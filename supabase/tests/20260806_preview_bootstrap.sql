-- TEST-ONLY bootstrap for a blank, isolated Supabase staging project.
-- Never apply this file to production. It creates only the production-shaped
-- objects required to execute and validate the 20260806 feature migrations.

create extension if not exists pgcrypto;

create schema if not exists app;
create schema if not exists core;
create schema if not exists operations;
create schema if not exists catalog;
create schema if not exists ml;

create table core.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'customer'
    check (role in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function core.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, core
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

alter table core.user_profiles enable row level security;

create table operations.customers (
  id uuid primary key default gen_random_uuid(),
  customer_type text not null default 'walk_in'
    check (customer_type in ('walk_in', 'repeat', 'fleet', 'wholesale')),
  name text not null,
  phone text,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table operations.mechanics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  specialization text not null,
  availability_status text not null default 'available'
    check (availability_status in ('available', 'off_duty', 'booked')),
  shift_label text,
  location_name text not null default 'Main Shop',
  bio text,
  photo_url text,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table operations.service_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references operations.customers(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  note text,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table catalog.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  model_name text,
  category text,
  brand text not null default 'Mitsubishi',
  uom text not null default 'PC',
  status text not null default 'in_stock'
    check (status in ('in_stock', 'low_stock', 'out_of_stock', 'discontinued')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  source_category text
);

create table catalog.inventory_balances (
  product_id uuid primary key references catalog.products(id) on delete cascade,
  on_hand numeric(12,2) not null default 0,
  reserved numeric(12,2) not null default 0,
  reorder_point numeric(12,2) not null default 0,
  reorder_quantity numeric(12,2) not null default 0,
  location jsonb not null default '{}'::jsonb,
  as_of_date date not null default current_date,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table catalog.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog.products(id) on delete cascade,
  movement_type text not null
    check (movement_type in ('stock_in', 'stock_out', 'adjustment', 'reservation', 'release', 'sale', 'service_usage')),
  quantity numeric(12,2) not null,
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- The hardening migration protects these existing backend-only production
-- tables. Their feature data is not required for this isolated test harness.
create table ml.vehicle_bundle_rules (id uuid primary key default gen_random_uuid());
create table ml.product_association_rules (id uuid primary key default gen_random_uuid());
create table ml.service_association_rules (id uuid primary key default gen_random_uuid());
create table ml.product_monthly_forecasts (id uuid primary key default gen_random_uuid());
create table ml.service_monthly_forecasts (id uuid primary key default gen_random_uuid());

create or replace function public.list_mechanics()
returns setof operations.mechanics
language sql
stable
security definer
set search_path = pg_catalog, operations
as $$
  select * from operations.mechanics order by sort_order, full_name;
$$;

create or replace function public.delete_mechanic(p_mechanic_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, operations
as $$
begin
  delete from operations.mechanics where id = p_mechanic_id;
  return found;
end;
$$;
