-- Operational reports must not depend on seeded or stale warehouse facts.
-- No transaction is removed: known seed markers are excluded from reporting.
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
  and coalesce(st.original_reference, '') not ilike 'DEMO-%';
revoke all on private.recorded_product_sales from public, anon, authenticated;

create or replace function public.get_top_selling_items(
 start_date date default null, end_date date default null, category_filter text default null,
 product_id_filter uuid default null, location_filter text default null, limit_count integer default 10
) returns table(product_id uuid, sku text, product_name text, category text, brand text, quantity numeric, revenue numeric, source_line_count integer)
language sql stable security definer set search_path = '' as $$
 select s.product_id,s.sku,s.product_name,s.category,s.brand,sum(s.quantity),sum(s.revenue),count(*)::integer
 from private.recorded_product_sales s
 where (start_date is null or s.sale_date >= start_date) and (end_date is null or s.sale_date <= end_date)
 and (coalesce(category_filter,'')='' or s.category=category_filter)
 and (product_id_filter is null or s.product_id=product_id_filter)
 and (coalesce(location_filter,'')='' or location_filter='Main Shop')
 group by s.product_id,s.sku,s.product_name,s.category,s.brand
 order by sum(s.quantity) desc,sum(s.revenue) desc,s.product_name
 limit greatest(coalesce(limit_count,10),1);
$$;

create or replace function public.get_item_sales_trend(
 start_date date default null,end_date date default null,product_id_filter uuid default null,
 category_filter text default null,location_filter text default null,granularity text default 'month'
) returns table(period_start date,label text,product_id uuid,sku text,product_name text,category text,quantity numeric,revenue numeric)
language sql stable security definer set search_path = '' as $$
 with filtered as (
 select s.*, date_trunc(case when granularity='day' then 'day' else 'month' end,s.sale_date)::date as bucket
 from private.recorded_product_sales s
 where (start_date is null or s.sale_date>=start_date) and (end_date is null or s.sale_date<=end_date)
 and (product_id_filter is null or s.product_id=product_id_filter)
 and (coalesce(category_filter,'')='' or s.category=category_filter)
 and (coalesce(location_filter,'')='' or location_filter='Main Shop')
 )
 select f.bucket,to_char(f.bucket,case when granularity='day' then 'Mon DD YYYY' else 'Mon YYYY' end),
 f.product_id,f.sku,f.product_name,f.category,sum(f.quantity),sum(f.revenue)
 from filtered f group by f.bucket,f.product_id,f.sku,f.product_name,f.category
 order by f.bucket,f.product_name;
$$;

create or replace function public.get_item_peak_periods(
 start_date date default null,end_date date default null,product_id_filter uuid default null,
 category_filter text default null,location_filter text default null
) returns table(product_id uuid,sku text,product_name text,category text,peak_month date,peak_quantity numeric,peak_revenue numeric)
language sql stable security definer set search_path = '' as $$
 with ranked as (
 select t.*,row_number() over(partition by t.product_id,t.sku order by t.quantity desc,t.revenue desc,t.period_start desc) as rank
 from public.get_item_sales_trend(start_date,end_date,product_id_filter,category_filter,location_filter,'month') t
 ) select r.product_id,r.sku,r.product_name,r.category,r.period_start,r.quantity,r.revenue
 from ranked r where r.rank=1 order by r.quantity desc,r.revenue desc,r.product_name;
$$;

create or replace function public.get_recorded_sales_report(
 p_start_date date default null,p_end_date date default null,p_category text default null,p_granularity text default 'month'
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
 if p_start_date > p_end_date then raise exception using errcode='22023',message='Start date must be before end date.'; end if;
 if p_granularity not in ('day','month') then raise exception using errcode='22023',message='Select daily or monthly reporting.'; end if;
 select jsonb_build_object(
 'generatedAt',statement_timestamp(),'source','completed_recorded_sales',
 'topSellingItems',(select coalesce(jsonb_agg(t),'[]') from public.get_top_selling_items(p_start_date,p_end_date,p_category,null,null,10) t),
 'itemTrend',(select coalesce(jsonb_agg(t),'[]') from public.get_item_sales_trend(p_start_date,p_end_date,null,p_category,null,p_granularity) t),
 'peakPeriods',(select coalesce(jsonb_agg(t),'[]') from public.get_item_peak_periods(p_start_date,p_end_date,null,p_category,null) t),
 'categories',(select coalesce(jsonb_agg(t order by t.revenue desc),'[]') from (
   select s.category,sum(s.quantity) quantity,sum(s.revenue) revenue from private.recorded_product_sales s
   where (p_start_date is null or s.sale_date>=p_start_date) and (p_end_date is null or s.sale_date<=p_end_date)
   and (coalesce(p_category,'')='' or s.category=p_category) group by s.category
 ) t)
 ) into v_result;
 return v_result;
end;
$$;
revoke all on function public.get_top_selling_items(date,date,text,uuid,text,integer),
 public.get_item_sales_trend(date,date,uuid,text,text,text),public.get_item_peak_periods(date,date,uuid,text,text),
 public.get_recorded_sales_report(date,date,text,text) from public,anon,authenticated;
grant execute on function public.get_top_selling_items(date,date,text,uuid,text,integer),
 public.get_item_sales_trend(date,date,uuid,text,text,text),public.get_item_peak_periods(date,date,uuid,text,text),
 public.get_recorded_sales_report(date,date,text,text) to service_role;
