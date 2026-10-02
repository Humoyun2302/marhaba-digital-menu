-- MARHABA table ordering. Additive only: existing QR tokens, table numbers, and menu rows are not modified.

create sequence if not exists public.restaurant_order_number_seq as integer start with 1001 increment by 1;

create table if not exists public.restaurant_order_settings (
  singleton boolean primary key default true,
  ordering_enabled boolean not null default true,
  orders_paused boolean not null default false,
  allow_outside_hours boolean not null default true,
  hours_start time,
  hours_end time,
  timezone text not null default 'Asia/Tashkent',
  orders_chat_id bigint,
  prep_estimate_minutes integer,
  max_line_quantity integer not null default 20,
  max_lines integer not null default 25,
  max_order_total integer not null default 50000000,
  updated_at timestamptz not null default now(),
  constraint restaurant_order_settings_singleton_check check (singleton),
  constraint restaurant_order_settings_prep_check check (prep_estimate_minutes is null or prep_estimate_minutes between 1 and 180),
  constraint restaurant_order_settings_line_qty_check check (max_line_quantity between 1 and 50),
  constraint restaurant_order_settings_lines_check check (max_lines between 1 and 60),
  constraint restaurant_order_settings_total_check check (max_order_total > 0),
  constraint restaurant_order_settings_hours_check check (
    (hours_start is null and hours_end is null) or (hours_start is not null and hours_end is not null)
  )
);

insert into public.restaurant_order_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.restaurant_orders (
  id uuid primary key default gen_random_uuid(),
  public_order_number integer not null default nextval('public.restaurant_order_number_seq'),
  table_qr_id uuid not null references public.restaurant_qr_codes (id) on delete restrict,
  table_number integer not null,
  fulfillment_mode text not null default 'dine_in',
  order_status text not null default 'pending',
  customer_name text,
  special_instructions text,
  allergy_notes text,
  currency text not null default 'UZS',
  total_amount integer not null,
  payment_status text not null default 'unpaid',
  payment_method text not null default 'at_restaurant',
  idempotency_key text not null,
  payload_hash text not null,
  tracking_token_hash text not null,
  tracking_token text,
  guest_session_id text,
  prep_estimate_minutes integer,
  cancellation_reason text,
  attention_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_orders_number_key unique (public_order_number),
  constraint restaurant_orders_idempotency_key_key unique (idempotency_key),
  constraint restaurant_orders_tracking_hash_key unique (tracking_token_hash),
  constraint restaurant_orders_table_check check (table_number between 1 and 120),
  constraint restaurant_orders_mode_check check (fulfillment_mode in ('dine_in', 'takeaway', 'delivery')),
  constraint restaurant_orders_status_check check (order_status in ('pending', 'accepted', 'preparing', 'ready', 'serving', 'served', 'cancelled')),
  constraint restaurant_orders_total_check check (total_amount >= 0),
  constraint restaurant_orders_payment_status_check check (payment_status in ('unpaid', 'paid', 'waived')),
  constraint restaurant_orders_payment_method_check check (payment_method in ('at_restaurant')),
  constraint restaurant_orders_name_check check (customer_name is null or char_length(customer_name) <= 80),
  constraint restaurant_orders_notes_check check (special_instructions is null or char_length(special_instructions) <= 500),
  constraint restaurant_orders_allergy_check check (allergy_notes is null or char_length(allergy_notes) <= 500),
  constraint restaurant_orders_prep_check check (prep_estimate_minutes is null or prep_estimate_minutes between 1 and 180)
);

create table if not exists public.restaurant_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.restaurant_orders (id) on delete cascade,
  menu_item_id uuid references public.menu_items (id) on delete set null,
  menu_item_name_snapshot text not null,
  menu_item_name_en_snapshot text,
  selected_variant_snapshot jsonb not null default '{}'::jsonb,
  quantity integer not null,
  unit_price integer not null,
  line_total integer not null,
  special_instructions text,
  created_at timestamptz not null default now(),
  constraint restaurant_order_items_qty_check check (quantity between 1 and 50),
  constraint restaurant_order_items_price_check check (unit_price >= 0),
  constraint restaurant_order_items_total_check check (line_total = unit_price * quantity),
  constraint restaurant_order_items_note_check check (special_instructions is null or char_length(special_instructions) <= 200)
);

create table if not exists public.restaurant_order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.restaurant_orders (id) on delete cascade,
  previous_status text,
  new_status text not null,
  actor_type text not null,
  actor_id text,
  actor_name text,
  reason text,
  is_exceptional boolean not null default false,
  created_at timestamptz not null default now(),
  constraint restaurant_order_events_status_check check (new_status in ('pending', 'accepted', 'preparing', 'ready', 'serving', 'served', 'cancelled')),
  constraint restaurant_order_events_actor_check check (actor_type in ('guest', 'staff', 'admin', 'system'))
);

create table if not exists public.restaurant_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  telegram_user_id bigint,
  telegram_username text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_staff_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint restaurant_staff_role_check check (role in ('manager', 'kitchen', 'waiter')),
  constraint restaurant_staff_telegram_key unique (telegram_user_id)
);

