-- Read-only schema and privilege assertions for
-- 20260806184500_phase1_secure_lookup_and_stock_receiving.sql.

begin;

do $$
declare
  v_lookup_oid oid := to_regprocedure('public.lookup_public_estimate(text,text)');
  v_manual_oid oid := to_regprocedure('public.receive_catalog_stock(jsonb,uuid,text)');
  v_invoice_oid oid := to_regprocedure('public.receive_supplier_invoice_stock_idempotent(jsonb,uuid,text,boolean)');
  v_product_lock_key_oid oid := to_regprocedure('private.catalog_stock_receipt_product_lock_key(text)');
  v_signature text;
  v_function_oid oid;
  v_public_execute boolean;
  v_product_lock_key_definition text;
  v_manual_definition text;
  v_invoice_definition text;
  v_is_security_definer boolean;
  v_rls_enabled boolean;
  v_policy_count integer;
begin
  if v_lookup_oid is null or v_manual_oid is null or v_invoice_oid is null
    or v_product_lock_key_oid is null then
    raise exception 'Phase 1 public RPCs are missing.';
  end if;

  if has_function_privilege('anon', v_product_lock_key_oid, 'execute')
    or has_function_privilege('authenticated', v_product_lock_key_oid, 'execute')
    or has_function_privilege('service_role', v_product_lock_key_oid, 'execute') then
    raise exception 'Private stock-receipt lock-key helper is directly executable by an API role.';
  end if;

  foreach v_signature in array array[
    'public.create_estimate(jsonb)',
    'public.list_estimates(text,integer)',
    'public.get_estimate_detail(uuid)',
    'public.get_estimate_revisions(uuid)',
    'public.revise_estimate(uuid,jsonb,uuid,text)',
    'public.lookup_public_estimate(text,text)',
    'public.convert_estimate_to_sale(uuid,text)',
    'public.convert_estimate_to_service_order(uuid,uuid)'
  ] loop
    v_function_oid := to_regprocedure(v_signature);

    if v_function_oid is null then
      raise exception 'Required estimate RPC is missing: %', v_signature;
    end if;

    select exists (
      select 1
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as expanded_acl
      where expanded_acl.grantee = 0
        and expanded_acl.privilege_type = 'EXECUTE'
    )
    into v_public_execute
    from pg_proc p
    where p.oid = v_function_oid;

    if coalesce(v_public_execute, false)
      or has_function_privilege('anon', v_function_oid, 'execute')
      or has_function_privilege('authenticated', v_function_oid, 'execute') then
      raise exception 'Estimate RPC is executable by PUBLIC or a client role: %', v_signature;
    end if;

    if not has_function_privilege('service_role', v_function_oid, 'execute') then
      raise exception 'Service role cannot execute required estimate RPC: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'app.create_estimate_internal(jsonb)',
    'app.create_estimate_with_revision_internal(jsonb,uuid)',
    'app.list_estimates_internal(text,integer)',
    'app.build_estimate_snapshot(uuid)',
    'app.get_estimate_revisions_internal(uuid)',
    'app.ensure_estimate_revision(uuid,uuid,text)',
    'app.revise_estimate_internal(uuid,jsonb,uuid,text)',
    'app.lookup_public_estimate_internal(text,text)',
    'app.convert_estimate_to_sale_internal(uuid,text)',
    'app.convert_estimate_to_service_order_internal(uuid,uuid)'
  ] loop
    v_function_oid := to_regprocedure(v_signature);

    if v_function_oid is not null then
      select exists (
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as expanded_acl
        where expanded_acl.grantee = 0
          and expanded_acl.privilege_type = 'EXECUTE'
      )
      into v_public_execute
      from pg_proc p
      where p.oid = v_function_oid;

      if coalesce(v_public_execute, false)
        or has_function_privilege('anon', v_function_oid, 'execute')
        or has_function_privilege('authenticated', v_function_oid, 'execute') then
        raise exception 'Estimate helper is executable by PUBLIC or a client role: %', v_signature;
      end if;

      if not has_function_privilege('service_role', v_function_oid, 'execute') then
        raise exception 'Service role cannot execute estimate helper: %', v_signature;
      end if;
    end if;
  end loop;

  if has_function_privilege('anon', v_manual_oid, 'execute')
    or has_function_privilege('authenticated', v_manual_oid, 'execute')
    or has_function_privilege('anon', v_invoice_oid, 'execute')
    or has_function_privilege('authenticated', v_invoice_oid, 'execute') then
    raise exception 'Stock receiving RPC is executable by a client role.';
  end if;

  if not has_function_privilege('service_role', v_manual_oid, 'execute')
    or not has_function_privilege('service_role', v_invoice_oid, 'execute') then
    raise exception 'Service role is missing a required Phase 1 RPC grant.';
  end if;

  foreach v_signature in array array[
    'public.receive_supplier_invoice_stock(jsonb,uuid)',
    'public.receive_existing_supplier_invoice_stock(jsonb,uuid)'
  ] loop
    v_function_oid := to_regprocedure(v_signature);

    if v_function_oid is not null and (
      has_function_privilege('anon', v_function_oid, 'execute')
      or has_function_privilege('authenticated', v_function_oid, 'execute')
      or not has_function_privilege('service_role', v_function_oid, 'execute')
    ) then
      raise exception 'Historical invoice wrapper has an unsafe client ACL: %', v_signature;
    end if;
  end loop;

  select bool_and(p.prosecdef)
  into v_is_security_definer
  from pg_proc p
  where p.oid in (v_lookup_oid, v_manual_oid, v_invoice_oid);

  if not coalesce(v_is_security_definer, false) then
    raise exception 'Phase 1 RPCs must remain SECURITY DEFINER.';
  end if;

  select lower(pg_get_functiondef(v_product_lock_key_oid))
  into v_product_lock_key_definition;

  select lower(pg_get_functiondef(v_manual_oid))
  into v_manual_definition;

  select lower(pg_get_functiondef(v_invoice_oid))
  into v_invoice_definition;

  if position('limen:catalog:stock-receipt:product:' in v_product_lock_key_definition) = 0
    or position('catalog.normalize_supplier_invoice_part_number' in v_product_lock_key_definition) = 0 then
    raise exception 'Private stock-receipt lock-key helper has drifted from the shared normalized product namespace.';
  end if;

  if position('private.catalog_stock_receipt_product_lock_key' in v_manual_definition) = 0
    or position('pg_advisory_xact_lock' in v_manual_definition) = 0
    or position('for update of product' in v_manual_definition) = 0
    or position('for update of supplier' in v_manual_definition) = 0
    or position('insert into catalog.suppliers' in v_manual_definition) = 0
    or position('insert into catalog.inventory_balances' in v_manual_definition) = 0
    or position('pg_advisory_xact_lock' in v_manual_definition)
      > position('for update of product' in v_manual_definition)
    or position('for update of product' in v_manual_definition)
      > position('for update of supplier' in v_manual_definition)
    or position('for update of product' in v_manual_definition)
      > position('insert into catalog.suppliers' in v_manual_definition)
    or position('for update of supplier' in v_manual_definition)
      > position('insert into catalog.inventory_balances' in v_manual_definition)
    or position('insert into catalog.suppliers' in v_manual_definition)
      > position('insert into catalog.inventory_balances' in v_manual_definition) then
    raise exception 'Manual stock RPC is missing the shared advisory -> product -> supplier -> balance lock order.';
  end if;

  if position('array_agg(distinct normalized.part_number order by normalized.part_number)' in v_invoice_definition) = 0
    or position('array_agg(keys.lock_key order by keys.lock_key)' in v_invoice_definition) = 0
    or position('private.catalog_stock_receipt_product_lock_key' in v_invoice_definition) = 0
    or position('pg_advisory_xact_lock' in v_invoice_definition) = 0
    or position('for update of supplier' in v_invoice_definition) = 0
    or position('insert into catalog.suppliers' in v_invoice_definition) = 0
    or position('order by product.id' in v_invoice_definition) = 0
    or position('order by balance.product_id' in v_invoice_definition) = 0
    or position('on conflict (product_id) do nothing' in v_invoice_definition) = 0
    or position('pg_advisory_xact_lock' in v_invoice_definition)
      > position('perform product.id' in v_invoice_definition)
    or position('perform product.id' in v_invoice_definition)
      > position('insert into catalog.suppliers' in v_invoice_definition)
    or position('perform product.id' in v_invoice_definition)
      > position('for update of supplier' in v_invoice_definition)
    or position('insert into catalog.suppliers' in v_invoice_definition)
      > position('insert into catalog.inventory_balances' in v_invoice_definition)
    or position('for update of supplier' in v_invoice_definition)
      > position('insert into catalog.inventory_balances' in v_invoice_definition) then
    raise exception 'Supplier invoice RPC is missing the shared advisory -> product -> supplier -> balance lock order or absent-balance handling.';
  end if;

  if to_regclass('catalog.stock_receipt_idempotency') is null then
    raise exception 'Private stock receipt idempotency ledger is missing.';
  end if;

  select c.relrowsecurity
  into v_rls_enabled
  from pg_class c
  where c.oid = 'catalog.stock_receipt_idempotency'::regclass;

  if not coalesce(v_rls_enabled, false) then
    raise exception 'RLS is not enabled on catalog.stock_receipt_idempotency.';
  end if;

  select count(*)
  into v_policy_count
  from pg_policy
  where polrelid = 'catalog.stock_receipt_idempotency'::regclass;

  if v_policy_count <> 0 then
    raise exception 'Idempotency ledger unexpectedly has direct-access RLS policies.';
  end if;

  if has_table_privilege('anon', 'catalog.stock_receipt_idempotency', 'select')
    or has_table_privilege('anon', 'catalog.stock_receipt_idempotency', 'insert')
    or has_table_privilege('anon', 'catalog.stock_receipt_idempotency', 'update')
    or has_table_privilege('anon', 'catalog.stock_receipt_idempotency', 'delete')
    or has_table_privilege('authenticated', 'catalog.stock_receipt_idempotency', 'select')
    or has_table_privilege('authenticated', 'catalog.stock_receipt_idempotency', 'insert')
    or has_table_privilege('authenticated', 'catalog.stock_receipt_idempotency', 'update')
    or has_table_privilege('authenticated', 'catalog.stock_receipt_idempotency', 'delete')
    or has_table_privilege('service_role', 'catalog.stock_receipt_idempotency', 'select')
    or has_table_privilege('service_role', 'catalog.stock_receipt_idempotency', 'insert')
    or has_table_privilege('service_role', 'catalog.stock_receipt_idempotency', 'update')
    or has_table_privilege('service_role', 'catalog.stock_receipt_idempotency', 'delete')
    or has_table_privilege('service_role', 'catalog.stock_receipt_idempotency', 'truncate') then
    raise exception 'Idempotency ledger has a direct table grant.';
  end if;
end;
$$;

rollback;
