-- Auditable, idempotent POS sale returns with proportional VAT-inclusive refunds.
-- Returns are restricted to paid, itemized POS/quotation-conversion sales.

create table operations.sales_returns (
  id uuid primary key default gen_random_uuid(),
  return_number text not null unique,
  sale_id uuid not null references operations.sales_transactions(id) on delete restrict,
  reason text not null check (reason in ('wrong_part', 'defective', 'excess', 'other')),
  reason_note text not null default '' check (length(reason_note) <= 500),
  refund_method text not null check (refund_method in ('cash', 'check', 'store_credit')),
  refund_reference text not null default '' check (length(refund_reference) <= 120),
  refund_total numeric(12,2) not null check (refund_total > 0),
  refund_confirmed boolean not null check (refund_confirmed),
  processed_by uuid references auth.users(id) on delete set null,
  business_date date not null,
  created_at timestamptz not null default timezone('utc', now()),
  check (refund_method <> 'check' or length(btrim(refund_reference)) > 0),
  check (reason <> 'other' or length(btrim(reason_note)) > 0)
);

create index sales_returns_sale_history_idx
  on operations.sales_returns (sale_id, created_at desc, id);

create table operations.sales_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references operations.sales_returns(id) on delete restrict,
  sale_item_id uuid not null references operations.sales_transaction_items(id) on delete restrict,
  product_id uuid references catalog.products(id) on delete set null,
  item_name_snapshot text not null,
  item_sku_snapshot text not null default '',
  quantity numeric(12,2) not null check (quantity > 0),
  item_condition text not null check (item_condition in ('resalable', 'damaged')),
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (return_id, sale_item_id)
);

create index sales_return_items_sale_line_idx
  on operations.sales_return_items (sale_item_id, created_at, id);

create table operations.sales_return_requests (
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  payload jsonb not null,
  return_id uuid not null references operations.sales_returns(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_id, request_id)
);

alter table operations.sales_returns enable row level security;
alter table operations.sales_return_items enable row level security;
alter table operations.sales_return_requests enable row level security;
revoke all on operations.sales_returns, operations.sales_return_items, operations.sales_return_requests
  from public, anon, authenticated;
grant select, insert on operations.sales_returns, operations.sales_return_items, operations.sales_return_requests
  to service_role;

