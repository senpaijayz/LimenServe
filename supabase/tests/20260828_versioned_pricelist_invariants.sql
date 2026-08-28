-- Schema-only assertions for the versioned retail price-list feature.
-- The test does not insert or update business data, so it is safe to run in a
-- disposable rehearsal database after the migration has been applied.
do $$
declare
  version_fk_count integer;
  item_unique_count integer;
  import_grant_count integer;
  import_definition text;
begin
  if to_regclass('catalog.pricelist_versions') is null then
    raise exception 'catalog.pricelist_versions is missing';
  end if;

  if to_regclass('catalog.pricelist_version_items') is null then
    raise exception 'catalog.pricelist_version_items is missing';
  end if;

  select count(*) into version_fk_count
  from pg_constraint
  where conrelid = 'catalog.pricelist_version_items'::regclass
    and confrelid = 'catalog.pricelist_versions'::regclass
    and contype = 'f';
  if version_fk_count <> 1 then
    raise exception 'Version items must have exactly one foreign key to pricelist_versions';
  end if;

  select count(*) into item_unique_count
  from pg_constraint
  where conrelid = 'catalog.pricelist_version_items'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) like '%(pricelist_version_id, sku)%';
  if item_unique_count <> 1 then
    raise exception 'Version items must be unique per version and SKU';
  end if;

  if to_regprocedure('public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)') is null then
    raise exception 'Version import RPC is missing';
  end if;

  if to_regprocedure('public.activate_retail_pricelist_version(uuid,uuid)') is null then
    raise exception 'Version activation RPC is missing';
  end if;

  select count(*) into import_grant_count
  from information_schema.routine_privileges
  where routine_schema = 'public'
    and routine_name = 'import_retail_pricelist_version'
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';
  if import_grant_count <> 1 then
    raise exception 'Version import RPC must be executable by service_role';
  end if;

  select pg_get_functiondef(to_regprocedure('public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)'))
  into import_definition;

  if position('pg_advisory_xact_lock' in lower(import_definition)) = 0 then
    raise exception 'Version import must serialize concurrent activations';
  end if;

  if position('update catalog.inventory_balances' in lower(import_definition)) > 0 then
    raise exception 'Version import must not overwrite inventory quantities';
  end if;

  if position('insert into catalog.product_prices' in lower(import_definition)) = 0 then
    raise exception 'Version import must update current retail prices when activated';
  end if;

  if position('active price list cannot be replaced as a draft' in lower(import_definition)) = 0 then
    raise exception 'Version import must not mutate the active snapshot through a draft upload';
  end if;
end;
$$;
