-- Phase 2 normalized-stockroom convergence invariants.
-- Run after the Phase 2 migrations against a disposable database only.

do $$
declare
  v_signature text;
  v_function_oid oid;
  v_function_definition text;
  v_public_execute boolean;
  v_constraint text;
  v_trigger_count integer;
  v_policy_count integer;
begin
  foreach v_constraint in array array[
    'layouts_parent_layout_id_fkey',
    'layouts_updated_by_fkey',
    'zones_floor_layout_fkey',
    'aisles_zone_layout_floor_fkey',
    'shelves_aisle_layout_floor_zone_fkey',
    'item_locations_layout_store_fkey',
    'item_locations_floor_layout_fkey',
    'item_locations_zone_layout_floor_fkey',
    'item_locations_aisle_layout_floor_zone_fkey',
    'item_locations_shelf_hierarchy_fkey',
    'item_locations_level_shelf_fkey',
    'item_locations_slot_level_fkey'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conname = v_constraint
        and constraint_row.convalidated
    ) then
      raise exception 'Validated normalized-stockroom constraint is missing: %', v_constraint;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute_row
    where attribute_row.attrelid = 'stockroom.item_locations'::pg_catalog.regclass
      and attribute_row.attname = 'store_id'
      and attribute_row.attnotnull
      and not attribute_row.attisdropped
  ) then
    raise exception 'stockroom.item_locations.store_id must be non-null';
  end if;

  if pg_catalog.to_regclass('public.store_layouts') is null
    or pg_catalog.to_regclass('public.product_locations') is null
    or pg_catalog.to_regclass('stockroom.legacy_layout_crosswalk') is null
    or pg_catalog.to_regclass('stockroom.legacy_location_crosswalk') is null
    or pg_catalog.to_regclass('stockroom.layout_audit_history') is null then
    raise exception 'Legacy preservation or normalized audit tables are missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies policy_row
    where policy_row.schemaname = 'stockroom'
      and policy_row.tablename in (
        'layout_audit_history',
        'legacy_layout_archives',
        'legacy_location_archives',
        'legacy_layout_crosswalk',
        'legacy_location_crosswalk'
      )
  ) then
    raise exception 'Backend-only Phase 2 archive/audit tables must not have browser RLS policies';
  end if;

  if has_table_privilege('anon', 'stockroom.layout_audit_history', 'select')
    or has_table_privilege('authenticated', 'stockroom.layout_audit_history', 'select')
    or not has_table_privilege('service_role', 'stockroom.layout_audit_history', 'select')
    or has_table_privilege('service_role', 'stockroom.layout_audit_history', 'insert')
    or has_table_privilege('service_role', 'stockroom.layout_audit_history', 'update')
    or has_table_privilege('service_role', 'stockroom.layout_audit_history', 'delete') then
    raise exception 'Layout audit history grants are not read-only service-role access';
  end if;

  foreach v_signature in array array[
    'public.limen_stockroom_create_layout_draft(uuid,bigint,text,uuid,text)',
    'public.limen_stockroom_update_layout_draft(uuid,bigint,jsonb,uuid,text)',
    'public.limen_stockroom_publish_layout(uuid,bigint,uuid,text)'
  ] loop
    v_function_oid := pg_catalog.to_regprocedure(v_signature);

    if v_function_oid is null then
      raise exception 'Stockroom lifecycle RPC is missing: %', v_signature;
    end if;

    select exists (
      select 1
      from pg_catalog.pg_proc function_row
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )
      ) expanded_acl
      where function_row.oid = v_function_oid
        and expanded_acl.grantee = 0
        and expanded_acl.privilege_type = 'EXECUTE'
    )
    into v_public_execute;

    if v_public_execute
      or has_function_privilege('anon', v_function_oid, 'execute')
      or has_function_privilege('authenticated', v_function_oid, 'execute')
      or not has_function_privilege('service_role', v_function_oid, 'execute') then
      raise exception 'Stockroom lifecycle RPC grants are not service-role only: %', v_signature;
    end if;

    select pg_catalog.pg_get_functiondef(v_function_oid)
    into v_function_definition;

    if v_function_definition not like '%SECURITY DEFINER%'
      or not exists (
        select 1
        from pg_catalog.pg_proc function_row
        where function_row.oid = v_function_oid
          and 'search_path=""' = any(function_row.proconfig)
      )
      or v_function_definition not like '%Layout revision conflict.%'
      or v_function_definition not like '%pg_advisory_xact_lock%' then
      raise exception 'Stockroom lifecycle RPC lost a concurrency or security invariant: %', v_signature;
    end if;
  end loop;

  select count(*)
  into v_trigger_count
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = 'stockroom.layouts'::pg_catalog.regclass
    and not trigger_row.tgisinternal
    and trigger_row.tgname in (
      'enforce_layout_revision',
      'audit_layout_revision',
      'prevent_layout_delete'
    );

  if v_trigger_count <> 3 then
    raise exception 'Normalized layouts are missing revision/audit/delete-protection triggers';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'stockroom.layout_audit_history'::pg_catalog.regclass
      and trigger_row.tgname = 'prevent_layout_history_update'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Stockroom layout audit history is mutable';
  end if;

  if pg_catalog.to_regclass('public.stockroom_layout_compat_v1') is null
    or pg_catalog.to_regclass('public.stockroom_product_location_compat_v1') is null
    or pg_catalog.to_regclass('public.stockroom_location_migration_report_v1') is null then
    raise exception 'Versioned stockroom compatibility views are missing';
  end if;

  if has_table_privilege('anon', 'public.stockroom_layout_compat_v1', 'select')
    or has_table_privilege('authenticated', 'public.stockroom_layout_compat_v1', 'select')
    or not has_table_privilege('service_role', 'public.stockroom_layout_compat_v1', 'select')
    or has_table_privilege('anon', 'public.stockroom_product_location_compat_v1', 'select')
    or has_table_privilege('authenticated', 'public.stockroom_product_location_compat_v1', 'select')
    or not has_table_privilege('service_role', 'public.stockroom_product_location_compat_v1', 'select') then
    raise exception 'Compatibility views must remain service-role-only';
  end if;

  select count(*)
  into v_policy_count
  from pg_catalog.pg_policies policy_row
  where policy_row.schemaname = 'stockroom'
    and policy_row.policyname like '%_stockroom_manage';

  if v_policy_count <> 0 then
    raise exception 'Legacy overlapping stockroom management policies remain';
  end if;
end;
$$;
