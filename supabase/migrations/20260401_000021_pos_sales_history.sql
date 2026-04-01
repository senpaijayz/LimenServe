alter table app.sales_transactions
  add column if not exists cash_received numeric(12,2),
  add column if not exists change_due numeric(12,2),
  add column if not exists customer_name_snapshot text;

alter table app.sales_transaction_items
  add column if not exists item_name_snapshot text,
  add column if not exists item_sku_snapshot text;

alter table app.sales_transaction_items
  drop constraint if exists sales_transaction_items_check;

alter table app.sales_transaction_items
  add constraint sales_transaction_items_source_check check (
    (line_type = 'product' and product_id is not null and service_id is null) or
    (
      line_type = 'service'
      and product_id is null
      and (
        service_id is not null or
        coalesce(item_name_snapshot, '') <> ''
      )
    )
  );

create index if not exists sales_transactions_created_at_idx
  on app.sales_transactions (created_at desc);

create index if not exists sales_transactions_processed_by_idx
  on app.sales_transactions (processed_by, created_at desc);

create index if not exists sales_transaction_items_transaction_id_idx
  on app.sales_transaction_items (transaction_id, created_at);

create or replace function app.create_pos_sale_internal(payload jsonb, p_operator_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_transaction_id uuid;
  v_transaction_number text := app.generate_document_number('SALE');
  v_business_date date := current_date;
  v_items jsonb := coalesce(payload -> 'items', '[]'::jsonb);
  v_payment_method text := lower(coalesce(nullif(payload ->> 'paymentMethod', ''), 'cash'));
  v_customer_name text := nullif(btrim(coalesce(payload ->> 'customerName', '')), '');
  v_discount_percent numeric(6,2) := greatest(coalesce((payload ->> 'discountPercent')::numeric, 0), 0);
  v_raw_subtotal numeric(12,2) := round(coalesce((payload -> 'totals' ->> 'rawSubtotal')::numeric, 0), 2);
  v_discount_total numeric(12,2) := round(coalesce((payload -> 'totals' ->> 'discountAmount')::numeric, 0), 2);
  v_tax_total numeric(12,2) := round(coalesce((payload -> 'totals' ->> 'tax')::numeric, 0), 2);
  v_total_amount numeric(12,2) := round(coalesce((payload -> 'totals' ->> 'total')::numeric, 0), 2);
  v_cash_received numeric(12,2) := round(coalesce((payload ->> 'cashReceived')::numeric, 0), 2);
  v_change_due numeric(12,2) := round(coalesce((payload ->> 'changeDue')::numeric, 0), 2);
  v_computed_raw_subtotal numeric(12,2) := 0;
  v_invalid_line boolean := false;
begin
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'A sale must include at least one line item.';
  end if;

  if v_payment_method not in ('cash', 'gcash', 'bank_transfer') then
    raise exception 'Unsupported payment method %.', v_payment_method;
  end if;

  select round(coalesce(sum(
    round(coalesce((line.value ->> 'quantity')::numeric, 0), 2) *
    round(coalesce((line.value ->> 'unitPrice')::numeric, 0), 2)
  ), 0), 2)
  into v_computed_raw_subtotal
  from jsonb_array_elements(v_items) as line(value);

  if abs(v_computed_raw_subtotal - v_raw_subtotal) > 0.05 then
    raise exception 'Sale subtotal does not match the submitted line items.';
  end if;

  if abs(round((v_raw_subtotal - v_discount_total + v_tax_total), 2) - v_total_amount) > 0.05 then
    raise exception 'Sale totals are inconsistent.';
  end if;

  if v_discount_percent < 0 or v_discount_percent > 100 then
    raise exception 'Discount percent must be between 0 and 100.';
  end if;

  if v_payment_method = 'cash' and v_cash_received < v_total_amount then
    raise exception 'Cash received must be greater than or equal to the sale total.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as line(value)
    where lower(coalesce(nullif(line.value ->> 'lineType', ''), case when nullif(line.value ->> 'serviceId', '') is not null then 'service' else 'product' end)) not in ('product', 'service')
      or coalesce((line.value ->> 'quantity')::numeric, 0) <= 0
      or coalesce((line.value ->> 'unitPrice')::numeric, 0) < 0
  ) then
    raise exception 'Each sale line must have a valid type, quantity, and unit price.';
  end if;

  select exists (
    select 1
    from (
      select distinct nullif(line.value ->> 'productId', '')::uuid as product_id
      from jsonb_array_elements(v_items) as line(value)
      where lower(coalesce(nullif(line.value ->> 'lineType', ''), 'product')) = 'product'
    ) requested
    left join app.products p on p.id = requested.product_id
    where requested.product_id is null or p.id is null
  )
  into v_invalid_line;

  if v_invalid_line then
    raise exception 'One or more product sale lines reference a missing product.';
  end if;

  select exists (
    select 1
    from (
      select distinct nullif(line.value ->> 'serviceId', '')::uuid as service_id
      from jsonb_array_elements(v_items) as line(value)
      where lower(coalesce(nullif(line.value ->> 'lineType', ''), case when nullif(line.value ->> 'serviceId', '') is not null then 'service' else 'product' end)) = 'service'
        and nullif(line.value ->> 'serviceId', '') is not null
    ) requested
    left join app.services s on s.id = requested.service_id
    where s.id is null
  )
  into v_invalid_line;

  if v_invalid_line then
    raise exception 'One or more service sale lines reference a missing service.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_items) as line(value)
    where lower(coalesce(nullif(line.value ->> 'lineType', ''), case when nullif(line.value ->> 'serviceId', '') is not null then 'service' else 'product' end)) = 'service'
      and nullif(line.value ->> 'serviceId', '') is null
      and coalesce(nullif(btrim(coalesce(line.value ->> 'displayName', '')), ''), nullif(btrim(coalesce(line.value ->> 'name', '')), '')) is null
  ) then
    raise exception 'Manual service lines must include a display name.';
  end if;

  if exists (
    with requested_products as (
      select
        nullif(line.value ->> 'productId', '')::uuid as product_id,
        sum(round(coalesce((line.value ->> 'quantity')::numeric, 0), 2)) as requested_quantity
      from jsonb_array_elements(v_items) as line(value)
      where lower(coalesce(nullif(line.value ->> 'lineType', ''), 'product')) = 'product'
      group by nullif(line.value ->> 'productId', '')::uuid
    )
    select 1
    from requested_products rp
    left join app.inventory_balances ib on ib.product_id = rp.product_id
    where coalesce(ib.on_hand, 0) < rp.requested_quantity
  ) then
    raise exception 'Insufficient stock for one or more product lines.';
  end if;

  insert into app.sales_transactions (
    transaction_number,
    customer_id,
    processed_by,
    payment_method,
    status,
    subtotal,
    discount_total,
    tax_total,
    total_amount,
    cash_received,
    change_due,
    customer_name_snapshot,
    business_date
  )
  values (
    v_transaction_number,
    null,
    p_operator_id,
    v_payment_method,
    'completed',
    v_raw_subtotal,
    v_discount_total,
    v_tax_total,
    v_total_amount,
    case when v_payment_method = 'cash' then v_cash_received else null end,
    case when v_payment_method = 'cash' then greatest(v_change_due, 0) else 0 end,
    coalesce(v_customer_name, 'Walk-in Customer'),
    v_business_date
  )
  returning id into v_transaction_id;

  insert into app.sales_transaction_items (
    transaction_id,
    line_type,
    product_id,
    service_id,
    quantity,
    unit_price,
    line_total,
    business_date,
    item_name_snapshot,
    item_sku_snapshot
  )
  select
    v_transaction_id,
    parsed.line_type,
    parsed.product_id,
    parsed.service_id,
    parsed.quantity,
    parsed.unit_price,
    parsed.line_total,
    v_business_date,
    coalesce(parsed.display_name, p.name, s.name, 'Unnamed Item'),
    coalesce(parsed.display_sku, p.sku, s.code, case when parsed.line_type = 'service' then 'SERVICE' else null end)
  from (
    select
      case
        when lower(coalesce(nullif(line.value ->> 'lineType', ''), case when nullif(line.value ->> 'serviceId', '') is not null then 'service' else 'product' end)) = 'service' then 'service'
        else 'product'
      end as line_type,
      nullif(line.value ->> 'productId', '')::uuid as product_id,
      nullif(line.value ->> 'serviceId', '')::uuid as service_id,
      round(coalesce((line.value ->> 'quantity')::numeric, 1), 2) as quantity,
      round(coalesce((line.value ->> 'unitPrice')::numeric, 0), 2) as unit_price,
      round(coalesce((line.value ->> 'lineTotal')::numeric, (line.value ->> 'quantity')::numeric * (line.value ->> 'unitPrice')::numeric), 2) as line_total,
      coalesce(
        nullif(btrim(coalesce(line.value ->> 'displayName', '')), ''),
        nullif(btrim(coalesce(line.value ->> 'name', '')), '')
      ) as display_name,
      coalesce(
        nullif(btrim(coalesce(line.value ->> 'sku', '')), ''),
        nullif(btrim(coalesce(line.value ->> 'code', '')), '')
      ) as display_sku
    from jsonb_array_elements(v_items) as line(value)
  ) parsed
  left join app.products p on p.id = parsed.product_id
  left join app.services s on s.id = parsed.service_id;

  insert into app.inventory_movements (
    product_id,
    movement_type,
    quantity,
    reference_type,
    reference_id,
    notes,
    performed_by,
    business_date
  )
  select
    sti.product_id,
    'sale',
    -1 * sti.quantity,
    'sales_transaction',
    v_transaction_id,
    'Direct POS sale ' || v_transaction_number,
    p_operator_id,
    sti.business_date
  from app.sales_transaction_items sti
  where sti.transaction_id = v_transaction_id
    and sti.product_id is not null;

  update app.inventory_balances ib
  set
    on_hand = greatest(ib.on_hand - sold.quantity, 0),
    as_of_date = v_business_date,
    business_date = v_business_date,
    updated_at = timezone('utc', now())
  from (
    select product_id, sum(quantity) as quantity
    from app.sales_transaction_items
    where transaction_id = v_transaction_id
      and product_id is not null
    group by product_id
  ) sold
  where ib.product_id = sold.product_id;

  return v_transaction_id;
