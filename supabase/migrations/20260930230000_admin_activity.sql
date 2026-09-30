create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.admin_activity enable row level security;

drop policy if exists "Admins read activity" on public.admin_activity;
create policy "Admins read activity"
on public.admin_activity
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins insert activity" on public.admin_activity;
create policy "Admins insert activity"
on public.admin_activity
for insert
to authenticated
with check (public.is_admin());

grant select, insert on public.admin_activity to authenticated;