create or replace function public.get_pos_sale_return_context(p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with sale_header as (
    select st.id, st.transaction_number, st.status, st.payment_method,
      st.subtotal, st.total_amount, st.source_type, st.inventory_applied,
      st.pos_issued_at, st.pos_paid_at,
      coalesce(c.name, st.customer_name_snapshot, 'Walk-in Customer') as customer_name,
      (st.status = 'completed'
        and st.payment_method <> 'to_follow'
        and st.source_type in ('pos', 'estimate_conversion')
        and st.inventory_applied
        and st.pos_issued_at is not null
        and st.pos_paid_at is not null
        and st.subtotal > 0) as can_return
    from operations.sales_transactions st
    left join operations.customers c on c.id = st.customer_id
    where st.id = p_sale_id
  ),
  returned_by_line as (
    select sri.sale_item_id, sum(sri.quantity) as returned_quantity,
      sum(sri.refund_amount) as returned_amount
    from operations.sales_return_items sri
    join operations.sales_returns sr on sr.id = sri.return_id
    where sr.sale_id = p_sale_id
    group by sri.sale_item_id
  ),
  sale_lines as (
    select si.id, si.line_type, si.product_id, si.quantity, si.unit_price, si.line_total,
      coalesce(si.item_name_snapshot, p.name, 'Unnamed Item') as item_name,
      coalesce(si.item_sku_snapshot, p.sku, '') as item_sku,
      coalesce(r.returned_quantity, 0) as returned_quantity,
      coalesce(r.returned_amount, 0) as returned_amount,
      case when sh.can_return and si.line_type = 'product' and si.product_id is not null
        then greatest(si.quantity - coalesce(r.returned_quantity, 0), 0)
        else 0 end as returnable_quantity,
      case when sh.can_return and si.line_type = 'product' and si.product_id is not null
        then greatest(round(si.line_total * sh.total_amount / nullif(sh.subtotal, 0), 2) - coalesce(r.returned_amount, 0), 0)
        else 0 end as returnable_amount
    from operations.sales_transaction_items si
    join sale_header sh on sh.id = si.transaction_id
    left join catalog.products p on p.id = si.product_id
    left join returned_by_line r on r.sale_item_id = si.id
  ),
  return_line_lists as (
    select sri.return_id,
      jsonb_agg(jsonb_build_object(
        'id', sri.id, 'saleItemId', sri.sale_item_id, 'productId', sri.product_id,
        'itemName', sri.item_name_snapshot, 'itemSku', sri.item_sku_snapshot,
        'quantity', sri.quantity, 'condition', sri.item_condition,
        'refundAmount', sri.refund_amount
      ) order by sri.id) as items
    from operations.sales_return_items sri
    join operations.sales_returns sr on sr.id = sri.return_id
    where sr.sale_id = p_sale_id
    group by sri.return_id
  ),
  return_history as (
    select sr.id, sr.return_number, sr.reason, sr.reason_note,
      sr.refund_method, sr.refund_reference, sr.refund_total,
      sr.business_date, sr.created_at, sr.processed_by,
      up.full_name as processed_by_name,
      coalesce(rll.items, '[]'::jsonb) as items
    from operations.sales_returns sr
    left join core.user_profiles up on up.user_id = sr.processed_by
    left join return_line_lists rll on rll.return_id = sr.id
    where sr.sale_id = p_sale_id
  )
  select case when not exists (select 1 from sale_header) then null else
    (select jsonb_build_object(
      'sale', jsonb_build_object(
        'id', sh.id, 'transactionNumber', sh.transaction_number,
        'customerName', sh.customer_name, 'status', sh.status,
        'paymentMethod', sh.payment_method, 'sourceType', sh.source_type,
        'totalAmount', sh.total_amount, 'canReturn', sh.can_return
      ),
      'canReturn', sh.can_return,
      'totalRefunded', coalesce((select sum(r.refund_total) from operations.sales_returns r where r.sale_id = sh.id), 0),
      'netAmount', greatest(sh.total_amount - coalesce((select sum(r.refund_total) from operations.sales_returns r where r.sale_id = sh.id), 0), 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sl.id, 'lineType', sl.line_type, 'productId', sl.product_id,
          'itemName', sl.item_name, 'itemSku', sl.item_sku,
          'quantity', sl.quantity, 'unitPrice', sl.unit_price, 'lineTotal', sl.line_total,
          'returnedQuantity', sl.returned_quantity, 'returnedAmount', sl.returned_amount,
          'returnableQuantity', sl.returnable_quantity, 'returnableAmount', sl.returnable_amount
        ) order by sl.id)
        from sale_lines sl
      ), '[]'::jsonb),
      'returns', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', rh.id, 'returnNumber', rh.return_number, 'reason', rh.reason,
          'reasonNote', rh.reason_note, 'refundMethod', rh.refund_method,
          'refundReference', rh.refund_reference, 'refundTotal', rh.refund_total,
          'businessDate', rh.business_date, 'createdAt', rh.created_at,
          'processedBy', rh.processed_by, 'processedByName', rh.processed_by_name,
          'items', rh.items
        ) order by rh.created_at desc, rh.id)
        from return_history rh
      ), '[]'::jsonb)
    ) from sale_header sh)
  end;
$function$;

