import { fetchMenuCategories } from "../menu/api";
import { requireSupabase } from "../../lib/supabase";
import type { Category, CategoryDraft, ItemDraft, MenuItem, SettingsDraft, SiteSettings } from "../../types/menu";
import { blankToNull, storagePath } from "../../utils/format";

const EXTRA_COLUMNS = [
  "serving_ru",
  "serving_en",
  "image_thumb_url",
  "image_source",
  "image_license",
  "image_attribution",
  "image_review_status",
  "image_hidden",
] as const;

export async function fetchAdminMenu(): Promise<Category[]> {
  return fetchMenuCategories({ activeOnly: false, availableOnly: false });
}

function needsNewColumns(draft: Pick<ItemDraft, (typeof EXTRA_COLUMNS)[number]>): boolean {
  return Boolean(
    draft.serving_ru.trim()
    || draft.serving_en.trim()
    || draft.image_hidden
    || draft.image_thumb_url
    || draft.image_source
    || draft.image_license
    || draft.image_attribution
    || draft.image_review_status,
  );
}

async function writeMenuItem(id: string | null, payload: Record<string, unknown>, requireColumns: boolean): Promise<string> {
  const client = requireSupabase();
  const send = async (body: Record<string, unknown>) => {
    if (id) return client.from("menu_items").update(body).eq("id", id);
    return client.from("menu_items").insert(body).select("id").single();
  };

  let result = await send(payload);
  if (result.error && /column/i.test(result.error.message)) {
    if (requireColumns) throw new Error("MIGRATION_REQUIRED");
    const legacy = { ...payload };
    for (const key of EXTRA_COLUMNS) delete legacy[key];
    result = await send(legacy);
  }
  if (result.error) throw new Error(result.error.message);
  if (id) return id;
  return (result.data as { id: string }).id;
}

export async function saveItem(id: string | null, draft: ItemDraft): Promise<void> {
  const client = requireSupabase();
  const payload = {
    category_id: draft.category_id,
    name_ru: draft.name_ru.trim(),
    name_en: draft.name_en.trim(),
    description_ru: blankToNull(draft.description_ru),
    description_en: blankToNull(draft.description_en),
    image_url: draft.image_url,
    image_thumb_url: draft.image_thumb_url,
    image_source: draft.image_source,
    image_license: draft.image_license,
    image_attribution: draft.image_attribution,
    image_review_status: draft.image_review_status,
    image_hidden: draft.image_hidden,
    serving_ru: blankToNull(draft.serving_ru),
    serving_en: blankToNull(draft.serving_en),
    is_available: draft.is_available,
    is_featured: draft.is_featured,
    sort_order: draft.sort_order,
  };

  const itemId = await writeMenuItem(id, payload, needsNewColumns(draft));

  const { data: existing, error: existingError } = await client
    .from("item_price_options")
    .select("id")
    .eq("item_id", itemId);
  if (existingError) throw new Error(existingError.message);

  const existingIds = ((existing ?? []) as { id: string }[]).map((row) => row.id);
  const kept = new Set(draft.options.flatMap((option) => (option.id ? [option.id] : [])));
  const removed = existingIds.filter((optionId) => !kept.has(optionId));
  if (removed.length) {
    const { error } = await client.from("item_price_options").delete().in("id", removed);
    if (error) throw new Error(error.message);
  }

  for (const [index, option] of draft.options.entries()) {
    const row = {
      item_id: itemId,
      label_ru: blankToNull(option.label_ru),
      label_en: blankToNull(option.label_en),
      price: option.price,
      sort_order: index,
    };
    const result = option.id
      ? await client.from("item_price_options").update(row).eq("id", option.id)
      : await client.from("item_price_options").insert(row);
    if (result.error) throw new Error(result.error.message);
  }
  await logActivity(id ? "updated" : "created", "menu_item", itemId, payload.name_en || payload.name_ru);
}

export async function deleteItem(item: MenuItem): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("menu_items").delete().eq("id", item.id);
  if (error) throw new Error(error.message);
  await removeImage(item.image_url, "menu-images");
  await logActivity("deleted", "menu_item", item.id, item.name_en || item.name_ru);
}

export async function setItemAvailability(id: string, isAvailable: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("menu_items").update({ is_available: isAvailable }).eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(isAvailable ? "restored" : "hidden", "menu_item", id, id);
}

export async function duplicateItem(item: MenuItem, suffix: string): Promise<void> {
  await saveItem(null, {
    category_id: item.category_id,
    name_ru: `${item.name_ru} (${suffix})`,
    name_en: `${item.name_en} (${suffix})`,
    description_ru: item.description_ru ?? "",
    description_en: item.description_en ?? "",
    image_url: item.image_url,
    image_thumb_url: item.image_thumb_url ?? null,
    image_source: item.image_source ?? null,
    image_license: item.image_license ?? null,
    image_attribution: item.image_attribution ?? null,
    image_review_status: item.image_review_status ?? null,
    image_hidden: item.image_hidden ?? false,
    serving_ru: item.serving_ru ?? "",
    serving_en: item.serving_en ?? "",
    is_available: item.is_available,
    is_featured: false,
    sort_order: item.sort_order + 1,
    options: item.item_price_options.map((option) => ({
      label_ru: option.label_ru ?? "",
      label_en: option.label_en ?? "",
      price: option.price,
    })),
  });
}