end;
$$;

create or replace function app.list_sales_history_internal(
  p_search text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_limit_count integer default 20,
  p_offset_count integer default 0
)
returns table (
  sale_id uuid,
  transaction_number text,
  customer_name text,
  cashier_name text,
  item_count numeric,
  line_count bigint,
  payment_method text,
  status text,
  total_amount numeric,
  business_date date,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = app, public
as $$
  with item_totals as (
    select
      transaction_id,
      coalesce(sum(quantity), 0) as item_count,
      count(*) as line_count
    from app.sales_transaction_items
    group by transaction_id
  ),
  filtered as (
    select
      st.id as sale_id,
      st.transaction_number,
      coalesce(c.name, st.customer_name_snapshot, 'Walk-in Customer') as customer_name,
      coalesce(up.full_name, 'Unknown Cashier') as cashier_name,
      coalesce(it.item_count, 0) as item_count,
      coalesce(it.line_count, 0) as line_count,
      st.payment_method,
      st.status,
      st.total_amount,
      st.business_date,
      st.created_at,
      count(*) over () as total_count
    from app.sales_transactions st
    left join app.customers c on c.id = st.customer_id
    left join app.user_profiles up on up.user_id = st.processed_by
    left join item_totals it on it.transaction_id = st.id
    where (
      p_search is null
      or p_search = ''
      or st.transaction_number ilike '%' || p_search || '%'
      or coalesce(c.name, st.customer_name_snapshot, '') ilike '%' || p_search || '%'
      or coalesce(up.full_name, '') ilike '%' || p_search || '%'
    )
      and (p_start_date is null or st.created_at::date >= p_start_date)
      and (p_end_date is null or st.created_at::date <= p_end_date)
  )
  select
    sale_id,
    transaction_number,
    customer_name,
    cashier_name,
    item_count,
    line_count,
    payment_method,
    status,
    total_amount,
    business_date,
    created_at,
    total_count
  from filtered
  order by created_at desc
  limit greatest(coalesce(p_limit_count, 20), 1)
  offset greatest(coalesce(p_offset_count, 0), 0);
$$;

create or replace function app.get_sale_detail_internal(p_sale_id uuid)
returns jsonb
language sql
security definer
set search_path = app, public
as $$
  with sale_header as (
    select
      st.id,
      st.transaction_number,
      st.estimate_id,
      st.customer_id,
      st.processed_by,
      st.payment_method,
      st.status,
      st.subtotal,
      st.discount_total,
      st.tax_total,
      st.total_amount,
      st.cash_received,
      st.change_due,
      st.customer_name_snapshot,
      st.business_date,
      st.created_at,
      st.updated_at,
      coalesce(c.name, st.customer_name_snapshot, 'Walk-in Customer') as customer_name,
      coalesce(up.full_name, 'Unknown Cashier') as cashier_name
    from app.sales_transactions st
    left join app.customers c on c.id = st.customer_id
    left join app.user_profiles up on up.user_id = st.processed_by
    where st.id = p_sale_id
  ),
  sale_items as (
    select
      sti.id,
      sti.line_type,
      sti.product_id,
      sti.service_id,
      sti.quantity,
      sti.unit_price,
      sti.line_total,
      sti.estimate_item_id,
      sti.business_date,
      sti.created_at,
      coalesce(sti.item_name_snapshot, p.name, s.name, 'Unnamed Item') as item_name,
      coalesce(sti.item_sku_snapshot, p.sku, s.code, case when sti.line_type = 'service' then 'SERVICE' else null end) as item_sku
    from app.sales_transaction_items sti
    left join app.products p on p.id = sti.product_id
    left join app.services s on s.id = sti.service_id
    where sti.transaction_id = p_sale_id
    order by sti.created_at, sti.id
  )
  select
    case
      when exists (select 1 from sale_header) then jsonb_build_object(
        'sale',
        (
          select jsonb_build_object(
            'id', sh.id,
            'transactionNumber', sh.transaction_number,
            'estimateId', sh.estimate_id,
            'customerId', sh.customer_id,
            'processedBy', sh.processed_by,
            'customerName', sh.customer_name,
            'cashierName', sh.cashier_name,
            'paymentMethod', sh.payment_method,
            'status', sh.status,
            'subtotal', sh.subtotal,
            'discountTotal', sh.discount_total,
            'taxTotal', sh.tax_total,
            'totalAmount', sh.total_amount,
            'cashReceived', sh.cash_received,
            'changeDue', sh.change_due,
            'businessDate', sh.business_date,
            'createdAt', sh.created_at,
            'updatedAt', sh.updated_at
          )
          from sale_header sh
        ),
        'items',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', si.id,
                'lineType', si.line_type,
                'productId', si.product_id,
                'serviceId', si.service_id,
                'quantity', si.quantity,
                'unitPrice', si.unit_price,
                'lineTotal', si.line_total,
                'itemName', si.item_name,
                'itemSku', si.item_sku,
                'estimateItemId', si.estimate_item_id,
                'createdAt', si.created_at
              )
              order by si.created_at, si.id
            )
            from sale_items si
          ),
          '[]'::jsonb
        ),
        'receipt',
        (
          select jsonb_build_object(
            'transactionNumber', sh.transaction_number,
            'customerName', sh.customer_name,
            'cashierName', sh.cashier_name,
            'paymentMethod', sh.payment_method,
            'status', sh.status,
            'subtotal', sh.subtotal,
            'discountTotal', sh.discount_total,
            'taxTotal', sh.tax_total,
            'totalAmount', sh.total_amount,
            'cashReceived', sh.cash_received,
            'changeDue', sh.change_due,
            'businessDate', sh.business_date,
            'createdAt', sh.created_at,
            'items',
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', si.id,
                    'lineType', si.line_type,
                    'itemName', si.item_name,
                    'itemSku', si.item_sku,
                    'quantity', si.quantity,
                    'unitPrice', si.unit_price,
                    'lineTotal', si.line_total
                  )
                  order by si.created_at, si.id
                )
                from sale_items si
              ),
              '[]'::jsonb
            )
          )
          from sale_header sh
        )
      )
      else null
    end;
$$;

create or replace function public.create_pos_sale(payload jsonb, p_operator_id uuid default null)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.create_pos_sale_internal(payload, p_operator_id);
$$;

create or replace function public.list_sales_history(
  p_search text default null,
  p_start_date date default null,
  p_end_date date default null,
  p_limit_count integer default 20,
  p_offset_count integer default 0
)
returns table (
  sale_id uuid,
  transaction_number text,
  customer_name text,
  cashier_name text,
  item_count numeric,
  line_count bigint,
  payment_method text,
  status text,
  total_amount numeric,
  business_date date,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.list_sales_history_internal(
    p_search,
    p_start_date,
    p_end_date,
    p_limit_count,
    p_offset_count
  );
$$;

create or replace function public.get_sale_detail(p_sale_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app
as $$
  select app.get_sale_detail_internal(p_sale_id);
$$;

grant execute on function public.create_pos_sale(jsonb, uuid) to authenticated, service_role;
grant execute on function public.list_sales_history(text, date, date, integer, integer) to authenticated, service_role;
grant execute on function public.get_sale_detail(uuid) to authenticated, service_role;
