import { requireSupabase } from "../../lib/supabase";
import type { Category, MenuItem, PriceOption, SiteSettings } from "../../types/menu";

type PriceRow = {
  id: string;
  item_id: string;
  label_ru: string | null;
  label_en: string | null;
  price: number;
  sort_order: number;
};

type ItemRow = {
  id: string;
  category_id: string;
  name_ru: string;
  name_en: string;
  description_ru: string | null;
  description_en: string | null;
  image_url: string | null;
  image_thumb_url?: string | null;
  image_source?: string | null;
  image_license?: string | null;
  image_attribution?: string | null;
  image_review_status?: "approved" | "needs_review" | null;
  image_hidden?: boolean;
  serving_ru?: string | null;
  serving_en?: string | null;
  is_available: boolean;
  is_featured: boolean;
  sort_order: number;
  updated_at?: string;
  item_price_options: PriceRow[] | null;
};

type CategoryRow = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
  menu_items: ItemRow[] | null;
};

function mapOption(row: PriceRow): PriceOption {
  return {
    id: row.id,
    item_id: row.item_id,
    label_ru: row.label_ru,
    label_en: row.label_en,
    price: row.price,
    sort_order: row.sort_order,
  };
}

function mapItem(row: ItemRow): MenuItem {
  return {
    id: row.id,
    category_id: row.category_id,
    name_ru: row.name_ru,
    name_en: row.name_en,
    description_ru: row.description_ru,
    description_en: row.description_en,
    image_url: row.image_url,
    image_thumb_url: row.image_thumb_url ?? null,
    image_source: row.image_source ?? null,
    image_license: row.image_license ?? null,
    image_attribution: row.image_attribution ?? null,
    image_review_status: row.image_review_status ?? null,
    image_hidden: row.image_hidden ?? false,
    serving_ru: row.serving_ru ?? null,
    serving_en: row.serving_en ?? null,
    is_available: row.is_available,
    is_featured: row.is_featured,
    sort_order: row.sort_order,
    updated_at: row.updated_at,
    item_price_options: (row.item_price_options ?? []).map(mapOption).sort((a, b) => a.sort_order - b.sort_order),
  };
}

const ITEM_FIELDS = `
  id, category_id, name_ru, name_en, description_ru, description_en,
  image_url, is_available, is_featured, sort_order, updated_at
`;

const ITEM_FIELDS_EXTENDED = `
  ${ITEM_FIELDS},
  image_thumb_url, image_source, image_license, image_attribution, image_review_status, image_hidden,
  serving_ru, serving_en
`;

function categorySelect(itemFields: string): string {
  return `
    id, slug, name_ru, name_en, sort_order, is_active,
    menu_items (
      ${itemFields},
      item_price_options ( id, item_id, label_ru, label_en, price, sort_order )
    )
  `;
}

export async function fetchMenuCategories(options: { activeOnly: boolean; availableOnly: boolean }): Promise<Category[]> {
  const client = requireSupabase();
  const load = (itemFields: string) => {
    let query = client.from("categories").select(categorySelect(itemFields)).order("sort_order", { ascending: true });
    if (options.activeOnly) query = query.eq("is_active", true);
    return query;
  };

  let response = await load(ITEM_FIELDS_EXTENDED);
  if (response.error && /column/i.test(response.error.message)) {
    response = await load(ITEM_FIELDS);
  }
  if (response.error) throw new Error(response.error.message);

  return ((response.data ?? []) as unknown as CategoryRow[])
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      name_ru: category.name_ru,
      name_en: category.name_en,
      sort_order: category.sort_order,
      is_active: category.is_active,
      menu_items: (category.menu_items ?? [])
        .filter((item) => (options.availableOnly ? item.is_available : true))
        .map(mapItem)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((category) => (options.availableOnly ? category.menu_items.length > 0 : true))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function fetchPublicMenu(): Promise<Category[]> {
  return fetchMenuCategories({ activeOnly: true, availableOnly: true });
}

export async function fetchSettings(): Promise<SiteSettings | null> {
  const client = requireSupabase();
  const { data, error } = await client.from("site_settings").select("*").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SiteSettings | null) ?? null;
}
