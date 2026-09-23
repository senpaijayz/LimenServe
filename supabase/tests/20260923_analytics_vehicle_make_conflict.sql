-- Run in an isolated database. Temp data and assertions roll back.
begin;
do $test$
declare
  v_definition text;
  v_model_upsert text;
  v_model_upsert_start integer;
  v_rows integer;
  v_make text;
begin
  if to_regprocedure('app.refresh_dimensional_data(uuid)') is null then
    raise exception 'Analytics dimensional refresh function is missing';
  end if;

  select pg_get_functiondef('app.refresh_dimensional_data(uuid)'::regprocedure)
  into v_definition;

  v_model_upsert_start := position('insert into dw.dim_vehicle_model' in v_definition);
  if v_model_upsert_start = 0 then
    raise exception 'Vehicle-model dimension upsert is missing';
  end if;

  v_model_upsert := substring(v_definition from v_model_upsert_start);
  v_model_upsert := substring(v_model_upsert from 1 for position('get diagnostics v_rows = row_count;' in v_model_upsert) - 1);

  if v_model_upsert like '%select distinct%' or v_model_upsert not like '%group by v.model_name%' then
    raise exception 'Vehicle-model source rows are not reduced to one deterministic row per model';
  end if;

  create temporary table analytics_vehicle_make_cases (
    model_name text not null,
    make text
  ) on commit drop;

  create temporary table analytics_vehicle_make_result (
    model_name text primary key,
    make text not null
  ) on commit drop;

  insert into analytics_vehicle_make_cases (model_name, make)
  values ('montero', 'Toyota'), ('montero', 'Mitsubishi'), ('unknown', null);

  insert into analytics_vehicle_make_result (model_name, make)
  select model_name, min(coalesce(nullif(btrim(make), ''), 'Mitsubishi'))
  from analytics_vehicle_make_cases
  group by model_name
  on conflict (model_name) do update
  set make = excluded.make;

  select count(*), min(make)
  into v_rows, v_make
  from analytics_vehicle_make_result
  where model_name = 'montero';

  if v_rows <> 1 or v_make <> 'Mitsubishi' then
    raise exception 'Conflicting makes did not resolve to one stable model row';
  end if;

  select make into v_make
  from analytics_vehicle_make_result
  where model_name = 'unknown';

  if v_make <> 'Mitsubishi' then
    raise exception 'Missing vehicle make did not retain the Mitsubishi fallback';
  end if;
end;
$test$;
rollback;
