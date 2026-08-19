-- Keep expired quotations out of the staff saved-quotation list. Production
-- stores estimates in operations (the historical app function is absent), so
-- replace the public service-role list wrapper with the live schema directly.

create or replace function public.list_estimates(
  p_search text default null,
  p_limit_count integer default 20
)
returns table (
  id uuid,
  estimate_number text,
  customer_name text,
  customer_phone text,
  vehicle_model_name text,
  status text,
  grand_total numeric,
  valid_until date,
  revision_count bigint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, operations
as $$
  select
    e.id,
    e.estimate_number,
    c.name as customer_name,
    c.phone as customer_phone,
    v.model_name as vehicle_model_name,
    e.status,
    e.grand_total,
    e.valid_until,
    coalesce(rev.revision_count, 0) as revision_count,
    e.updated_at
  from operations.estimates e
  left join operations.customers c on c.id = e.customer_id
  left join operations.vehicles v on v.id = e.vehicle_id
  left join (
    select estimate_id, count(*) as revision_count
    from operations.estimate_revisions
    group by estimate_id
  ) rev on rev.estimate_id = e.id
  where (e.valid_until is null or e.valid_until >= current_date)
    and (
      p_search is null
      or p_search = ''
      or e.estimate_number ilike '%' || p_search || '%'
      or coalesce(c.name, '') ilike '%' || p_search || '%'
      or coalesce(c.phone, '') ilike '%' || p_search || '%'
      or coalesce(v.model_name, '') ilike '%' || p_search || '%'
    )
  order by e.updated_at desc
  limit greatest(coalesce(p_limit_count, 20), 1);
$$;
