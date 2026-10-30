-- Exact read-only attention queues; no derived state is persisted.
create function public.service_attention_page(p_page integer default 1,p_kind text default 'all') returns jsonb
language plpgsql stable security invoker set search_path='' as $fn$
declare result jsonb;
begin
 if p_kind is null or p_kind not in ('all','awaiting_payment','overdue','awaiting_assignment','release_review','payment_review') then
  raise exception using errcode='22023',message='Choose a valid job category.';
 end if;
 with base as materialized (
  select so.id,so.order_number,so.created_at,so.priority,so.status,so.payment_status,
   so.assigned_mechanic_id,so.scheduled_end,ws.stage,c.name customer_name
  from operations.service_orders so
  left join operations.service_work_state ws on ws.service_order_id=so.id
  left join operations.customers c on c.id=so.customer_id
  where so.status<>'cancelled'
    and coalesce(so.order_number,'') not ilike 'SVC-DEMO-%'
    and coalesce(c.name,'') not ilike 'demo customer%'
    and coalesce(so.note,'') not ilike '%demo service order%'
 ), classified as materialized (
  select b.*,case
   when (b.status='completed' or b.stage='released') and coalesce(b.payment_status,'unpaid')<>'paid' then 'payment_review'
   when b.status in ('pending','in_progress') and b.payment_status='paid' then 'release_review'
   when b.status in ('pending','in_progress') and b.stage='work_completed' then 'awaiting_payment'
   when b.status in ('pending','in_progress') and coalesce(b.stage,'') not in ('released','cancelled') and b.scheduled_end<now() then 'overdue'
   when b.status in ('pending','in_progress') and coalesce(b.stage,'') not in ('released','cancelled') and b.assigned_mechanic_id is null then 'awaiting_assignment'
  end kind from base b
 ), matches as (select * from classified where kind is not null and (p_kind='all' or kind=p_kind)),
 counts as (select count(*) total_count from matches),
 paging as (select total_count,greatest(1,(total_count+5)/6)::integer pages,
  least(greatest(coalesce(p_page,1),1),greatest(1,(total_count+5)/6)::integer) page from counts),
 selected as (
  select m.*,row_number() over(order by
   case m.kind when 'awaiting_payment' then 0 when 'overdue' then 1 when 'awaiting_assignment' then 2 when 'release_review' then 3 else 4 end,
   case m.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,m.created_at,m.id) ordinal
  from matches m order by ordinal limit 6 offset (select (page-1)*6 from paging)
 )
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'number',s.order_number,'customerName',s.customer_name,'kind',s.kind) order by s.ordinal) from selected s),'[]'::jsonb),
  'pagination',(select jsonb_build_object('page',page,'pageSize',6,'totalCount',total_count,'totalPages',pages) from paging),
  'summary',(select jsonb_build_object('active',count(*) filter(where status in ('pending','in_progress')),
   'awaiting_payment',count(*) filter(where kind='awaiting_payment'),'overdue',count(*) filter(where kind='overdue'),
   'awaiting_assignment',count(*) filter(where kind='awaiting_assignment'),'release_review',count(*) filter(where kind='release_review'),
   'payment_review',count(*) filter(where kind='payment_review')) from classified),
  'checkedAt',now()) into result;
 return result;
end;
$fn$;
create function public.dashboard_active_quote_count() returns jsonb
language sql stable security invoker set search_path='' as $fn$
 select jsonb_build_object('activeCount',count(*))
 from operations.estimates e left join operations.customers c on c.id=e.customer_id
 where e.archived_at is null and e.status in ('draft','sent','approved')
  and (e.valid_until is null or e.valid_until >= (now() at time zone 'Asia/Manila')::date)
  and coalesce(e.estimate_number,'') not ilike 'EST-DEMO-%'
  and coalesce(c.name,'') not ilike '%demo customer%'
  and not exists(select 1 from operations.service_orders so where so.estimate_id=e.id)
  and not exists(select 1 from operations.sales_transactions st where st.estimate_id=e.id);
$fn$;
revoke all on function public.service_attention_page(integer,text),public.dashboard_active_quote_count() from public,anon,authenticated;
grant execute on function public.service_attention_page(integer,text),public.dashboard_active_quote_count() to service_role;
