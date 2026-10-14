-- Keep catalog products available while active reservations depend on them.
-- Product hard-delete is already blocked by part_reservations.product_id's
-- ON DELETE RESTRICT foreign key; this trigger adds the equivalent archive
-- guard and also covers pricelist replacement RPCs.
create or replace function catalog.prevent_archive_with_active_reservations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.is_active is true
     and new.is_active is false
     and (exists (
       select 1
       from operations.part_reservations r
       where r.product_id = old.id
         and r.status in (
           'pending', 'approved', 'waiting_for_stock',
           'partially_available', 'available'
         )
     ) or exists (
       select 1 from catalog.inventory_balances b
       where b.product_id = old.id and b.reserved > 0
     ) or exists (
       select 1 from operations.service_order_items i
       join operations.service_orders s on s.id = i.service_order_id
       where i.product_id = old.id and s.status in ('pending', 'in_progress')
     )) then
    raise exception using
      errcode = '23503',
      message = 'IN_USE: This product has an active reservation, allocated stock, or an open service order. Finish or cancel the linked work before archiving it.';
  end if;

  return new;
end;
$function$;

revoke all on function catalog.prevent_archive_with_active_reservations() from public, anon, authenticated;
drop trigger if exists prevent_archive_with_active_reservations on catalog.products;
create trigger prevent_archive_with_active_reservations
before update of is_active on catalog.products
for each row
execute function catalog.prevent_archive_with_active_reservations();

