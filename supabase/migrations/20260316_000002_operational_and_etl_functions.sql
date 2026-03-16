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

create or replace function app.refresh_dimensional_data(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  insert into dw.dim_date (
    date_key,
    full_date,
    year_number,
    quarter_number,
    month_number,
    month_name,
    day_of_month,
    day_name,
    week_of_year,
    is_weekend
  )
  select
    to_char(d::date, 'YYYYMMDD')::integer,
    d::date,
    extract(year from d)::integer,
    extract(quarter from d)::integer,
    extract(month from d)::integer,
    trim(to_char(d, 'Month')),
    extract(day from d)::integer,
    trim(to_char(d, 'Day')),
    extract(week from d)::integer,
    extract(isodow from d) in (6, 7)
  from generate_series(date '2024-01-01', date '2027-12-31', interval '1 day') gs(d)
  on conflict (date_key) do update
  set
    full_date = excluded.full_date,
    year_number = excluded.year_number,
    quarter_number = excluded.quarter_number,
    month_number = excluded.month_number,
    month_name = excluded.month_name,
    day_of_month = excluded.day_of_month,
    day_name = excluded.day_name,
    week_of_year = excluded.week_of_year,
    is_weekend = excluded.is_weekend;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_product (
    source_product_id,
    sku,
    name,
    category,
    model_name,
    brand,
    current_price,
    is_active
  )
  select
    p.id,
    p.sku,
    p.name,
    p.category,
    p.model_name,
    p.brand,
    coalesce(cp.amount, 0),
    p.is_active
  from app.products p
  left join lateral (
    select amount
    from app.product_prices pp
    where pp.product_id = p.id
      and pp.price_type = 'retail'
    order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
    limit 1
  ) cp on true
  on conflict (source_product_id) do update
  set
    sku = excluded.sku,
    name = excluded.name,
    category = excluded.category,
    model_name = excluded.model_name,
    brand = excluded.brand,
    current_price = excluded.current_price,
    is_active = excluded.is_active;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_service (
    source_service_id,
    code,
    name,
    standard_price,
    estimated_duration_minutes,
    is_active
  )
  select
    s.id,
    s.code,
    s.name,
    s.standard_price,
    s.estimated_duration_minutes,
    s.is_active
  from app.services s
  on conflict (source_service_id) do update
  set
    code = excluded.code,
    name = excluded.name,
    standard_price = excluded.standard_price,
    estimated_duration_minutes = excluded.estimated_duration_minutes,
    is_active = excluded.is_active;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_vehicle_model (source_model_name, make)
  select distinct
    v.model_name,
    coalesce(v.make, 'Mitsubishi')
  from app.vehicles v
  where coalesce(v.model_name, '') <> ''
  on conflict (source_model_name) do update
  set make = excluded.make;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_customer_type (source_customer_type)
  select distinct c.customer_type
  from app.customers c
  on conflict (source_customer_type) do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_employee (source_user_id, full_name, email, role)
  select
    up.user_id,
    up.full_name,
    up.email,
    up.role
  from app.user_profiles up
  on conflict (source_user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set dimension_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;

create or replace function app.refresh_monthly_aggregates(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  truncate table
    dw.fact_estimate_lines,
    dw.fact_sales_lines,
    dw.fact_service_order_lines,
    dw.fact_inventory_movements,
    dw.fact_upsell_events,
    dw.fact_monthly_product_demand,
    dw.fact_monthly_service_demand
  restart identity;

  insert into dw.fact_estimate_lines (
    estimate_id,
    estimate_item_id,
    date_key,
    product_key,
    service_key,
    vehicle_model_key,
    customer_type_key,
    employee_key,
    status,
    line_type,
    quantity,
    unit_price,
    line_total,
    is_upsell
  )
  select
    e.id,
    ei.id,
    to_char(e.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    ds.service_key,
    dvm.vehicle_model_key,
    dct.customer_type_key,
    de.employee_key,
    e.status,
    ei.line_type,
    ei.quantity,
    ei.unit_price,
    ei.line_total,
    ei.is_upsell
  from app.estimate_items ei
  join app.estimates e on e.id = ei.estimate_id
  left join app.customers c on c.id = e.customer_id
  left join app.vehicles v on v.id = e.vehicle_id
  left join dw.dim_product dp on dp.source_product_id = ei.product_id
  left join dw.dim_service ds on ds.source_service_id = ei.service_id
  left join dw.dim_vehicle_model dvm on dvm.source_model_name = v.model_name
  left join dw.dim_customer_type dct on dct.source_customer_type = c.customer_type
  left join dw.dim_employee de on de.source_user_id = e.created_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_sales_lines (
    transaction_id,
    transaction_item_id,
    date_key,
    product_key,
    service_key,
    customer_type_key,
    employee_key,
    status,
    line_type,
    quantity,
    unit_price,
    line_total
  )
  select
    st.id,
    sti.id,
    to_char(st.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    ds.service_key,
    dct.customer_type_key,
    de.employee_key,
    st.status,
    sti.line_type,
    sti.quantity,
    sti.unit_price,
    sti.line_total
  from app.sales_transaction_items sti
  join app.sales_transactions st on st.id = sti.transaction_id
  left join app.customers c on c.id = st.customer_id
  left join dw.dim_product dp on dp.source_product_id = sti.product_id
  left join dw.dim_service ds on ds.source_service_id = sti.service_id
  left join dw.dim_customer_type dct on dct.source_customer_type = c.customer_type
  left join dw.dim_employee de on de.source_user_id = st.processed_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_service_order_lines (
    service_order_id,
    service_order_item_id,
    date_key,
    product_key,
    service_key,
    vehicle_model_key,
    customer_type_key,
    employee_key,
    status,
    line_type,
    quantity,
    unit_price,
    line_total
  )
  select
    so.id,
    soi.id,
    to_char(so.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    ds.service_key,
    dvm.vehicle_model_key,
    dct.customer_type_key,
    de.employee_key,
    so.status,
    soi.line_type,
    soi.quantity,
    soi.unit_price,
    soi.line_total
  from app.service_order_items soi
  join app.service_orders so on so.id = soi.service_order_id
  left join app.customers c on c.id = so.customer_id
  left join app.vehicles v on v.id = so.vehicle_id
  left join dw.dim_product dp on dp.source_product_id = soi.product_id
  left join dw.dim_service ds on ds.source_service_id = soi.service_id
  left join dw.dim_vehicle_model dvm on dvm.source_model_name = v.model_name
  left join dw.dim_customer_type dct on dct.source_customer_type = c.customer_type
  left join dw.dim_employee de on de.source_user_id = so.assigned_to;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_inventory_movements (
    movement_id,
    date_key,
    product_key,
    employee_key,
    movement_type,
    quantity,
    reference_type
  )
  select
    im.id,
    to_char(im.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    de.employee_key,
    im.movement_type,
    im.quantity,
    im.reference_type
  from app.inventory_movements im
  join dw.dim_product dp on dp.source_product_id = im.product_id
  left join dw.dim_employee de on de.source_user_id = im.performed_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_upsell_events (
    upsell_event_id,
    date_key,
    product_key,
    recommended_product_key,
    recommended_service_key,
    employee_key,
    action,
    context_type
  )
  select
    ui.id,
    to_char(ui.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    dpr.product_key,
    ds.service_key,
    de.employee_key,
    ui.action,
    ui.context_type
  from app.upsell_interactions ui
  join dw.dim_product dp on dp.source_product_id = ui.product_id
  left join dw.dim_product dpr on dpr.source_product_id = ui.recommended_product_id
  left join dw.dim_service ds on ds.source_service_id = ui.recommended_service_id
  left join dw.dim_employee de on de.source_user_id = ui.created_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_monthly_product_demand (
    month_key,
    month_start,
    product_key,
    quantity,
    revenue,
    source_line_count
  )
  with product_lines as (
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsl.product_key,
      fsl.quantity,
      fsl.line_total
    from dw.fact_sales_lines fsl
    join dw.dim_date dd on dd.date_key = fsl.date_key
    where fsl.product_key is not null
      and fsl.status = 'completed'
    union all
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsol.product_key,
      fsol.quantity,
      fsol.line_total
    from dw.fact_service_order_lines fsol
    join dw.dim_date dd on dd.date_key = fsol.date_key
    where fsol.product_key is not null
      and fsol.status in ('pending', 'in_progress', 'completed')
  )
  select
    to_char(month_start, 'YYYYMM')::integer,
    month_start,
    product_key,
    sum(quantity),
    sum(line_total),
    count(*)
  from product_lines
  group by month_start, product_key;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_monthly_service_demand (
    month_key,
    month_start,
    service_key,
    quantity,
    revenue,
    source_line_count
  )
  with service_lines as (
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsl.service_key,
      fsl.quantity,
      fsl.line_total
    from dw.fact_sales_lines fsl
    join dw.dim_date dd on dd.date_key = fsl.date_key
    where fsl.service_key is not null
      and fsl.status = 'completed'
    union all
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsol.service_key,
      fsol.quantity,
      fsol.line_total
    from dw.fact_service_order_lines fsol
    join dw.dim_date dd on dd.date_key = fsol.date_key
    where fsol.service_key is not null
      and fsol.status in ('pending', 'in_progress', 'completed')
  )
  select
    to_char(month_start, 'YYYYMM')::integer,
    month_start,
    service_key,
    sum(quantity),
    sum(line_total),
    count(*)
  from service_lines
  group by month_start, service_key;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set fact_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;
