create table if not exists app.public_vehicle_fitments (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,
  vehicle_family text not null,
  year integer not null check (year between 1990 and 2100),
  engine text not null,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint public_vehicle_fitments_model_year_engine_key unique (model_name, year, engine)
);

create index if not exists idx_public_vehicle_fitments_lookup
  on app.public_vehicle_fitments (is_active, sort_order, model_name, year, engine);

drop trigger if exists trg_public_vehicle_fitments_updated_at on app.public_vehicle_fitments;
create trigger trg_public_vehicle_fitments_updated_at
before update on app.public_vehicle_fitments
for each row
execute function app.touch_updated_at();

with fitment_seed as (
  select *
  from (
    values
      ('Montero Sport', 'Montero', 2016, 2026, array[''2.4L Diesel MIVEC'', ''2.5L Diesel'', ''3.0L Gasoline V6'']::text[], 10),
      ('Montero', 'Montero', 2010, 2015, array[''2.5L Diesel'', ''3.2L Diesel'']::text[], 20),
      ('Xpander', 'Xpander', 2018, 2026, array[''1.5L Gasoline'']::text[], 30),
      ('Mirage G4', 'Mirage', 2013, 2026, array[''1.2L Gasoline'']::text[], 40),
      ('Mirage Hatchback', 'Mirage', 2012, 2026, array[''1.2L Gasoline'']::text[], 50),
      ('Strada', 'Strada', 2016, 2026, array[''2.4L Diesel'', ''2.5L Diesel'']::text[], 60),
      ('L300', 'L300', 2015, 2026, array[''2.2L Diesel'', ''2.5L Diesel'']::text[], 70),
      ('Adventure', 'Adventure', 2010, 2017, array[''2.5L Diesel'']::text[], 80),
      ('Outlander Sport', 'Outlander', 2013, 2020, array[''2.0L Gasoline'']::text[], 90),
      ('Pajero', 'Pajero', 2008, 2021, array[''3.2L Diesel'']::text[], 100)
  ) as seed(model_name, vehicle_family, year_start, year_end, engines, sort_order)
)
insert into app.public_vehicle_fitments (
  model_name,
  vehicle_family,
  year,
  engine,
  sort_order,
  is_active
)
select
  seed.model_name,
  seed.vehicle_family,
  series.year_number,
  engine_choice.engine_name,
  seed.sort_order,
  true
from fitment_seed seed
cross join lateral generate_series(seed.year_start, seed.year_end) as series(year_number)
cross join lateral unnest(seed.engines) as engine_choice(engine_name)
on conflict (model_name, year, engine) do update
set
  vehicle_family = excluded.vehicle_family,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = timezone('utc', now());
