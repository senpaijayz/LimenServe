-- 06 Estimate and Conversion Functions
-- Source: 20260316_000002_operational_and_etl_functions.sql

create or replace function app.generate_document_number(prefix text)
returns text
language sql
volatile
as $$
  select upper(prefix) || '-' || to_char(timezone('utc', now()), 'YYYYMMDDHH24MISSMS');
$$;

create or replace function app.create_estimate_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_estimate_id uuid;
  v_item jsonb;
  v_business_date date := coalesce((payload -> 'estimate' ->> 'business_date')::date, current_date);
  v_estimate_number text := coalesce(payload -> 'estimate' ->> 'estimate_number', app.generate_document_number('EST'));
begin
  if payload ? 'customer' and coalesce(payload -> 'customer' ->> 'name', '') <> '' then
    insert into app.customers (
      customer_type,
      name,
      phone,
      email,
      metadata,
      business_date
    )
    values (
      coalesce(payload -> 'customer' ->> 'customer_type', 'walk_in'),
      payload -> 'customer' ->> 'name',
      payload -> 'customer' ->> 'phone',
      payload -> 'customer' ->> 'email',
      coalesce(payload -> 'customer' -> 'metadata', '{}'::jsonb),
      v_business_date
    )
    returning id into v_customer_id;
  end if;

  if payload ? 'vehicle' and coalesce(payload -> 'vehicle' ->> 'model_name', '') <> '' then
    insert into app.vehicles (
      customer_id,
      plate_no,
      make,
      model_name,
      year,
      engine,
      mileage,
      metadata,
      business_date
    )
    values (
      v_customer_id,
      payload -> 'vehicle' ->> 'plate_no',
      coalesce(payload -> 'vehicle' ->> 'make', 'Mitsubishi'),
      payload -> 'vehicle' ->> 'model_name',
      nullif(payload -> 'vehicle' ->> 'year', '')::integer,
      payload -> 'vehicle' ->> 'engine',
      nullif(payload -> 'vehicle' ->> 'mileage', '')::integer,
      coalesce(payload -> 'vehicle' -> 'metadata', '{}'::jsonb),
      v_business_date
    )
    returning id into v_vehicle_id;
  end if;

  insert into app.estimates (
    estimate_number,
    customer_id,
    vehicle_id,
    status,
    source,
    note,
    subtotal,
    discount_total,
    tax_total,
    grand_total,
    issued_at,
    valid_until,
    business_date,
    created_by
  )
  values (
    v_estimate_number,
    v_customer_id,
    v_vehicle_id,
    coalesce(payload -> 'estimate' ->> 'status', 'draft'),
    coalesce(payload -> 'estimate' ->> 'source', 'public'),
    payload -> 'estimate' ->> 'note',
    coalesce((payload -> 'estimate' ->> 'subtotal')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'discount_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'tax_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'grand_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'issued_at')::timestamptz, timezone('utc', now())),
    coalesce((payload -> 'estimate' ->> 'valid_until')::date, current_date + 7),
    v_business_date,
    auth.uid()
  )
  returning id into v_estimate_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
  loop
    insert into app.estimate_items (
      estimate_id,
      line_type,
      product_id,
      service_id,
      quantity,
      unit_price,
      line_total,
      recommendation_rule_id,
      is_upsell,
      business_date
    )
    values (
      v_estimate_id,
      coalesce(v_item ->> 'line_type', case when v_item ? 'service_id' then 'service' else 'product' end),
      nullif(v_item ->> 'product_id', '')::uuid,
      nullif(v_item ->> 'service_id', '')::uuid,
      coalesce((v_item ->> 'quantity')::numeric, 1),
      coalesce((v_item ->> 'unit_price')::numeric, 0),
      coalesce((v_item ->> 'line_total')::numeric, 0),
      nullif(v_item ->> 'recommendation_rule_id', '')::uuid,
      coalesce((v_item ->> 'is_upsell')::boolean, false),
      v_business_date
    );
  end loop;

  return v_estimate_id;
end;
$$;

create or replace function app.convert_estimate_to_sale_internal(p_estimate_id uuid, p_payment_method text default 'cash')
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_transaction_id uuid;
  v_transaction_number text := app.generate_document_number('SALE');
  v_row record;
begin
  insert into app.sales_transactions (
    transaction_number,
    estimate_id,
    customer_id,
    processed_by,
    payment_method,
    status,
    subtotal,
    discount_total,
    tax_total,
    total_amount,
    business_date
  )
  select
    v_transaction_number,
    e.id,
    e.customer_id,
    auth.uid(),
    p_payment_method,
    'completed',
    e.subtotal,
    e.discount_total,
    e.tax_total,
    e.grand_total,
    e.business_date
  from app.estimates e
  where e.id = p_estimate_id
  returning id into v_transaction_id;

  insert into app.sales_transaction_items (
    transaction_id,
    line_type,
    product_id,
    service_id,
    quantity,
    unit_price,
    line_total,
    estimate_item_id,
    business_date
  )
  select
    v_transaction_id,
    ei.line_type,
    ei.product_id,
    ei.service_id,
    ei.quantity,
    ei.unit_price,
    ei.line_total,
    ei.id,
    ei.business_date
  from app.estimate_items ei
  where ei.estimate_id = p_estimate_id;

  for v_row in
    select product_id, quantity, business_date
    from app.estimate_items
    where estimate_id = p_estimate_id
      and product_id is not null
  loop
    insert into app.inventory_movements (
      product_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      performed_by,
      business_date
    )
    values (
      v_row.product_id,
      'sale',
      -1 * v_row.quantity,
      'sales_transaction',
      v_transaction_id,
      auth.uid(),
      v_row.business_date
    );

    update app.inventory_balances
    set
      on_hand = greatest(on_hand - v_row.quantity, 0),
      updated_at = timezone('utc', now())
    where product_id = v_row.product_id;
  end loop;

  update app.estimates
  set status = 'converted_sale'
  where id = p_estimate_id;

  return v_transaction_id;
end;
$$;

create or replace function app.convert_estimate_to_service_order_internal(p_estimate_id uuid, p_assigned_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_service_order_id uuid;
  v_order_number text := app.generate_document_number('SVC');
begin
  insert into app.service_orders (
    order_number,
    estimate_id,
    customer_id,
    vehicle_id,
    assigned_to,
    status,
    note,
    subtotal,
    tax_total,
    total_amount,
    business_date
  )
  select
    v_order_number,
    e.id,
    e.customer_id,
    e.vehicle_id,
    p_assigned_to,
    'pending',
    e.note,
    e.subtotal,
    e.tax_total,
    e.grand_total,
    e.business_date
  from app.estimates e
  where e.id = p_estimate_id
  returning id into v_service_order_id;

  insert into app.service_order_items (
    service_order_id,
    line_type,
    product_id,
    service_id,
    quantity,
    unit_price,
    line_total,
    estimate_item_id,
    business_date
  )
  select
    v_service_order_id,
    ei.line_type,
    ei.product_id,
    ei.service_id,
    ei.quantity,
    ei.unit_price,
    ei.line_total,
    ei.id,
    ei.business_date
  from app.estimate_items ei
  where ei.estimate_id = p_estimate_id;

  update app.estimates
  set status = 'converted_service'
  where id = p_estimate_id;

  return v_service_order_id;
end;
$$;

create or replace function app.record_upsell_action_internal(
  p_context_type text,
  p_context_id uuid,
  p_product_id uuid,
  p_recommended_product_id uuid default null,
  p_recommended_service_id uuid default null,
  p_action text default 'shown',
  p_rule_id uuid default null,
  p_reason_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_event_id uuid;
begin
  insert into app.upsell_interactions (
    context_type,
    context_id,
    product_id,
    recommended_product_id,
    recommended_service_id,
    recommendation_rule_id,
    action,
    reason_label,
    created_by,
    business_date
  )
  values (
    p_context_type,
    p_context_id,
    p_product_id,
    p_recommended_product_id,
    p_recommended_service_id,
    p_rule_id,
    p_action,
    p_reason_label,
    auth.uid(),
    current_date
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

