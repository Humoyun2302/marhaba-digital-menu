-- Fix order creation and use one status path for the restaurant group.
-- Staff tables stay in place. Existing order history is kept.

update public.restaurant_orders
set order_status = 'ready'
where order_status = 'serving';

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
