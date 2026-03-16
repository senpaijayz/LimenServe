create extension if not exists pgcrypto;

create schema if not exists app;
create schema if not exists dw;
create schema if not exists ml;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists app.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'cashier', 'staff', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function app.current_app_role()
returns text
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    (
      select up.role
      from app.user_profiles up
      where up.user_id = auth.uid()
      limit 1
    ),
    'anonymous'
  );
$$;

create or replace function app.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_role() in ('admin', 'cashier', 'staff');
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_role() = 'admin';
$$;

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

create table if not exists app.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_number text not null unique,
  estimate_id uuid references app.estimates(id) on delete set null,
  customer_id uuid references app.customers(id) on delete set null,
  processed_by uuid references auth.users(id) on delete set null,
  payment_method text not null default 'cash',
  status text not null default 'completed' check (status in ('pending', 'completed', 'voided')),
  subtotal numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.sales_transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references app.sales_transactions(id) on delete cascade,
  line_type text not null check (line_type in ('product', 'service')),
  product_id uuid references app.products(id) on delete set null,
  service_id uuid references app.services(id) on delete set null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  estimate_item_id uuid references app.estimate_items(id) on delete set null,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (line_type = 'product' and product_id is not null and service_id is null) or
    (line_type = 'service' and service_id is not null and product_id is null)
  )
);

create table if not exists app.service_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  estimate_id uuid references app.estimates(id) on delete set null,
  customer_id uuid references app.customers(id) on delete set null,
  vehicle_id uuid references app.vehicles(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
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

create table if not exists app.service_order_items (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references app.service_orders(id) on delete cascade,
  line_type text not null check (line_type in ('product', 'service')),
  product_id uuid references app.products(id) on delete set null,
  service_id uuid references app.services(id) on delete set null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  estimate_item_id uuid references app.estimate_items(id) on delete set null,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (line_type = 'product' and product_id is not null and service_id is null) or
    (line_type = 'service' and service_id is not null and product_id is null)
  )
);

create table if not exists app.analytics_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  initiated_by uuid references auth.users(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  notes text,
  error_message text,
  dimension_rows integer not null default 0,
  fact_rows integer not null default 0,
  rule_rows integer not null default 0,
  forecast_rows integer not null default 0,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz
);

create table if not exists app.upsell_interactions (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('estimate', 'sale', 'service')),
  context_id uuid not null,
  product_id uuid not null references app.products(id) on delete cascade,
  recommended_product_id uuid references app.products(id) on delete set null,
  recommended_service_id uuid references app.services(id) on delete set null,
  recommendation_rule_id uuid,
  action text not null default 'shown' check (action in ('shown', 'accepted', 'rejected', 'ignored')),
  reason_label text,
  created_by uuid references auth.users(id) on delete set null,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (recommended_product_id is not null and recommended_service_id is null) or
    (recommended_product_id is null and recommended_service_id is not null)
  )
);

create index if not exists estimates_business_date_idx on app.estimates (business_date);
create index if not exists sales_transactions_business_date_idx on app.sales_transactions (business_date);
create index if not exists service_orders_business_date_idx on app.service_orders (business_date);
create index if not exists inventory_movements_business_date_idx on app.inventory_movements (business_date);
create index if not exists upsell_interactions_business_date_idx on app.upsell_interactions (business_date);

create table if not exists dw.dim_date (
  date_key integer primary key,
  full_date date not null unique,
  year_number integer not null,
  quarter_number integer not null,
  month_number integer not null,
  month_name text not null,
  day_of_month integer not null,
  day_name text not null,
  week_of_year integer not null,
  is_weekend boolean not null
);

