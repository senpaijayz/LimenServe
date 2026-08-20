-- Allow authenticated staff (through the backend service role) to remove
-- quotations only while they are still drafts. Converted/sent/approved quotes
-- are immutable through this operation.

create or replace function public.delete_draft_estimate(p_estimate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
begin
  if p_estimate_id is null then
    return jsonb_build_object('deleted', false, 'reason', 'invalid_id');
  end if;

  -- Production uses operations.estimates; the app branch keeps compatibility
  -- with the historical schema without requiring either schema at parse time.
  if to_regclass('operations.estimates') is not null then
    execute 'select status from operations.estimates where id = $1 for update'
      into v_status
      using p_estimate_id;

    if v_status is null then
      return jsonb_build_object('deleted', false, 'reason', 'not_found');
    end if;
    if lower(v_status) <> 'draft' then
      return jsonb_build_object('deleted', false, 'reason', 'not_draft');
    end if;

    delete from operations.estimates
    where id = p_estimate_id and lower(status) = 'draft';
  elsif to_regclass('app.estimates') is not null then
    execute 'select status from app.estimates where id = $1 for update'
      into v_status
      using p_estimate_id;

    if v_status is null then
      return jsonb_build_object('deleted', false, 'reason', 'not_found');
    end if;
    if lower(v_status) <> 'draft' then
      return jsonb_build_object('deleted', false, 'reason', 'not_draft');
    end if;

    delete from app.estimates
    where id = p_estimate_id and lower(status) = 'draft';
  else
    raise exception using
      errcode = '42P01',
      message = 'ESTIMATE_SCHEMA_INCOMPLETE: estimate schema is unavailable';
  end if;

  return jsonb_build_object('deleted', true, 'reason', 'deleted');
end;
$$;

revoke all on function public.delete_draft_estimate(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_draft_estimate(uuid) to service_role;

