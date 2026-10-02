-- Guest visits are separate from permanent table QR codes and from orders.
-- Existing QR tokens and historical orders are left in place.

alter table public.restaurant_order_settings
  add column if not exists guest_idle_minutes integer not null default 240,
  add column if not exists guest_max_hours integer not null default 12,
  add column if not exists personal_data_retention_days integer not null default 90;

do $$
begin
  alter table public.restaurant_order_settings
    add constraint restaurant_order_settings_idle_check check (guest_idle_minutes between 30 and 1440);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.restaurant_order_settings
    add constraint restaurant_order_settings_visit_hours_check check (guest_max_hours between 1 and 24);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.restaurant_order_settings
    add constraint restaurant_order_settings_retention_check check (personal_data_retention_days between 7 and 3650);
exception when duplicate_object then null;
end $$;

create table if not exists public.guest_visits (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  qr_code_id uuid not null references public.restaurant_qr_codes (id) on delete restrict,
  table_number integer not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  close_reason text,
  constraint guest_visits_secret_key unique (secret_hash),
  constraint guest_visits_status_check check (status in ('active', 'closed', 'revoked')),
  constraint guest_visits_table_check check (table_number between 1 and 120)
);

create index if not exists guest_visits_qr_status_idx
  on public.guest_visits (qr_code_id, status, expires_at);

alter table public.restaurant_orders
  add column if not exists visit_id uuid references public.guest_visits (id) on delete restrict;

create index if not exists restaurant_orders_visit_idx
  on public.restaurant_orders (visit_id);

alter table public.guest_visits enable row level security;
revoke all on public.guest_visits from public, anon, authenticated;

create or replace function public.redact_expired_guest_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  days integer;
begin
  select coalesce(personal_data_retention_days, 90) into days
  from public.restaurant_order_settings
  where singleton;
  update public.restaurant_orders
  set customer_name = null,
      special_instructions = null,
      allergy_notes = null
  where order_status in ('served', 'cancelled')
    and created_at < now() - make_interval(days => days)
    and (customer_name is not null or special_instructions is not null or allergy_notes is not null);
  update public.restaurant_order_items as items
  set special_instructions = null
  from public.restaurant_orders as orders
  where items.order_id = orders.id
    and items.special_instructions is not null
    and orders.order_status in ('served', 'cancelled')
    and orders.created_at < now() - make_interval(days => days);
end;
$$;