create table if not exists dw.dim_product (
  product_key integer generated always as identity primary key,
  source_product_id uuid not null unique,
  sku text not null,
  name text not null,
  category text,
  model_name text,
  brand text,
  current_price numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists dw.dim_service (
  service_key integer generated always as identity primary key,
  source_service_id uuid not null unique,
  code text not null,
  name text not null,
  standard_price numeric(12,2) not null default 0,
  estimated_duration_minutes integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists dw.dim_vehicle_model (
  vehicle_model_key integer generated always as identity primary key,
  source_model_name text not null unique,
  make text not null default 'Mitsubishi',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists dw.dim_customer_type (
  customer_type_key integer generated always as identity primary key,
  source_customer_type text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists dw.dim_employee (
  employee_key integer generated always as identity primary key,
  source_user_id uuid not null unique,
  full_name text,
  email text,
  role text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists dw.fact_estimate_lines (
  fact_id bigint generated always as identity primary key,
  estimate_id uuid not null,
  estimate_item_id uuid not null unique,
  date_key integer not null references dw.dim_date(date_key),
  product_key integer references dw.dim_product(product_key),
  service_key integer references dw.dim_service(service_key),
  vehicle_model_key integer references dw.dim_vehicle_model(vehicle_model_key),
  customer_type_key integer references dw.dim_customer_type(customer_type_key),
  employee_key integer references dw.dim_employee(employee_key),
  status text not null,
  line_type text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null,
  is_upsell boolean not null default false
);

create table if not exists dw.fact_sales_lines (
  fact_id bigint generated always as identity primary key,
  transaction_id uuid not null,
  transaction_item_id uuid not null unique,
  date_key integer not null references dw.dim_date(date_key),
  product_key integer references dw.dim_product(product_key),
  service_key integer references dw.dim_service(service_key),
  customer_type_key integer references dw.dim_customer_type(customer_type_key),
  employee_key integer references dw.dim_employee(employee_key),
  status text not null,
  line_type text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null
);

create table if not exists dw.fact_service_order_lines (
  fact_id bigint generated always as identity primary key,
  service_order_id uuid not null,
  service_order_item_id uuid not null unique,
  date_key integer not null references dw.dim_date(date_key),
  product_key integer references dw.dim_product(product_key),
  service_key integer references dw.dim_service(service_key),
  vehicle_model_key integer references dw.dim_vehicle_model(vehicle_model_key),
  customer_type_key integer references dw.dim_customer_type(customer_type_key),
  employee_key integer references dw.dim_employee(employee_key),
  status text not null,
  line_type text not null,
  quantity numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null
);

create table if not exists dw.fact_inventory_movements (
  fact_id bigint generated always as identity primary key,
  movement_id uuid not null unique,
  date_key integer not null references dw.dim_date(date_key),
  product_key integer not null references dw.dim_product(product_key),
  employee_key integer references dw.dim_employee(employee_key),
  movement_type text not null,
  quantity numeric(12,2) not null,
  reference_type text
);

create table if not exists dw.fact_upsell_events (
  fact_id bigint generated always as identity primary key,
  upsell_event_id uuid not null unique,
  date_key integer not null references dw.dim_date(date_key),
  product_key integer not null references dw.dim_product(product_key),
  recommended_product_key integer references dw.dim_product(product_key),
  recommended_service_key integer references dw.dim_service(service_key),
  employee_key integer references dw.dim_employee(employee_key),
  action text not null,
  context_type text not null
);

create table if not exists dw.fact_monthly_product_demand (
  month_key integer not null,
  month_start date not null,
  product_key integer not null references dw.dim_product(product_key),
  quantity numeric(12,2) not null,
  revenue numeric(12,2) not null,
  source_line_count integer not null,
  primary key (month_key, product_key)
);

create table if not exists dw.fact_monthly_service_demand (
  month_key integer not null,
  month_start date not null,
  service_key integer not null references dw.dim_service(service_key),
  quantity numeric(12,2) not null,
  revenue numeric(12,2) not null,
  source_line_count integer not null,
  primary key (month_key, service_key)
);

create table if not exists ml.product_association_rules (
  id uuid primary key default gen_random_uuid(),
  antecedent_product_id uuid not null references app.products(id) on delete cascade,
  consequent_kind text not null check (consequent_kind in ('product', 'service')),
  consequent_product_id uuid references app.products(id) on delete cascade,
  consequent_service_id uuid references app.services(id) on delete cascade,
  support numeric(8,4) not null,
  confidence numeric(8,4) not null,
  lift numeric(10,4) not null,
  sample_count integer not null,
  effective_month date not null,
  active boolean not null default true,
  refresh_run_id uuid references app.analytics_refresh_runs(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (consequent_kind = 'product' and consequent_product_id is not null and consequent_service_id is null) or
    (consequent_kind = 'service' and consequent_service_id is not null and consequent_product_id is null)
  )
);

create table if not exists ml.service_association_rules (
  id uuid primary key default gen_random_uuid(),
  antecedent_service_id uuid not null references app.services(id) on delete cascade,
  consequent_kind text not null check (consequent_kind in ('product', 'service')),
  consequent_product_id uuid references app.products(id) on delete cascade,
  consequent_service_id uuid references app.services(id) on delete cascade,
  support numeric(8,4) not null,
  confidence numeric(8,4) not null,
  lift numeric(10,4) not null,
  sample_count integer not null,
  effective_month date not null,
  active boolean not null default true,
  refresh_run_id uuid references app.analytics_refresh_runs(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (consequent_kind = 'product' and consequent_product_id is not null and consequent_service_id is null) or
    (consequent_kind = 'service' and consequent_service_id is not null and consequent_product_id is null)
  )
);

create table if not exists ml.vehicle_bundle_rules (
  id uuid primary key default gen_random_uuid(),
  vehicle_model_name text not null,
  anchor_product_id uuid references app.products(id) on delete cascade,
  anchor_service_id uuid references app.services(id) on delete cascade,
  recommended_product_id uuid references app.products(id) on delete cascade,
  recommended_service_id uuid references app.services(id) on delete cascade,
  support numeric(8,4) not null,
  confidence numeric(8,4) not null,
  lift numeric(10,4) not null,
  sample_count integer not null,
  effective_month date not null,
  active boolean not null default true,
  refresh_run_id uuid references app.analytics_refresh_runs(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (recommended_product_id is not null or recommended_service_id is not null)
);

create table if not exists ml.product_monthly_forecasts (
  id uuid primary key default gen_random_uuid(),
  target_month date not null,
  product_id uuid not null references app.products(id) on delete cascade,
  recent_month_values jsonb not null default '[]'::jsonb,
  predicted_quantity numeric(12,2) not null,
  predicted_revenue numeric(12,2) not null,
  trend_label text not null check (trend_label in ('rising', 'stable', 'declining')),
  confidence_label text not null check (confidence_label in ('low', 'medium', 'high')),
  generated_at timestamptz not null default timezone('utc', now()),
  refresh_run_id uuid references app.analytics_refresh_runs(id) on delete set null,
  unique (target_month, product_id)
);

create table if not exists ml.service_monthly_forecasts (
  id uuid primary key default gen_random_uuid(),
  target_month date not null,
  service_id uuid not null references app.services(id) on delete cascade,
  recent_month_values jsonb not null default '[]'::jsonb,
  predicted_quantity numeric(12,2) not null,
  predicted_revenue numeric(12,2) not null,
  trend_label text not null check (trend_label in ('rising', 'stable', 'declining')),
  confidence_label text not null check (confidence_label in ('low', 'medium', 'high')),
  generated_at timestamptz not null default timezone('utc', now()),
  refresh_run_id uuid references app.analytics_refresh_runs(id) on delete set null,
  unique (target_month, service_id)
);