export async function saveOrder(table: "categories" | "menu_items", ids: string[]): Promise<void> {
  const client = requireSupabase();
  const results = await Promise.all(ids.map((id, index) => client.from(table).update({ sort_order: index }).eq("id", id)));
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  await logActivity("reordered", table === "categories" ? "category" : "menu_item", null, table);
}

export async function saveCategory(
  id: string | null,
  draft: CategoryDraft,
  slug: string,
  sortOrder: number,
): Promise<void> {
  const client = requireSupabase();
  const payload = {
    name_ru: draft.name_ru.trim(),
    name_en: draft.name_en.trim(),
    is_active: draft.is_active,
  };
  if (id) {
    const { error } = await client.from("categories").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
    await logActivity("updated", "category", id, payload.name_en || payload.name_ru);
    return;
  }
  const { error } = await client.from("categories").insert({ ...payload, slug, sort_order: sortOrder });
  if (error) throw new Error(error.message);
  await logActivity("created", "category", null, payload.name_en || payload.name_ru);
}

export async function deleteCategory(id: string, reassignTo: string | null): Promise<void> {
  const client = requireSupabase();
  if (reassignTo) {
    const { error } = await client.from("menu_items").update({ category_id: reassignTo }).eq("category_id", id);
    if (error) throw new Error(error.message);
  }
  const { error } = await client.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity("deleted", "category", id, id);
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("categories").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function saveSettings(current: SiteSettings | null, draft: SettingsDraft): Promise<void> {
  const client = requireSupabase();
  const payload = {
    restaurant_name: draft.restaurant_name.trim() || "MARHABA HOTEL & SPA",
    subtitle: blankToNull(draft.subtitle),
    logo_url: draft.logo_url,
    currency_code: "UZS",
    phone: blankToNull(draft.phone),
    address_ru: blankToNull(draft.address_ru),
    address_en: blankToNull(draft.address_en),
    instagram_url: blankToNull(draft.instagram_url),
    opening_hours_ru: blankToNull(draft.opening_hours_ru),
    opening_hours_en: blankToNull(draft.opening_hours_en),
  };
  if (current) {
    const { error } = await client.from("site_settings").update(payload).eq("id", current.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await client.from("site_settings").insert(payload);
  if (error) throw new Error(error.message);
}

export type RecentDish = {
  id: string;
  name_ru: string;
  name_en: string;
  is_available: boolean;
  updated_at: string;
  categories: { name_ru: string; name_en: string } | { name_ru: string; name_en: string }[] | null;
};

export async function fetchDashboard(): Promise<{
  total: number;
  available: number;
  categories: number;
  recent: RecentDish[];
}> {
  const client = requireSupabase();
  const [total, available, categories, recent] = await Promise.all([
    client.from("menu_items").select("id", { count: "exact", head: true }),
    client.from("menu_items").select("id", { count: "exact", head: true }).eq("is_available", true),
    client.from("categories").select("id", { count: "exact", head: true }),
    client
      .from("menu_items")
      .select("id, name_ru, name_en, is_available, updated_at, categories(name_ru, name_en)")
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);
  const failure = total.error ?? available.error ?? categories.error ?? recent.error;
  if (failure) throw new Error(failure.message);
  return {
    total: total.count ?? 0,
    available: available.count ?? 0,
    categories: categories.count ?? 0,
    recent: (recent.data ?? []) as RecentDish[],
  };
}

export type ActivityEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_name: string;
  created_at: string;
};

export async function logActivity(
  action: string,
  entityType: string,
  entityId: string | null,
  entityName: string,
): Promise<void> {
  try {
    const client = requireSupabase();
    const { data } = await client.auth.getUser();
    await client.from("admin_activity").insert({
      admin_user_id: data.user?.id ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
    });
  } catch {
    /* activity logging must not block menu edits */
  }
}

export async function fetchActivity(): Promise<ActivityEntry[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("admin_activity")
    .select("id, action, entity_type, entity_name, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) return [];
  return (data ?? []) as ActivityEntry[];
}

export type ItemImagePatch = {
  image_url: string | null;
  image_thumb_url: string | null;
  image_source: string | null;
  image_license: string | null;
  image_attribution: string | null;
  image_review_status: "approved" | "needs_review" | null;
  image_hidden: boolean;
};

export async function updateItemImage(id: string, patch: ItemImagePatch): Promise<void> {
  await writeMenuItem(id, patch, true);
  await logActivity(patch.image_hidden ? "hidden" : "updated", "menu_item", id, "image");
}

export async function removeImage(url: string | null, bucket: "menu-images" | "branding"): Promise<void> {
  if (!url) return;
  const path = storagePath(url, bucket);
  if (!path) return;
  const client = requireSupabase();
  await client.storage.from(bucket).remove([path]);
}
