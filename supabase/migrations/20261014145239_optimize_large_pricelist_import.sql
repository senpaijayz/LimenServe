-- Large admin uploads need indexed/statistically described working sets.
-- Keep the ordinary API's 8-second limit unchanged; exempt only these RPCs.
do $migration$
declare original text; revised text;
begin
  original := pg_get_functiondef('public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)'::regprocedure);
  revised := replace(original,
    '  select count(*) into v_unique_count from _retail_pricelist_version_items;',
    '  create unique index on _retail_pricelist_version_items(sku);' || E'\n' ||
    '  analyze _retail_pricelist_version_items;' || E'\n' ||
    '  select count(*) into v_unique_count from _retail_pricelist_version_items;');
  revised := replace(revised,
    '  if p_activate and v_previous_version_id is not null',
    '  analyze _retail_pricelist_previous_prices;' || E'\n' ||
    '  if p_activate and v_previous_version_id is not null');
  if revised = original or position('analyze _retail_pricelist_version_items' in revised)=0 then
    raise exception 'Unexpected pricelist working-set definition; migration stopped safely';
  end if;
  execute revised;
end;
$migration$;
alter function public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)
  set statement_timeout = '60s';
alter function public.activate_retail_pricelist_version(uuid,uuid)
  set statement_timeout = '60s';
notify pgrst, 'reload schema';
