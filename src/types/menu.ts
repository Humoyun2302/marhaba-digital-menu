export type Lang = "ru" | "en";

export type PriceOption = {
  id: string;
  item_id: string;
  label_ru: string | null;
  label_en: string | null;
  price: number;
  sort_order: number;
};

export type MenuItem = {
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
  item_price_options: PriceOption[];
};

export type Category = {
  id: string;
  slug: string;
  name_ru: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
  menu_items: MenuItem[];
};

export type SiteSettings = {
  id: string;
  restaurant_name: string;
  subtitle: string | null;
  logo_url: string | null;
  currency_code: string;
  phone: string | null;
  address_ru: string | null;
  address_en: string | null;
  instagram_url: string | null;
  opening_hours_ru: string | null;
  opening_hours_en: string | null;
  qr_domain?: string | null;
  qr_domain_locked?: boolean;
  updated_at: string;
};

export type ItemDraft = {
  category_id: string;
  name_ru: string;
  name_en: string;
  description_ru: string;
  description_en: string;
  image_url: string | null;
  image_thumb_url: string | null;
  image_source: string | null;
  image_license: string | null;
  image_attribution: string | null;
  image_review_status: "approved" | "needs_review" | null;
  image_hidden: boolean;
  serving_ru: string;
  serving_en: string;
  is_available: boolean;
  is_featured: boolean;
  sort_order: number;
  options: Array<{
    id?: string;
    label_ru: string;
    label_en: string;
    price: number;
  }>;
};

export type CategoryDraft = {
  name_ru: string;
  name_en: string;
  is_active: boolean;
};

export type SettingsDraft = {
  restaurant_name: string;
  subtitle: string;
  logo_url: string | null;
  phone: string;
  address_ru: string;
  address_en: string;
  instagram_url: string;
  opening_hours_ru: string;
  opening_hours_en: string;
};
