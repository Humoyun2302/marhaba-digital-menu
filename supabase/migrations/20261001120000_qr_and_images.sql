-- MARHABA menu photographs, serving sizes, and 120 permanent table QR codes.
-- Safe to run more than once. Existing QR tokens and table numbers are never replaced.

alter table public.menu_items
  add column if not exists serving_ru text,
  add column if not exists serving_en text,
  add column if not exists image_thumb_url text,
  add column if not exists image_source text,
  add column if not exists image_license text,
  add column if not exists image_attribution text,
  add column if not exists image_review_status text,
  add column if not exists image_hidden boolean not null default false;

alter table public.menu_items drop constraint if exists menu_items_image_review_check;
alter table public.menu_items
  add constraint menu_items_image_review_check
  check (image_review_status is null or image_review_status in ('approved', 'needs_review'));

alter table public.site_settings
  add column if not exists qr_domain text,
  add column if not exists qr_domain_locked boolean not null default false;

alter table public.site_settings drop constraint if exists site_settings_qr_domain_lock_check;
alter table public.site_settings
  add constraint site_settings_qr_domain_lock_check
  check (
    qr_domain_locked = false
    or (qr_domain is not null and char_length(btrim(qr_domain)) > 0)
  );

create table if not exists public.restaurant_qr_codes (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null,
  token text not null,
  created_at timestamptz not null default now(),
  label text,
  installation_status text not null default 'not_installed',
  internal_notes text,
  constraint restaurant_qr_codes_table_number_key unique (table_number),
  constraint restaurant_qr_codes_token_key unique (token),
  constraint restaurant_qr_codes_table_range_check check (table_number between 1 and 120),
  constraint restaurant_qr_codes_token_length_check check (char_length(token) >= 32),
  constraint restaurant_qr_codes_status_check check (
    installation_status in ('not_installed', 'installed', 'needs_inspection')
  )
);

create table if not exists public.qr_scan_events (
  id uuid primary key default gen_random_uuid(),
  qr_code_id uuid not null references public.restaurant_qr_codes (id) on delete restrict,
  scanned_at timestamptz not null default now()
);

create index if not exists qr_scan_events_code_time_idx
  on public.qr_scan_events (qr_code_id, scanned_at desc);

comment on table public.restaurant_qr_codes is
  'Permanent MARHABA table QR codes. Tokens and table numbers are immutable.';

create or replace function public.protect_qr_codes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Permanent QR codes cannot be deleted';
  end if;
  if new.id is distinct from old.id
     or new.table_number is distinct from old.table_number
     or new.token is distinct from old.token
     or new.created_at is distinct from old.created_at
  then
    raise exception 'QR token, table number, and identifier are permanent';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_qr_codes_protect on public.restaurant_qr_codes;
create trigger restaurant_qr_codes_protect
before update or delete on public.restaurant_qr_codes
for each row execute function public.protect_qr_codes();

create or replace function public.protect_qr_domain()
returns trigger
language plpgsql
as $$
begin
  if old.qr_domain_locked and (
    new.qr_domain is distinct from old.qr_domain
    or new.qr_domain_locked is distinct from old.qr_domain_locked
  ) then
    raise exception 'The canonical QR domain is locked';
  end if;
  if new.qr_domain is not null then
    new.qr_domain = regexp_replace(btrim(new.qr_domain), '/+$', '');
  end if;
  return new;
end;
$$;

drop trigger if exists site_settings_protect_qr_domain on public.site_settings;
create trigger site_settings_protect_qr_domain
before update on public.site_settings
for each row execute function public.protect_qr_domain();

insert into public.restaurant_qr_codes (table_number, token)
select gs, encode(gen_random_bytes(24), 'hex')
from generate_series(1, 120) as gs
on conflict (table_number) do nothing;

alter table public.restaurant_qr_codes enable row level security;
alter table public.qr_scan_events enable row level security;

drop policy if exists "Admins read QR codes" on public.restaurant_qr_codes;
create policy "Admins read QR codes"
on public.restaurant_qr_codes
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins update QR metadata" on public.restaurant_qr_codes;
create policy "Admins update QR metadata"
on public.restaurant_qr_codes
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins read QR scans" on public.qr_scan_events;
create policy "Admins read QR scans"
on public.qr_scan_events
for select
to authenticated
using (public.is_admin());

grant select, update on public.restaurant_qr_codes to authenticated;
grant select on public.qr_scan_events to authenticated;
revoke insert, delete, truncate on public.restaurant_qr_codes from anon, authenticated;
revoke insert, update, delete, truncate on public.qr_scan_events from anon, authenticated;

create or replace function public.record_qr_scan(p_token text, p_record boolean default true)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  qr_id uuid;
  table_no integer;
  recent integer;
begin
  if p_token is null or char_length(p_token) < 16 or char_length(p_token) > 128 then
    return null;
  end if;

  select id, table_number
  into qr_id, table_no
  from public.restaurant_qr_codes
  where token = p_token;

  if qr_id is null then
    return null;
  end if;

  if coalesce(p_record, true) then
    select count(*)
    into recent
    from public.qr_scan_events
    where qr_code_id = qr_id
      and scanned_at > now() - interval '1 minute';

    if recent < 40 then
      insert into public.qr_scan_events (qr_code_id)
      values (qr_id);
    end if;
  end if;

  return table_no;
end;
$$;

create or replace function public.qr_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'unique_tokens', count(distinct token),
    'unique_tables', count(distinct table_number),
    'installed', count(*) filter (where installation_status = 'installed'),
    'not_installed', count(*) filter (where installation_status = 'not_installed'),
    'needs_inspection', count(*) filter (where installation_status = 'needs_inspection'),
    'scans', (select count(*) from public.qr_scan_events)
  )
  into result
  from public.restaurant_qr_codes;

  return result;
end;
$$;

create or replace function public.qr_admin_cards()
returns table (
  id uuid,
  table_number integer,
  token text,
  label text,
  installation_status text,
  internal_notes text,
  created_at timestamptz,
  scan_count bigint,
  last_scanned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select
    codes.id,
    codes.table_number,
    codes.token,
    codes.label,
    codes.installation_status,
    codes.internal_notes,
    codes.created_at,
    coalesce(stats.scan_count, 0)::bigint,
    stats.last_scanned_at
  from public.restaurant_qr_codes as codes
  left join (
    select
      events.qr_code_id,
      count(*)::bigint as scan_count,
      max(events.scanned_at) as last_scanned_at
    from public.qr_scan_events as events
    group by events.qr_code_id
  ) as stats on stats.qr_code_id = codes.id
  order by codes.table_number;
end;
$$;

create or replace function public.qr_recent_scans(p_id uuid)
returns table (scanned_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select events.scanned_at
  from public.qr_scan_events as events
  where events.qr_code_id = p_id
  order by events.scanned_at desc
  limit 8;
end;
$$;

revoke all on function public.record_qr_scan(text, boolean) from public;
grant execute on function public.record_qr_scan(text, boolean) to anon, authenticated;

revoke all on function public.qr_admin_overview() from public;
grant execute on function public.qr_admin_overview() to authenticated;

revoke all on function public.qr_admin_cards() from public;
grant execute on function public.qr_admin_cards() to authenticated;

revoke all on function public.qr_recent_scans(uuid) from public;
grant execute on function public.qr_recent_scans(uuid) to authenticated;

revoke all on function public.protect_qr_codes() from public, anon, authenticated;
revoke all on function public.protect_qr_domain() from public, anon, authenticated;
