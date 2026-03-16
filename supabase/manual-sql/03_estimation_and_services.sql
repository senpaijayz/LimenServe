-- 03 Estimation and Services
-- Source: 20260316_000001_core_schema.sql

create table if not exists app.customers (
  id uuid primary key default gen_random_uuid(),
  customer_type text not null default 'walk_in' check (customer_type in ('walk_in', 'repeat', 'fleet', 'wholesale')),
  name text not null,
  phone text,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references app.customers(id) on delete set null,
  plate_no text,
  make text not null default 'Mitsubishi',
  model_name text not null,
  year integer,
  engine text,
  mileage integer,
  metadata jsonb not null default '{}'::jsonb,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists vehicles_plate_no_idx on app.vehicles (plate_no) where plate_no is not null;

create table if not exists app.services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  standard_price numeric(12,2) not null default 0,
  estimated_duration_minutes integer not null default 30,
  is_active boolean not null default true,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.estimates (
  id uuid primary key default gen_random_uuid(),
  estimate_number text not null unique,
  customer_id uuid references app.customers(id) on delete set null,
  vehicle_id uuid references app.vehicles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'converted_sale', 'converted_service', 'expired', 'rejected')),
  source text not null default 'internal' check (source in ('public', 'internal')),
  note text,
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  issued_at timestamptz,
  valid_until date,
  business_date date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references app.estimates(id) on delete cascade,
  line_type text not null check (line_type in ('product', 'service')),
  product_id uuid references app.products(id) on delete set null,
  service_id uuid references app.services(id) on delete set null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  recommendation_rule_id uuid,
  is_upsell boolean not null default false,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (line_type = 'product' and product_id is not null and service_id is null) or
    (line_type = 'service' and service_id is not null and product_id is null)
  )
);