-- One reservation order can contain multiple product lines. Existing rows are
-- backfilled as one-line orders so their history and workflow remain usable.
create table if not exists operations.part_reservation_orders (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  reservation_number text not null unique,
  customer_id uuid not null references operations.customers(id) on delete restrict,
  request_key uuid not null,
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid')),
  customer_note text,
  estimated_total numeric(12,2) not null default 0 check (estimated_total >= 0),
  sale_id uuid references operations.sales_transactions(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.timezone('utc', now()),
  updated_at timestamptz not null default pg_catalog.timezone('utc', now()),
  unique (customer_id, request_key)
);

alter table operations.part_reservations
  add column if not exists reservation_order_id uuid
    references operations.part_reservation_orders(id) on delete restrict,
  add column if not exists unit_price_snapshot numeric(12,2)
    check (unit_price_snapshot is null or unit_price_snapshot >= 0),
  add column if not exists line_total numeric(12,2)
    check (line_total is null or line_total >= 0);

create index if not exists part_reservations_order_idx
  on operations.part_reservations(reservation_order_id, requested_at, product_id)
  where reservation_order_id is not null;

insert into operations.part_reservation_orders (
  reservation_number, customer_id, request_key, payment_status,
  customer_note, estimated_total, created_by, completed_at,
  created_at, updated_at
)
select
  r.reservation_number,
  r.customer_id,
  r.request_key,
  r.payment_status,
  r.customer_note,
  round(r.requested_quantity * coalesce(price.amount, 0), 2),
  r.processed_by,
  r.completed_at,
  r.created_at,
  r.updated_at
from operations.part_reservations r
left join lateral (
  select pp.amount
  from catalog.product_prices pp
  where pp.product_id = r.product_id
    and pp.price_type = 'retail'
    and pp.is_current
  order by pp.created_at desc, pp.id desc
  limit 1
) price on true
where r.reservation_order_id is null
on conflict (customer_id, request_key) do nothing;

update operations.part_reservations r
set reservation_order_id = o.id,
    unit_price_snapshot = coalesce(
      r.unit_price_snapshot,
      (select pp.amount
       from catalog.product_prices pp
       where pp.product_id = r.product_id
         and pp.price_type = 'retail'
         and pp.is_current
       order by pp.created_at desc, pp.id desc
       limit 1),
      0
    ),
    line_total = coalesce(
      r.line_total,
      round(r.requested_quantity * coalesce((
        select pp.amount
        from catalog.product_prices pp
        where pp.product_id = r.product_id
          and pp.price_type = 'retail'
          and pp.is_current
        order by pp.created_at desc, pp.id desc
        limit 1
      ), 0), 2)
    )
from operations.part_reservation_orders o
where r.reservation_order_id is null
  and o.customer_id = r.customer_id
  and o.request_key = r.request_key;

alter table operations.part_reservation_orders enable row level security;
drop policy if exists part_reservation_orders_visible_to_internal_users
  on operations.part_reservation_orders;
create policy part_reservation_orders_visible_to_internal_users
on operations.part_reservation_orders
for select to authenticated
using ((select private.is_internal_user()));

revoke all on operations.part_reservation_orders from anon, authenticated;
grant select on operations.part_reservation_orders to authenticated;
grant all on operations.part_reservation_orders to service_role;

-- Aggregate in PostgreSQL so API row limits cannot truncate an order's
-- readiness checks when the queue contains many multi-part orders.
create or replace function public.reservation_order_summaries(p_order_ids uuid[])
returns jsonb language sql stable security invoker set search_path = ''
as $function$
select coalesce(pg_catalog.jsonb_agg(summary), '[]'::jsonb)
from (
  select o.id, o.reservation_number as "reservationNumber",
    o.estimated_total as "estimatedTotal", o.payment_status as "paymentStatus",
    o.sale_id as "saleId", pg_catalog.count(r.id) as "partCount",
    o.sale_id is null
      and pg_catalog.count(r.id) filter (where r.status not in ('cancelled', 'rejected')) > 0
      and coalesce(pg_catalog.bool_and(r.status = 'available' and r.allocated_quantity = r.requested_quantity)
        filter (where r.status not in ('cancelled', 'rejected')), false) as "readyForCheckout"
  from operations.part_reservation_orders o
  left join operations.part_reservations r on r.reservation_order_id = o.id
  where o.id = any(p_order_ids)
  group by o.id
) summary;
$function$;
revoke all on function public.reservation_order_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.reservation_order_summaries(uuid[]) to service_role;

-- Create a multi-line reservation atomically. The client supplies only product
-- IDs and quantities; the database takes the price snapshots from the active
-- retail pricelist and persists an order total.
create or replace function public.create_admin_part_reservation_order(
  p_actor_user_id uuid,
  p_items jsonb,
  p_request_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_note text default null,
  p_payment_status text default 'unpaid'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.timezone('utc', now());
  v_customer operations.customers%rowtype;
  v_product catalog.products%rowtype;
  v_order operations.part_reservation_orders%rowtype;
  v_existing operations.part_reservation_orders%rowtype;
  v_reservation operations.part_reservations%rowtype;
  v_phone text := pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_customer_phone, '')), '[^0-9]', '', 'g');
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_customer_email, '')));
  v_name text := pg_catalog.btrim(coalesce(p_customer_name, ''));
  v_payment_status text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_status, 'unpaid')));
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(12,2);
  v_unit_price numeric(12,2);
  v_total numeric(12,2) := 0;
  v_number text;
  v_count integer;
  v_index integer := 0;
  v_lines jsonb := '[]'::jsonb;
