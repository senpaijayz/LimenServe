-- Stockroom inventory bridge for Inventory <-> 3D Stockroom synchronization.
-- Run once in Supabase SQL Editor before using /api/inventory/stockroom persistence.

create schema if not exists app;

create table if not exists app.stockroom_layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Main Stockroom Layout',
  layout_data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists stockroom_layouts_one_active_idx
  on app.stockroom_layouts (is_active)
  where is_active = true;

create table if not exists app.shelves (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references app.stockroom_layouts(id) on delete cascade,
  aisle text not null,
  shelf_number integer not null check (shelf_number > 0),
  level integer not null default 1 check (level > 0),
  bin_count integer not null default 3 check (bin_count > 0),
  capacity integer not null default 50 check (capacity >= 0),
  position jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (layout_id, aisle, shelf_number, level)
);

create index if not exists shelves_layout_lookup_idx
  on app.shelves (layout_id, aisle, shelf_number, level);

create table if not exists app.product_locations (
  product_id uuid primary key references catalog.products(id) on delete cascade,
  layout_id uuid references app.stockroom_layouts(id) on delete set null,
  shelf_id uuid references app.shelves(id) on delete set null,
  aisle text not null,
  shelf_number integer not null check (shelf_number > 0),
  level integer not null default 1 check (level > 0),
  bin text not null default 'Left',
  bin_number integer not null default 1 check (bin_number > 0),
  quantity numeric,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists product_locations_layout_idx
  on app.product_locations (layout_id);

create index if not exists product_locations_shelf_idx
  on app.product_locations (shelf_id);

create index if not exists product_locations_lookup_idx
  on app.product_locations (aisle, shelf_number, level, bin_number);

alter table app.stockroom_layouts enable row level security;
alter table app.shelves enable row level security;
alter table app.product_locations enable row level security;

drop policy if exists "stockroom bridge service role full access" on app.stockroom_layouts;
drop policy if exists "stockroom shelves service role full access" on app.shelves;
drop policy if exists "product locations service role full access" on app.product_locations;

create policy "stockroom bridge service role full access"
  on app.stockroom_layouts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "stockroom shelves service role full access"
  on app.shelves
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "product locations service role full access"
  on app.product_locations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into app.stockroom_layouts (name, layout_data, is_active)
select 'Main Stockroom Layout', '{"source":"inventory-stockroom-bridge","version":1}'::jsonb, true
where not exists (select 1 from app.stockroom_layouts where is_active = true);
