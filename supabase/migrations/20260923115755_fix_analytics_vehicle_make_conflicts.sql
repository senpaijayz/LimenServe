-- refresh_dimensional_data previously selected distinct (model_name, make)
-- pairs while upserting on model_name alone. When source vehicles disagree on
-- make, PostgreSQL raises 21000 because one INSERT would update that target row
-- twice. Keep the existing schema-specific refresh body and replace only that
-- source block so this migration works for both the legacy app.* and current
-- operations.* source layouts.
do $migration$
declare
  v_definition text;
  v_patched_definition text;
begin
  if to_regprocedure('app.refresh_dimensional_data(uuid)') is null then
    raise exception 'Required analytics function app.refresh_dimensional_data(uuid) is missing.';
  end if;

  select pg_get_functiondef('app.refresh_dimensional_data(uuid)'::regprocedure)
  into v_definition;

  if position('group by v.model_name' in v_definition) > 0 then
    return;
  end if;

  v_patched_definition := regexp_replace(
    v_definition,
    $pattern$insert into dw[.]dim_vehicle_model \(source_model_name, make\)[[:space:]]+select distinct[[:space:]]+v[.]model_name,[[:space:]]+coalesce\(v[.]make, 'Mitsubishi'\)[[:space:]]+from (app|operations)[.]vehicles v[[:space:]]+where coalesce\(v[.]model_name, ''\) <> ''[[:space:]]+on conflict \(source_model_name\) do update[[:space:]]+set make = excluded[.]make;$pattern$,
    $replacement$insert into dw.dim_vehicle_model (source_model_name, make)
  select
    v.model_name,
    min(coalesce(nullif(btrim(v.make), ''), 'Mitsubishi'))
  from \1.vehicles v
  where coalesce(v.model_name, '') <> ''
  group by v.model_name
  on conflict (source_model_name) do update
  set make = excluded.make;$replacement$,
    's'
  );

  if v_patched_definition = v_definition then
    raise exception 'Analytics refresh function did not match the expected vehicle-model upsert; no changes were applied.';
  end if;

  execute v_patched_definition;
end;
$migration$;