begin
  perform operations.assert_reservation_admin(p_actor_user_id);

  if p_request_key is null then raise exception 'A request key is required.'; end if;
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    raise exception 'Choose between 1 and 50 parts for one reservation.';
  end if;
  if pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 50 then
    raise exception 'Choose between 1 and 50 parts for one reservation.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) item
    where coalesce(item.value->>'productId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or coalesce(item.value->>'quantity', '') !~ '^[0-9]{1,3}$'
       or case
            when coalesce(item.value->>'quantity', '') ~ '^[0-9]{1,3}$'
              then (item.value->>'quantity')::numeric < 1
                or (item.value->>'quantity')::numeric > 999
            else false
          end
  ) then
    raise exception 'Each reserved part must have a valid product and whole-number quantity from 1 to 999.';
  end if;
  select pg_catalog.count(*), pg_catalog.count(distinct pg_catalog.lower(item.value->>'productId'))
    into v_count, v_index
  from pg_catalog.jsonb_array_elements(p_items) item;
  if v_count <> v_index then
    raise exception 'Add each part once and adjust its quantity instead of duplicating it.';
  end if;
  if pg_catalog.length(v_name) < 2 or pg_catalog.length(v_name) > 120 then raise exception 'A valid customer name is required.'; end if;
  if v_phone !~ '^0[0-9]{9,10}$' then raise exception 'A valid Philippine phone number is required.'; end if;
  if v_email <> '' and (pg_catalog.length(v_email) > 160 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'A valid email address is required.';
  end if;
  if v_payment_status not in ('unpaid', 'partial', 'paid') then raise exception 'Choose a valid payment status.'; end if;
  if pg_catalog.length(coalesce(p_customer_note, '')) > 1000 then raise exception 'The reservation note is too long.'; end if;

  -- Use the same outer lock as POS and pricelist activation before row locks.
  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);

  -- Prevent duplicate walk-in customer creation for concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_phone, 0));
  select * into v_customer
  from operations.customers
  where phone = v_phone
     or (v_email <> '' and pg_catalog.lower(coalesce(email, '')) = v_email)
  order by updated_at desc nulls last, created_at desc, id
  limit 1
  for update;

  if not found then
    insert into operations.customers (customer_type, name, phone, email, metadata, business_date)
    values ('walk_in', v_name, v_phone, nullif(v_email, ''), pg_catalog.jsonb_build_object('source', 'admin_reservation'), current_date)
    returning * into v_customer;
  else
    update operations.customers
    set name = v_name,
        phone = v_phone,
        email = coalesce(nullif(v_email, ''), email),
        metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object('source', 'admin_reservation'),
        updated_at = v_now
    where id = v_customer.id
    returning * into v_customer;
  end if;

  select * into v_existing
  from operations.part_reservation_orders
  where customer_id = v_customer.id and request_key = p_request_key;
  if found then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.requested_at, r.product_id), '[]'::jsonb)
      into v_lines
    from operations.part_reservations r
    where r.reservation_order_id = v_existing.id;
    return pg_catalog.jsonb_build_object('order', pg_catalog.to_jsonb(v_existing), 'reservations', v_lines, 'idempotentReplay', true);
  end if;

  -- Lock products in stable order. The archive trigger sees this transaction's
  -- inserted active reservation rows before another archive can proceed.
  perform p.id
  from catalog.products p
  join pg_catalog.jsonb_array_elements(p_items) item
    on p.id = (item.value->>'productId')::uuid
  order by p.id
  for share of p;
  get diagnostics v_index = row_count;
  if v_index <> v_count then raise exception 'One or more selected parts were not found.'; end if;
  v_index := 0;

  v_number := 'PR-' || pg_catalog.to_char(v_now, 'YYYYMMDD') || '-' ||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 8));
  insert into operations.part_reservation_orders (
    reservation_number, customer_id, request_key, payment_status,
    customer_note, created_by, created_at, updated_at
  ) values (
    v_number, v_customer.id, p_request_key, v_payment_status,
    nullif(pg_catalog.btrim(p_customer_note), ''), p_actor_user_id, v_now, v_now
  ) returning * into v_order;

  for v_item in
    select item.value
    from pg_catalog.jsonb_array_elements(p_items) item
    order by (item.value->>'productId')::uuid
  loop
    v_product_id := (v_item->>'productId')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    select * into v_product
    from catalog.products
    where id = v_product_id
    for share;
    if not found or not v_product.is_active or v_product.status = 'discontinued' then
      raise exception 'A selected part is no longer available for reservation.';
    end if;

    select pp.amount into v_unit_price
    from catalog.product_prices pp
    where pp.product_id = v_product_id
      and pp.price_type = 'retail'
      and pp.is_current
    order by pp.created_at desc, pp.id desc
    limit 1;
    if v_unit_price is null then raise exception 'A selected part has no current retail price.'; end if;

    insert into catalog.inventory_balances (
      product_id, on_hand, reserved, reorder_point, reorder_quantity,
      location, as_of_date, business_date, updated_at
    ) values (
      v_product_id, 0, 0, 0, 0, '{}'::jsonb, current_date, current_date, v_now
    ) on conflict (product_id) do nothing;

    v_index := v_index + 1;
    insert into operations.part_reservations (
      reservation_number, customer_id, product_id, requested_quantity,
      request_key, customer_note, payment_status, reservation_order_id,
      unit_price_snapshot, line_total, created_at, updated_at
    ) values (
      v_number || '-' || pg_catalog.lpad(v_index::text, 2, '0'),
      v_customer.id, v_product_id, v_quantity,
      pg_catalog.gen_random_uuid(), nullif(pg_catalog.btrim(p_customer_note), ''),
      v_payment_status, v_order.id, v_unit_price,
      pg_catalog.round(v_quantity * v_unit_price, 2), v_now, v_now
    ) returning * into v_reservation;

    v_total := v_total + v_reservation.line_total;
    insert into operations.part_reservation_events (
      reservation_id, event_type, to_status, quantity, actor_user_id, note, metadata
    ) values (
      v_reservation.id, 'created_by_admin', 'pending', v_quantity,
      p_actor_user_id, v_reservation.customer_note,
      pg_catalog.jsonb_build_object('source', 'admin', 'reservationOrderId', v_order.id)
    );
  end loop;

  update operations.part_reservation_orders
  set estimated_total = pg_catalog.round(v_total, 2), updated_at = v_now
  where id = v_order.id
  returning * into v_order;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.requested_at, r.product_id), '[]'::jsonb)
    into v_lines
  from operations.part_reservations r
  where r.reservation_order_id = v_order.id;

  return pg_catalog.jsonb_build_object('order', pg_catalog.to_jsonb(v_order), 'reservations', v_lines, 'idempotentReplay', false);
