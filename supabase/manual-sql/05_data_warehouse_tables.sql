-- 05 Data Warehouse and Mining Tables
-- Source: 20260316_000001_core_schema.sql

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
