-- 02 Inventory and Catalog
-- Source: 20260316_000001_core_schema.sql

create table if not exists app.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  model_name text,
  category text,
  brand text not null default 'Mitsubishi',
  uom text not null default 'PC',
  status text not null default 'in_stock' check (status in ('in_stock', 'low_stock', 'out_of_stock', 'discontinued')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references app.products(id) on delete cascade,
  price_type text not null default 'retail' check (price_type in ('retail', 'cost', 'wholesale', 'promo')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'PHP',
  effective_from date not null default current_date,
  effective_to date,
  is_current boolean not null default true,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists product_prices_current_idx
  on app.product_prices (product_id, price_type)
  where is_current;

create table if not exists app.inventory_balances (
  product_id uuid primary key references app.products(id) on delete cascade,
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

create table if not exists app.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references app.products(id) on delete cascade,
  movement_type text not null check (movement_type in ('stock_in', 'stock_out', 'adjustment', 'reservation', 'release', 'sale', 'service_usage')),
  quantity numeric(12,2) not null,
  reference_type text,
  reference_id uuid,
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

