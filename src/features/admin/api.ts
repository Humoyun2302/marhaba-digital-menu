import { requireSupabase } from "../../lib/supabase";
import type { Category, CategoryDraft, ItemDraft, MenuItem, SettingsDraft, SiteSettings } from "../../types/menu";
import { blankToNull, storagePath } from "../../utils/format";

export async function fetchAdminMenu(): Promise<Category[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("categories")
    .select(`
      id, slug, name_ru, name_en, sort_order, is_active,
      menu_items (
        id, category_id, name_ru, name_en, description_ru, description_en,
        image_url, is_available, is_featured, sort_order, updated_at,
        item_price_options ( id, item_id, label_ru, label_en, price, sort_order )
      )
    `)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Category[]).map((category) => ({
    ...category,
    menu_items: [...(category.menu_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
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
    is_available: draft.is_available,
    is_featured: draft.is_featured,
    sort_order: draft.sort_order,
  };

  let itemId = id;
  if (itemId) {
    const { error } = await client.from("menu_items").update(payload).eq("id", itemId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await client.from("menu_items").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    itemId = (data as { id: string }).id;
  }

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
}

export async function deleteItem(item: MenuItem): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("menu_items").delete().eq("id", item.id);
  if (error) throw new Error(error.message);
  await removeImage(item.image_url, "menu-images");
}

export async function setItemAvailability(id: string, isAvailable: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from("menu_items").update({ is_available: isAvailable }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicateItem(item: MenuItem, suffix: string): Promise<void> {
  await saveItem(null, {
    category_id: item.category_id,
    name_ru: `${item.name_ru} (${suffix})`,
    name_en: `${item.name_en} (${suffix})`,
    description_ru: item.description_ru ?? "",
    description_en: item.description_en ?? "",
    image_url: item.image_url,
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
    return;
  }
  const { error } = await client.from("categories").insert({ ...payload, slug, sort_order: sortOrder });
  if (error) throw new Error(error.message);
}

export async function deleteCategory(id: string, reassignTo: string | null): Promise<void> {
  const client = requireSupabase();
  if (reassignTo) {
    const { error } = await client.from("menu_items").update({ category_id: reassignTo }).eq("category_id", id);
    if (error) throw new Error(error.message);
  }
  const { error } = await client.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
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

export async function removeImage(url: string | null, bucket: "menu-images" | "branding"): Promise<void> {
  if (!url) return;
  const path = storagePath(url, bucket);
  if (!path) return;
  const client = requireSupabase();
  await client.storage.from(bucket).remove([path]);
}