end;
$function$;

revoke all on function public.create_admin_part_reservation_order(uuid, jsonb, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_admin_part_reservation_order(uuid, jsonb, uuid, text, text, text, text, text)
  to service_role;

-- Complete the entire reservation order as one actual POS sale. All lines,
-- stock release, sale rows and reservation events commit or roll back together.
create or replace function public.complete_admin_part_reservation_order(
  p_reservation_id uuid,
  p_actor_user_id uuid,
  p_payment_method text,
  p_cash_received numeric default 0,
  p_expected_total numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.timezone('utc', now());
  v_order_id uuid;
  v_order operations.part_reservation_orders%rowtype;
  v_payment_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method, '')));
  v_cash_received numeric(12,2) := pg_catalog.round(coalesce(p_cash_received, 0), 2);
  v_line_count integer;
  v_ready_count integer;
  v_total numeric(12,2) := 0;
  v_items jsonb;
  v_payload jsonb;
  v_sale_id uuid;
  v_transaction_number text;
  v_reservation operations.part_reservations%rowtype;
begin
  perform operations.assert_reservation_admin(p_actor_user_id);
  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);

  select r.reservation_order_id into v_order_id
  from operations.part_reservations r
  where r.id = p_reservation_id;
  if v_order_id is null then raise exception 'This reservation is not part of a multi-part reservation order.'; end if;

  -- Match the stock-first lock order used by individual reservation actions.
  perform b.product_id
  from catalog.inventory_balances b
  join operations.part_reservations r on r.product_id = b.product_id
  where r.reservation_order_id = v_order_id
  order by b.product_id
  for update of b;

  select * into v_order
  from operations.part_reservation_orders
  where id = v_order_id
  for update;
  if not found then raise exception 'Reservation order was not found.'; end if;

  if v_order.sale_id is not null then
    select st.transaction_number into v_transaction_number
    from operations.sales_transactions st where st.id = v_order.sale_id;
    return pg_catalog.jsonb_build_object(
      'orderId', v_order.id, 'saleId', v_order.sale_id,
      'transactionNumber', v_transaction_number,
      'totalAmount', v_order.estimated_total, 'idempotentReplay', true
    );
  end if;

  if v_payment_method not in ('cash', 'gcash', 'bank_transfer') then
    raise exception 'Choose a valid payment method.';
  end if;

  select pg_catalog.count(*), pg_catalog.count(*) filter (
    where r.status = 'available' and r.allocated_quantity = r.requested_quantity
  ) into v_line_count, v_ready_count
  from operations.part_reservations r
  where r.reservation_order_id = v_order_id
    and r.status not in ('cancelled', 'rejected');
  if v_line_count < 1 then raise exception 'This reservation order has no parts.'; end if;
  if v_ready_count <> v_line_count then
    raise exception 'All parts in the reservation order must be fully allocated before checkout.';
  end if;

  -- Current prices are used at pickup and revalidated by create_pos_sale.
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'lineType', 'product',
    'productId', r.product_id,
    'quantity', r.requested_quantity,
    'unitPrice', cp.amount,
    'lineTotal', pg_catalog.round(r.requested_quantity * cp.amount, 2),
    'displayName', p.name,
    'sku', p.sku
  ) order by r.product_id),
  pg_catalog.round(pg_catalog.sum(r.requested_quantity * cp.amount), 2)
  into v_items, v_total
  from operations.part_reservations r
  join catalog.products p on p.id = r.product_id and p.is_active
  join catalog.product_prices cp on cp.product_id = r.product_id and cp.price_type = 'retail' and cp.is_current
  where r.reservation_order_id = v_order_id
    and r.status not in ('cancelled', 'rejected');

  if coalesce(pg_catalog.jsonb_array_length(v_items), 0) <> v_line_count then
    raise exception 'A reserved part is archived or has no current retail price. Review the order before checkout.';
  end if;
  if p_expected_total is null or pg_catalog.round(p_expected_total, 2) is distinct from v_total then
    raise exception using errcode = 'PT409', message = 'The reservation total changed. Review the current prices before checkout.';
  end if;
  if v_payment_method = 'cash' and v_cash_received < v_total then
    raise exception 'Cash received must cover the full reservation total.';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'customerName', (select c.name from operations.customers c where c.id = v_order.customer_id),
    'paymentMethod', v_payment_method,
    'cashReceived', case when v_payment_method = 'cash' then v_cash_received else 0 end,
    'changeDue', case when v_payment_method = 'cash' then greatest(v_cash_received - v_total, 0) else 0 end,
    'discountPercent', 0,
    'totals', pg_catalog.jsonb_build_object(
      'rawSubtotal', v_total, 'discountAmount', 0, 'tax', 0, 'total', v_total
    ),
    'items', v_items
  );

  -- Release reserved units before the POS RPC reduces on-hand stock. This
  -- preserves the inventory constraint (reserved <= on_hand) throughout the
  -- transaction. If sale creation fails, PostgreSQL rolls this release back.
  for v_reservation in
    select r.* from operations.part_reservations r
    where r.reservation_order_id = v_order_id
      and r.status = 'available'
    order by r.product_id
    for update
  loop
    update catalog.inventory_balances b
    set reserved = b.reserved - v_reservation.allocated_quantity,
        updated_at = v_now,
        as_of_date = current_date,
        business_date = current_date
    where b.product_id = v_reservation.product_id
      and b.reserved >= v_reservation.allocated_quantity;
    if not found then raise exception 'Reserved inventory is inconsistent; no changes were applied.'; end if;
  end loop;

  v_sale_id := public.create_pos_sale(v_payload, p_actor_user_id);
  update operations.sales_transactions set customer_id = v_order.customer_id where id = v_sale_id;

  for v_reservation in
    select r.* from operations.part_reservations r
    where r.reservation_order_id = v_order_id
      and r.status = 'available'
    order by r.product_id
    for update
  loop

    update catalog.products p
    set status = case
        when b.on_hand - b.reserved <= 0 then 'out_of_stock'
        when b.on_hand - b.reserved <= 5 then 'low_stock'
        else 'in_stock'
      end,
      updated_at = v_now
    from catalog.inventory_balances b
    where p.id = v_reservation.product_id and b.product_id = p.id;

    update operations.part_reservations
    set status = 'completed', completed_at = v_now,
        payment_status = 'paid',
        processed_by = p_actor_user_id, last_processed_at = v_now, updated_at = v_now
    where id = v_reservation.id;

    insert into operations.part_reservation_events (
      reservation_id, event_type, from_status, to_status, quantity,
      actor_user_id, note, metadata
    ) values (
      v_reservation.id, 'completed_as_pos_sale', 'available', 'completed',
      v_reservation.allocated_quantity, p_actor_user_id,
      'Reservation completed and posted to POS sales.',
      pg_catalog.jsonb_build_object('saleId', v_sale_id, 'reservationOrderId', v_order_id)
    );
  end loop;

  update operations.part_reservation_orders
  set sale_id = v_sale_id, payment_status = 'paid', estimated_total = v_total,
      completed_at = v_now, updated_at = v_now
  where id = v_order_id
  returning * into v_order;

  select st.transaction_number into v_transaction_number
  from operations.sales_transactions st where st.id = v_sale_id;

  return pg_catalog.jsonb_build_object(
    'orderId', v_order.id, 'saleId', v_sale_id,
    'transactionNumber', v_transaction_number,
    'totalAmount', v_total, 'idempotentReplay', false
  );
