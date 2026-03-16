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

create or replace function public.create_estimate(payload jsonb)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.create_estimate_internal(payload);
$$;

create or replace function public.convert_estimate_to_sale(p_estimate_id uuid, p_payment_method text default 'cash')
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.convert_estimate_to_sale_internal(p_estimate_id, p_payment_method);
$$;

create or replace function public.convert_estimate_to_service_order(p_estimate_id uuid, p_assigned_to uuid default null)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.convert_estimate_to_service_order_internal(p_estimate_id, p_assigned_to);
$$;

create or replace function public.record_upsell_action(
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
language sql
security definer
set search_path = public, app
as $$
  select app.record_upsell_action_internal(
    p_context_type,
    p_context_id,
    p_product_id,
    p_recommended_product_id,
    p_recommended_service_id,
    p_action,
    p_rule_id,
    p_reason_label
  );
$$;

create or replace function public.run_full_analytics_refresh(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.is_admin() then
    raise exception 'Only admin users can trigger analytics refreshes.';
  end if;

  return app.run_full_analytics_refresh(p_notes);
end;
$$;

create or replace function public.get_product_upsell_recommendations(
  product_id uuid,
  vehicle_model_id text default null,
  limit_count integer default 5
)
returns table (
  rule_id uuid,
  consequent_kind text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_price numeric,
  support numeric,
  confidence numeric,
  lift numeric,
  sample_count integer,
  reason_label text
)
language sql
security definer
set search_path = public, app, ml
as $$
  with direct_rules as (
    select
      par.id as rule_id,
      par.consequent_kind,
      par.consequent_product_id as recommended_product_id,
      cp.name as recommended_product_name,
      par.consequent_service_id as recommended_service_id,
      cs.name as recommended_service_name,
      coalesce(pp.amount, cs.standard_price, 0) as recommended_price,
      par.support,
      par.confidence,
      par.lift,
      par.sample_count,
      case
        when par.consequent_kind = 'product' then 'Frequently bought together'
        else 'Recommended service pairing'
      end as reason_label
    from ml.product_association_rules par
    left join app.products cp on cp.id = par.consequent_product_id
    left join app.services cs on cs.id = par.consequent_service_id
    left join lateral (
      select amount
      from app.product_prices pp
      where pp.product_id = par.consequent_product_id
        and pp.price_type = 'retail'
      order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
      limit 1
    ) pp on true
    where par.active
      and par.antecedent_product_id = product_id
  ),
  vehicle_rules as (
    select
      vbr.id as rule_id,
      case when vbr.recommended_product_id is not null then 'product' else 'service' end as consequent_kind,
      vbr.recommended_product_id,
      cp.name as recommended_product_name,
      vbr.recommended_service_id,
      cs.name as recommended_service_name,
      coalesce(pp.amount, cs.standard_price, 0) as recommended_price,
      vbr.support,
      vbr.confidence,
      vbr.lift,
      vbr.sample_count,
      'Top bundle for ' || vbr.vehicle_model_name as reason_label
    from ml.vehicle_bundle_rules vbr
    left join app.products cp on cp.id = vbr.recommended_product_id
    left join app.services cs on cs.id = vbr.recommended_service_id
    left join lateral (
      select amount
      from app.product_prices pp
      where pp.product_id = vbr.recommended_product_id
        and pp.price_type = 'retail'
      order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
      limit 1
    ) pp on true
    where vbr.active
      and vehicle_model_id is not null
      and vbr.vehicle_model_name = vehicle_model_id
  )
  select *
  from (
    select * from direct_rules
    union all
    select * from vehicle_rules
  ) recommendations
  order by lift desc, confidence desc, sample_count desc
  limit greatest(limit_count, 1);
$$;

create or replace function public.get_monthly_product_forecasts(target_month date default null)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  target_month date,
  predicted_quantity numeric,
  predicted_revenue numeric,
  trend_label text,
  confidence_label text,
  recent_month_values jsonb
)
language sql
security definer
set search_path = public, app, ml
as $$
  select
    pmf.product_id,
    p.sku,
    p.name,
    pmf.target_month,
    pmf.predicted_quantity,
    pmf.predicted_revenue,
    pmf.trend_label,
    pmf.confidence_label,
    pmf.recent_month_values
  from ml.product_monthly_forecasts pmf
  join app.products p on p.id = pmf.product_id
  where pmf.target_month = coalesce(target_month, (select max(target_month) from ml.product_monthly_forecasts))
  order by pmf.predicted_quantity desc, pmf.predicted_revenue desc;
$$;

create or replace function public.get_monthly_service_forecasts(target_month date default null)
returns table (
  service_id uuid,
  service_code text,
  service_name text,
  target_month date,
  predicted_quantity numeric,
  predicted_revenue numeric,
  trend_label text,
  confidence_label text,
  recent_month_values jsonb
)
language sql
security definer
set search_path = public, app, ml
as $$
  select
    smf.service_id,
    s.code,
    s.name,
    smf.target_month,
    smf.predicted_quantity,
    smf.predicted_revenue,
    smf.trend_label,
    smf.confidence_label,
    smf.recent_month_values
  from ml.service_monthly_forecasts smf
  join app.services s on s.id = smf.service_id
  where smf.target_month = coalesce(target_month, (select max(target_month) from ml.service_monthly_forecasts))
  order by smf.predicted_quantity desc, smf.predicted_revenue desc;
$$;

create or replace function public.get_analytics_dashboard_snapshot()
returns jsonb
language sql
security definer
set search_path = public, app, dw, ml
as $$
  select jsonb_build_object(
    'latestRefresh', (
      select jsonb_build_object(
        'id', ar.id,
        'status', ar.status,
        'startedAt', ar.started_at,
        'endedAt', ar.ended_at,
        'dimensionRows', ar.dimension_rows,
        'factRows', ar.fact_rows,
        'ruleRows', ar.rule_rows,
        'forecastRows', ar.forecast_rows
      )
      from app.analytics_refresh_runs ar
      order by ar.started_at desc
      limit 1
    ),
    'topUpsellOpportunities', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.lift desc), '[]'::jsonb)
      from (
        select *
        from ml.v_top_upsell_opportunities
        order by lift desc, confidence desc
        limit 5
      ) t
    ),
    'predictedLowStockRisk', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from ml.v_predicted_low_stock_risk
        where risk_level in ('critical', 'high', 'medium')
        limit 5
      ) r
    ),
    'topProductForecasts', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from public.get_monthly_product_forecasts(null)
        limit 5
      ) f
    ),
    'topServiceForecasts', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from public.get_monthly_service_forecasts(null)
        limit 5
      ) f
    )
  );
$$;
