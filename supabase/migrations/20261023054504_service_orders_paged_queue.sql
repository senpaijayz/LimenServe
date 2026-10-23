-- Page the complete workshop queue rather than truncating it at 100 orders.
create or replace function public.limen_service_order_queue(
  p_search text default '',
  p_stage text default 'active',
  p_mechanic_id uuid default null,
  p_priority text default 'all',
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 18
)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, operations, public
as $$
declare
  v_page integer := least(greatest(coalesce(p_page, 1), 1), 100000);
  v_size integer := least(greatest(coalesce(p_page_size, 18), 1), 50);
  v_search text := btrim(coalesce(p_search, ''));
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode='42501', message='The service queue is server-managed.';
  end if;
  if p_stage not in ('active','pending','in_progress','overdue','completed','cancelled','all')
     or p_priority not in ('all','low','normal','high','urgent')
     or p_sort not in ('newest','oldest','due','urgency') then
    raise exception using errcode='22023', message='Invalid service queue filter.';
  end if;

  with base as (
    select so.id, so.created_at, so.scheduled_end, so.status, so.priority,
           so.payment_status, so.assigned_mechanic_id
    from operations.service_orders so
    left join operations.customers c on c.id = so.customer_id
    left join operations.vehicles v on v.id = so.vehicle_id
    where coalesce(so.order_number, '') not ilike 'SVC-DEMO-%'
      and coalesce(c.name, '') not ilike 'demo customer%'
      and coalesce(so.note, '') not ilike '%demo service order%'
      and (v_search = '' or so.order_number ilike '%' || v_search || '%'
           or c.name ilike '%' || v_search || '%'
           or c.phone ilike '%' || v_search || '%'
           or v.plate_no ilike '%' || v_search || '%'
           or v.model_name ilike '%' || v_search || '%')
      and (p_mechanic_id is null or so.assigned_mechanic_id = p_mechanic_id)
      and (p_priority = 'all' or so.priority = p_priority)
  ), filtered as (
    select * from base b
    where p_stage = 'all'
       or (p_stage = 'active' and b.status in ('pending','in_progress'))
       or (p_stage = 'overdue' and b.status in ('pending','in_progress') and b.scheduled_end < now())
       or b.status = p_stage
  ), ranked as (
    select f.*, row_number() over (order by
      case when p_sort = 'oldest' then f.created_at end asc nulls last,
      case when p_sort = 'due' then f.scheduled_end end asc nulls last,
      case when p_sort = 'urgency' then
        case f.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end end asc nulls last,
      f.created_at desc, f.id) as ordinal
    from filtered f
  ), page_rows as (
    select * from ranked f
    order by
      case when p_sort = 'oldest' then f.created_at end asc nulls last,
      case when p_sort = 'due' then f.scheduled_end end asc nulls last,
      case when p_sort = 'urgency' then
        case f.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end end asc nulls last,
      f.created_at desc, f.id
    limit v_size offset (v_page - 1) * v_size
  )
  select jsonb_build_object(
    'orders', coalesce((select jsonb_agg(public.limen_service_order_json(pr.id) order by pr.ordinal) from page_rows pr), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', v_page,
    'pageSize', v_size,
    'summary', (select jsonb_build_object(
      'active', count(*) filter (where status in ('pending','in_progress')),
      'pending', count(*) filter (where status = 'pending'),
      'inProgress', count(*) filter (where status = 'in_progress'),
      'overdue', count(*) filter (where status in ('pending','in_progress') and scheduled_end < now()),
      'awaitingAssignment', count(*) filter (where status in ('pending','in_progress') and assigned_mechanic_id is null),
      'awaitingPayment', count(*) filter (where status in ('pending','in_progress') and payment_status = 'unpaid'),
      'completed', count(*) filter (where status = 'completed'),
      'cancelled', count(*) filter (where status = 'cancelled')
    ) from base)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.limen_service_order_queue(text,text,uuid,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.limen_service_order_queue(text,text,uuid,text,text,integer,integer) to service_role;
