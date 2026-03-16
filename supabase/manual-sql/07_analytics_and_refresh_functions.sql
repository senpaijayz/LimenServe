-- 07 Analytics and Refresh Functions

-- Source: 20260316_000002_operational_and_etl_functions.sql (warehouse loaders)

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

-- Source: 20260316_000003_analytics_rpc.sql (refresh, mining, forecasting, views)

create or replace function app.refresh_association_rules(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, ml, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  truncate table
    ml.product_association_rules,
    ml.service_association_rules,
    ml.vehicle_bundle_rules
  restart identity;

  insert into ml.product_association_rules (
    antecedent_product_id,
    consequent_kind,
    consequent_product_id,
    consequent_service_id,
    support,
    confidence,
    lift,
    sample_count,
    effective_month,
    active,
    refresh_run_id
  )
  with basket_lines as (
    select
      'estimate:' || e.id::text as basket_id,
      date_trunc('month', e.business_date)::date as effective_month,
      v.model_name as vehicle_model_name,
      ei.product_id,
      ei.service_id
    from app.estimates e
    join app.estimate_items ei on ei.estimate_id = e.id
    left join app.vehicles v on v.id = e.vehicle_id
    union all
    select
      'sale:' || st.id::text,
      date_trunc('month', st.business_date)::date,
      v.model_name,
      sti.product_id,
      sti.service_id
    from app.sales_transactions st
    join app.sales_transaction_items sti on sti.transaction_id = st.id
    left join app.estimates e on e.id = st.estimate_id
    left join app.vehicles v on v.id = e.vehicle_id
    union all
    select
      'service:' || so.id::text,
      date_trunc('month', so.business_date)::date,
      v.model_name,
      soi.product_id,
      soi.service_id
    from app.service_orders so
    join app.service_order_items soi on soi.service_order_id = so.id
    left join app.vehicles v on v.id = so.vehicle_id
  ),
  basket_meta as (
    select basket_id, effective_month, max(vehicle_model_name) as vehicle_model_name
    from basket_lines
    group by basket_id, effective_month
  ),
  month_totals as (
    select effective_month, count(distinct basket_id) as total_baskets
    from basket_meta
    group by effective_month
  ),
  product_occurrence as (
    select distinct bl.basket_id, bm.effective_month, bl.product_id
    from basket_lines bl
    join basket_meta bm on bm.basket_id = bl.basket_id
    where bl.product_id is not null
  ),
  service_occurrence as (
    select distinct bl.basket_id, bm.effective_month, bl.service_id
    from basket_lines bl
    join basket_meta bm on bm.basket_id = bl.basket_id
    where bl.service_id is not null
  ),
  product_base as (
    select effective_month, product_id, count(*) as basket_count
    from product_occurrence
    group by effective_month, product_id
  ),
  service_base as (
    select effective_month, service_id, count(*) as basket_count
    from service_occurrence
    group by effective_month, service_id
  ),
  product_product_pairs as (
    select
      a.effective_month,
      a.product_id as antecedent_product_id,
      b.product_id as consequent_product_id,
      count(*) as sample_count
    from product_occurrence a
    join product_occurrence b
      on a.basket_id = b.basket_id
     and a.product_id <> b.product_id
     and a.effective_month = b.effective_month
    group by a.effective_month, a.product_id, b.product_id
  ),
  product_service_pairs as (
    select
      p.effective_month,
      p.product_id as antecedent_product_id,
      s.service_id as consequent_service_id,
      count(*) as sample_count
    from product_occurrence p
    join service_occurrence s
      on p.basket_id = s.basket_id
     and p.effective_month = s.effective_month
    group by p.effective_month, p.product_id, s.service_id
  )
  select
    ppp.antecedent_product_id,
    'product',
    ppp.consequent_product_id,
    null,
    round(ppp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(ppp.sample_count::numeric / nullif(pb.basket_count, 0), 4),
    round(
      (ppp.sample_count::numeric / nullif(pb.basket_count, 0)) /
      nullif(cpb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    ppp.sample_count,
    ppp.effective_month,
    true,
    p_refresh_run_id
  from product_product_pairs ppp
  join month_totals mt on mt.effective_month = ppp.effective_month
  join product_base pb on pb.effective_month = ppp.effective_month and pb.product_id = ppp.antecedent_product_id
  join product_base cpb on cpb.effective_month = ppp.effective_month and cpb.product_id = ppp.consequent_product_id
  where ppp.sample_count >= 2
    and (ppp.sample_count::numeric / nullif(pb.basket_count, 0)) >= 0.20
  union all
  select
    psp.antecedent_product_id,
    'service',
    null,
    psp.consequent_service_id,
    round(psp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(psp.sample_count::numeric / nullif(pb.basket_count, 0), 4),
    round(
      (psp.sample_count::numeric / nullif(pb.basket_count, 0)) /
      nullif(sb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    psp.sample_count,
    psp.effective_month,
    true,
    p_refresh_run_id
  from product_service_pairs psp
  join month_totals mt on mt.effective_month = psp.effective_month
  join product_base pb on pb.effective_month = psp.effective_month and pb.product_id = psp.antecedent_product_id
  join service_base sb on sb.effective_month = psp.effective_month and sb.service_id = psp.consequent_service_id
  where psp.sample_count >= 2
    and (psp.sample_count::numeric / nullif(pb.basket_count, 0)) >= 0.20;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into ml.service_association_rules (
    antecedent_service_id,
    consequent_kind,
    consequent_product_id,
    consequent_service_id,
    support,
    confidence,
    lift,
    sample_count,
    effective_month,
    active,
    refresh_run_id
  )
  with basket_lines as (
    select
      'estimate:' || e.id::text as basket_id,
      date_trunc('month', e.business_date)::date as effective_month,
      ei.product_id,
      ei.service_id
    from app.estimates e
    join app.estimate_items ei on ei.estimate_id = e.id
    union all
    select
      'sale:' || st.id::text,
      date_trunc('month', st.business_date)::date,
      sti.product_id,
      sti.service_id
    from app.sales_transactions st
    join app.sales_transaction_items sti on sti.transaction_id = st.id
    union all
    select
      'service:' || so.id::text,
      date_trunc('month', so.business_date)::date,
      soi.product_id,
      soi.service_id
    from app.service_orders so
    join app.service_order_items soi on soi.service_order_id = so.id
  ),
  month_totals as (
    select effective_month, count(distinct basket_id) as total_baskets
    from basket_lines
    group by effective_month
  ),
  product_occurrence as (
    select distinct basket_id, effective_month, product_id
    from basket_lines
    where product_id is not null
  ),
  service_occurrence as (
    select distinct basket_id, effective_month, service_id
    from basket_lines
    where service_id is not null
  ),
  product_base as (
    select effective_month, product_id, count(*) as basket_count
    from product_occurrence
    group by effective_month, product_id
  ),
  service_base as (
    select effective_month, service_id, count(*) as basket_count
    from service_occurrence
    group by effective_month, service_id
  ),
  service_product_pairs as (
    select
      s.effective_month,
      s.service_id as antecedent_service_id,
      p.product_id as consequent_product_id,
      count(*) as sample_count
    from service_occurrence s
    join product_occurrence p
      on s.basket_id = p.basket_id
     and s.effective_month = p.effective_month
    group by s.effective_month, s.service_id, p.product_id
  ),
  service_service_pairs as (
    select
      a.effective_month,
      a.service_id as antecedent_service_id,
      b.service_id as consequent_service_id,
      count(*) as sample_count
    from service_occurrence a
    join service_occurrence b
      on a.basket_id = b.basket_id
     and a.service_id <> b.service_id
     and a.effective_month = b.effective_month
    group by a.effective_month, a.service_id, b.service_id
  )
  select
    spp.antecedent_service_id,
    'product',
    spp.consequent_product_id,
    null,
    round(spp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(spp.sample_count::numeric / nullif(sb.basket_count, 0), 4),
    round(
      (spp.sample_count::numeric / nullif(sb.basket_count, 0)) /
      nullif(pb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    spp.sample_count,
    spp.effective_month,
    true,
    p_refresh_run_id
  from service_product_pairs spp
  join month_totals mt on mt.effective_month = spp.effective_month
  join service_base sb on sb.effective_month = spp.effective_month and sb.service_id = spp.antecedent_service_id
  join product_base pb on pb.effective_month = spp.effective_month and pb.product_id = spp.consequent_product_id
  where spp.sample_count >= 2
    and (spp.sample_count::numeric / nullif(sb.basket_count, 0)) >= 0.20
  union all
  select
    ssp.antecedent_service_id,
    'service',
    null,
    ssp.consequent_service_id,
    round(ssp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(ssp.sample_count::numeric / nullif(sb.basket_count, 0), 4),
    round(
      (ssp.sample_count::numeric / nullif(sb.basket_count, 0)) /
      nullif(csb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    ssp.sample_count,
    ssp.effective_month,
    true,
    p_refresh_run_id
  from service_service_pairs ssp
  join month_totals mt on mt.effective_month = ssp.effective_month
  join service_base sb on sb.effective_month = ssp.effective_month and sb.service_id = ssp.antecedent_service_id
  join service_base csb on csb.effective_month = ssp.effective_month and csb.service_id = ssp.consequent_service_id
  where ssp.sample_count >= 2
    and (ssp.sample_count::numeric / nullif(sb.basket_count, 0)) >= 0.20;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into ml.vehicle_bundle_rules (
    vehicle_model_name,
    anchor_product_id,
    anchor_service_id,
    recommended_product_id,
    recommended_service_id,
    support,
    confidence,
    lift,
    sample_count,
    effective_month,
    active,
    refresh_run_id
  )
  with basket_lines as (
    select
      'estimate:' || e.id::text as basket_id,
      date_trunc('month', e.business_date)::date as effective_month,
      v.model_name as vehicle_model_name,
      ei.product_id,
      ei.service_id
    from app.estimates e
    join app.estimate_items ei on ei.estimate_id = e.id
    join app.vehicles v on v.id = e.vehicle_id
    union all
    select
      'service:' || so.id::text,
      date_trunc('month', so.business_date)::date,
      v.model_name,
      soi.product_id,
      soi.service_id
    from app.service_orders so
    join app.service_order_items soi on soi.service_order_id = so.id
    join app.vehicles v on v.id = so.vehicle_id
  ),
  model_baskets as (
    select vehicle_model_name, effective_month, count(distinct basket_id) as total_baskets
    from basket_lines
    where coalesce(vehicle_model_name, '') <> ''
    group by vehicle_model_name, effective_month
  ),
  global_totals as (
    select effective_month, count(distinct basket_id) as total_baskets
    from basket_lines
    group by effective_month
  ),
  product_counts as (
    select vehicle_model_name, effective_month, product_id, count(distinct basket_id) as sample_count
    from basket_lines
    where product_id is not null and coalesce(vehicle_model_name, '') <> ''
    group by vehicle_model_name, effective_month, product_id
  ),
  global_product_counts as (
    select effective_month, product_id, count(distinct basket_id) as sample_count
    from basket_lines
    where product_id is not null
    group by effective_month, product_id
  )
  select
    pc.vehicle_model_name,
    null,
    null,
    pc.product_id,
    null,
    round(pc.sample_count::numeric / nullif(gt.total_baskets, 0), 4),
    round(pc.sample_count::numeric / nullif(mb.total_baskets, 0), 4),
    round(
      (pc.sample_count::numeric / nullif(mb.total_baskets, 0)) /
      nullif(gpc.sample_count::numeric / nullif(gt.total_baskets, 0), 0),
      4
    ),
    pc.sample_count,
    pc.effective_month,
    true,
    p_refresh_run_id
  from product_counts pc
  join model_baskets mb on mb.vehicle_model_name = pc.vehicle_model_name and mb.effective_month = pc.effective_month
  join global_totals gt on gt.effective_month = pc.effective_month
  join global_product_counts gpc on gpc.effective_month = pc.effective_month and gpc.product_id = pc.product_id
  where pc.sample_count >= 2;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set rule_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;

create or replace function app.refresh_demand_forecasts(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, ml, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  truncate table
    ml.product_monthly_forecasts,
    ml.service_monthly_forecasts
  restart identity;

  insert into ml.product_monthly_forecasts (
    target_month,
    product_id,
    recent_month_values,
    predicted_quantity,
    predicted_revenue,
    trend_label,
    confidence_label,
    refresh_run_id
  )
  with ranked as (
    select
      fmpd.product_key,
      fmpd.month_start,
      fmpd.quantity,
      fmpd.revenue,
      dp.source_product_id as product_id,
      row_number() over (partition by fmpd.product_key order by fmpd.month_start desc) as rn,
      max(fmpd.month_start) over () as latest_month
    from dw.fact_monthly_product_demand fmpd
    join dw.dim_product dp on dp.product_key = fmpd.product_key
  ),
  agg as (
    select
      product_id,
      (latest_month + interval '1 month')::date as target_month,
      jsonb_agg(
        jsonb_build_object(
          'month_start', month_start,
          'quantity', quantity,
          'revenue', revenue
        )
        order by month_start desc
      ) filter (where rn <= 6) as recent_month_values,
      max(case when rn = 1 then quantity end) as q1,
      max(case when rn = 2 then quantity end) as q2,
      max(case when rn = 3 then quantity end) as q3,
      max(case when rn = 1 then revenue end) as r1,
      max(case when rn = 2 then revenue end) as r2,
      max(case when rn = 3 then revenue end) as r3,
      count(*) filter (where rn <= 3) as history_count
    from ranked
    group by product_id, latest_month
  )
  select
    target_month,
    product_id,
    coalesce(recent_month_values, '[]'::jsonb),
    round(
      coalesce(q1, 0) * 0.50 +
      coalesce(q2, q1, 0) * 0.30 +
      coalesce(q3, q2, q1, 0) * 0.20,
      2
    ),
    round(
      coalesce(r1, 0) * 0.50 +
      coalesce(r2, r1, 0) * 0.30 +
      coalesce(r3, r2, r1, 0) * 0.20,
      2
    ),
    case
      when coalesce(q1, 0) > coalesce(q2, q1, 0) * 1.10 then 'rising'
      when coalesce(q1, 0) < coalesce(q2, q1, 0) * 0.90 then 'declining'
      else 'stable'
    end,
    case
      when history_count >= 3 then 'high'
      when history_count = 2 then 'medium'
      else 'low'
    end,
    p_refresh_run_id
  from agg;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into ml.service_monthly_forecasts (
    target_month,
    service_id,
    recent_month_values,
    predicted_quantity,
    predicted_revenue,
    trend_label,
    confidence_label,
    refresh_run_id
  )
  with ranked as (
    select
      fmsd.service_key,
      fmsd.month_start,
      fmsd.quantity,
      fmsd.revenue,
      ds.source_service_id as service_id,
      row_number() over (partition by fmsd.service_key order by fmsd.month_start desc) as rn,
      max(fmsd.month_start) over () as latest_month
    from dw.fact_monthly_service_demand fmsd
    join dw.dim_service ds on ds.service_key = fmsd.service_key
  ),
  agg as (
    select
      service_id,
      (latest_month + interval '1 month')::date as target_month,
      jsonb_agg(
        jsonb_build_object(
          'month_start', month_start,
          'quantity', quantity,
          'revenue', revenue
        )
        order by month_start desc
      ) filter (where rn <= 6) as recent_month_values,
      max(case when rn = 1 then quantity end) as q1,
      max(case when rn = 2 then quantity end) as q2,
      max(case when rn = 3 then quantity end) as q3,
      max(case when rn = 1 then revenue end) as r1,
      max(case when rn = 2 then revenue end) as r2,
      max(case when rn = 3 then revenue end) as r3,
      count(*) filter (where rn <= 3) as history_count
    from ranked
    group by service_id, latest_month
  )
  select
    target_month,
    service_id,
    coalesce(recent_month_values, '[]'::jsonb),
    round(
      coalesce(q1, 0) * 0.50 +
      coalesce(q2, q1, 0) * 0.30 +
      coalesce(q3, q2, q1, 0) * 0.20,
      2
    ),
    round(
      coalesce(r1, 0) * 0.50 +
      coalesce(r2, r1, 0) * 0.30 +
      coalesce(r3, r2, r1, 0) * 0.20,
      2
    ),
    case
      when coalesce(q1, 0) > coalesce(q2, q1, 0) * 1.10 then 'rising'
      when coalesce(q1, 0) < coalesce(q2, q1, 0) * 0.90 then 'declining'
      else 'stable'
    end,
    case
      when history_count >= 3 then 'high'
      when history_count = 2 then 'medium'
      else 'low'
    end,
    p_refresh_run_id
  from agg;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set forecast_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;

create or replace function app.run_full_analytics_refresh(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_refresh_id uuid;
begin
  insert into app.analytics_refresh_runs (initiated_by, status, notes)
  values (auth.uid(), 'running', p_notes)
  returning id into v_refresh_id;

  begin
    perform app.refresh_dimensional_data(v_refresh_id);
    perform app.refresh_monthly_aggregates(v_refresh_id);
    perform app.refresh_association_rules(v_refresh_id);
    perform app.refresh_demand_forecasts(v_refresh_id);

    update app.analytics_refresh_runs
    set
      status = 'success',
      ended_at = timezone('utc', now())
    where id = v_refresh_id;
  exception when others then
    update app.analytics_refresh_runs
    set
      status = 'failed',
      ended_at = timezone('utc', now()),
      error_message = sqlerrm
    where id = v_refresh_id;
    raise;
  end;

  return v_refresh_id;
end;
$$;

create or replace view ml.v_top_upsell_opportunities as
select
  par.id as rule_id,
  par.antecedent_product_id as product_id,
  p.name as product_name,
  par.consequent_kind,
  par.consequent_product_id,
  cp.name as recommended_product_name,
  par.consequent_service_id,
  cs.name as recommended_service_name,
  par.support,
  par.confidence,
  par.lift,
  par.sample_count,
  par.effective_month
from ml.product_association_rules par
join app.products p on p.id = par.antecedent_product_id
left join app.products cp on cp.id = par.consequent_product_id
left join app.services cs on cs.id = par.consequent_service_id
where par.active;

create or replace view ml.v_predicted_low_stock_risk as
select
  pmf.target_month,
  pmf.product_id,
  p.sku,
  p.name as product_name,
  pmf.predicted_quantity,
  pmf.predicted_revenue,
  ib.on_hand,
  ib.reorder_point,
  case
    when ib.on_hand <= 0 then 'critical'
    when ib.on_hand < pmf.predicted_quantity then 'high'
    when ib.on_hand < greatest(pmf.predicted_quantity * 1.25, ib.reorder_point) then 'medium'
    else 'low'
  end as risk_level,
  pmf.trend_label,
  pmf.confidence_label
from ml.product_monthly_forecasts pmf
join app.products p on p.id = pmf.product_id
left join app.inventory_balances ib on ib.product_id = pmf.product_id;

create or replace view ml.v_product_forecast_vs_actual as
select
  pmf.target_month,
  pmf.product_id,
  p.sku,
  p.name as product_name,
  pmf.predicted_quantity,
  coalesce(fmpd.quantity, 0) as actual_quantity,
  pmf.predicted_revenue,
  coalesce(fmpd.revenue, 0) as actual_revenue,
  pmf.trend_label,
  pmf.confidence_label
from ml.product_monthly_forecasts pmf
join app.products p on p.id = pmf.product_id
left join dw.dim_product dp on dp.source_product_id = pmf.product_id
left join dw.fact_monthly_product_demand fmpd
  on fmpd.product_key = dp.product_key
 and fmpd.month_start = pmf.target_month;


