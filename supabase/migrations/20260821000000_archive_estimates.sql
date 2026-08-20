-- Keep sent, approved, and converted quotations for history while removing
-- them from the active staff list. Drafts continue to use delete_draft_estimate.

do $archive_columns$
begin
  if to_regclass('operations.estimates') is not null then
    alter table operations.estimates
      add column if not exists archived_at timestamptz;
    create index if not exists operations_estimates_archived_at_idx
      on operations.estimates (archived_at)
      where archived_at is null;
  elsif to_regclass('app.estimates') is not null then
    alter table app.estimates
      add column if not exists archived_at timestamptz;
    create index if not exists app_estimates_archived_at_idx
      on app.estimates (archived_at)
      where archived_at is null;
  end if;
end;
$archive_columns$;

create or replace function public.archive_estimate(p_estimate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_schema text;
  v_status text;
  v_archived_at timestamptz;
begin
  if p_estimate_id is null then
    return jsonb_build_object('archived', false, 'reason', 'invalid_id');
  end if;

  v_schema := case
    when to_regclass('operations.estimates') is not null then 'operations'
    when to_regclass('app.estimates') is not null then 'app'
    else null
  end;

  if v_schema is null then
    raise exception using
      errcode = '42P01',
      message = 'ESTIMATE_SCHEMA_INCOMPLETE: estimate schema is unavailable';
  end if;

  execute format(
    'select status, archived_at from %I.estimates where id = $1 for update',
    v_schema
  ) into v_status, v_archived_at using p_estimate_id;

  if v_status is null then
    return jsonb_build_object('archived', false, 'reason', 'not_found');
  end if;

  if lower(coalesce(v_status, '')) = 'draft' then
    return jsonb_build_object('archived', false, 'reason', 'draft_only_delete');
  end if;

  if v_archived_at is not null then
    return jsonb_build_object('archived', true, 'reason', 'already_archived');
  end if;

  execute format(
    'update %I.estimates set archived_at = timezone(''utc'', now()), updated_at = timezone(''utc'', now()) where id = $1',
    v_schema
  ) using p_estimate_id;

  return jsonb_build_object('archived', true, 'reason', 'archived');
end;
$$;

revoke all on function public.archive_estimate(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.archive_estimate(uuid) to service_role;

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
    where e.archived_at is null
      and (e.valid_until is null or e.valid_until >= current_date)
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
