-- MARHABA Hotel & Spa digital menu.
-- Run this in the Supabase SQL editor before seed.sql.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ru text not null,
  name_en text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_ru_check check (char_length(btrim(name_ru)) > 0),
  constraint categories_name_en_check check (char_length(btrim(name_en)) > 0)
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  name_ru text not null,
  name_en text not null,
  description_ru text,
  description_en text,
  image_url text,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_items_name_ru_check check (char_length(btrim(name_ru)) > 0),
  constraint menu_items_name_en_check check (char_length(btrim(name_en)) > 0)
);

create table if not exists public.item_price_options (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.menu_items (id) on delete cascade,
  label_ru text,
  label_en text,
  price integer not null,
  sort_order integer not null default 0,
  constraint item_price_options_price_check check (price >= 0)
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_name text not null default 'MARHABA HOTEL & SPA',
  subtitle text,
  logo_url text,
  currency_code text not null default 'UZS',
  phone text,
  address_ru text,
  address_en text,
  instagram_url text,
  opening_hours_ru text,
  opening_hours_en text,
  updated_at timestamptz not null default now(),
  constraint site_settings_name_check check (char_length(btrim(restaurant_name)) > 0)
);

create index if not exists categories_active_sort_idx on public.categories (is_active, sort_order);
create index if not exists menu_items_category_sort_idx on public.menu_items (category_id, sort_order);
create index if not exists menu_items_available_idx on public.menu_items (is_available);
create index if not exists menu_items_updated_idx on public.menu_items (updated_at desc);
create index if not exists item_price_options_item_sort_idx on public.item_price_options (item_id, sort_order);

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

drop trigger if exists menu_items_set_updated_at on public.menu_items;
create trigger menu_items_set_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.item_price_options enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "Read own admin membership" on public.admin_users;
create policy "Read own admin membership"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins insert admin users" on public.admin_users;
create policy "Admins insert admin users"
on public.admin_users
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Public read active categories" on public.categories;
create policy "Public read active categories"
on public.categories
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins read categories" on public.categories;
create policy "Admins read categories"
on public.categories
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins insert categories" on public.categories;
create policy "Admins insert categories"
on public.categories
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update categories" on public.categories;
create policy "Admins update categories"
on public.categories
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete categories" on public.categories;
create policy "Admins delete categories"
on public.categories
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public read available items" on public.menu_items;
create policy "Public read available items"
on public.menu_items
for select
to anon, authenticated
using (
  is_available = true
  and exists (
    select 1
    from public.categories
    where categories.id = menu_items.category_id
      and categories.is_active = true
  )
);

drop policy if exists "Admins read items" on public.menu_items;
create policy "Admins read items"
on public.menu_items
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins insert items" on public.menu_items;
create policy "Admins insert items"
on public.menu_items
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update items" on public.menu_items;
create policy "Admins update items"
on public.menu_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete items" on public.menu_items;
create policy "Admins delete items"
on public.menu_items
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public read visible prices" on public.item_price_options;
create policy "Public read visible prices"
on public.item_price_options
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.menu_items
    join public.categories on categories.id = menu_items.category_id
    where menu_items.id = item_price_options.item_id
      and menu_items.is_available = true
      and categories.is_active = true
  )
);

drop policy if exists "Admins read prices" on public.item_price_options;
create policy "Admins read prices"
on public.item_price_options
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins insert prices" on public.item_price_options;
create policy "Admins insert prices"
on public.item_price_options
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update prices" on public.item_price_options;
create policy "Admins update prices"
on public.item_price_options
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete prices" on public.item_price_options;
create policy "Admins delete prices"
on public.item_price_options
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Public read settings" on public.site_settings;
create policy "Public read settings"
on public.site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Admins insert settings" on public.site_settings;
create policy "Admins insert settings"
on public.site_settings
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins update settings" on public.site_settings;
create policy "Admins update settings"
on public.site_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.categories, public.menu_items, public.item_price_options, public.site_settings to anon, authenticated;
grant insert, update, delete on public.categories, public.menu_items, public.item_price_options, public.site_settings to authenticated;
grant select on public.admin_users to authenticated;
grant insert on public.admin_users to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('menu-images', 'menu-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('branding', 'branding', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read menu assets" on storage.objects;
create policy "Public read menu assets"
on storage.objects
for select
to anon, authenticated
using (bucket_id in ('menu-images', 'branding'));

drop policy if exists "Admins insert menu assets" on storage.objects;
create policy "Admins insert menu assets"
on storage.objects
for insert
to authenticated
with check (bucket_id in ('menu-images', 'branding') and public.is_admin());

drop policy if exists "Admins update menu assets" on storage.objects;
create policy "Admins update menu assets"
on storage.objects
for update
to authenticated
using (bucket_id in ('menu-images', 'branding') and public.is_admin())
with check (bucket_id in ('menu-images', 'branding') and public.is_admin());

drop policy if exists "Admins delete menu assets" on storage.objects;
create policy "Admins delete menu assets"
on storage.objects
for delete
to authenticated
using (bucket_id in ('menu-images', 'branding') and public.is_admin());
