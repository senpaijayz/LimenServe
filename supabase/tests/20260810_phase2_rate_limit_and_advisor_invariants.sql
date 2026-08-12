-- Phase 2 shared rate-limit and focused advisor regression tests.

do $$
declare
  v_function_oid regprocedure;
  v_function_definition text;
  v_public_execute boolean;
  v_public_table_privilege boolean;
  v_identity_hash text;
  v_scope text;
  v_first jsonb;
  v_second jsonb;
  v_third jsonb;
  v_primary_key_columns text[];
  v_customer_policy_count integer;
begin
  v_function_oid := pg_catalog.to_regprocedure(
    'public.consume_public_rate_limit(text,text,integer,integer)'
  );

  if v_function_oid is null then
    raise exception 'Shared rate-limit RPC is missing';
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
    raise exception 'Shared rate-limit RPC grants are not service-role only';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_class table_row
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        table_row.relacl,
        pg_catalog.acldefault('r', table_row.relowner)
      )
    ) expanded_acl
    where table_row.oid = 'private.api_rate_limit_buckets'::pg_catalog.regclass
      and expanded_acl.grantee = 0
      and expanded_acl.privilege_type in (
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      )
  )
  into v_public_table_privilege;

  if v_public_table_privilege
    or has_table_privilege('anon', 'private.api_rate_limit_buckets', 'select')
    or has_table_privilege('authenticated', 'private.api_rate_limit_buckets', 'select')
    or has_table_privilege('service_role', 'private.api_rate_limit_buckets', 'select')
    or has_table_privilege('service_role', 'private.api_rate_limit_buckets', 'insert')
    or has_table_privilege('service_role', 'private.api_rate_limit_buckets', 'update')
    or has_table_privilege('service_role', 'private.api_rate_limit_buckets', 'delete') then
    raise exception 'Rate-limit bucket table has a direct application-role grant';
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
    or v_function_definition not like '%ON CONFLICT (scope, identity_hash, window_started_at)%'
    or v_function_definition not like '%request_count = private.api_rate_limit_buckets.request_count + 1%' then
    raise exception 'Shared rate-limit RPC lost its security or atomic-increment invariant';
  end if;

  v_identity_hash := pg_catalog.md5(
    pg_catalog.clock_timestamp()::text || pg_catalog.random()::text
  ) || pg_catalog.md5(
    pg_catalog.random()::text || pg_catalog.clock_timestamp()::text
  );
  v_scope := 'phase2_test_' || pg_catalog.txid_current()::text;

  v_first := public.consume_public_rate_limit(v_scope, v_identity_hash, 60, 2);
  v_second := public.consume_public_rate_limit(v_scope, v_identity_hash, 60, 2);
  v_third := public.consume_public_rate_limit(v_scope, v_identity_hash, 60, 2);

  if not (v_first->>'allowed')::boolean
    or (v_first->>'remaining')::integer <> 1
    or (v_first->>'reset_seconds')::integer < 1
    or not (v_second->>'allowed')::boolean
    or (v_second->>'remaining')::integer <> 0
    or (v_third->>'allowed')::boolean
    or (v_third->>'request_count')::integer <> 3 then
    raise exception 'Shared rate-limit flow did not enforce the configured fixed window';
  end if;

  delete from private.api_rate_limit_buckets
  where scope = v_scope and identity_hash = v_identity_hash;

  if pg_catalog.to_regclass('public.pricelist') is not null then
    select array_agg(attribute_row.attname order by key_column.ordinality)
    into v_primary_key_columns
    from pg_catalog.pg_constraint constraint_row
    cross join lateral unnest(constraint_row.conkey)
      with ordinality as key_column(attnum, ordinality)
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = key_column.attnum
    where constraint_row.conrelid = 'public.pricelist'::pg_catalog.regclass
      and constraint_row.contype = 'p';

    if v_primary_key_columns is distinct from array['sku']::text[] then
      raise exception 'public.pricelist primary key is not exactly (sku)';
    end if;
  end if;

  if pg_catalog.to_regclass('catalog.admin_notifications') is not null then
    if not exists (
      select 1
      from pg_catalog.pg_policies policy_row
      where policy_row.schemaname = 'catalog'
        and policy_row.tablename = 'admin_notifications'
        and policy_row.policyname = 'service_role_admin_notifications_all'
        and policy_row.roles = array['service_role']::name[]
        and policy_row.qual = 'true'
        and policy_row.with_check = 'true'
    ) then
      raise exception 'Admin notification policy was not narrowed to service_role';
    end if;
  end if;

  if pg_catalog.to_regclass('operations.customers') is not null then
    select count(*)
    into v_customer_policy_count
    from pg_catalog.pg_policies policy_row
    where policy_row.schemaname = 'operations'
      and policy_row.tablename = 'customers'
      and policy_row.policyname in (
        'customers_select',
        'customers_internal_insert',
        'customers_internal_update',
        'customers_internal_delete'
      );

    if v_customer_policy_count <> 4
      or exists (
        select 1
        from pg_catalog.pg_policies policy_row
        where policy_row.schemaname = 'operations'
          and policy_row.tablename = 'customers'
          and policy_row.policyname in (
            'customers_internal_all',
            'customers_self_select'
          )
      ) then
      raise exception 'Customer RLS policies were not consolidated as expected';
    end if;
  end if;
end;
$$;
