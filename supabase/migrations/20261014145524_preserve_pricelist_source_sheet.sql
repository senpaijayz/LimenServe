-- The legacy staging table requires source_sheet. Retain uploaded provenance
-- instead of weakening that constraint or allowing an activation to fail.
do $migration$
declare original text; revised text;
begin
  original := pg_get_functiondef('public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)'::regprocedure);
  revised := replace(original,
    'v_version_id, product.id, null, item.source_line_number, item.sku, item.name,',
    'v_version_id, product.id, coalesce(nullif(btrim(p_source_filename), ''''), ''Uploaded pricelist''), item.source_line_number, item.sku, item.name,');
  revised := replace(revised,
    'select item.source_sheet, item.source_line_number, item.sku, item.name,',
    'select coalesce(item.source_sheet, nullif(btrim(p_source_filename), ''''), ''Uploaded pricelist''), item.source_line_number, item.sku, item.name,');
  if revised = original or position('v_version_id, product.id, null, item.source_line_number' in revised)>0 then
    raise exception 'Unexpected import source projection; migration stopped safely';
  end if;
  execute revised;
  original := pg_get_functiondef('public.activate_retail_pricelist_version(uuid,uuid)'::regprocedure);
  revised := replace(original,
    'select item.source_sheet, item.source_line_number, item.sku, item.name,',
    'select coalesce(item.source_sheet, nullif(btrim(v_version.source_filename), ''''), ''Uploaded pricelist''), item.source_line_number, item.sku, item.name,');
  if revised = original then raise exception 'Unexpected activation source projection; migration stopped safely'; end if;
  execute revised;
end;
$migration$;
notify pgrst, 'reload schema';
