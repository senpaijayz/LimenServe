-- Search every supplied word across the service order and its linked records.
-- Each token may match a different field (for example, year + vehicle make).
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
    left join operations.mechanics m on m.id = so.assigned_mechanic_id
    where coalesce(so.order_number, '') not ilike 'SVC-DEMO-%'
      and coalesce(c.name, '') not ilike 'demo customer%'
      and coalesce(so.note, '') not ilike '%demo service order%'
      and (
        v_search = ''
        or not exists (
          select 1
          from regexp_split_to_table(v_search, '\s+') as search_term
          where search_term <> ''
            and not (
              concat_ws(' ', so.order_number, so.id::text, c.name, c.phone,
                v.plate_no, v.make, v.model_name, v.year::text, so.note,
                so.status, so.priority, so.payment_status,
                so.business_date::text, m.full_name
              ) ilike '%' || search_term || '%'
              or exists (
                select 1
                from operations.service_order_items i
                left join catalog.products p on p.id = i.product_id
                left join operations.services s on s.id = i.service_id
                where i.service_order_id = so.id
                  and concat_ws(' ', i.item_name_snapshot, p.name,
                    i.item_sku_snapshot, p.sku, s.name, s.code
                  ) ilike '%' || search_term || '%'
              )
            )
        )
      )
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

create or replace function public.limen_service_order_queue_by_date(
  p_search text, p_stage text, p_mechanic_id uuid, p_priority text,
  p_sort text, p_page integer, p_page_size integer, p_date date
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, operations, public
as $$
declare
  v_page integer := least(greatest(coalesce(p_page,1),1),100000);
  v_size integer := least(greatest(coalesce(p_page_size,18),1),50);
  v_search text := btrim(coalesce(p_search,''));
  v_result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='The service queue is server-managed.';
  end if;
  if p_date is null or p_stage not in ('active','pending','in_progress','overdue','completed','cancelled','all')
     or p_priority not in ('all','low','normal','high','urgent')
     or p_sort not in ('newest','oldest','due','urgency') then
    raise exception using errcode='22023',message='Choose valid service queue filters and date.';
  end if;
  with base as (
    select so.id,so.created_at,so.scheduled_end,so.status,so.priority,
           so.payment_status,so.assigned_mechanic_id
    from operations.service_orders so
    left join operations.customers c on c.id=so.customer_id
    left join operations.vehicles v on v.id=so.vehicle_id
    left join operations.mechanics m on m.id=so.assigned_mechanic_id
    where coalesce(so.order_number,'') not ilike 'SVC-DEMO-%'
      and coalesce(c.name,'') not ilike 'demo customer%'
      and coalesce(so.note,'') not ilike '%demo service order%'
      and (coalesce(so.completed_at,so.created_at) at time zone 'Asia/Manila')::date=p_date
      and (
        v_search = ''
        or not exists (
          select 1
          from regexp_split_to_table(v_search, '\s+') as search_term
          where search_term <> ''
            and not (
              concat_ws(' ', so.order_number, so.id::text, c.name, c.phone,
                v.plate_no, v.make, v.model_name, v.year::text, so.note,
                so.status, so.priority, so.payment_status,
                so.business_date::text, m.full_name
              ) ilike '%' || search_term || '%'
              or exists (
                select 1
                from operations.service_order_items i
                left join catalog.products p on p.id = i.product_id
                left join operations.services s on s.id = i.service_id
                where i.service_order_id = so.id
                  and concat_ws(' ', i.item_name_snapshot, p.name,
                    i.item_sku_snapshot, p.sku, s.name, s.code
                  ) ilike '%' || search_term || '%'
              )
            )
        )
      )
      and (p_mechanic_id is null or so.assigned_mechanic_id=p_mechanic_id)
      and (p_priority='all' or so.priority=p_priority)
  ), filtered as (
    select * from base b where p_stage='all'
      or (p_stage='active' and b.status in ('pending','in_progress'))
      or (p_stage='overdue' and b.status in ('pending','in_progress') and b.scheduled_end<now())
      or b.status=p_stage
  ), ranked as (
    select f.*,row_number() over (order by
      case when p_sort='oldest' then f.created_at end asc nulls last,
      case when p_sort='due' then f.scheduled_end end asc nulls last,
      case when p_sort='urgency' then
        case f.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end end asc nulls last,
      f.created_at desc,f.id) as ordinal
    from filtered f
  ), page_rows as (
    select * from ranked f order by
      case when p_sort='oldest' then f.created_at end asc nulls last,
      case when p_sort='due' then f.scheduled_end end asc nulls last,
      case when p_sort='urgency' then
        case f.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end end asc nulls last,
      f.created_at desc,f.id
    limit v_size offset (v_page-1)*v_size
  )
  select jsonb_build_object(
    'orders',coalesce((select jsonb_agg(public.limen_service_order_json(pr.id) order by pr.ordinal) from page_rows pr),'[]'::jsonb),
    'total',(select count(*) from filtered),
    'page',v_page,'pageSize',v_size,
    'summary',(select jsonb_build_object(
      'active',count(*) filter(where status in ('pending','in_progress')),
      'pending',count(*) filter(where status='pending'),
      'inProgress',count(*) filter(where status='in_progress'),
      'overdue',count(*) filter(where status in ('pending','in_progress') and scheduled_end<now()),
      'awaitingAssignment',count(*) filter(where status in ('pending','in_progress') and assigned_mechanic_id is null),
      'awaitingPayment',count(*) filter(where exists (
        select 1 from operations.service_work_state ws
        where ws.service_order_id=base.id and ws.stage='work_completed')),
      'completed',count(*) filter(where status='completed'),
      'cancelled',count(*) filter(where status='cancelled')
    ) from base)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.limen_service_order_queue_by_date(text,text,uuid,text,text,integer,integer,date)
  from public,anon,authenticated;
grant execute on function public.limen_service_order_queue_by_date(text,text,uuid,text,text,integer,integer,date)
  to service_role;
