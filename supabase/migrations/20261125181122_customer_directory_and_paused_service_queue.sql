-- Staff-only customer directory. Keep this separate from the existing search RPC
-- so the directory can list recent customers without a search term and use a
-- page size/date order without changing SavedCustomerIntake's existing contract.
create or replace function public.limen_customer_directory(
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 10,
  p_sort text default 'newest',
  p_quotes boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_search text := left(btrim(coalesce(p_search, '')), 120);
  v_page integer := least(greatest(coalesce(p_page, 1), 1), 100000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 50);
begin
  if p_sort not in ('newest', 'oldest') then
    raise exception using errcode = '22023', message = 'Choose a valid customer sort order.';
  end if;

  return (
    with links as materialized (
      select customer_id, id as vehicle_id
      from operations.vehicles
      where customer_id is not null
      union
      select customer_id, vehicle_id
      from operations.service_orders
      where customer_id is not null and vehicle_id is not null
      union
      select customer_id, vehicle_id
      from operations.estimates
      where p_quotes and customer_id is not null and vehicle_id is not null
    ), filtered as materialized (
      select c.id, c.name, c.phone, c.created_at
      from operations.customers c
      where v_search = ''
        or strpos(lower(coalesce(c.name, '')), lower(v_search)) > 0
        or (
          length(regexp_replace(v_search, '[^0-9]', '', 'g')) >= 2
          and strpos(
            regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'),
            regexp_replace(v_search, '[^0-9]', '', 'g')
          ) > 0
        )
        or (
          length(regexp_replace(v_search, '[^A-Za-z0-9]', '', 'g')) >= 2
          and exists (
            select 1
            from links l
            join operations.vehicles v on v.id = l.vehicle_id
            where l.customer_id = c.id
              and strpos(
                upper(regexp_replace(coalesce(v.plate_no, ''), '[^A-Za-z0-9]', '', 'g')),
                upper(regexp_replace(v_search, '[^A-Za-z0-9]', '', 'g'))
              ) > 0
          )
        )
    ), enriched as (
      select c.*,
        (select count(*) from operations.service_orders so where so.customer_id = c.id) as service_count,
        case when p_quotes then
          (select count(*) from operations.estimates e where e.customer_id = c.id)
        else null end as quote_count,
        (select count(*) from operations.sales_transactions s where s.customer_id = c.id) as sale_count,
        (select count(*) from links l where l.customer_id = c.id) as vehicle_count
      from filtered c
    ), page_rows as (
      select e.*
      from enriched e
      order by
        case when p_sort = 'newest' then e.created_at end desc nulls last,
        case when p_sort = 'oldest' then e.created_at end asc nulls last,
        e.id
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(r) order by
          case when p_sort = 'newest' then r.created_at end desc nulls last,
          case when p_sort = 'oldest' then r.created_at end asc nulls last,
          r.id
        ) from page_rows r
      ), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'page', v_page,
      'pageSize', v_page_size,
      'sort', p_sort,
      'quotesAllowed', p_quotes,
      'checkedAt', pg_catalog.now()
    )
  );
end;
$function$;

revoke all on function public.limen_customer_directory(text, integer, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.limen_customer_directory(text, integer, integer, text, boolean)
  to service_role;

-- A separate paged queue for paused work avoids filtering only the current
-- page of the regular queue and preserves search, mechanic, priority, date,
-- and sort behavior for paused service orders.
create or replace function public.limen_service_order_paused_queue(
  p_search text default '',
  p_mechanic_id uuid default null,
  p_priority text default 'all',
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 18,
  p_date date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_search text := btrim(coalesce(p_search, ''));
  v_page integer := least(greatest(coalesce(p_page, 1), 1), 100000);
  v_page_size integer := least(greatest(coalesce(p_page_size, 18), 1), 50);
begin
  if p_priority not in ('all', 'low', 'normal', 'high', 'urgent')
    or p_sort not in ('newest', 'oldest', 'due', 'urgency') then
    raise exception using errcode = '22023', message = 'Choose valid paused service queue filters.';
  end if;

  return (
    with base as materialized (
      select so.id, so.created_at, so.scheduled_end, so.status, so.priority,
        so.payment_status, so.assigned_mechanic_id, coalesce(ws.stage, 'intake') as work_stage
      from operations.service_orders so
      left join operations.service_work_state ws on ws.service_order_id = so.id
      left join operations.customers c on c.id = so.customer_id
      left join operations.vehicles v on v.id = so.vehicle_id
      left join operations.mechanics m on m.id = so.assigned_mechanic_id
      where coalesce(so.order_number, '') not ilike 'SVC-DEMO-%'
        and coalesce(c.name, '') not ilike 'demo customer%'
        and coalesce(so.note, '') not ilike '%demo service order%'
        and (p_date is null or (coalesce(so.completed_at, so.created_at) at time zone 'Asia/Manila')::date = p_date)
        and (p_mechanic_id is null or so.assigned_mechanic_id = p_mechanic_id)
        and (p_priority = 'all' or so.priority = p_priority)
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
    ), filtered as materialized (
      select b.* from base b where b.work_stage = 'paused'
    ), ranked as (
      select f.*,
        row_number() over (order by
          case when p_sort = 'oldest' then f.created_at end asc nulls last,
          case when p_sort = 'due' then f.scheduled_end end asc nulls last,
          case when p_sort = 'urgency' then
            case f.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end
          end asc nulls last,
          f.created_at desc, f.id
        ) as ordinal
      from filtered f
    ), page_rows as (
      select r.*
      from ranked r
      order by r.ordinal
      limit v_page_size offset (v_page - 1) * v_page_size
    )
    select jsonb_build_object(
      'orders', coalesce((
        select jsonb_agg(public.limen_service_order_json(pr.id) order by pr.ordinal)
        from page_rows pr
      ), '[]'::jsonb),
      'total', (select count(*) from filtered),
      'page', v_page,
      'pageSize', v_page_size,
      'summary', jsonb_build_object(
        'paused', (select count(*) from base where work_stage = 'paused'),
        'active', (select count(*) from base where status in ('pending', 'in_progress')),
        'pending', (select count(*) from base where status = 'pending'),
        'inProgress', (select count(*) from base where status = 'in_progress' and work_stage <> 'paused'),
        'overdue', (select count(*) from base where status in ('pending', 'in_progress') and scheduled_end < pg_catalog.now()),
        'awaitingAssignment', (select count(*) from base where status in ('pending', 'in_progress') and assigned_mechanic_id is null),
        'awaitingPayment', (select count(*) from base where work_stage = 'work_completed'),
        'completed', (select count(*) from base where status = 'completed'),
        'cancelled', (select count(*) from base where status = 'cancelled')
      )
    )
  );
end;
$function$;

revoke all on function public.limen_service_order_paused_queue(text, uuid, text, text, integer, integer, date)
  from public, anon, authenticated;
grant execute on function public.limen_service_order_paused_queue(text, uuid, text, text, integer, integer, date)
  to service_role;
