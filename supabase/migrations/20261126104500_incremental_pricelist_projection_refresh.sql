-- Keep the compatibility catalog in sync with the active snapshot without
-- deleting and recreating every indexed row on each large pricelist update.
-- Historical revisions remain in pricelist_version_items; this table is only
-- the current compatibility projection used by existing catalog workflows.
begin;

create or replace function catalog.refresh_pricelist_import_staging_snapshot(
  p_version_id uuid,
  p_version_year integer,
  p_source_filename text,
  p_imported_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, catalog
as $function$
begin
  create temporary table _pricelist_staging_snapshot on commit drop as
  select
    coalesce(item.source_sheet, nullif(pg_catalog.btrim(p_source_filename), ''), 'Uploaded pricelist') as source_sheet,
    item.source_line_number,
    item.sku,
    item.name,
    item.model_name,
    item.uom,
    item.pcc,
    item.price,
    item.status,
    item.category,
    item.source_category,
    item.classification_version,
    item.classification_confidence,
    item.classification_strategy,
    item.classification_rule_key,
    item.classification_tokens,
    p_imported_at as imported_at,
    p_version_id as pricelist_version_id,
    p_version_year as version_year
  from catalog.pricelist_version_items item
  where item.pricelist_version_id = p_version_id;

  create unique index _pricelist_staging_snapshot_sku_idx
    on pg_temp._pricelist_staging_snapshot (sku);
  create unique index _pricelist_staging_snapshot_source_idx
    on pg_temp._pricelist_staging_snapshot (source_sheet, source_line_number);
  analyze pg_temp._pricelist_staging_snapshot;

  -- Remove only rows omitted from the newly activated snapshot. The previous
  -- implementation cleared this same current-state projection in full.
  delete from catalog.pricelist_import_staging staging
  where not exists (
    select 1 from pg_temp._pricelist_staging_snapshot snapshot
    where snapshot.sku = staging.sku
  );

  -- Free changed source-line keys before updating so the existing unique
  -- (source_sheet, source_line_number) constraint remains valid during swaps.
  delete from catalog.pricelist_import_staging staging
  using pg_temp._pricelist_staging_snapshot snapshot
  where staging.sku = snapshot.sku
    and row(staging.source_sheet, staging.source_line_number)
      is distinct from row(snapshot.source_sheet, snapshot.source_line_number);

  -- Keep search-indexed columns out of price-only updates. This avoids GIN and
  -- category/name index maintenance when a part's text did not change.
  update catalog.pricelist_import_staging staging
  set name = snapshot.name,
      model_name = snapshot.model_name,
      uom = snapshot.uom,
      pcc = snapshot.pcc,
      price = snapshot.price,
      status = snapshot.status,
      category = snapshot.category,
      source_category = snapshot.source_category,
      classification_version = snapshot.classification_version,
      classification_confidence = snapshot.classification_confidence,
      classification_strategy = snapshot.classification_strategy,
      classification_rule_key = snapshot.classification_rule_key,
      classification_tokens = snapshot.classification_tokens
  from pg_temp._pricelist_staging_snapshot snapshot
  where staging.sku = snapshot.sku
    and row(staging.name, staging.model_name, staging.category, staging.source_category)
      is distinct from row(snapshot.name, snapshot.model_name, snapshot.category, snapshot.source_category);

  -- Price and classification changes are common during imports and do not
  -- need to rewrite indexed text columns when those columns are unchanged.
  update catalog.pricelist_import_staging staging
  set uom = snapshot.uom,
      pcc = snapshot.pcc,
      price = snapshot.price,
      status = snapshot.status,
      classification_version = snapshot.classification_version,
      classification_confidence = snapshot.classification_confidence,
      classification_strategy = snapshot.classification_strategy,
      classification_rule_key = snapshot.classification_rule_key,
      classification_tokens = snapshot.classification_tokens
  from pg_temp._pricelist_staging_snapshot snapshot
  where staging.sku = snapshot.sku
    and row(staging.name, staging.model_name, staging.category, staging.source_category)
      is not distinct from row(snapshot.name, snapshot.model_name, snapshot.category, snapshot.source_category)
    and row(staging.uom, staging.pcc, staging.price, staging.status,
      staging.classification_version, staging.classification_confidence,
      staging.classification_strategy, staging.classification_rule_key,
      staging.classification_tokens)
      is distinct from row(snapshot.uom, snapshot.pcc, snapshot.price, snapshot.status,
      snapshot.classification_version, snapshot.classification_confidence,
      snapshot.classification_strategy, snapshot.classification_rule_key,
      snapshot.classification_tokens);

  -- Version metadata is intentionally advanced for every retained SKU so
  -- readers scoped to the active version see the same rows as before.
  update catalog.pricelist_import_staging staging
  set imported_at = snapshot.imported_at,
      pricelist_version_id = snapshot.pricelist_version_id,
      version_year = snapshot.version_year
  from pg_temp._pricelist_staging_snapshot snapshot
  where staging.sku = snapshot.sku
    and (staging.imported_at is distinct from snapshot.imported_at
      or staging.pricelist_version_id is distinct from snapshot.pricelist_version_id
      or staging.version_year is distinct from snapshot.version_year);

  insert into catalog.pricelist_import_staging (
    source_sheet, source_line_number, sku, name, model_name, uom, pcc, price,
    status, category, source_category, classification_version,
    classification_confidence, classification_strategy, classification_rule_key,
    classification_tokens, imported_at, pricelist_version_id, version_year
  )
  select snapshot.source_sheet, snapshot.source_line_number, snapshot.sku, snapshot.name,
    snapshot.model_name, snapshot.uom, snapshot.pcc, snapshot.price, snapshot.status,
    snapshot.category, snapshot.source_category, snapshot.classification_version,
    snapshot.classification_confidence, snapshot.classification_strategy,
    snapshot.classification_rule_key, snapshot.classification_tokens,
    snapshot.imported_at, snapshot.pricelist_version_id, snapshot.version_year
  from pg_temp._pricelist_staging_snapshot snapshot
  where not exists (
    select 1 from catalog.pricelist_import_staging staging
    where staging.sku = snapshot.sku
  );
end;
$function$;

revoke all on function catalog.refresh_pricelist_import_staging_snapshot(uuid, integer, text, timestamptz)
  from public, anon, authenticated;

do $migration$
declare
  original text;
  revised text;
  refresh_start integer;
  return_start integer;
begin
  original := pg_get_functiondef('public.activate_retail_pricelist_version(uuid,uuid)'::regprocedure);
  refresh_start := strpos(original, '  delete from catalog.pricelist_import_staging where id is not null;');
  if refresh_start > 0 then
    return_start := strpos(substring(original from refresh_start), '  return pg_catalog.jsonb_build_object(') + refresh_start - 1;
  end if;

  if refresh_start = 0 or return_start <= refresh_start then
    raise exception 'Unexpected active-pricelist projection refresh; migration stopped without changing the function';
  end if;

  revised := left(original, refresh_start - 1)
    || '  perform catalog.refresh_pricelist_import_staging_snapshot(p_version_id, v_version.version_year, v_version.source_filename, v_now);' || E'\n\n'
    || substring(original from return_start);
  execute revised;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
