-- Mitsubishi recommendation profile and service-group upgrade
-- Run this before the curated rule seed.

alter table app.quote_recommendation_rules
  add column if not exists vehicle_family text,
  add column if not exists service_group text;

create table if not exists app.product_recommendation_profile (
  product_id uuid primary key references app.products(id) on delete cascade,
  sku text not null,
  model_name text,
  vehicle_family text,
  part_function text,
  service_group text,
  keywords text[] not null default '{}'::text[],
  is_vehicle_specific boolean not null default true,
  analysis_source text not null default 'sql_profile_builder',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.service_recommendation_groups (
  service_id uuid primary key references app.services(id) on delete cascade,
  service_group text not null,
  priority integer not null default 100,
  vehicle_model_name text,
  vehicle_family text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_product_recommendation_profile_vehicle_family
  on app.product_recommendation_profile (vehicle_family);

create index if not exists idx_product_recommendation_profile_part_function
  on app.product_recommendation_profile (part_function);

create index if not exists idx_product_recommendation_profile_service_group
  on app.product_recommendation_profile (service_group);

create index if not exists idx_service_recommendation_groups_group
  on app.service_recommendation_groups (service_group, is_active);

create or replace function app.extract_vehicle_family(p_model_name text)
returns text
language sql
immutable
as $$
  select nullif(trim(split_part(coalesce(p_model_name, ''), '(', 1)), '');
$$;

create or replace function app.infer_part_function(p_name text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_name, '')) like '%oil filter%' then 'oil_filter'
    when lower(coalesce(p_name, '')) like '%engine oil%' or lower(coalesce(p_name, '')) like '%synthetic oil%' or lower(coalesce(p_name, '')) like '%motor oil%' then 'engine_oil'
    when lower(coalesce(p_name, '')) like '%drain washer%' or lower(coalesce(p_name, '')) like '%drain plug washer%' then 'drain_washer'
    when lower(coalesce(p_name, '')) like '%brake pad%' then 'brake_pad'
    when lower(coalesce(p_name, '')) like '%brake shoe%' then 'brake_shoe'
    when lower(coalesce(p_name, '')) like '%brake fluid%' then 'brake_fluid'
    when lower(coalesce(p_name, '')) like '%brake cleaner%' then 'brake_cleaner'
    when lower(coalesce(p_name, '')) like '%disc rotor%' or lower(coalesce(p_name, '')) like '%rotor%' then 'disc_rotor'
    when lower(coalesce(p_name, '')) like '%spark plug%' or lower(coalesce(p_name, '')) like '%glow plug%' then 'spark_plug'
    when lower(coalesce(p_name, '')) like '%ignition coil%' then 'ignition_coil'
    when lower(coalesce(p_name, '')) like '%cabin air filter%' or lower(coalesce(p_name, '')) like '%cabin filter%' then 'cabin_filter'
    when lower(coalesce(p_name, '')) like '%air filter%' then 'air_filter'
    when lower(coalesce(p_name, '')) like '%fuel filter%' then 'fuel_filter'
    when lower(coalesce(p_name, '')) like '%battery terminal%' or lower(coalesce(p_name, '')) like '%terminal cleaner%' then 'battery_terminal'
    when lower(coalesce(p_name, '')) like '%battery%' then 'battery'
    when lower(coalesce(p_name, '')) like '%radiator hose%' then 'radiator_hose'
    when lower(coalesce(p_name, '')) like '%radiator%' then 'radiator'
    when lower(coalesce(p_name, '')) like '%coolant%' then 'coolant'
    when lower(coalesce(p_name, '')) like '%thermostat%' then 'thermostat'
    when lower(coalesce(p_name, '')) like '%water pump%' then 'water_pump'
    when lower(coalesce(p_name, '')) like '%lug nut%' or lower(coalesce(p_name, '')) like '%wheel nut%' or lower(coalesce(p_name, '')) like '%lug bolt%' then 'lug_nut'
    when lower(coalesce(p_name, '')) like '%valve%' then 'wheel_valve'
    when lower(coalesce(p_name, '')) like '%tire%' or lower(coalesce(p_name, '')) like '%tyre%' then 'tire'
    when lower(coalesce(p_name, '')) like '%wheel%' then 'wheel'
    else null
  end;
$$;

create or replace function app.infer_service_group(p_part_function text)
returns text
language sql
immutable
as $$
  select case
    when p_part_function in ('oil_filter', 'engine_oil', 'drain_washer') then 'oil_change'
    when p_part_function in ('brake_pad', 'brake_shoe', 'brake_fluid', 'brake_cleaner', 'disc_rotor') then 'brake_service'
    when p_part_function in ('spark_plug', 'ignition_coil') then 'tune_up'
    when p_part_function in ('air_filter', 'cabin_filter', 'fuel_filter') then 'filter_service'
    when p_part_function in ('battery', 'battery_terminal') then 'battery_service'
    when p_part_function in ('radiator', 'coolant', 'thermostat', 'water_pump', 'radiator_hose') then 'cooling_service'
    when p_part_function in ('tire', 'wheel', 'wheel_valve', 'lug_nut') then 'tire_service'
    else null
  end;
$$;

create or replace function app.refresh_product_recommendation_profile()
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_rows integer := 0;
begin
  insert into app.product_recommendation_profile (
    product_id,
    sku,
    model_name,
    vehicle_family,
    part_function,
    service_group,
    keywords,
    is_vehicle_specific,
    analysis_source,
    updated_at
  )
  select
    p.id,
    p.sku,
    p.model_name,
    app.extract_vehicle_family(p.model_name),
    app.infer_part_function(p.name),
    app.infer_service_group(app.infer_part_function(p.name)),
    array_remove(regexp_split_to_array(lower(coalesce(p.name, '') || ' ' || coalesce(p.model_name, '')), '\\s+'), ''),
    case
      when lower(coalesce(p.model_name, '')) like '%various%' then false
      when lower(coalesce(p.model_name, '')) like '%universal%' then false
      when coalesce(p.model_name, '') = '' then false
      else true
    end,
    'sql_profile_builder',
    timezone('utc', now())
  from app.products p
  where p.is_active = true
  on conflict (product_id) do update
  set
    sku = excluded.sku,
    model_name = excluded.model_name,
    vehicle_family = excluded.vehicle_family,
    part_function = excluded.part_function,
    service_group = excluded.service_group,
    keywords = excluded.keywords,
    is_vehicle_specific = excluded.is_vehicle_specific,
    analysis_source = excluded.analysis_source,
    updated_at = timezone('utc', now());

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

insert into app.services (code, name, description, standard_price, estimated_duration_minutes)
values
  ('SVC-TIRE-INSTALL', 'Tire Installation Service', 'Tire mounting and installation labor', 600.00, 45),
  ('SVC-WHEEL-BAL', 'Wheel Balancing Service', 'Wheel balancing for smoother handling and tire wear', 450.00, 45),
  ('SVC-WHEEL-ALIGN', 'Wheel Alignment Service', 'Wheel alignment and steering geometry adjustment', 850.00, 60),
  ('SVC-COOL', 'Cooling System Service', 'Cooling-system inspection, radiator and coolant service', 1250.00, 90),
  ('SVC-FILTER', 'Filter Replacement Service', 'Labor for air, cabin, or fuel filter replacement', 500.00, 45)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  standard_price = excluded.standard_price,
  estimated_duration_minutes = excluded.estimated_duration_minutes,
  updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'oil_change', 10, null, null, true, timezone('utc', now())
from app.services
where code = 'SVC-OIL'
on conflict (service_id) do update
set service_group = excluded.service_group, priority = excluded.priority, updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'brake_service', 10, null, null, true, timezone('utc', now())
from app.services
where code = 'SVC-BRAKE'
on conflict (service_id) do update
set service_group = excluded.service_group, priority = excluded.priority, updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'tune_up', 10, null, null, true, timezone('utc', now())
from app.services
where code = 'SVC-TUNE'
on conflict (service_id) do update
set service_group = excluded.service_group, priority = excluded.priority, updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'battery_service', 10, null, null, true, timezone('utc', now())
from app.services
where code = 'SVC-BATT'
on conflict (service_id) do update
set service_group = excluded.service_group, priority = excluded.priority, updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'tire_service', 10, null, null, true, timezone('utc', now())
from app.services
where code in ('SVC-TIRE-INSTALL', 'SVC-WHEEL-BAL', 'SVC-WHEEL-ALIGN')
on conflict (service_id) do update
set service_group = excluded.service_group, priority = excluded.priority, updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'cooling_service', 10, null, null, true, timezone('utc', now())
from app.services
where code = 'SVC-COOL'
on conflict (service_id) do update
set service_group = excluded.service_group, priority = excluded.priority, updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'filter_service', 10, null, null, true, timezone('utc', now())
from app.services
where code = 'SVC-FILTER'
on conflict (service_id) do update
set service_group = excluded.service_group, priority = excluded.priority, updated_at = timezone('utc', now());

select app.refresh_product_recommendation_profile() as profiled_products;

select service_group, count(*) as service_count
from app.service_recommendation_groups
where is_active = true
group by service_group
order by service_group;