create table if not exists public.restaurant_staff_link_codes (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.restaurant_staff (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint restaurant_staff_link_codes_hash_key unique (code_hash)
);

create table if not exists public.restaurant_staff_prompts (
  telegram_user_id bigint primary key,
  order_id uuid not null references public.restaurant_orders (id) on delete cascade,
  prompt text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint restaurant_staff_prompts_kind_check check (prompt in ('cancel_reason'))
);

create table if not exists public.restaurant_order_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.restaurant_orders (id) on delete cascade,
  destination_chat_id bigint,
  telegram_message_id bigint,
  delivery_status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint restaurant_order_notifications_order_key unique (order_id),
  constraint restaurant_order_notifications_status_check check (delivery_status in ('pending', 'sending', 'delivered', 'failed')),
  constraint restaurant_order_notifications_attempts_check check (attempt_count >= 0)
);

create table if not exists public.telegram_update_receipts (
  update_id bigint primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.order_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  hits integer not null,
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_orders_status_created_idx
  on public.restaurant_orders (order_status, created_at desc);
create index if not exists restaurant_orders_table_created_idx
  on public.restaurant_orders (table_number, created_at desc);
create index if not exists restaurant_orders_created_idx
  on public.restaurant_orders (created_at desc);
create index if not exists restaurant_orders_active_idx
  on public.restaurant_orders (created_at desc)
  where order_status not in ('served', 'cancelled');
create index if not exists restaurant_order_items_order_idx
  on public.restaurant_order_items (order_id);
create index if not exists restaurant_order_events_order_idx
  on public.restaurant_order_status_events (order_id, created_at);
create index if not exists restaurant_order_notifications_due_idx
  on public.restaurant_order_notifications (delivery_status, next_attempt_at);
create index if not exists restaurant_staff_link_staff_idx
  on public.restaurant_staff_link_codes (staff_id, expires_at desc);

drop trigger if exists restaurant_orders_set_updated_at on public.restaurant_orders;
create trigger restaurant_orders_set_updated_at
before update on public.restaurant_orders
for each row execute function public.set_updated_at();

drop trigger if exists restaurant_order_settings_set_updated_at on public.restaurant_order_settings;
create trigger restaurant_order_settings_set_updated_at
before update on public.restaurant_order_settings
for each row execute function public.set_updated_at();

drop trigger if exists restaurant_staff_set_updated_at on public.restaurant_staff;
create trigger restaurant_staff_set_updated_at
before update on public.restaurant_staff
for each row execute function public.set_updated_at();

drop trigger if exists restaurant_order_notifications_set_updated_at on public.restaurant_order_notifications;
create trigger restaurant_order_notifications_set_updated_at
before update on public.restaurant_order_notifications
for each row execute function public.set_updated_at();

create or replace function public.restaurant_order_settings_guard()
returns trigger
language plpgsql
as $$
begin
  new.timezone := coalesce(nullif(btrim(new.timezone), ''), 'Asia/Tashkent');
  begin
    perform timezone(new.timezone, now());
  exception when others then
    raise exception 'INVALID_TIMEZONE';
  end;
  if (new.hours_start is null) <> (new.hours_end is null) then
    raise exception 'INVALID_HOURS';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurant_order_settings_guard on public.restaurant_order_settings;
create trigger restaurant_order_settings_guard
before insert or update on public.restaurant_order_settings
for each row execute function public.restaurant_order_settings_guard();

create or replace function public.restaurant_ordering_block_reason()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.restaurant_order_settings%rowtype;
  local_time time;
begin
  select * into settings from public.restaurant_order_settings where singleton;
  if not found then
    return 'UNAVAILABLE';
  end if;
  if not settings.ordering_enabled then
    return 'ORDERING_DISABLED';
  end if;
  if settings.orders_paused then
    return 'ORDERS_PAUSED';
  end if;
  if settings.hours_start is not null and settings.hours_end is not null and not settings.allow_outside_hours then
    begin
      local_time := (timezone(settings.timezone, now()))::time;
    exception when others then
      return 'OUTSIDE_HOURS';
    end;
    if settings.hours_start <= settings.hours_end then
      if local_time < settings.hours_start or local_time >= settings.hours_end then
        return 'OUTSIDE_HOURS';
      end if;
    elsif local_time < settings.hours_start and local_time >= settings.hours_end then
      return 'OUTSIDE_HOURS';
    end if;
  end if;
  return null;
end;
$$;

create or replace function public.public_ordering_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  reason text;
  settings public.restaurant_order_settings%rowtype;
begin
  select * into settings from public.restaurant_order_settings where singleton;
  reason := public.restaurant_ordering_block_reason();
  return jsonb_build_object(
    'ordering_enabled', coalesce(settings.ordering_enabled, false),
    'orders_paused', coalesce(settings.orders_paused, false),
    'allow_outside_hours', coalesce(settings.allow_outside_hours, true),
    'accepting', reason is null,
    'closed_reason', reason
  );
end;
$$;

create or replace function public.bump_order_rate_limit(p_key text, p_window interval, p_max integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  next_hits integer;
begin
  insert into public.order_rate_limits (bucket_key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update
  set
    hits = case
      when public.order_rate_limits.window_start < now() - p_window then 1
      else public.order_rate_limits.hits + 1
    end,
    window_start = case
      when public.order_rate_limits.window_start < now() - p_window then now()
      else public.order_rate_limits.window_start
    end,
    updated_at = now()
  returning hits into next_hits;

  if next_hits > p_max then
    raise exception 'RATE_LIMIT';
  end if;
end;
$$;

create or replace function public.order_public_json(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'id', orders.id,
    'public_order_number', orders.public_order_number,
    'table_number', orders.table_number,
    'fulfillment_mode', orders.fulfillment_mode,
    'order_status', orders.order_status,
    'customer_name', orders.customer_name,
    'special_instructions', orders.special_instructions,
    'allergy_notes', orders.allergy_notes,
    'currency', orders.currency,
    'total_amount', orders.total_amount,
    'payment_status', orders.payment_status,
    'payment_method', orders.payment_method,
    'prep_estimate_minutes', case
      when orders.order_status in ('accepted', 'preparing', 'ready')
        then coalesce(orders.prep_estimate_minutes, settings.prep_estimate_minutes)
      else null
    end,
    'cancellation_reason', orders.cancellation_reason,
    'attention_required', orders.attention_required,
    'created_at', orders.created_at,
    'updated_at', orders.updated_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', items.id,
        'menu_item_id', items.menu_item_id,
        'name_ru', items.menu_item_name_snapshot,
        'name_en', items.menu_item_name_en_snapshot,
        'variant_ru', items.selected_variant_snapshot->>'label_ru',
        'variant_en', items.selected_variant_snapshot->>'label_en',
        'quantity', items.quantity,
        'unit_price', items.unit_price,
        'line_total', items.line_total,
        'special_instructions', items.special_instructions
      ) order by items.created_at, items.id)
      from public.restaurant_order_items as items
      where items.order_id = orders.id
    ), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', events.id,
        'previous_status', events.previous_status,
        'status', events.new_status,
        'actor_type', events.actor_type,
        'actor_name', events.actor_name,
        'reason', case when events.new_status = 'cancelled' then events.reason else null end,
        'exceptional', events.is_exceptional,
        'created_at', events.created_at
      ) order by events.created_at, events.id)
      from public.restaurant_order_status_events as events
      where events.order_id = orders.id
    ), '[]'::jsonb)
  )
  into result
  from public.restaurant_orders as orders
  cross join public.restaurant_order_settings as settings
  where orders.id = p_order_id
    and settings.singleton;
  return result;