create or replace function public.open_guest_visit(
  p_token text,
  p_secret text default '',
  p_force_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  qr_id uuid;
  table_no integer;
  secret text;
  guest public.guest_visits%rowtype;
  idle_minutes integer := 240;
  max_hours integer := 12;
  active_orders integer := 0;
  new_id uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{32,128}$' then
    raise exception 'INVALID_TABLE';
  end if;

  select id, table_number
  into qr_id, table_no
  from public.restaurant_qr_codes
  where token = p_token;
  if qr_id is null then
    raise exception 'INVALID_TABLE';
  end if;

  select coalesce(guest_idle_minutes, 240), coalesce(guest_max_hours, 12)
  into idle_minutes, max_hours
  from public.restaurant_order_settings
  where singleton;

  secret := lower(btrim(coalesce(p_secret, '')));
  guest := null;

  if secret ~ '^[0-9a-f]{64}$' then
    select * into guest
    from public.guest_visits
    where secret_hash = encode(digest(secret, 'sha256'), 'hex')
    for update;
  end if;

  if coalesce(p_force_new, false) then
    if guest.id is not null and guest.qr_code_id = qr_id and guest.status = 'active' then
      update public.guest_visits
      set status = 'closed', closed_at = now(), close_reason = 'replaced'
      where id = guest.id;
    end if;
  elsif guest.id is not null and guest.qr_code_id = qr_id and guest.status = 'active' then
    if guest.expires_at > now()
      and guest.last_seen_at > now() - make_interval(mins => idle_minutes)
      and guest.created_at > now() - make_interval(hours => max_hours)
    then
      select count(*) into active_orders
      from public.restaurant_orders
      where visit_id = guest.id
        and order_status not in ('served', 'cancelled');
      if active_orders > 0 or not exists (select 1 from public.restaurant_orders where visit_id = guest.id) then
        update public.guest_visits
        set last_seen_at = now(),
            expires_at = least(
              guest.created_at + make_interval(hours => max_hours),
              now() + make_interval(mins => idle_minutes)
            )
        where id = guest.id;
        return jsonb_build_object(
          'session_id', guest.id,
          'session_secret', secret,
          'table_number', table_no,
          'resumed', true
        );
      end if;
      update public.guest_visits
      set status = 'closed', closed_at = now(), close_reason = 'completed'
      where id = guest.id and status = 'active';
    else
      update public.guest_visits
      set status = 'closed', closed_at = now(), close_reason = 'expired'
      where id = guest.id and status = 'active';
    end if;
  end if;

  perform public.bump_order_rate_limit('visit:' || qr_id::text, interval '10 minutes', 40);

  secret := encode(gen_random_bytes(32), 'hex');
  insert into public.guest_visits (secret_hash, qr_code_id, table_number, status, expires_at)
  values (
    encode(digest(secret, 'sha256'), 'hex'),
    qr_id,
    table_no,
    'active',
    now() + make_interval(mins => idle_minutes)
  )
  returning id into new_id;

  return jsonb_build_object(
    'session_id', new_id,
    'session_secret', secret,
    'table_number', table_no,
    'resumed', false
  );
end;
$$;

create or replace function public.guest_active_orders(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  guest public.guest_visits%rowtype;
  active_rows jsonb;
  recent_rows jsonb;
begin
  if p_secret is null or lower(p_secret) !~ '^[0-9a-f]{64}$' then
    raise exception 'SESSION_INVALID';
  end if;
  select * into guest
  from public.guest_visits
  where secret_hash = encode(digest(lower(p_secret), 'sha256'), 'hex');
  if not found or guest.status <> 'active' or guest.expires_at <= now() then
    raise exception 'SESSION_INVALID';
  end if;

  select coalesce(jsonb_agg(public.order_public_json(orders.id) || jsonb_build_object('tracking_token', orders.tracking_token) order by orders.created_at), '[]'::jsonb)
  into active_rows
  from public.restaurant_orders as orders
  where orders.visit_id = guest.id
    and orders.order_status not in ('served', 'cancelled');

  select coalesce(jsonb_agg(public.order_public_json(orders.id) || jsonb_build_object('tracking_token', orders.tracking_token) order by orders.updated_at desc), '[]'::jsonb)
  into recent_rows
  from public.restaurant_orders as orders
  where orders.visit_id = guest.id
    and orders.order_status in ('served', 'cancelled')
    and orders.updated_at > now() - interval '30 minutes';

  return jsonb_build_object('active', active_rows, 'recent', recent_rows);
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
  visit_status text;
  visit_expires timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select orders.id, visits.status, visits.expires_at
  into order_id, visit_status, visit_expires
  from public.restaurant_orders as orders
  left join public.guest_visits as visits on visits.id = orders.visit_id
  where orders.tracking_token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if order_id is null then
    return null;
  end if;
  if visit_status is not null and (visit_status <> 'active' or visit_expires <= now()) then
    return null;
  end if;
  return public.order_public_json(order_id);
end;
$$;

create or replace function public.admin_table_board()
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
    raise exception 'NOT_ALLOWED';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'table_number', codes.table_number,
    'active_orders', (
      select count(*)
      from public.restaurant_orders as orders
      where orders.table_qr_id = codes.id
        and orders.order_status not in ('served', 'cancelled')
    ),
    'active_visits', (
      select count(*)
      from public.guest_visits as visits
      where visits.qr_code_id = codes.id
        and visits.status = 'active'
        and visits.expires_at > now()
    )
  ) order by codes.table_number), '[]'::jsonb)
  into result
  from public.restaurant_qr_codes as codes;
  return result;
end;
$$;