create or replace function public.create_pos_sale_return(
  p_sale_id uuid, p_payload jsonb, p_actor uuid, p_request uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_sale operations.sales_transactions%rowtype;
  v_sale_item operations.sales_transaction_items%rowtype;
  v_prior operations.sales_return_requests%rowtype;
  v_canonical jsonb;
  v_request_line jsonb;
  v_saved_line jsonb;
  v_saved_lines jsonb := '[]'::jsonb;
  v_sale_item_id uuid;
  v_quantity numeric(12,2);
  v_previous_quantity numeric(12,2);
  v_previous_refund numeric(12,2);
  v_line_refund numeric(12,2);
  v_target_refund numeric(12,2);
  v_refund numeric(12,2);
  v_refund_total numeric(12,2) := 0;
  v_reason text;
  v_reason_note text;
  v_refund_method text;
  v_refund_reference text;
  v_condition text;
  v_actor_name text;
  v_business_date date := (now() at time zone 'Asia/Manila')::date;
  v_return_id uuid;
  v_return_number text;
begin
  if p_sale_id is null or p_actor is null or p_request is null
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'items') is distinct from 'array'
    or jsonb_array_length(p_payload->'items') not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Choose a receipt and at least one item to return.';
  end if;

  if not exists (
    select 1 from core.user_profiles up
    where up.user_id = p_actor and up.role in ('admin', 'cashier')
  ) then
    raise exception using errcode = '42501', message = 'An administrator or cashier is required to record a return.';
  end if;

  v_reason := p_payload->>'reason';
  v_reason_note := btrim(coalesce(p_payload->>'reasonNote', ''));
  v_refund_method := p_payload->>'refundMethod';
  v_refund_reference := btrim(coalesce(p_payload->>'refundReference', ''));
  if v_reason is null or v_reason not in ('wrong_part', 'defective', 'excess', 'other')
    or length(v_reason_note) > 500
    or (v_reason = 'other' and v_reason_note = '')
    or v_refund_method is null or v_refund_method not in ('cash', 'check', 'store_credit')
    or length(v_refund_reference) > 120
    or (v_refund_method = 'check' and v_refund_reference = '')
    or p_payload->>'refundConfirmed' is distinct from 'true' then
    raise exception using errcode = '22023', message = 'Review the return reason, refund method and confirmation.';
  end if;

  if (select count(*) from jsonb_array_elements(p_payload->'items'))
    <> (select count(distinct value->>'saleItemId') from jsonb_array_elements(p_payload->'items')) then
    raise exception using errcode = '22023', message = 'A receipt item can only appear once in a return.';
  end if;

  v_canonical := jsonb_build_object('saleId', p_sale_id, 'payload', p_payload);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sale-return:' || p_actor::text || ':' || p_request::text, 0)
  );
  select * into v_prior from operations.sales_return_requests
  where actor_id = p_actor and request_id = p_request;
  if found then
    if v_prior.payload is distinct from v_canonical then
      raise exception using errcode = 'PT409', message = 'This return reference already belongs to another saved request. Reload the receipt before trying again.';
    end if;
    return public.get_pos_sale_return_context(p_sale_id)
      || jsonb_build_object('savedReturnId', v_prior.return_id);
  end if;

  select * into v_sale from operations.sales_transactions where id = p_sale_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'The original receipt could not be found.';
  end if;
  if v_sale.status <> 'completed' or v_sale.payment_method = 'to_follow'
    or v_sale.source_type not in ('pos', 'estimate_conversion')
    or not v_sale.inventory_applied or v_sale.pos_issued_at is null
    or v_sale.pos_paid_at is null or v_sale.subtotal <= 0 then
    raise exception using errcode = 'PT409', message = 'Only paid, completed POS receipts can be returned. Unpaid, historical and service-only records are not eligible.';
  end if;

  select up.full_name into v_actor_name from core.user_profiles up where up.user_id = p_actor;
  for v_request_line in
    select value from jsonb_array_elements(p_payload->'items') as line(value)
  loop
    v_sale_item_id := (v_request_line->>'saleItemId')::uuid;
    v_quantity := (v_request_line->>'quantity')::numeric;
    v_condition := v_request_line->>'condition';
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999
      or v_quantity::text in ('NaN', 'Infinity', '-Infinity')
      or v_condition is null or v_condition not in ('resalable', 'damaged') then
      raise exception using errcode = '22023', message = 'Enter a valid quantity and item condition.';
    end if;

    select * into v_sale_item from operations.sales_transaction_items si
    where si.id = v_sale_item_id and si.transaction_id = p_sale_id
      and si.line_type = 'product' for update;
    if not found or v_sale_item.product_id is null then
      raise exception using errcode = '22023', message = 'One selected part is not returnable from this receipt.';
    end if;

    select coalesce(sum(sri.quantity), 0), coalesce(sum(sri.refund_amount), 0)
      into v_previous_quantity, v_previous_refund
    from operations.sales_return_items sri
    join operations.sales_returns sr on sr.id = sri.return_id
    where sr.sale_id = p_sale_id and sri.sale_item_id = v_sale_item_id;
    if v_previous_quantity + v_quantity > v_sale_item.quantity then
      raise exception using errcode = 'PT409', message = 'The requested quantity exceeds the amount still available to return. Reload the receipt.';
    end if;

    v_line_refund := round(v_sale_item.line_total * v_sale.total_amount / v_sale.subtotal, 2);
    v_target_refund := case
      when v_previous_quantity + v_quantity >= v_sale_item.quantity then v_line_refund
      else round(v_line_refund * (v_previous_quantity + v_quantity) / v_sale_item.quantity, 2)
    end;
    v_refund := v_target_refund - v_previous_refund;
    if v_refund < 0 then
      raise exception using errcode = 'PT409', message = 'The refund amount changed on this receipt. Reload it and review the return.';
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_saved_line := jsonb_build_object(
      'saleItemId', v_sale_item.id, 'productId', v_sale_item.product_id,
      'itemName', coalesce(v_sale_item.item_name_snapshot, 'Returned part'),
      'itemSku', coalesce(v_sale_item.item_sku_snapshot, ''),
      'quantity', v_quantity, 'condition', v_condition, 'refundAmount', v_refund
    );
    v_saved_lines := v_saved_lines || jsonb_build_array(v_saved_line);
  end loop;
  v_refund_total := round(v_refund_total, 2);
  if v_refund_total <= 0 then
    raise exception using errcode = '22023', message = 'The selected items do not have a refundable balance.';
  end if;

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date, updated_at
  )
  select requested.product_id, 0, 0, 0, 0, '{}'::jsonb,
    v_business_date, v_business_date, timezone('utc', now())
  from (
    select distinct (line.value->>'productId')::uuid as product_id
    from jsonb_array_elements(v_saved_lines) as line(value)
    where line.value->>'condition' = 'resalable'
  ) requested
  on conflict (product_id) do nothing;

  perform b.product_id from catalog.inventory_balances b
  where b.product_id in (
    select distinct (line.value->>'productId')::uuid
    from jsonb_array_elements(v_saved_lines) as line(value)
    where line.value->>'condition' = 'resalable'
  )
  order by b.product_id for update;

  v_return_id := gen_random_uuid();
  v_return_number := 'RET-' || pg_catalog.to_char(v_business_date, 'YYYYMMDD') || '-'
    || upper(pg_catalog.substr(pg_catalog.replace(v_return_id::text, '-', ''), 1, 8));
  insert into operations.sales_returns (
    id, return_number, sale_id, reason, reason_note, refund_method,
    refund_reference, refund_total, refund_confirmed, processed_by, business_date
  ) values (
    v_return_id, v_return_number, p_sale_id, v_reason, v_reason_note,
    v_refund_method, v_refund_reference, v_refund_total, true, p_actor, v_business_date
  );

  insert into operations.sales_return_items (
    return_id, sale_item_id, product_id, item_name_snapshot, item_sku_snapshot,
    quantity, item_condition, refund_amount
  )
  select v_return_id, (line.value->>'saleItemId')::uuid,
    (line.value->>'productId')::uuid, line.value->>'itemName', line.value->>'itemSku',
    (line.value->>'quantity')::numeric, line.value->>'condition',
    (line.value->>'refundAmount')::numeric
  from jsonb_array_elements(v_saved_lines) as line(value);

  insert into catalog.inventory_movements (
    product_id, movement_type, quantity, reference_type, reference_id,
    notes, performed_by, business_date
  )
  select (line.value->>'productId')::uuid, 'stock_in',
    sum((line.value->>'quantity')::numeric), 'sales_return', v_return_id,
    'Resalable customer return ' || v_return_number, p_actor, v_business_date
  from jsonb_array_elements(v_saved_lines) as line(value)
  where line.value->>'condition' = 'resalable'
  group by (line.value->>'productId')::uuid;

  update catalog.inventory_balances b
  set on_hand = b.on_hand + returned.quantity,
    as_of_date = v_business_date, business_date = v_business_date,
    updated_at = timezone('utc', now())
  from (
    select (line.value->>'productId')::uuid as product_id,
      sum((line.value->>'quantity')::numeric) as quantity
    from jsonb_array_elements(v_saved_lines) as line(value)
    where line.value->>'condition' = 'resalable'
    group by (line.value->>'productId')::uuid
  ) returned
  where b.product_id = returned.product_id;

  insert into operations.sales_return_requests (actor_id, request_id, payload, return_id)
  values (p_actor, p_request, v_canonical, v_return_id);

  return public.get_pos_sale_return_context(p_sale_id)
    || jsonb_build_object('savedReturnId', v_return_id, 'savedReturnNumber', v_return_number,
      'savedRefundTotal', v_refund_total, 'savedRefundMethod', v_refund_method,
      'savedProcessedByName', coalesce(v_actor_name, 'Staff'));