end;
$function$;

revoke all on function public.complete_admin_part_reservation_order(uuid, uuid, text, numeric, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_admin_part_reservation_order(uuid, uuid, text, numeric, numeric)
  to service_role;

-- Keep older single-part callers compatible with the order checkout workflow.
create or replace function operations.attach_reservation_order()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_price numeric(12,2);
begin
  if new.reservation_order_id is not null then return new; end if;
  select amount into v_price from catalog.product_prices
  where product_id = new.product_id and price_type = 'retail' and is_current
  order by created_at desc, id desc limit 1;
  new.unit_price_snapshot := coalesce(v_price, 0);
  new.line_total := pg_catalog.round(new.requested_quantity * new.unit_price_snapshot, 2);
  insert into operations.part_reservation_orders (
    reservation_number, customer_id, request_key, payment_status,
    customer_note, estimated_total, created_by
  ) values (
    new.reservation_number, new.customer_id, new.request_key, new.payment_status,
    new.customer_note, new.line_total, new.processed_by
  ) returning id into new.reservation_order_id;
  return new;
end;
$function$;
revoke all on function operations.attach_reservation_order() from public, anon, authenticated;
create trigger attach_reservation_order before insert on operations.part_reservations
for each row execute function operations.attach_reservation_order();

-- The old stock-only completion must not bypass order checkout and Sales.
do $migration$
declare original text; revised text;
begin
  original := pg_catalog.pg_get_functiondef('public.process_part_reservation(uuid,text,uuid,text,date)'::regprocedure);
  revised := replace(original, 'elsif v_action = ''complete'' then',
    'elsif v_action = ''complete'' then
      raise exception using errcode = ''PT409'', message = ''Complete the reservation through order checkout to record its sale.'';');
  if revised = original then raise exception 'Unexpected reservation processing function; migration stopped safely.'; end if;
  execute revised;
end;
$migration$;

-- POS must leave stock allocated to other customers available for their orders.
-- The reservation checkout releases only its own units inside the sale transaction.
do $migration$
declare original text; revised text;
begin
  original := pg_catalog.pg_get_functiondef('operations.create_pos_sale_internal(jsonb,uuid)'::regprocedure);
  revised := replace(original, 'coalesce(ib.on_hand, 0) < rp.requested_quantity',
    'coalesce(ib.on_hand - ib.reserved, 0) < rp.requested_quantity');
  revised := replace(revised, 'Insufficient stock for one or more product lines.',
    'Insufficient unreserved stock for one or more product lines. Some stock may be allocated to reservations.');
  revised := pg_catalog.regexp_replace(revised, 'if exists\s*\(\s*with requested_products as',
    'perform b.product_id from catalog.inventory_balances b
      where b.product_id in (
        select (line.value->>''productId'')::uuid
        from pg_catalog.jsonb_array_elements(v_items) line(value)
        where coalesce(line.value->>''lineType'', ''product'') = ''product''
      ) order by b.product_id for update;
    if exists (with requested_products as');
  if revised = original or position('coalesce(ib.on_hand - ib.reserved, 0) < rp.requested_quantity' in revised) = 0
    or position('order by b.product_id for update' in revised) = 0 then
    raise exception 'Unexpected POS stock validation; migration stopped safely.';
  end if;
  execute revised;
end;
$migration$;

create or replace function private.prevent_linked_record_removal()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare in_use boolean := false; reason text;
begin
  if tg_table_schema = 'catalog' and tg_table_name = 'products' then
    in_use := exists (select 1 from operations.part_reservations where product_id = old.id)
      or exists (select 1 from operations.sales_transaction_items where product_id = old.id)
      or exists (select 1 from operations.estimate_items where product_id = old.id)
      or exists (select 1 from operations.service_order_items where product_id = old.id)
      or exists (select 1 from catalog.inventory_movements where product_id = old.id)
      or exists (select 1 from catalog.inventory_balances where product_id = old.id and (on_hand > 0 or reserved > 0))
      or exists (select 1 from stockroom.item_locations where item_id = old.id and is_active);
    reason := 'This product has stock or linked operational records. Preserve its history and use archive after linked work is finished.';
  elsif tg_table_schema = 'catalog' and tg_table_name = 'suppliers' then
    in_use := exists (select 1 from catalog.product_supplier_links where supplier_id = old.id)
      or exists (select 1 from catalog.stock_receipts where supplier_id = old.id)
      or exists (select 1 from catalog.stock_receiving_logs where supplier_id = old.id);
    reason := 'This supplier is used by products or receiving records and cannot be deleted.';
  elsif tg_table_schema = 'catalog' and tg_table_name = 'categories' then
    in_use := exists (select 1 from catalog.products where pg_catalog.lower(pg_catalog.btrim(category)) = pg_catalog.lower(pg_catalog.btrim(old.name)));
    reason := 'This category is used by products. Reassign those products before deleting it.';
  elsif tg_table_schema = 'operations' and tg_table_name = 'estimates' then
    in_use := exists (select 1 from operations.sales_transactions where estimate_id = old.id)
      or exists (select 1 from operations.service_orders where estimate_id = old.id);
    reason := 'This quotation is linked to a sale or service order and cannot be deleted.';
  elsif tg_table_schema = 'operations' and tg_table_name = 'mechanics' then
    if tg_op = 'UPDATE' and not (old.is_active and not new.is_active) then return new; end if;
    in_use := exists (select 1 from operations.service_orders where assigned_mechanic_id = old.id and status in ('pending', 'in_progress'))
      or exists (select 1 from operations.mechanic_assignments where mechanic_id = old.id and status = 'assigned');
    if tg_op = 'DELETE' then
      in_use := in_use or exists (select 1 from operations.mechanic_assignments where mechanic_id = old.id)
        or exists (select 1 from operations.service_orders where assigned_mechanic_id = old.id);
    end if;
    reason := 'This mechanic is linked to service work. Finish or reassign open work before deactivating; retain profiles with service history.';
  elsif tg_table_schema = 'stockroom' then
    if tg_table_name = 'zones' then
      in_use := exists (select 1 from stockroom.item_locations where zone_id = old.id and is_active);
    elsif tg_table_name = 'aisles' then
      in_use := exists (select 1 from stockroom.item_locations where aisle_id = old.id and is_active);
    elsif tg_table_name = 'shelves' then
      in_use := exists (select 1 from stockroom.item_locations where shelf_id = old.id and is_active);
    elsif tg_table_name = 'shelf_levels' then
      in_use := exists (select 1 from stockroom.item_locations where shelf_level_id = old.id and is_active);
    elsif tg_table_name = 'shelf_slots' then
      in_use := exists (select 1 from stockroom.item_locations where shelf_slot_id = old.id and is_active);
    end if;
    reason := 'This stockroom location contains assigned products. Move those products before deleting it.';
  end if;
  if in_use then raise exception using errcode = '23503', message = 'IN_USE: ' || reason; end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$function$;
revoke all on function private.prevent_linked_record_removal() from public, anon, authenticated;

create trigger prevent_linked_product_delete before delete on catalog.products
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_linked_supplier_delete before delete on catalog.suppliers
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_linked_category_delete before delete on catalog.categories
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_linked_estimate_delete before delete on operations.estimates
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_linked_mechanic_removal before delete or update of is_active on operations.mechanics
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_occupied_zone_delete before delete on stockroom.zones
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_occupied_aisle_delete before delete on stockroom.aisles
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_occupied_shelf_delete before delete on stockroom.shelves
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_occupied_level_delete before delete on stockroom.shelf_levels
for each row execute function private.prevent_linked_record_removal();
create trigger prevent_occupied_slot_delete before delete on stockroom.shelf_slots
for each row execute function private.prevent_linked_record_removal();