create or replace function public.admin_release_table(p_table_number integer, p_unfinished text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  qr_id uuid;
  qr_token text;
  finished_count integer := 0;
  revoked_count integer := 0;
  order_row public.restaurant_orders%rowtype;
  next_status text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_unfinished not in ('cancel', 'serve') then
    raise exception 'CONFIRM_REQUIRED';
  end if;
  select id, token into qr_id, qr_token
  from public.restaurant_qr_codes
  where table_number = p_table_number;
  if qr_id is null then
    raise exception 'INVALID_TABLE';
  end if;

  next_status := case when p_unfinished = 'serve' then 'served' else 'cancelled' end;
  for order_row in
    select *
    from public.restaurant_orders
    where table_qr_id = qr_id
      and order_status not in ('served', 'cancelled')
    for update
  loop
    update public.restaurant_orders
    set order_status = next_status,
        cancellation_reason = case
          when next_status = 'cancelled' then 'Стол освобождён'
          else cancellation_reason
        end
    where id = order_row.id;
    insert into public.restaurant_order_status_events (
      order_id, previous_status, new_status, actor_type, actor_name, reason, is_exceptional
    ) values (
      order_row.id,
      order_row.order_status,
      next_status,
      'admin',
      'Администратор',
      'Стол освобождён',
      true
    );
    perform public.queue_order_notification(order_row.id);
    finished_count := finished_count + 1;
  end loop;

  update public.guest_visits
  set status = 'revoked', closed_at = now(), close_reason = 'table_reset'
  where qr_code_id = qr_id
    and status = 'active';
  get diagnostics revoked_count = row_count;

  return jsonb_build_object(
    'table_number', p_table_number,
    'token', qr_token,
    'revoked_visits', revoked_count,
    'finished_orders', finished_count
  );
end;
$$;

revoke all on function public.redact_expired_guest_data() from public, anon, authenticated;
revoke all on function public.open_guest_visit(text, text, boolean) from public;
revoke all on function public.guest_active_orders(text) from public;
revoke all on function public.guest_order_by_token(text) from public, anon, authenticated;
revoke all on function public.admin_table_board() from public, anon;
revoke all on function public.admin_release_table(integer, text) from public, anon;

grant execute on function public.open_guest_visit(text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.guest_active_orders(text) to anon, authenticated, service_role;
grant execute on function public.guest_order_by_token(text) to service_role;
grant execute on function public.admin_table_board() to authenticated, service_role;
grant execute on function public.admin_release_table(integer, text) to authenticated, service_role;
grant execute on function public.redact_expired_guest_data() to service_role;

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
  session_secret text;
  guest public.guest_visits%rowtype;
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
  guest_session_id := null;
  session_secret := lower(btrim(coalesce(p_payload->>'session_secret', '')));
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


  select id, restaurant_qr_codes.table_number
  into qr_id, table_number
  from public.restaurant_qr_codes
  where token = table_token;
  if qr_id is null then
    raise exception 'INVALID_TABLE';
  end if;

  if session_secret !~ '^[0-9a-f]{64}$' then
    raise exception 'SESSION_INVALID';
  end if;
  select * into guest
  from public.guest_visits
  where secret_hash = encode(digest(session_secret, 'sha256'), 'hex')
  for update;
  if not found then
    raise exception 'SESSION_INVALID';
  end if;
  if guest.status = 'revoked' then
    raise exception 'SESSION_REVOKED';
  end if;
  if guest.status <> 'active' or guest.expires_at <= now()
    or guest.last_seen_at < now() - make_interval(mins => settings.guest_idle_minutes) then
    raise exception 'SESSION_EXPIRED';
  end if;
  if guest.qr_code_id <> qr_id then
    raise exception 'SESSION_TABLE_MISMATCH';
  end if;
  guest_session_id := guest.id::text;

  select coalesce(jsonb_agg(elem order by elem->>'menu_item_id', elem->>'price_option_id', elem->>'special_instructions'), '[]'::jsonb)
  into sorted_items
  from jsonb_array_elements(clean_items) as elem;

  payload_hash := encode(digest(jsonb_build_object(
    'table_token', table_token,
    'visit_id', guest.id,
    'customer_name', customer_name,
    'special_instructions', special_instructions,
    'allergy_notes', allergy_notes,
    'items', sorted_items
  )::text, 'sha256'), 'hex');

  select * into existing from public.restaurant_orders where restaurant_orders.idempotency_key = request_key;
  if found then
    if existing.payload_hash = payload_hash and existing.visit_id = guest.id and guest.status = 'active' then
      return jsonb_build_object(
        'replayed', true,
        'tracking_token', existing.tracking_token,
        'notification_status', 'queued',
        'order', public.order_public_json(existing.id)
      );
    end if;
    if existing.visit_id = guest.id and guest.status <> 'active' then
      raise exception 'SESSION_REVOKED';
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  block_reason := public.restaurant_ordering_block_reason();
  if block_reason is not null then
    raise exception '%', block_reason;
  end if;

  perform public.bump_order_rate_limit('table:' || qr_id::text, interval '15 minutes', 10);
  delete from public.order_rate_limits where window_start < now() - interval '1 day';
  perform public.redact_expired_guest_data();

  if chat_id is null then
    chat_id := settings.orders_chat_id;
  end if;

  if p_payload ? 'expected_total' and nullif(p_payload->>'expected_total', '') is not null
     and (p_payload->>'expected_total') !~ '^[0-9]+$' then
    raise exception 'INVALID_ITEMS';
  end if;
  if p_payload ? 'expected_total' and nullif(p_payload->>'expected_total', '') is not null
     and (p_payload->>'expected_total')::integer is distinct from order_total then
    raise exception 'PRICE_CHANGED';
  end if;

  tracking_token := encode(gen_random_bytes(32), 'hex');
  tracking_hash := encode(digest(tracking_token, 'sha256'), 'hex');

  begin
    insert into public.restaurant_orders (
      table_qr_id, table_number, fulfillment_mode, order_status,
      customer_name, special_instructions, allergy_notes, currency, total_amount,
      payment_status, payment_method, idempotency_key, payload_hash,
      tracking_token_hash, tracking_token, guest_session_id, visit_id, attention_required
    ) values (
      qr_id, table_number, 'dine_in', 'pending',
      customer_name, special_instructions, allergy_notes, 'UZS', order_total,
      'unpaid', 'at_restaurant', request_key, payload_hash,
      tracking_hash, tracking_token, guest_session_id, guest.id, chat_id is null
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
          'notification_status', 'queued',
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

  update public.guest_visits
  set last_seen_at = now()
  where id = guest.id;

  return jsonb_build_object(
    'replayed', false,
    'tracking_token', tracking_token,
    'notification_status', case when chat_id is null then 'failed' else 'queued' end,
    'order', public.order_public_json(order_id)
  );
end;
$$;

