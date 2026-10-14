-- Respect the API role's safeupdate protection without disabling it.
-- This staging table is only the current-list projection, not price history.
do $migration$
declare signature regprocedure; original text; revised text;
begin
  foreach signature in array array[
    'public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)'::regprocedure,
    'public.activate_retail_pricelist_version(uuid,uuid)'::regprocedure
  ] loop
    original := pg_get_functiondef(signature);
    revised := replace(original,
      'delete from catalog.pricelist_import_staging;',
      'delete from catalog.pricelist_import_staging where id is not null;');
    if revised = original then
      raise exception 'Unexpected pricelist projection DELETE in %; migration stopped safely', signature;
    end if;
    execute revised;
  end loop;
end;
$migration$;
notify pgrst, 'reload schema';
