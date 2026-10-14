-- Read-only, conservative baseline forecasts from recorded completed sales.
-- Never read warehouse/demo forecasts or modify inventory balances.
create or replace function public.get_recorded_forecast_snapshot(
 p_as_of date default (now() at time zone 'Asia/Manila')::date
) returns jsonb language sql stable security definer set search_path = '' as $$
with bounds as (
 select date_trunc('month',p_as_of)::date as month_start,
 (date_trunc('month',p_as_of)-interval '6 months')::date as window_start,
 (date_trunc('month',p_as_of)+interval '1 month')::date as target_month
), lines as (
 select 'product'::text kind,s.product_id as item_id,s.sku,s.product_name as name,s.sale_date,s.quantity,s.revenue
 from private.recorded_product_sales s join catalog.products p on p.id=s.product_id and p.is_active
 union all
 select 'service',si.service_id,coalesce(si.item_sku_snapshot,''),coalesce(si.item_name_snapshot,service.name),
 coalesce(st.business_date,(st.sale_at at time zone 'Asia/Manila')::date),si.quantity,si.line_total
 from operations.sales_transactions st join operations.sales_transaction_items si on si.transaction_id=st.id
 join operations.services service on service.id=si.service_id and service.is_active
 where st.status='completed' and si.line_type='service'
 and st.transaction_number not ilike 'SALE-DEMO-%'
 and coalesce(st.customer_name_snapshot,'') not ilike 'demo customer%'
 and coalesce(st.original_reference,'') not ilike 'DEMO-%'
), monthly as (
 select l.kind,l.item_id,max(l.sku) sku,max(l.name) name,date_trunc('month',l.sale_date)::date bucket_month,
 sum(l.quantity) quantity,sum(l.revenue) revenue
 from lines l cross join bounds b where l.sale_date>=b.window_start and l.sale_date<b.month_start
 group by l.kind,l.item_id,date_trunc('month',l.sale_date)::date
), forecasts as (
 select m.kind,m.item_id,max(m.sku) sku,max(m.name) name,
 round(sum(m.quantity)/6,2) predicted_quantity,round(sum(m.revenue)/6,2) predicted_revenue,
 count(*)::int observed_months,max(m.bucket_month) latest_month
 from monthly m group by m.kind,m.item_id
 having count(*)>=3 and max(m.bucket_month)>=(select month_start-interval '3 months' from bounds)
), product_forecasts as (
 select f.item_id product_id,f.sku,f.name product_name,b.target_month,f.predicted_quantity,f.predicted_revenue,
 'six_month_mean'::text method,'limited'::text confidence_label,f.observed_months
 from forecasts f cross join bounds b where f.kind='product'
 order by f.predicted_quantity desc,f.predicted_revenue desc limit 5
), service_forecasts as (
 select f.item_id service_id,f.name service_name,b.target_month,f.predicted_quantity,f.predicted_revenue,
 'six_month_mean'::text method,'limited'::text confidence_label,f.observed_months
 from forecasts f cross join bounds b where f.kind='service'
 order by f.predicted_quantity desc,f.predicted_revenue desc limit 5
)
select jsonb_build_object(
 'latestRefresh',null,'topUpsellOpportunities','[]'::jsonb,'predictedLowStockRisk','[]'::jsonb,
 'topProductForecasts',(select coalesce(jsonb_agg(p),'[]') from product_forecasts p),
 'topServiceForecasts',(select coalesce(jsonb_agg(s),'[]') from service_forecasts s),
 'forecastMetadata',jsonb_build_object('generatedAt',statement_timestamp(),'source','completed_recorded_sales',
 'method','six_month_mean','historyStart',b.window_start,'historyEnd',b.month_start-1,'targetMonth',b.target_month,
 'minimumActiveMonths',3,'productStatus',case when exists(select 1 from product_forecasts) then 'available' else 'insufficient_history' end,
 'serviceStatus',case when exists(select 1 from service_forecasts) then 'available' else 'insufficient_history' end)
) from bounds b;
$$;
revoke all on function public.get_recorded_forecast_snapshot(date) from public,anon,authenticated;
grant execute on function public.get_recorded_forecast_snapshot(date) to service_role;

-- Preserve existing price semantics; add available stock for checkout preflight.
create or replace function public.limen_current_retail_prices(p_product_ids uuid[])
returns jsonb language sql stable set search_path = 'pg_catalog','catalog' as $$
 select coalesce(jsonb_agg(jsonb_build_object('productId',p.id,'sku',p.sku,'name',p.name,
 'price',cp.amount,'available',p.is_active and cp.id is not null,
 'availableStock',greatest(coalesce(b.on_hand,0)-coalesce(b.reserved,0),0))), '[]'::jsonb)
 from catalog.products p
 left join catalog.product_prices cp on cp.product_id=p.id and cp.price_type='retail' and cp.is_current
 left join catalog.inventory_balances b on b.product_id=p.id
 where p.id=any(p_product_ids);
$$;
revoke all on function public.limen_current_retail_prices(uuid[]) from public,anon,authenticated;
grant execute on function public.limen_current_retail_prices(uuid[]) to service_role;