end;
$$;

create or replace function public.order_notification_bundle(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'order', public.order_public_json(p_order_id),
    'notification', (
      select jsonb_build_object(
        'id', notes.id,
        'destination_chat_id', notes.destination_chat_id,
        'telegram_message_id', notes.telegram_message_id,
        'delivery_status', notes.delivery_status,
        'attempt_count', notes.attempt_count,
        'last_error', notes.last_error
      )
      from public.restaurant_order_notifications as notes
      where notes.order_id = p_order_id
    )
  )
  into result;
  return result;
end;
$$;

create or replace function public.queue_order_notification(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.restaurant_order_notifications
  set
    delivery_status = 'pending',
    next_attempt_at = now(),
    attempt_count = 0,
    destination_chat_id = coalesce(
      destination_chat_id,
      (select orders_chat_id from public.restaurant_order_settings where singleton)
    )
  where order_id = p_order_id;
end;
$$;

create or replace function public.create_restaurant_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  settings public.restaurant_order_settings%rowtype;
  table_token text;
  request_key text;
  customer_name text;
  special_instructions text;
  allergy_notes text;
  guest_session_id text;
  ip_hash text;
  chat_id bigint;
  raw_items jsonb;
  clean_items jsonb := '[]'::jsonb;
  sorted_items jsonb;
  payload_hash text;
  existing public.restaurant_orders%rowtype;
  qr_id uuid;
  table_number integer;
  item jsonb;
  menu_id uuid;
  option_id uuid;
  option_count integer;
  item_name_ru text;
  item_name_en text;
  item_available boolean;
  category_active boolean;
  variant_ru text;
  variant_en text;
  unit_price integer;
  quantity integer;
  line_note text;
  line_total integer;
  order_total integer := 0;
  tracking_token text;
  tracking_hash text;
  order_id uuid;
  constraint_name text;
  block_reason text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_ITEMS';
  end if;

  table_token := btrim(coalesce(p_payload->>'table_token', ''));
  request_key := btrim(coalesce(p_payload->>'idempotency_key', ''));
  if table_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'INVALID_TABLE';
  end if;
  if request_key !~ '^[0-9a-fA-F-]{32,80}$' then
    raise exception 'INVALID_ITEMS';
  end if;

  customer_name := nullif(regexp_replace(btrim(coalesce(p_payload->>'customer_name', '')), '[[:cntrl:]]', '', 'g'), '');
  special_instructions := nullif(regexp_replace(btrim(coalesce(p_payload->>'special_instructions', '')), '[[:cntrl:]]', '', 'g'), '');
  allergy_notes := nullif(regexp_replace(btrim(coalesce(p_payload->>'allergy_notes', '')), '[[:cntrl:]]', '', 'g'), '');
  guest_session_id := nullif(left(regexp_replace(btrim(coalesce(p_payload->>'guest_session_id', '')), '[^A-Za-z0-9-]', '', 'g'), 80), '');
  ip_hash := nullif(left(regexp_replace(coalesce(p_payload->>'ip_hash', ''), '[^a-f0-9]', '', 'g'), 128), '');
  if p_payload ? 'chat_id' and nullif(p_payload->>'chat_id', '') is not null then
    chat_id := (p_payload->>'chat_id')::bigint;
  end if;
  if customer_name is not null and char_length(customer_name) > 80 then
    raise exception 'INVALID_ITEMS';
  end if;
  if special_instructions is not null and char_length(special_instructions) > 500 then
    raise exception 'INVALID_ITEMS';
  end if;
  if allergy_notes is not null and char_length(allergy_notes) > 500 then
    raise exception 'INVALID_ITEMS';
  end if;

  select * into existing from public.restaurant_orders where restaurant_orders.idempotency_key = request_key;
  if not found then
    if ip_hash is null then
      perform public.bump_order_rate_limit('ip:missing', interval '15 minutes', 4);
    else
      perform public.bump_order_rate_limit('ip:' || ip_hash, interval '15 minutes', 12);
    end if;
  end if;

  raw_items := p_payload->'items';
  if raw_items is null or jsonb_typeof(raw_items) <> 'array' then
    raise exception 'INVALID_ITEMS';
  end if;

  select * into settings from public.restaurant_order_settings where singleton;
  if not found then
    raise exception 'UNAVAILABLE';
  end if;
  if jsonb_array_length(raw_items) < 1 or jsonb_array_length(raw_items) > settings.max_lines then
    raise exception 'INVALID_ITEMS';
  end if;

  for item in select value from jsonb_array_elements(raw_items) loop
    begin
      menu_id := (item->>'menu_item_id')::uuid;
    exception when others then
      raise exception 'INVALID_ITEMS';
    end;
    option_id := null;
    if nullif(item->>'price_option_id', '') is not null then
      begin
        option_id := (item->>'price_option_id')::uuid;
      exception when others then
        raise exception 'VARIANT_REQUIRED';
      end;
    end if;
    begin
      quantity := (item->>'quantity')::integer;
    exception when others then
      raise exception 'QUANTITY_LIMIT';
    end;
    if (item->>'quantity') !~ '^[0-9]+$' or quantity < 1 or quantity > settings.max_line_quantity then
      raise exception 'QUANTITY_LIMIT';
    end if;
    line_note := nullif(left(regexp_replace(btrim(coalesce(item->>'special_instructions', '')), '[[:cntrl:]]', '', 'g'), 200), '');

    select items.name_ru, items.name_en, items.is_available, categories.is_active
    into item_name_ru, item_name_en, item_available, category_active
    from public.menu_items as items
    join public.categories as categories on categories.id = items.category_id
    where items.id = menu_id;

    if not found or not item_available or not category_active then
      raise exception 'ITEM_UNAVAILABLE';
    end if;

    select count(*) into option_count from public.item_price_options where item_id = menu_id;
    if option_count = 0 then
      raise exception 'ITEM_UNAVAILABLE';
    end if;
    if option_id is null then
      if option_count <> 1 then
        raise exception 'VARIANT_REQUIRED';
      end if;
      select id, price, label_ru, label_en
      into option_id, unit_price, variant_ru, variant_en
      from public.item_price_options
      where item_id = menu_id
      order by sort_order, price
      limit 1;
    else
      select id, price, label_ru, label_en
      into option_id, unit_price, variant_ru, variant_en
      from public.item_price_options
      where id = option_id and item_id = menu_id;
      if not found then
        raise exception 'VARIANT_REQUIRED';
      end if;
    end if;

    line_total := unit_price * quantity;
    order_total := order_total + line_total;
    clean_items := clean_items || jsonb_build_array(jsonb_build_object(
      'menu_item_id', menu_id,
      'price_option_id', option_id,
      'name_ru', item_name_ru,
      'name_en', item_name_en,
      'label_ru', variant_ru,
      'label_en', variant_en,
      'quantity', quantity,
      'unit_price', unit_price,
      'line_total', line_total,
      'special_instructions', line_note
    ));
  end loop;

  if order_total > settings.max_order_total then
    raise exception 'TOTAL_LIMIT';
  end if;

  select coalesce(jsonb_agg(elem order by elem->>'menu_item_id', elem->>'price_option_id', elem->>'special_instructions'), '[]'::jsonb)
  into sorted_items
  from jsonb_array_elements(clean_items) as elem;

  payload_hash := encode(digest(jsonb_build_object(
    'table_token', table_token,
    'customer_name', customer_name,
    'special_instructions', special_instructions,
    'allergy_notes', allergy_notes,
    'items', sorted_items
  )::text, 'sha256'), 'hex');

  select * into existing from public.restaurant_orders where restaurant_orders.idempotency_key = request_key;
  if found then
    if existing.payload_hash = payload_hash then
      return jsonb_build_object(
        'replayed', true,
        'tracking_token', existing.tracking_token,
        'order', public.order_public_json(existing.id)
      );
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  block_reason := public.restaurant_ordering_block_reason();
  if block_reason is not null then
    raise exception '%', block_reason;
  end if;

  select id, restaurant_qr_codes.table_number
  into qr_id, table_number
  from public.restaurant_qr_codes
  where token = table_token;
  if qr_id is null then
    raise exception 'INVALID_TABLE';
  end if;

  perform public.bump_order_rate_limit('table:' || qr_id::text, interval '15 minutes', 10);
  delete from public.order_rate_limits where window_start < now() - interval '1 day';

  if chat_id is null then
    chat_id := settings.orders_chat_id;
  end if;

  tracking_token := encode(gen_random_bytes(32), 'hex');
  tracking_hash := encode(digest(tracking_token, 'sha256'), 'hex');

  begin
    insert into public.restaurant_orders (
      table_qr_id, table_number, fulfillment_mode, order_status,
      customer_name, special_instructions, allergy_notes, currency, total_amount,
      payment_status, payment_method, idempotency_key, payload_hash,
      tracking_token_hash, tracking_token, guest_session_id, attention_required
    ) values (
      qr_id, table_number, 'dine_in', 'pending',
      customer_name, special_instructions, allergy_notes, 'UZS', order_total,
      'unpaid', 'at_restaurant', request_key, payload_hash,
      tracking_hash, tracking_token, guest_session_id, chat_id is null
    )
    returning id into order_id;
  exception when unique_violation then
    get stacked diagnostics constraint_name = CONSTRAINT_NAME;
    if constraint_name = 'restaurant_orders_idempotency_key_key' then
      select * into existing from public.restaurant_orders where restaurant_orders.idempotency_key = request_key;
      if existing.payload_hash = payload_hash then
        return jsonb_build_object(
          'replayed', true,
          'tracking_token', existing.tracking_token,
          'order', public.order_public_json(existing.id)
        );
      end if;
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    raise;
  end;

  insert into public.restaurant_order_items (
    order_id, menu_item_id, menu_item_name_snapshot, menu_item_name_en_snapshot,
    selected_variant_snapshot, quantity, unit_price, line_total, special_instructions
  )
  select
    order_id,
    (elem->>'menu_item_id')::uuid,
    elem->>'name_ru',
    elem->>'name_en',
    jsonb_build_object(
      'id', elem->>'price_option_id',
      'label_ru', elem->>'label_ru',
      'label_en', elem->>'label_en'
    ),
    (elem->>'quantity')::integer,
    (elem->>'unit_price')::integer,
    (elem->>'line_total')::integer,
    nullif(elem->>'special_instructions', '')
  from jsonb_array_elements(clean_items) as elem;

  insert into public.restaurant_order_status_events (
    order_id, previous_status, new_status, actor_type, actor_name
  ) values (
    order_id, null, 'pending', 'guest', null
  );

  insert into public.restaurant_order_notifications (
    order_id, destination_chat_id, delivery_status, attempt_count, last_error, next_attempt_at
  ) values (
    order_id,
    chat_id,
    case when chat_id is null then 'failed' else 'pending' end,
    case when chat_id is null then 8 else 0 end,
    case when chat_id is null then 'TELEGRAM_CHAT_NOT_CONFIGURED' else null end,
    now()
  );

  return jsonb_build_object(
    'replayed', false,
    'tracking_token', tracking_token,
    'order', public.order_public_json(order_id)
  );
end;
$$;

create or replace function public.apply_order_transition(
  p_order_id uuid,
  p_to_status text,
  p_actor_type text,
  p_actor_id text,
  p_actor_name text,
  p_role text,
  p_reason text,
  p_exceptional boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.restaurant_orders%rowtype;
  allowed boolean := false;
  clean_reason text;
begin
  if p_to_status not in ('pending', 'accepted', 'preparing', 'ready', 'serving', 'served', 'cancelled') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_actor_type not in ('staff', 'admin', 'system') then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into current_order
  from public.restaurant_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  clean_reason := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '[[:cntrl:]]', '', 'g'), '');

  allowed := (current_order.order_status, p_to_status) in (
    ('pending', 'accepted'),
    ('pending', 'cancelled'),
    ('accepted', 'preparing'),
    ('accepted', 'cancelled'),
    ('preparing', 'ready'),
    ('ready', 'served'),
    ('serving', 'served')
  );

  if not allowed or p_to_status = current_order.order_status then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_to_status = 'cancelled' and clean_reason is null then
    clean_reason := 'Отменено';
  end if;

  update public.restaurant_orders
  set
    order_status = p_to_status,
    cancellation_reason = case when p_to_status = 'cancelled' then clean_reason else cancellation_reason end
  where id = p_order_id
    and order_status = current_order.order_status;
  if not found then
    raise exception 'INVALID_TRANSITION';
  end if;

  insert into public.restaurant_order_status_events (
    order_id, previous_status, new_status, actor_type, actor_id, actor_name, reason, is_exceptional
  ) values (
    p_order_id,
    current_order.order_status,
    p_to_status,
    p_actor_type,
    nullif(p_actor_id, ''),
    nullif(btrim(coalesce(p_actor_name, '')), ''),
    clean_reason,
    coalesce(p_exceptional, false)
  );

  perform public.queue_order_notification(p_order_id);
  return public.order_public_json(p_order_id);
