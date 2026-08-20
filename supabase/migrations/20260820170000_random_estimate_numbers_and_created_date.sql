-- Give newly-created quotations a short, non-sequential EST identifier and
-- expose the creation timestamp to the staff quotation list.  This migration
-- is deliberately additive: existing quotation numbers and rows are kept.

create or replace function app.assign_random_estimate_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_relation text;
  v_number text;
  v_exists boolean;
begin
  -- The deployed database stores estimates in operations; clean installs use
  -- the historical app schema.  The trigger is only attached to a relation
  -- that exists, but this keeps the function safe across both layouts.
  v_relation := case
    when to_regclass('operations.estimates') is not null then 'operations.estimates'
    when to_regclass('app.estimates') is not null then 'app.estimates'
    else null
  end;

  -- Preserve non-EST document numbers supplied by trusted internal flows.
  if v_relation is null
     or (new.estimate_number is not null
         and btrim(new.estimate_number) <> ''
         and upper(new.estimate_number) not like 'EST-%') then
    return new;
  end if;

  loop
    v_number := 'EST-' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    execute format('select exists (select 1 from %s where estimate_number = $1)', v_relation)
      into v_exists
      using v_number;
    exit when not v_exists;
  end loop;

  new.estimate_number := v_number;
  return new;
end;
$$;

do $$
begin
  if to_regclass('operations.estimates') is not null then
    drop trigger if exists trg_estimates_random_number on operations.estimates;
    create trigger trg_estimates_random_number
      before insert on operations.estimates
      for each row execute function app.assign_random_estimate_number();
  elsif to_regclass('app.estimates') is not null then
    drop trigger if exists trg_estimates_random_number on app.estimates;
    create trigger trg_estimates_random_number
      before insert on app.estimates
      for each row execute function app.assign_random_estimate_number();
  end if;
end;
$$;

-- The old return shape included an internal revision aggregate that the UI no
-- longer uses.  Drop/recreate is required because PostgreSQL cannot change a
-- function's RETURNS TABLE columns with CREATE OR REPLACE.
drop function if exists public.list_estimates(text, integer);

create function public.list_estimates(
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
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_schema text;
begin
  v_schema := case
    when to_regclass('operations.estimates') is not null then 'operations'
    when to_regclass('app.estimates') is not null then 'app'
    else null
  end;

  if v_schema is null then
    return;
  end if;

  return query execute format($query$
    select
      e.id,
      e.estimate_number,
      c.name as customer_name,
      c.phone as customer_phone,
      v.model_name as vehicle_model_name,
      e.status,
      e.grand_total,
      e.valid_until,
      e.created_at,
      e.updated_at
    from %I.estimates e
    left join %I.customers c on c.id = e.customer_id
    left join %I.vehicles v on v.id = e.vehicle_id
    where (e.valid_until is null or e.valid_until >= current_date)
      and (
        $1 is null
        or $1 = ''
        or e.estimate_number ilike '%%' || $1 || '%%'
        or coalesce(c.name, '') ilike '%%' || $1 || '%%'
        or coalesce(c.phone, '') ilike '%%' || $1 || '%%'
        or coalesce(v.model_name, '') ilike '%%' || $1 || '%%'
      )
    order by e.updated_at desc
    limit greatest(coalesce($2, 20), 1)
  $query$, v_schema, v_schema, v_schema)
  using p_search, p_limit_count;
end;
$$;

revoke all on function public.list_estimates(text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_estimates(text, integer) to service_role;