end;
$function$;

revoke all on function public.get_pos_sale_return_context(uuid),
  public.create_pos_sale_return(uuid, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_pos_sale_return_context(uuid),
  public.create_pos_sale_return(uuid, jsonb, uuid, uuid) to service_role;

-- Make return quantities and refunds reduce the existing item-level sales analytics.
create or replace view private.recorded_product_sales as
select st.id as transaction_id,
       coalesce(st.business_date, (st.sale_at at time zone 'Asia/Manila')::date) as sale_date,
       si.product_id,
       coalesce(si.item_sku_snapshot, p.sku, '') as sku,
       coalesce(si.item_name_snapshot, p.name, 'Recorded product') as product_name,
       coalesce(p.category, 'Uncategorized') as category,
       coalesce(p.brand, '') as brand,
       si.quantity, si.line_total as revenue
from operations.sales_transactions st
join operations.sales_transaction_items si on si.transaction_id = st.id
left join catalog.products p on p.id = si.product_id
where st.status = 'completed' and si.line_type = 'product'
  and st.transaction_number not ilike 'SALE-DEMO-%'
  and coalesce(st.customer_name_snapshot, '') not ilike 'demo customer%'
  and coalesce(st.original_reference, '') not ilike 'DEMO-%'
union all
select sr.id as transaction_id, sr.business_date as sale_date, sri.product_id,
       coalesce(sri.item_sku_snapshot, p.sku, '') as sku,
       coalesce(sri.item_name_snapshot, p.name, 'Returned product') as product_name,
       coalesce(p.category, 'Uncategorized') as category,
       coalesce(p.brand, '') as brand,
       (-sri.quantity)::numeric(12,2) as quantity,
       (-round(si.line_total * sri.quantity / nullif(si.quantity, 0), 2))::numeric(12,2) as revenue
from operations.sales_returns sr
join operations.sales_return_items sri on sri.return_id = sr.id
join operations.sales_transaction_items si on si.id = sri.sale_item_id
left join catalog.products p on p.id = sri.product_id
where sri.product_id is not null;

revoke all on private.recorded_product_sales from public, anon, authenticated;