end;
$$;

create or replace function public.admin_transition_order(
  p_order_id uuid,
  p_to_status text,
  p_reason text default null,
  p_exceptional boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  return public.apply_order_transition(
    p_order_id,
    p_to_status,
    'admin',
    auth.uid()::text,
    'Администратор',
    'manager',
    p_reason,
    coalesce(p_exceptional, false)
  );
end;
$$;

create or replace function public.staff_by_telegram(p_telegram_user_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object('id', id, 'name', name, 'role', role)
  into result
  from public.restaurant_staff
  where telegram_user_id = p_telegram_user_id
    and is_active
  limit 1;
  return result;
end;
$$;

create or replace function public.staff_transition_order(
  p_telegram_user_id bigint,
  p_order_id uuid,
  p_to_status text,
  p_reason text default null,
  p_exceptional boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.restaurant_staff%rowtype;
begin
  select * into actor
  from public.restaurant_staff
  where telegram_user_id = p_telegram_user_id
    and is_active;
  if not found then
    raise exception 'NOT_ALLOWED';
  end if;
  return public.apply_order_transition(
    p_order_id,
    p_to_status,
    'staff',
    actor.id::text,
    actor.name,
    actor.role,
    p_reason,
    coalesce(p_exceptional, false) and actor.role = 'manager'
  );
end;
$$;

create or replace function public.guest_order_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  order_id uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select id into order_id
  from public.restaurant_orders
  where tracking_token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if order_id is null then
    return null;
  end if;
  return public.order_public_json(order_id);
end;
$$;

create or replace function public.claim_order_notifications(p_limit integer, p_order_id uuid default null)
returns table (order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.restaurant_order_notifications as notes
  set delivery_status = 'sending'
  where notes.id in (
    select queued.id
    from public.restaurant_order_notifications as queued
    where (p_order_id is null or queued.order_id = p_order_id)
      and (
        (queued.delivery_status = 'pending' and queued.next_attempt_at <= now())
        or (queued.delivery_status = 'sending' and queued.updated_at < now() - interval '2 minutes')
        or (queued.delivery_status = 'failed' and queued.attempt_count < 8 and queued.next_attempt_at <= now())
      )
    order by queued.created_at
    limit greatest(1, least(coalesce(p_limit, 5), 20))
    for update skip locked
  )
  returning notes.order_id;
end;
$$;

create or replace function public.complete_order_notification(
  p_order_id uuid,
  p_ok boolean,
  p_message_id bigint default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  attempts integer;
  clean_error text;
begin
  clean_error := nullif(left(regexp_replace(coalesce(p_error, ''), '[[:cntrl:]]', '', 'g'), 500), '');
  if p_ok then
    update public.restaurant_order_notifications
    set
      delivery_status = 'delivered',
      telegram_message_id = coalesce(p_message_id, telegram_message_id),
      delivered_at = now(),
      last_error = null,
      attempt_count = 0
    where order_id = p_order_id;
    update public.restaurant_orders
    set attention_required = false
    where id = p_order_id;
    return;
  end if;

  update public.restaurant_order_notifications
  set
    attempt_count = attempt_count + 1,
    last_error = clean_error,
    next_attempt_at = now() + least(interval '30 minutes', (interval '1 minute' * power(2, least(attempt_count + 1, 8)))),
    delivery_status = case when attempt_count + 1 >= 8 then 'failed' else 'pending' end
  where order_id = p_order_id
  returning attempt_count into attempts;

  if attempts is not null and attempts >= 8 then
    update public.restaurant_orders
    set attention_required = true
    where id = p_order_id;
  end if;
end;
$$;

create or replace function public.requeue_failed_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
  chat_id bigint;
begin
  select orders_chat_id into chat_id from public.restaurant_order_settings where singleton;
  update public.restaurant_order_notifications
  set
    delivery_status = 'pending',
    attempt_count = 0,
    next_attempt_at = now(),
    last_error = null,
    destination_chat_id = coalesce(chat_id, destination_chat_id)
  where delivery_status in ('failed', 'pending')
     or (delivery_status = 'sending' and updated_at < now() - interval '2 minutes');
  get diagnostics affected = row_count;
  update public.restaurant_orders as orders
  set attention_required = false
  where attention_required
    and exists (
      select 1 from public.restaurant_order_notifications as notes
      where notes.order_id = orders.id
        and notes.delivery_status = 'pending'
    );
  return affected;
end;
$$;

create or replace function public.record_telegram_update(p_update_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.telegram_update_receipts (update_id)
  values (p_update_id)
  on conflict (update_id) do nothing;
  return found;
end;
$$;

create or replace function public.release_telegram_update(p_update_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.telegram_update_receipts where update_id = p_update_id;
end;
$$;

create or replace function public.active_orders_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'public_order_number', orders.public_order_number,
      'table_number', orders.table_number,
      'order_status', orders.order_status,
      'total_amount', orders.total_amount,
      'created_at', orders.created_at
    ) order by orders.created_at)
    from (
      select *
      from public.restaurant_orders
      where order_status not in ('served', 'cancelled')
      order by created_at
      limit 20
    ) as orders
  ), '[]'::jsonb);
end;
$$;

create or replace function public.order_id_by_number(p_number integer)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found_id uuid;
begin
  select id into found_id from public.restaurant_orders where public_order_number = p_number;
  return found_id;
end;
$$;

create or replace function public.set_staff_prompt(p_telegram_user_id bigint, p_order_id uuid, p_prompt text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.restaurant_staff_prompts (telegram_user_id, order_id, prompt, expires_at)
  values (p_telegram_user_id, p_order_id, p_prompt, now() + interval '10 minutes')
  on conflict (telegram_user_id) do update
  set order_id = excluded.order_id, prompt = excluded.prompt, expires_at = excluded.expires_at, created_at = now();
end;
$$;

create or replace function public.take_staff_prompt(p_telegram_user_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  delete from public.restaurant_staff_prompts
  where telegram_user_id = p_telegram_user_id
    and expires_at > now()
  returning jsonb_build_object('order_id', order_id, 'prompt', prompt) into result;
  delete from public.restaurant_staff_prompts
  where telegram_user_id = p_telegram_user_id
     or expires_at <= now();
  return result;
end;
$$;

create or replace function public.order_admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  today_start := (date_trunc('day', timezone('Asia/Tashkent', now()))) at time zone 'Asia/Tashkent';
  return jsonb_build_object(
    'pending', (select count(*) from public.restaurant_orders where order_status = 'pending'),
    'preparing', (select count(*) from public.restaurant_orders where order_status = 'preparing'),
    'ready_for_service', (select count(*) from public.restaurant_orders where order_status in ('ready', 'serving')),
    'served_today', (
      select count(*)
      from public.restaurant_orders as orders
      where orders.order_status = 'served'
        and exists (
          select 1 from public.restaurant_order_status_events as events
          where events.order_id = orders.id
            and events.new_status = 'served'
            and events.created_at >= today_start
        )
    ),
    'cancelled_today', (
      select count(*)
      from public.restaurant_orders as orders
      where orders.order_status = 'cancelled'
        and exists (
          select 1 from public.restaurant_order_status_events as events
          where events.order_id = orders.id
            and events.new_status = 'cancelled'
            and events.created_at >= today_start
        )
    ),
    'attention', (select count(*) from public.restaurant_orders where attention_required)
  );
end;
$$;

create or replace function public.admin_set_prep_estimate(p_order_id uuid, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_minutes is not null and p_minutes not between 1 and 180 then
    raise exception 'INVALID_ITEMS';
  end if;
  update public.restaurant_orders
  set prep_estimate_minutes = p_minutes
  where id = p_order_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
end;
$$;

create or replace function public.admin_reissue_tracking(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token text;
  order_number integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  token := encode(gen_random_bytes(32), 'hex');
  update public.restaurant_orders
  set
    tracking_token = token,
    tracking_token_hash = encode(digest(token, 'sha256'), 'hex')
  where id = p_order_id
  returning public_order_number into order_number;
  if order_number is null then
    raise exception 'NOT_FOUND';
  end if;
  return jsonb_build_object(
    'public_order_number', order_number,
    'tracking_token', token
  );
end;
$$;

create or replace function public.admin_create_link_code(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text := '';
  index integer;
  expires_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.restaurant_staff where id = p_staff_id) then
    raise exception 'NOT_FOUND';
  end if;
  update public.restaurant_staff_link_codes
  set revoked_at = now()
  where staff_id = p_staff_id
    and used_at is null
    and revoked_at is null;

  bytes := gen_random_bytes(8);
  for index in 0..7 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, index) % 32), 1);
  end loop;
  expires_at := now() + interval '15 minutes';
  insert into public.restaurant_staff_link_codes (staff_id, code_hash, expires_at)
  values (p_staff_id, encode(digest(code, 'sha256'), 'hex'), expires_at);
  return jsonb_build_object('code', code, 'expires_at', expires_at);
end;
$$;

create or replace function public.redeem_staff_link(p_code text, p_telegram_user_id bigint, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text;
  link public.restaurant_staff_link_codes%rowtype;
  actor public.restaurant_staff%rowtype;
begin
  normalized := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if char_length(normalized) < 6 or p_telegram_user_id is null then
    raise exception 'LINK_INVALID';
  end if;
  perform public.bump_order_rate_limit('link:' || p_telegram_user_id::text, interval '15 minutes', 8);

  select * into link
  from public.restaurant_staff_link_codes
  where code_hash = encode(digest(normalized, 'sha256'), 'hex')
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'LINK_INVALID';
  end if;

  if exists (
    select 1 from public.restaurant_staff
    where telegram_user_id = p_telegram_user_id
      and id <> link.staff_id
  ) then
    raise exception 'ALREADY_LINKED';
  end if;

  update public.restaurant_staff
  set
    telegram_user_id = p_telegram_user_id,
    telegram_username = nullif(left(regexp_replace(coalesce(p_username, ''), '[^A-Za-z0-9_]', '', 'g'), 64), ''),
    is_active = true
  where id = link.staff_id
  returning * into actor;

  update public.restaurant_staff_link_codes
  set used_at = now()
  where id = link.id;

  return jsonb_build_object('id', actor.id, 'name', actor.name, 'role', actor.role);
end;
$$;

revoke all on function public.restaurant_ordering_block_reason() from public, anon, authenticated;
revoke all on function public.bump_order_rate_limit(text, interval, integer) from public, anon, authenticated;
revoke all on function public.order_public_json(uuid) from public, anon, authenticated;
revoke all on function public.order_notification_bundle(uuid) from public, anon, authenticated;
revoke all on function public.queue_order_notification(uuid) from public, anon, authenticated;
revoke all on function public.create_restaurant_order(jsonb) from public, anon, authenticated;
revoke all on function public.apply_order_transition(uuid, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.staff_by_telegram(bigint) from public, anon, authenticated;
revoke all on function public.staff_transition_order(bigint, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.guest_order_by_token(text) from public, anon, authenticated;
revoke all on function public.claim_order_notifications(integer, uuid) from public, anon, authenticated;
revoke all on function public.complete_order_notification(uuid, boolean, bigint, text) from public, anon, authenticated;
revoke all on function public.requeue_failed_notifications() from public, anon, authenticated;
revoke all on function public.record_telegram_update(bigint) from public, anon, authenticated;
revoke all on function public.release_telegram_update(bigint) from public, anon, authenticated;
revoke all on function public.active_orders_summary() from public, anon, authenticated;
revoke all on function public.order_id_by_number(integer) from public, anon, authenticated;
revoke all on function public.set_staff_prompt(bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.take_staff_prompt(bigint) from public, anon, authenticated;
revoke all on function public.redeem_staff_link(text, bigint, text) from public, anon, authenticated;
revoke all on function public.restaurant_order_settings_guard() from public, anon, authenticated;

grant execute on function public.public_ordering_status() to anon, authenticated, service_role;
grant execute on function public.order_admin_stats() to authenticated, service_role;
grant execute on function public.admin_transition_order(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.admin_set_prep_estimate(uuid, integer) to authenticated, service_role;
grant execute on function public.admin_reissue_tracking(uuid) to authenticated, service_role;
grant execute on function public.admin_create_link_code(uuid) to authenticated, service_role;

grant execute on function public.create_restaurant_order(jsonb) to service_role;
grant execute on function public.guest_order_by_token(text) to service_role;
grant execute on function public.order_notification_bundle(uuid) to service_role;
grant execute on function public.claim_order_notifications(integer, uuid) to service_role;
grant execute on function public.complete_order_notification(uuid, boolean, bigint, text) to service_role;
grant execute on function public.requeue_failed_notifications() to service_role;
grant execute on function public.record_telegram_update(bigint) to service_role;
grant execute on function public.release_telegram_update(bigint) to service_role;
grant execute on function public.staff_by_telegram(bigint) to service_role;
grant execute on function public.staff_transition_order(bigint, uuid, text, text, boolean) to service_role;
grant execute on function public.active_orders_summary() to service_role;
grant execute on function public.order_id_by_number(integer) to service_role;
grant execute on function public.set_staff_prompt(bigint, uuid, text) to service_role;
grant execute on function public.take_staff_prompt(bigint) to service_role;
grant execute on function public.redeem_staff_link(text, bigint, text) to service_role;
grant execute on function public.apply_order_transition(uuid, text, text, text, text, text, text, boolean) to service_role;

alter table public.restaurant_order_settings enable row level security;
alter table public.restaurant_orders enable row level security;
alter table public.restaurant_order_items enable row level security;
alter table public.restaurant_order_status_events enable row level security;
alter table public.restaurant_staff enable row level security;
alter table public.restaurant_staff_link_codes enable row level security;
alter table public.restaurant_staff_prompts enable row level security;
alter table public.restaurant_order_notifications enable row level security;
alter table public.telegram_update_receipts enable row level security;
alter table public.order_rate_limits enable row level security;

drop policy if exists "Admins read order settings" on public.restaurant_order_settings;
create policy "Admins read order settings"
on public.restaurant_order_settings for select to authenticated
using (public.is_admin());

drop policy if exists "Admins update order settings" on public.restaurant_order_settings;
create policy "Admins update order settings"
on public.restaurant_order_settings for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins read orders" on public.restaurant_orders;
create policy "Admins read orders"
on public.restaurant_orders for select to authenticated
using (public.is_admin());

drop policy if exists "Admins read order items" on public.restaurant_order_items;
create policy "Admins read order items"
on public.restaurant_order_items for select to authenticated
using (public.is_admin());

drop policy if exists "Admins read order events" on public.restaurant_order_status_events;
create policy "Admins read order events"
on public.restaurant_order_status_events for select to authenticated
using (public.is_admin());

drop policy if exists "Admins read notifications" on public.restaurant_order_notifications;
create policy "Admins read notifications"
on public.restaurant_order_notifications for select to authenticated
using (public.is_admin());

drop policy if exists "Admins read staff" on public.restaurant_staff;
create policy "Admins read staff"
on public.restaurant_staff for select to authenticated
using (public.is_admin());

drop policy if exists "Admins insert staff" on public.restaurant_staff;
create policy "Admins insert staff"
on public.restaurant_staff for insert to authenticated
with check (public.is_admin());

drop policy if exists "Admins update staff" on public.restaurant_staff;
create policy "Admins update staff"
on public.restaurant_staff for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete staff" on public.restaurant_staff;
create policy "Admins delete staff"
on public.restaurant_staff for delete to authenticated
using (public.is_admin());

revoke all on table public.restaurant_orders from anon, authenticated;
revoke all on table public.restaurant_order_items from anon, authenticated;
revoke all on table public.restaurant_order_status_events from anon, authenticated;
revoke all on table public.restaurant_order_notifications from anon, authenticated;
revoke all on table public.restaurant_order_settings from anon, authenticated;
revoke all on table public.restaurant_staff from anon, authenticated;
revoke all on table public.restaurant_staff_link_codes from anon, authenticated;
revoke all on table public.restaurant_staff_prompts from anon, authenticated;
revoke all on table public.telegram_update_receipts from anon, authenticated;
revoke all on table public.order_rate_limits from anon, authenticated;
revoke all on sequence public.restaurant_order_number_seq from anon, authenticated;

grant select (
  id, public_order_number, table_qr_id, table_number, fulfillment_mode, order_status,
  customer_name, special_instructions, allergy_notes, currency, total_amount,
  payment_status, payment_method, prep_estimate_minutes, cancellation_reason,
  attention_required, created_at, updated_at
) on public.restaurant_orders to authenticated;

grant select on public.restaurant_order_items to authenticated;
grant select on public.restaurant_order_status_events to authenticated;
grant select on public.restaurant_order_notifications to authenticated;
grant select, update on public.restaurant_order_settings to authenticated;
grant select, insert, update, delete on public.restaurant_staff to authenticated;

notify pgrst, 'reload schema';
