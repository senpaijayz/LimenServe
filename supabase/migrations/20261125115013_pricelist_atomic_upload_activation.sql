-- Create and activate a reviewed upload atomically. If the active list changed
-- after preview or any activation check fails, the whole transaction rolls back.
begin;

create or replace function public.import_and_activate_pricelist_upload(
  p_upload_id uuid,
  p_items jsonb,
  p_version_year integer,
  p_effective_from date,
  p_source_sheet text,
  p_pricing_category text,
  p_file_checksum text,
  p_expected_active_version_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $function$
declare
  v_active_version_id uuid;
  v_created jsonb;
  v_activation jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);

  select id into v_active_version_id
    from catalog.pricelist_versions
   where price_type = 'retail' and is_active
   for update;

  if v_active_version_id is distinct from p_expected_active_version_id then
    raise exception using errcode = '40001',
      message = 'The active pricelist changed while you were reviewing this upload. Compare it again before updating.';
  end if;

  v_created := public.create_pricelist_version_from_upload(
    p_upload_id, p_items, p_version_year, p_effective_from,
    p_source_sheet, p_pricing_category, p_file_checksum, p_actor_id
  );

  v_activation := public.activate_pricelist_version_audited(
    (v_created ->> 'versionId')::uuid, p_actor_id
  );

  return v_created || v_activation || pg_catalog.jsonb_build_object(
    'status', 'published', 'isActive', true, 'activationPending', false
  );
end;
$function$;

revoke all on function public.import_and_activate_pricelist_upload(uuid, jsonb, integer, date, text, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.import_and_activate_pricelist_upload(uuid, jsonb, integer, date, text, text, text, uuid, uuid)
  to service_role;

commit;

notify pgrst, 'reload schema';
