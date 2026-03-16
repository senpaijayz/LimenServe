-- FILE: 20260316_000001_core_schema.sql
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

-- FILE: 20260316_000002_operational_and_etl_functions.sql
create or replace function app.generate_document_number(prefix text)
returns text
language sql
volatile
as $$
  select upper(prefix) || '-' || to_char(timezone('utc', now()), 'YYYYMMDDHH24MISSMS');
$$;

create or replace function app.create_estimate_internal(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_estimate_id uuid;
  v_item jsonb;
  v_business_date date := coalesce((payload -> 'estimate' ->> 'business_date')::date, current_date);
  v_estimate_number text := coalesce(payload -> 'estimate' ->> 'estimate_number', app.generate_document_number('EST'));
begin
  if payload ? 'customer' and coalesce(payload -> 'customer' ->> 'name', '') <> '' then
    insert into app.customers (
      customer_type,
      name,
      phone,
      email,
      metadata,
      business_date
    )
    values (
      coalesce(payload -> 'customer' ->> 'customer_type', 'walk_in'),
      payload -> 'customer' ->> 'name',
      payload -> 'customer' ->> 'phone',
      payload -> 'customer' ->> 'email',
      coalesce(payload -> 'customer' -> 'metadata', '{}'::jsonb),
      v_business_date
    )
    returning id into v_customer_id;
  end if;

  if payload ? 'vehicle' and coalesce(payload -> 'vehicle' ->> 'model_name', '') <> '' then
    insert into app.vehicles (
      customer_id,
      plate_no,
      make,
      model_name,
      year,
      engine,
      mileage,
      metadata,
      business_date
    )
    values (
      v_customer_id,
      payload -> 'vehicle' ->> 'plate_no',
      coalesce(payload -> 'vehicle' ->> 'make', 'Mitsubishi'),
      payload -> 'vehicle' ->> 'model_name',
      nullif(payload -> 'vehicle' ->> 'year', '')::integer,
      payload -> 'vehicle' ->> 'engine',
      nullif(payload -> 'vehicle' ->> 'mileage', '')::integer,
      coalesce(payload -> 'vehicle' -> 'metadata', '{}'::jsonb),
      v_business_date
    )
    returning id into v_vehicle_id;
  end if;

  insert into app.estimates (
    estimate_number,
    customer_id,
    vehicle_id,
    status,
    source,
    note,
    subtotal,
    discount_total,
    tax_total,
    grand_total,
    issued_at,
    valid_until,
    business_date,
    created_by
  )
  values (
    v_estimate_number,
    v_customer_id,
    v_vehicle_id,
    coalesce(payload -> 'estimate' ->> 'status', 'draft'),
    coalesce(payload -> 'estimate' ->> 'source', 'public'),
    payload -> 'estimate' ->> 'note',
    coalesce((payload -> 'estimate' ->> 'subtotal')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'discount_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'tax_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'grand_total')::numeric, 0),
    coalesce((payload -> 'estimate' ->> 'issued_at')::timestamptz, timezone('utc', now())),
    coalesce((payload -> 'estimate' ->> 'valid_until')::date, current_date + 7),
    v_business_date,
    auth.uid()
  )
  returning id into v_estimate_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb))
  loop
    insert into app.estimate_items (
      estimate_id,
      line_type,
      product_id,
      service_id,
      quantity,
      unit_price,
      line_total,
      recommendation_rule_id,
      is_upsell,
      business_date
    )
    values (
      v_estimate_id,
      coalesce(v_item ->> 'line_type', case when v_item ? 'service_id' then 'service' else 'product' end),
      nullif(v_item ->> 'product_id', '')::uuid,
      nullif(v_item ->> 'service_id', '')::uuid,
      coalesce((v_item ->> 'quantity')::numeric, 1),
      coalesce((v_item ->> 'unit_price')::numeric, 0),
      coalesce((v_item ->> 'line_total')::numeric, 0),
      nullif(v_item ->> 'recommendation_rule_id', '')::uuid,
      coalesce((v_item ->> 'is_upsell')::boolean, false),
      v_business_date
    );
  end loop;

  return v_estimate_id;
end;
$$;

create or replace function app.convert_estimate_to_sale_internal(p_estimate_id uuid, p_payment_method text default 'cash')
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_transaction_id uuid;
  v_transaction_number text := app.generate_document_number('SALE');
  v_row record;
begin
  insert into app.sales_transactions (
    transaction_number,
    estimate_id,
    customer_id,
    processed_by,
    payment_method,
    status,
    subtotal,
    discount_total,
    tax_total,
    total_amount,
    business_date
  )
  select
    v_transaction_number,
    e.id,
    e.customer_id,
    auth.uid(),
    p_payment_method,
    'completed',
    e.subtotal,
    e.discount_total,
    e.tax_total,
    e.grand_total,
    e.business_date
  from app.estimates e
  where e.id = p_estimate_id
  returning id into v_transaction_id;

  insert into app.sales_transaction_items (
    transaction_id,
    line_type,
    product_id,
    service_id,
    quantity,
    unit_price,
    line_total,
    estimate_item_id,
    business_date
  )
  select
    v_transaction_id,
    ei.line_type,
    ei.product_id,
    ei.service_id,
    ei.quantity,
    ei.unit_price,
    ei.line_total,
    ei.id,
    ei.business_date
  from app.estimate_items ei
  where ei.estimate_id = p_estimate_id;

  for v_row in
    select product_id, quantity, business_date
    from app.estimate_items
    where estimate_id = p_estimate_id
      and product_id is not null
  loop
    insert into app.inventory_movements (
      product_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      performed_by,
      business_date
    )
    values (
      v_row.product_id,
      'sale',
      -1 * v_row.quantity,
      'sales_transaction',
      v_transaction_id,
      auth.uid(),
      v_row.business_date
    );

    update app.inventory_balances
    set
      on_hand = greatest(on_hand - v_row.quantity, 0),
      updated_at = timezone('utc', now())
    where product_id = v_row.product_id;
  end loop;

  update app.estimates
  set status = 'converted_sale'
  where id = p_estimate_id;

  return v_transaction_id;
end;
$$;

create or replace function app.convert_estimate_to_service_order_internal(p_estimate_id uuid, p_assigned_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_service_order_id uuid;
  v_order_number text := app.generate_document_number('SVC');
begin
  insert into app.service_orders (
    order_number,
    estimate_id,
    customer_id,
    vehicle_id,
    assigned_to,
    status,
    note,
    subtotal,
    tax_total,
    total_amount,
    business_date
  )
  select
    v_order_number,
    e.id,
    e.customer_id,
    e.vehicle_id,
    p_assigned_to,
    'pending',
    e.note,
    e.subtotal,
    e.tax_total,
    e.grand_total,
    e.business_date
  from app.estimates e
  where e.id = p_estimate_id
  returning id into v_service_order_id;

  insert into app.service_order_items (
    service_order_id,
    line_type,
    product_id,
    service_id,
    quantity,
    unit_price,
    line_total,
    estimate_item_id,
    business_date
  )
  select
    v_service_order_id,
    ei.line_type,
    ei.product_id,
    ei.service_id,
    ei.quantity,
    ei.unit_price,
    ei.line_total,
    ei.id,
    ei.business_date
  from app.estimate_items ei
  where ei.estimate_id = p_estimate_id;

  update app.estimates
  set status = 'converted_service'
  where id = p_estimate_id;

  return v_service_order_id;
end;
$$;

create or replace function app.record_upsell_action_internal(
  p_context_type text,
  p_context_id uuid,
  p_product_id uuid,
  p_recommended_product_id uuid default null,
  p_recommended_service_id uuid default null,
  p_action text default 'shown',
  p_rule_id uuid default null,
  p_reason_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_event_id uuid;
begin
  insert into app.upsell_interactions (
    context_type,
    context_id,
    product_id,
    recommended_product_id,
    recommended_service_id,
    recommendation_rule_id,
    action,
    reason_label,
    created_by,
    business_date
  )
  values (
    p_context_type,
    p_context_id,
    p_product_id,
    p_recommended_product_id,
    p_recommended_service_id,
    p_rule_id,
    p_action,
    p_reason_label,
    auth.uid(),
    current_date
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function app.refresh_dimensional_data(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  insert into dw.dim_date (
    date_key,
    full_date,
    year_number,
    quarter_number,
    month_number,
    month_name,
    day_of_month,
    day_name,
    week_of_year,
    is_weekend
  )
  select
    to_char(d::date, 'YYYYMMDD')::integer,
    d::date,
    extract(year from d)::integer,
    extract(quarter from d)::integer,
    extract(month from d)::integer,
    trim(to_char(d, 'Month')),
    extract(day from d)::integer,
    trim(to_char(d, 'Day')),
    extract(week from d)::integer,
    extract(isodow from d) in (6, 7)
  from generate_series(date '2024-01-01', date '2027-12-31', interval '1 day') gs(d)
  on conflict (date_key) do update
  set
    full_date = excluded.full_date,
    year_number = excluded.year_number,
    quarter_number = excluded.quarter_number,
    month_number = excluded.month_number,
    month_name = excluded.month_name,
    day_of_month = excluded.day_of_month,
    day_name = excluded.day_name,
    week_of_year = excluded.week_of_year,
    is_weekend = excluded.is_weekend;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_product (
    source_product_id,
    sku,
    name,
    category,
    model_name,
    brand,
    current_price,
    is_active
  )
  select
    p.id,
    p.sku,
    p.name,
    p.category,
    p.model_name,
    p.brand,
    coalesce(cp.amount, 0),
    p.is_active
  from app.products p
  left join lateral (
    select amount
    from app.product_prices pp
    where pp.product_id = p.id
      and pp.price_type = 'retail'
    order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
    limit 1
  ) cp on true
  on conflict (source_product_id) do update
  set
    sku = excluded.sku,
    name = excluded.name,
    category = excluded.category,
    model_name = excluded.model_name,
    brand = excluded.brand,
    current_price = excluded.current_price,
    is_active = excluded.is_active;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_service (
    source_service_id,
    code,
    name,
    standard_price,
    estimated_duration_minutes,
    is_active
  )
  select
    s.id,
    s.code,
    s.name,
    s.standard_price,
    s.estimated_duration_minutes,
    s.is_active
  from app.services s
  on conflict (source_service_id) do update
  set
    code = excluded.code,
    name = excluded.name,
    standard_price = excluded.standard_price,
    estimated_duration_minutes = excluded.estimated_duration_minutes,
    is_active = excluded.is_active;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_vehicle_model (source_model_name, make)
  select distinct
    v.model_name,
    coalesce(v.make, 'Mitsubishi')
  from app.vehicles v
  where coalesce(v.model_name, '') <> ''
  on conflict (source_model_name) do update
  set make = excluded.make;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_customer_type (source_customer_type)
  select distinct c.customer_type
  from app.customers c
  on conflict (source_customer_type) do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.dim_employee (source_user_id, full_name, email, role)
  select
    up.user_id,
    up.full_name,
    up.email,
    up.role
  from app.user_profiles up
  on conflict (source_user_id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set dimension_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;

create or replace function app.refresh_monthly_aggregates(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  truncate table
    dw.fact_estimate_lines,
    dw.fact_sales_lines,
    dw.fact_service_order_lines,
    dw.fact_inventory_movements,
    dw.fact_upsell_events,
    dw.fact_monthly_product_demand,
    dw.fact_monthly_service_demand
  restart identity;

  insert into dw.fact_estimate_lines (
    estimate_id,
    estimate_item_id,
    date_key,
    product_key,
    service_key,
    vehicle_model_key,
    customer_type_key,
    employee_key,
    status,
    line_type,
    quantity,
    unit_price,
    line_total,
    is_upsell
  )
  select
    e.id,
    ei.id,
    to_char(e.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    ds.service_key,
    dvm.vehicle_model_key,
    dct.customer_type_key,
    de.employee_key,
    e.status,
    ei.line_type,
    ei.quantity,
    ei.unit_price,
    ei.line_total,
    ei.is_upsell
  from app.estimate_items ei
  join app.estimates e on e.id = ei.estimate_id
  left join app.customers c on c.id = e.customer_id
  left join app.vehicles v on v.id = e.vehicle_id
  left join dw.dim_product dp on dp.source_product_id = ei.product_id
  left join dw.dim_service ds on ds.source_service_id = ei.service_id
  left join dw.dim_vehicle_model dvm on dvm.source_model_name = v.model_name
  left join dw.dim_customer_type dct on dct.source_customer_type = c.customer_type
  left join dw.dim_employee de on de.source_user_id = e.created_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_sales_lines (
    transaction_id,
    transaction_item_id,
    date_key,
    product_key,
    service_key,
    customer_type_key,
    employee_key,
    status,
    line_type,
    quantity,
    unit_price,
    line_total
  )
  select
    st.id,
    sti.id,
    to_char(st.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    ds.service_key,
    dct.customer_type_key,
    de.employee_key,
    st.status,
    sti.line_type,
    sti.quantity,
    sti.unit_price,
    sti.line_total
  from app.sales_transaction_items sti
  join app.sales_transactions st on st.id = sti.transaction_id
  left join app.customers c on c.id = st.customer_id
  left join dw.dim_product dp on dp.source_product_id = sti.product_id
  left join dw.dim_service ds on ds.source_service_id = sti.service_id
  left join dw.dim_customer_type dct on dct.source_customer_type = c.customer_type
  left join dw.dim_employee de on de.source_user_id = st.processed_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_service_order_lines (
    service_order_id,
    service_order_item_id,
    date_key,
    product_key,
    service_key,
    vehicle_model_key,
    customer_type_key,
    employee_key,
    status,
    line_type,
    quantity,
    unit_price,
    line_total
  )
  select
    so.id,
    soi.id,
    to_char(so.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    ds.service_key,
    dvm.vehicle_model_key,
    dct.customer_type_key,
    de.employee_key,
    so.status,
    soi.line_type,
    soi.quantity,
    soi.unit_price,
    soi.line_total
  from app.service_order_items soi
  join app.service_orders so on so.id = soi.service_order_id
  left join app.customers c on c.id = so.customer_id
  left join app.vehicles v on v.id = so.vehicle_id
  left join dw.dim_product dp on dp.source_product_id = soi.product_id
  left join dw.dim_service ds on ds.source_service_id = soi.service_id
  left join dw.dim_vehicle_model dvm on dvm.source_model_name = v.model_name
  left join dw.dim_customer_type dct on dct.source_customer_type = c.customer_type
  left join dw.dim_employee de on de.source_user_id = so.assigned_to;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_inventory_movements (
    movement_id,
    date_key,
    product_key,
    employee_key,
    movement_type,
    quantity,
    reference_type
  )
  select
    im.id,
    to_char(im.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    de.employee_key,
    im.movement_type,
    im.quantity,
    im.reference_type
  from app.inventory_movements im
  join dw.dim_product dp on dp.source_product_id = im.product_id
  left join dw.dim_employee de on de.source_user_id = im.performed_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_upsell_events (
    upsell_event_id,
    date_key,
    product_key,
    recommended_product_key,
    recommended_service_key,
    employee_key,
    action,
    context_type
  )
  select
    ui.id,
    to_char(ui.business_date, 'YYYYMMDD')::integer,
    dp.product_key,
    dpr.product_key,
    ds.service_key,
    de.employee_key,
    ui.action,
    ui.context_type
  from app.upsell_interactions ui
  join dw.dim_product dp on dp.source_product_id = ui.product_id
  left join dw.dim_product dpr on dpr.source_product_id = ui.recommended_product_id
  left join dw.dim_service ds on ds.source_service_id = ui.recommended_service_id
  left join dw.dim_employee de on de.source_user_id = ui.created_by;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_monthly_product_demand (
    month_key,
    month_start,
    product_key,
    quantity,
    revenue,
    source_line_count
  )
  with product_lines as (
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsl.product_key,
      fsl.quantity,
      fsl.line_total
    from dw.fact_sales_lines fsl
    join dw.dim_date dd on dd.date_key = fsl.date_key
    where fsl.product_key is not null
      and fsl.status = 'completed'
    union all
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsol.product_key,
      fsol.quantity,
      fsol.line_total
    from dw.fact_service_order_lines fsol
    join dw.dim_date dd on dd.date_key = fsol.date_key
    where fsol.product_key is not null
      and fsol.status in ('pending', 'in_progress', 'completed')
  )
  select
    to_char(month_start, 'YYYYMM')::integer,
    month_start,
    product_key,
    sum(quantity),
    sum(line_total),
    count(*)
  from product_lines
  group by month_start, product_key;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into dw.fact_monthly_service_demand (
    month_key,
    month_start,
    service_key,
    quantity,
    revenue,
    source_line_count
  )
  with service_lines as (
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsl.service_key,
      fsl.quantity,
      fsl.line_total
    from dw.fact_sales_lines fsl
    join dw.dim_date dd on dd.date_key = fsl.date_key
    where fsl.service_key is not null
      and fsl.status = 'completed'
    union all
    select
      date_trunc('month', dd.full_date)::date as month_start,
      fsol.service_key,
      fsol.quantity,
      fsol.line_total
    from dw.fact_service_order_lines fsol
    join dw.dim_date dd on dd.date_key = fsol.date_key
    where fsol.service_key is not null
      and fsol.status in ('pending', 'in_progress', 'completed')
  )
  select
    to_char(month_start, 'YYYYMM')::integer,
    month_start,
    service_key,
    sum(quantity),
    sum(line_total),
    count(*)
  from service_lines
  group by month_start, service_key;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set fact_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;

-- FILE: 20260316_000003_analytics_rpc.sql
create or replace function app.refresh_association_rules(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, ml, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  truncate table
    ml.product_association_rules,
    ml.service_association_rules,
    ml.vehicle_bundle_rules
  restart identity;

  insert into ml.product_association_rules (
    antecedent_product_id,
    consequent_kind,
    consequent_product_id,
    consequent_service_id,
    support,
    confidence,
    lift,
    sample_count,
    effective_month,
    active,
    refresh_run_id
  )
  with basket_lines as (
    select
      'estimate:' || e.id::text as basket_id,
      date_trunc('month', e.business_date)::date as effective_month,
      v.model_name as vehicle_model_name,
      ei.product_id,
      ei.service_id
    from app.estimates e
    join app.estimate_items ei on ei.estimate_id = e.id
    left join app.vehicles v on v.id = e.vehicle_id
    union all
    select
      'sale:' || st.id::text,
      date_trunc('month', st.business_date)::date,
      v.model_name,
      sti.product_id,
      sti.service_id
    from app.sales_transactions st
    join app.sales_transaction_items sti on sti.transaction_id = st.id
    left join app.estimates e on e.id = st.estimate_id
    left join app.vehicles v on v.id = e.vehicle_id
    union all
    select
      'service:' || so.id::text,
      date_trunc('month', so.business_date)::date,
      v.model_name,
      soi.product_id,
      soi.service_id
    from app.service_orders so
    join app.service_order_items soi on soi.service_order_id = so.id
    left join app.vehicles v on v.id = so.vehicle_id
  ),
  basket_meta as (
    select basket_id, effective_month, max(vehicle_model_name) as vehicle_model_name
    from basket_lines
    group by basket_id, effective_month
  ),
  month_totals as (
    select effective_month, count(distinct basket_id) as total_baskets
    from basket_meta
    group by effective_month
  ),
  product_occurrence as (
    select distinct bl.basket_id, bm.effective_month, bl.product_id
    from basket_lines bl
    join basket_meta bm on bm.basket_id = bl.basket_id
    where bl.product_id is not null
  ),
  service_occurrence as (
    select distinct bl.basket_id, bm.effective_month, bl.service_id
    from basket_lines bl
    join basket_meta bm on bm.basket_id = bl.basket_id
    where bl.service_id is not null
  ),
  product_base as (
    select effective_month, product_id, count(*) as basket_count
    from product_occurrence
    group by effective_month, product_id
  ),
  service_base as (
    select effective_month, service_id, count(*) as basket_count
    from service_occurrence
    group by effective_month, service_id
  ),
  product_product_pairs as (
    select
      a.effective_month,
      a.product_id as antecedent_product_id,
      b.product_id as consequent_product_id,
      count(*) as sample_count
    from product_occurrence a
    join product_occurrence b
      on a.basket_id = b.basket_id
     and a.product_id <> b.product_id
     and a.effective_month = b.effective_month
    group by a.effective_month, a.product_id, b.product_id
  ),
  product_service_pairs as (
    select
      p.effective_month,
      p.product_id as antecedent_product_id,
      s.service_id as consequent_service_id,
      count(*) as sample_count
    from product_occurrence p
    join service_occurrence s
      on p.basket_id = s.basket_id
     and p.effective_month = s.effective_month
    group by p.effective_month, p.product_id, s.service_id
  )
  select
    ppp.antecedent_product_id,
    'product',
    ppp.consequent_product_id,
    null,
    round(ppp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(ppp.sample_count::numeric / nullif(pb.basket_count, 0), 4),
    round(
      (ppp.sample_count::numeric / nullif(pb.basket_count, 0)) /
      nullif(cpb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    ppp.sample_count,
    ppp.effective_month,
    true,
    p_refresh_run_id
  from product_product_pairs ppp
  join month_totals mt on mt.effective_month = ppp.effective_month
  join product_base pb on pb.effective_month = ppp.effective_month and pb.product_id = ppp.antecedent_product_id
  join product_base cpb on cpb.effective_month = ppp.effective_month and cpb.product_id = ppp.consequent_product_id
  where ppp.sample_count >= 2
    and (ppp.sample_count::numeric / nullif(pb.basket_count, 0)) >= 0.20
  union all
  select
    psp.antecedent_product_id,
    'service',
    null,
    psp.consequent_service_id,
    round(psp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(psp.sample_count::numeric / nullif(pb.basket_count, 0), 4),
    round(
      (psp.sample_count::numeric / nullif(pb.basket_count, 0)) /
      nullif(sb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    psp.sample_count,
    psp.effective_month,
    true,
    p_refresh_run_id
  from product_service_pairs psp
  join month_totals mt on mt.effective_month = psp.effective_month
  join product_base pb on pb.effective_month = psp.effective_month and pb.product_id = psp.antecedent_product_id
  join service_base sb on sb.effective_month = psp.effective_month and sb.service_id = psp.consequent_service_id
  where psp.sample_count >= 2
    and (psp.sample_count::numeric / nullif(pb.basket_count, 0)) >= 0.20;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into ml.service_association_rules (
    antecedent_service_id,
    consequent_kind,
    consequent_product_id,
    consequent_service_id,
    support,
    confidence,
    lift,
    sample_count,
    effective_month,
    active,
    refresh_run_id
  )
  with basket_lines as (
    select
      'estimate:' || e.id::text as basket_id,
      date_trunc('month', e.business_date)::date as effective_month,
      ei.product_id,
      ei.service_id
    from app.estimates e
    join app.estimate_items ei on ei.estimate_id = e.id
    union all
    select
      'sale:' || st.id::text,
      date_trunc('month', st.business_date)::date,
      sti.product_id,
      sti.service_id
    from app.sales_transactions st
    join app.sales_transaction_items sti on sti.transaction_id = st.id
    union all
    select
      'service:' || so.id::text,
      date_trunc('month', so.business_date)::date,
      soi.product_id,
      soi.service_id
    from app.service_orders so
    join app.service_order_items soi on soi.service_order_id = so.id
  ),
  month_totals as (
    select effective_month, count(distinct basket_id) as total_baskets
    from basket_lines
    group by effective_month
  ),
  product_occurrence as (
    select distinct basket_id, effective_month, product_id
    from basket_lines
    where product_id is not null
  ),
  service_occurrence as (
    select distinct basket_id, effective_month, service_id
    from basket_lines
    where service_id is not null
  ),
  product_base as (
    select effective_month, product_id, count(*) as basket_count
    from product_occurrence
    group by effective_month, product_id
  ),
  service_base as (
    select effective_month, service_id, count(*) as basket_count
    from service_occurrence
    group by effective_month, service_id
  ),
  service_product_pairs as (
    select
      s.effective_month,
      s.service_id as antecedent_service_id,
      p.product_id as consequent_product_id,
      count(*) as sample_count
    from service_occurrence s
    join product_occurrence p
      on s.basket_id = p.basket_id
     and s.effective_month = p.effective_month
    group by s.effective_month, s.service_id, p.product_id
  ),
  service_service_pairs as (
    select
      a.effective_month,
      a.service_id as antecedent_service_id,
      b.service_id as consequent_service_id,
      count(*) as sample_count
    from service_occurrence a
    join service_occurrence b
      on a.basket_id = b.basket_id
     and a.service_id <> b.service_id
     and a.effective_month = b.effective_month
    group by a.effective_month, a.service_id, b.service_id
  )
  select
    spp.antecedent_service_id,
    'product',
    spp.consequent_product_id,
    null,
    round(spp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(spp.sample_count::numeric / nullif(sb.basket_count, 0), 4),
    round(
      (spp.sample_count::numeric / nullif(sb.basket_count, 0)) /
      nullif(pb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    spp.sample_count,
    spp.effective_month,
    true,
    p_refresh_run_id
  from service_product_pairs spp
  join month_totals mt on mt.effective_month = spp.effective_month
  join service_base sb on sb.effective_month = spp.effective_month and sb.service_id = spp.antecedent_service_id
  join product_base pb on pb.effective_month = spp.effective_month and pb.product_id = spp.consequent_product_id
  where spp.sample_count >= 2
    and (spp.sample_count::numeric / nullif(sb.basket_count, 0)) >= 0.20
  union all
  select
    ssp.antecedent_service_id,
    'service',
    null,
    ssp.consequent_service_id,
    round(ssp.sample_count::numeric / nullif(mt.total_baskets, 0), 4),
    round(ssp.sample_count::numeric / nullif(sb.basket_count, 0), 4),
    round(
      (ssp.sample_count::numeric / nullif(sb.basket_count, 0)) /
      nullif(csb.basket_count::numeric / nullif(mt.total_baskets, 0), 0),
      4
    ),
    ssp.sample_count,
    ssp.effective_month,
    true,
    p_refresh_run_id
  from service_service_pairs ssp
  join month_totals mt on mt.effective_month = ssp.effective_month
  join service_base sb on sb.effective_month = ssp.effective_month and sb.service_id = ssp.antecedent_service_id
  join service_base csb on csb.effective_month = ssp.effective_month and csb.service_id = ssp.consequent_service_id
  where ssp.sample_count >= 2
    and (ssp.sample_count::numeric / nullif(sb.basket_count, 0)) >= 0.20;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into ml.vehicle_bundle_rules (
    vehicle_model_name,
    anchor_product_id,
    anchor_service_id,
    recommended_product_id,
    recommended_service_id,
    support,
    confidence,
    lift,
    sample_count,
    effective_month,
    active,
    refresh_run_id
  )
  with basket_lines as (
    select
      'estimate:' || e.id::text as basket_id,
      date_trunc('month', e.business_date)::date as effective_month,
      v.model_name as vehicle_model_name,
      ei.product_id,
      ei.service_id
    from app.estimates e
    join app.estimate_items ei on ei.estimate_id = e.id
    join app.vehicles v on v.id = e.vehicle_id
    union all
    select
      'service:' || so.id::text,
      date_trunc('month', so.business_date)::date,
      v.model_name,
      soi.product_id,
      soi.service_id
    from app.service_orders so
    join app.service_order_items soi on soi.service_order_id = so.id
    join app.vehicles v on v.id = so.vehicle_id
  ),
  model_baskets as (
    select vehicle_model_name, effective_month, count(distinct basket_id) as total_baskets
    from basket_lines
    where coalesce(vehicle_model_name, '') <> ''
    group by vehicle_model_name, effective_month
  ),
  global_totals as (
    select effective_month, count(distinct basket_id) as total_baskets
    from basket_lines
    group by effective_month
  ),
  product_counts as (
    select vehicle_model_name, effective_month, product_id, count(distinct basket_id) as sample_count
    from basket_lines
    where product_id is not null and coalesce(vehicle_model_name, '') <> ''
    group by vehicle_model_name, effective_month, product_id
  ),
  global_product_counts as (
    select effective_month, product_id, count(distinct basket_id) as sample_count
    from basket_lines
    where product_id is not null
    group by effective_month, product_id
  )
  select
    pc.vehicle_model_name,
    null,
    null,
    pc.product_id,
    null,
    round(pc.sample_count::numeric / nullif(gt.total_baskets, 0), 4),
    round(pc.sample_count::numeric / nullif(mb.total_baskets, 0), 4),
    round(
      (pc.sample_count::numeric / nullif(mb.total_baskets, 0)) /
      nullif(gpc.sample_count::numeric / nullif(gt.total_baskets, 0), 0),
      4
    ),
    pc.sample_count,
    pc.effective_month,
    true,
    p_refresh_run_id
  from product_counts pc
  join model_baskets mb on mb.vehicle_model_name = pc.vehicle_model_name and mb.effective_month = pc.effective_month
  join global_totals gt on gt.effective_month = pc.effective_month
  join global_product_counts gpc on gpc.effective_month = pc.effective_month and gpc.product_id = pc.product_id
  where pc.sample_count >= 2;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set rule_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;

create or replace function app.refresh_demand_forecasts(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, dw, ml, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  truncate table
    ml.product_monthly_forecasts,
    ml.service_monthly_forecasts
  restart identity;

  insert into ml.product_monthly_forecasts (
    target_month,
    product_id,
    recent_month_values,
    predicted_quantity,
    predicted_revenue,
    trend_label,
    confidence_label,
    refresh_run_id
  )
  with ranked as (
    select
      fmpd.product_key,
      fmpd.month_start,
      fmpd.quantity,
      fmpd.revenue,
      dp.source_product_id as product_id,
      row_number() over (partition by fmpd.product_key order by fmpd.month_start desc) as rn,
      max(fmpd.month_start) over () as latest_month
    from dw.fact_monthly_product_demand fmpd
    join dw.dim_product dp on dp.product_key = fmpd.product_key
  ),
  agg as (
    select
      product_id,
      (latest_month + interval '1 month')::date as target_month,
      jsonb_agg(
        jsonb_build_object(
          'month_start', month_start,
          'quantity', quantity,
          'revenue', revenue
        )
        order by month_start desc
      ) filter (where rn <= 6) as recent_month_values,
      max(case when rn = 1 then quantity end) as q1,
      max(case when rn = 2 then quantity end) as q2,
      max(case when rn = 3 then quantity end) as q3,
      max(case when rn = 1 then revenue end) as r1,
      max(case when rn = 2 then revenue end) as r2,
      max(case when rn = 3 then revenue end) as r3,
      count(*) filter (where rn <= 3) as history_count
    from ranked
    group by product_id, latest_month
  )
  select
    target_month,
    product_id,
    coalesce(recent_month_values, '[]'::jsonb),
    round(
      coalesce(q1, 0) * 0.50 +
      coalesce(q2, q1, 0) * 0.30 +
      coalesce(q3, q2, q1, 0) * 0.20,
      2
    ),
    round(
      coalesce(r1, 0) * 0.50 +
      coalesce(r2, r1, 0) * 0.30 +
      coalesce(r3, r2, r1, 0) * 0.20,
      2
    ),
    case
      when coalesce(q1, 0) > coalesce(q2, q1, 0) * 1.10 then 'rising'
      when coalesce(q1, 0) < coalesce(q2, q1, 0) * 0.90 then 'declining'
      else 'stable'
    end,
    case
      when history_count >= 3 then 'high'
      when history_count = 2 then 'medium'
      else 'low'
    end,
    p_refresh_run_id
  from agg;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into ml.service_monthly_forecasts (
    target_month,
    service_id,
    recent_month_values,
    predicted_quantity,
    predicted_revenue,
    trend_label,
    confidence_label,
    refresh_run_id
  )
  with ranked as (
    select
      fmsd.service_key,
      fmsd.month_start,
      fmsd.quantity,
      fmsd.revenue,
      ds.source_service_id as service_id,
      row_number() over (partition by fmsd.service_key order by fmsd.month_start desc) as rn,
      max(fmsd.month_start) over () as latest_month
    from dw.fact_monthly_service_demand fmsd
    join dw.dim_service ds on ds.service_key = fmsd.service_key
  ),
  agg as (
    select
      service_id,
      (latest_month + interval '1 month')::date as target_month,
      jsonb_agg(
        jsonb_build_object(
          'month_start', month_start,
          'quantity', quantity,
          'revenue', revenue
        )
        order by month_start desc
      ) filter (where rn <= 6) as recent_month_values,
      max(case when rn = 1 then quantity end) as q1,
      max(case when rn = 2 then quantity end) as q2,
      max(case when rn = 3 then quantity end) as q3,
      max(case when rn = 1 then revenue end) as r1,
      max(case when rn = 2 then revenue end) as r2,
      max(case when rn = 3 then revenue end) as r3,
      count(*) filter (where rn <= 3) as history_count
    from ranked
    group by service_id, latest_month
  )
  select
    target_month,
    service_id,
    coalesce(recent_month_values, '[]'::jsonb),
    round(
      coalesce(q1, 0) * 0.50 +
      coalesce(q2, q1, 0) * 0.30 +
      coalesce(q3, q2, q1, 0) * 0.20,
      2
    ),
    round(
      coalesce(r1, 0) * 0.50 +
      coalesce(r2, r1, 0) * 0.30 +
      coalesce(r3, r2, r1, 0) * 0.20,
      2
    ),
    case
      when coalesce(q1, 0) > coalesce(q2, q1, 0) * 1.10 then 'rising'
      when coalesce(q1, 0) < coalesce(q2, q1, 0) * 0.90 then 'declining'
      else 'stable'
    end,
    case
      when history_count >= 3 then 'high'
      when history_count = 2 then 'medium'
      else 'low'
    end,
    p_refresh_run_id
  from agg;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set forecast_rows = v_total
    where id = p_refresh_run_id;
  end if;
end;
$$;

create or replace function app.run_full_analytics_refresh(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_refresh_id uuid;
begin
  insert into app.analytics_refresh_runs (initiated_by, status, notes)
  values (auth.uid(), 'running', p_notes)
  returning id into v_refresh_id;

  begin
    perform app.refresh_dimensional_data(v_refresh_id);
    perform app.refresh_monthly_aggregates(v_refresh_id);
    perform app.refresh_association_rules(v_refresh_id);
    perform app.refresh_demand_forecasts(v_refresh_id);

    update app.analytics_refresh_runs
    set
      status = 'success',
      ended_at = timezone('utc', now())
    where id = v_refresh_id;
  exception when others then
    update app.analytics_refresh_runs
    set
      status = 'failed',
      ended_at = timezone('utc', now()),
      error_message = sqlerrm
    where id = v_refresh_id;
    raise;
  end;

  return v_refresh_id;
end;
$$;

create or replace view ml.v_top_upsell_opportunities as
select
  par.id as rule_id,
  par.antecedent_product_id as product_id,
  p.name as product_name,
  par.consequent_kind,
  par.consequent_product_id,
  cp.name as recommended_product_name,
  par.consequent_service_id,
  cs.name as recommended_service_name,
  par.support,
  par.confidence,
  par.lift,
  par.sample_count,
  par.effective_month
from ml.product_association_rules par
join app.products p on p.id = par.antecedent_product_id
left join app.products cp on cp.id = par.consequent_product_id
left join app.services cs on cs.id = par.consequent_service_id
where par.active;

create or replace view ml.v_predicted_low_stock_risk as
select
  pmf.target_month,
  pmf.product_id,
  p.sku,
  p.name as product_name,
  pmf.predicted_quantity,
  pmf.predicted_revenue,
  ib.on_hand,
  ib.reorder_point,
  case
    when ib.on_hand <= 0 then 'critical'
    when ib.on_hand < pmf.predicted_quantity then 'high'
    when ib.on_hand < greatest(pmf.predicted_quantity * 1.25, ib.reorder_point) then 'medium'
    else 'low'
  end as risk_level,
  pmf.trend_label,
  pmf.confidence_label
from ml.product_monthly_forecasts pmf
join app.products p on p.id = pmf.product_id
left join app.inventory_balances ib on ib.product_id = pmf.product_id;

create or replace view ml.v_product_forecast_vs_actual as
select
  pmf.target_month,
  pmf.product_id,
  p.sku,
  p.name as product_name,
  pmf.predicted_quantity,
  coalesce(fmpd.quantity, 0) as actual_quantity,
  pmf.predicted_revenue,
  coalesce(fmpd.revenue, 0) as actual_revenue,
  pmf.trend_label,
  pmf.confidence_label
from ml.product_monthly_forecasts pmf
join app.products p on p.id = pmf.product_id
left join dw.dim_product dp on dp.source_product_id = pmf.product_id
left join dw.fact_monthly_product_demand fmpd
  on fmpd.product_key = dp.product_key
 and fmpd.month_start = pmf.target_month;

create or replace function public.create_estimate(payload jsonb)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.create_estimate_internal(payload);
$$;

create or replace function public.convert_estimate_to_sale(p_estimate_id uuid, p_payment_method text default 'cash')
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.convert_estimate_to_sale_internal(p_estimate_id, p_payment_method);
$$;

create or replace function public.convert_estimate_to_service_order(p_estimate_id uuid, p_assigned_to uuid default null)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.convert_estimate_to_service_order_internal(p_estimate_id, p_assigned_to);
$$;

create or replace function public.record_upsell_action(
  p_context_type text,
  p_context_id uuid,
  p_product_id uuid,
  p_recommended_product_id uuid default null,
  p_recommended_service_id uuid default null,
  p_action text default 'shown',
  p_rule_id uuid default null,
  p_reason_label text default null
)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.record_upsell_action_internal(
    p_context_type,
    p_context_id,
    p_product_id,
    p_recommended_product_id,
    p_recommended_service_id,
    p_action,
    p_rule_id,
    p_reason_label
  );
$$;

create or replace function public.run_full_analytics_refresh(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.is_admin() then
    raise exception 'Only admin users can trigger analytics refreshes.';
  end if;

  return app.run_full_analytics_refresh(p_notes);
end;
$$;

create or replace function public.get_product_upsell_recommendations(
  product_id uuid,
  vehicle_model_id text default null,
  limit_count integer default 5
)
returns table (
  rule_id uuid,
  consequent_kind text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_price numeric,
  support numeric,
  confidence numeric,
  lift numeric,
  sample_count integer,
  reason_label text
)
language sql
security definer
set search_path = public, app, ml
as $$
  with direct_rules as (
    select
      par.id as rule_id,
      par.consequent_kind,
      par.consequent_product_id as recommended_product_id,
      cp.name as recommended_product_name,
      par.consequent_service_id as recommended_service_id,
      cs.name as recommended_service_name,
      coalesce(pp.amount, cs.standard_price, 0) as recommended_price,
      par.support,
      par.confidence,
      par.lift,
      par.sample_count,
      case
        when par.consequent_kind = 'product' then 'Frequently bought together'
        else 'Recommended service pairing'
      end as reason_label
    from ml.product_association_rules par
    left join app.products cp on cp.id = par.consequent_product_id
    left join app.services cs on cs.id = par.consequent_service_id
    left join lateral (
      select amount
      from app.product_prices pp
      where pp.product_id = par.consequent_product_id
        and pp.price_type = 'retail'
      order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
      limit 1
    ) pp on true
    where par.active
      and par.antecedent_product_id = product_id
  ),
  vehicle_rules as (
    select
      vbr.id as rule_id,
      case when vbr.recommended_product_id is not null then 'product' else 'service' end as consequent_kind,
      vbr.recommended_product_id,
      cp.name as recommended_product_name,
      vbr.recommended_service_id,
      cs.name as recommended_service_name,
      coalesce(pp.amount, cs.standard_price, 0) as recommended_price,
      vbr.support,
      vbr.confidence,
      vbr.lift,
      vbr.sample_count,
      'Top bundle for ' || vbr.vehicle_model_name as reason_label
    from ml.vehicle_bundle_rules vbr
    left join app.products cp on cp.id = vbr.recommended_product_id
    left join app.services cs on cs.id = vbr.recommended_service_id
    left join lateral (
      select amount
      from app.product_prices pp
      where pp.product_id = vbr.recommended_product_id
        and pp.price_type = 'retail'
      order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
      limit 1
    ) pp on true
    where vbr.active
      and vehicle_model_id is not null
      and vbr.vehicle_model_name = vehicle_model_id
  )
  select *
  from (
    select * from direct_rules
    union all
    select * from vehicle_rules
  ) recommendations
  order by lift desc, confidence desc, sample_count desc
  limit greatest(limit_count, 1);
$$;

create or replace function public.get_monthly_product_forecasts(target_month date default null)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  target_month date,
  predicted_quantity numeric,
  predicted_revenue numeric,
  trend_label text,
  confidence_label text,
  recent_month_values jsonb
)
language sql
security definer
set search_path = public, app, ml
as $$
  select
    pmf.product_id,
    p.sku,
    p.name,
    pmf.target_month,
    pmf.predicted_quantity,
    pmf.predicted_revenue,
    pmf.trend_label,
    pmf.confidence_label,
    pmf.recent_month_values
  from ml.product_monthly_forecasts pmf
  join app.products p on p.id = pmf.product_id
  where pmf.target_month = coalesce(target_month, (select max(target_month) from ml.product_monthly_forecasts))
  order by pmf.predicted_quantity desc, pmf.predicted_revenue desc;
$$;

create or replace function public.get_monthly_service_forecasts(target_month date default null)
returns table (
  service_id uuid,
  service_code text,
  service_name text,
  target_month date,
  predicted_quantity numeric,
  predicted_revenue numeric,
  trend_label text,
  confidence_label text,
  recent_month_values jsonb
)
language sql
security definer
set search_path = public, app, ml
as $$
  select
    smf.service_id,
    s.code,
    s.name,
    smf.target_month,
    smf.predicted_quantity,
    smf.predicted_revenue,
    smf.trend_label,
    smf.confidence_label,
    smf.recent_month_values
  from ml.service_monthly_forecasts smf
  join app.services s on s.id = smf.service_id
  where smf.target_month = coalesce(target_month, (select max(target_month) from ml.service_monthly_forecasts))
  order by smf.predicted_quantity desc, smf.predicted_revenue desc;
$$;

create or replace function public.get_analytics_dashboard_snapshot()
returns jsonb
language sql
security definer
set search_path = public, app, dw, ml
as $$
  select jsonb_build_object(
    'latestRefresh', (
      select jsonb_build_object(
        'id', ar.id,
        'status', ar.status,
        'startedAt', ar.started_at,
        'endedAt', ar.ended_at,
        'dimensionRows', ar.dimension_rows,
        'factRows', ar.fact_rows,
        'ruleRows', ar.rule_rows,
        'forecastRows', ar.forecast_rows
      )
      from app.analytics_refresh_runs ar
      order by ar.started_at desc
      limit 1
    ),
    'topUpsellOpportunities', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.lift desc), '[]'::jsonb)
      from (
        select *
        from ml.v_top_upsell_opportunities
        order by lift desc, confidence desc
        limit 5
      ) t
    ),
    'predictedLowStockRisk', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from ml.v_predicted_low_stock_risk
        where risk_level in ('critical', 'high', 'medium')
        limit 5
      ) r
    ),
    'topProductForecasts', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from public.get_monthly_product_forecasts(null)
        limit 5
      ) f
    ),
    'topServiceForecasts', (
      select coalesce(jsonb_agg(to_jsonb(f) order by f.predicted_quantity desc), '[]'::jsonb)
      from (
        select *
        from public.get_monthly_service_forecasts(null)
        limit 5
      ) f
    )
  );
$$;

-- FILE: 20260316_000004_seed_and_security.sql
create or replace function app.seed_demo_data()
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_estimate_id uuid;
  v_sale_id uuid;
  v_service_order_id uuid;
  v_month date;
  v_idx integer;
  p_oil_filter uuid;
  p_engine_oil uuid;
  p_drain_washer uuid;
  p_brake_pads uuid;
  p_brake_cleaner uuid;
  p_air_filter uuid;
  p_spark_plugs uuid;
  p_terminal_cleaner uuid;
  s_oil_change uuid;
  s_brake_service uuid;
  s_tune_up uuid;
  s_battery_check uuid;
begin
  if exists (select 1 from app.sales_transactions where transaction_number like 'SALE-DEMO-%') then
    return;
  end if;

  insert into app.products (sku, name, model_name, category, metadata)
  values
    ('LF-OF-001', 'Oil Filter - Xpander', 'XPANDER (2017-PRESENT)', 'Filters', '{"recommended_for":["oil_change"]}'),
    ('LF-EO-004', 'Fully Synthetic Engine Oil 4L', 'XPANDER (2017-PRESENT)', 'Fluids & Oils', '{"recommended_for":["oil_change"]}'),
    ('LF-DW-001', 'Drain Plug Washer', 'XPANDER (2017-PRESENT)', 'General Parts', '{"recommended_for":["oil_change"]}'),
    ('LF-BP-101', 'Brake Pad Front Set', 'MONTERO (2015-PRESENT)', 'Brakes', '{"recommended_for":["brake_service"]}'),
    ('LF-BC-001', 'Brake Cleaner', 'MONTERO (2015-PRESENT)', 'Brakes', '{"recommended_for":["brake_service"]}'),
    ('LF-AF-210', 'Air Filter - Mirage', 'MIRAGE G4 (2012-PRESENT)', 'Filters', '{"recommended_for":["tune_up"]}'),
    ('LF-SP-410', 'Spark Plug Set', 'MIRAGE G4 (2012-PRESENT)', 'Ignition', '{"recommended_for":["tune_up"]}'),
    ('LF-BT-010', 'Battery Terminal Cleaner', 'VARIOUS', 'Electrical', '{"recommended_for":["battery_check"]}')
  on conflict (sku) do nothing;

  select id into p_oil_filter from app.products where sku = 'LF-OF-001';
  select id into p_engine_oil from app.products where sku = 'LF-EO-004';
  select id into p_drain_washer from app.products where sku = 'LF-DW-001';
  select id into p_brake_pads from app.products where sku = 'LF-BP-101';
  select id into p_brake_cleaner from app.products where sku = 'LF-BC-001';
  select id into p_air_filter from app.products where sku = 'LF-AF-210';
  select id into p_spark_plugs from app.products where sku = 'LF-SP-410';
  select id into p_terminal_cleaner from app.products where sku = 'LF-BT-010';

  insert into app.product_prices (product_id, price_type, amount, is_current, effective_from)
  values
    (p_oil_filter, 'retail', 450.00, true, date '2025-10-01'),
    (p_engine_oil, 'retail', 1850.00, true, date '2025-10-01'),
    (p_drain_washer, 'retail', 55.00, true, date '2025-10-01'),
    (p_brake_pads, 'retail', 3200.00, true, date '2025-10-01'),
    (p_brake_cleaner, 'retail', 280.00, true, date '2025-10-01'),
    (p_air_filter, 'retail', 780.00, true, date '2025-10-01'),
    (p_spark_plugs, 'retail', 1680.00, true, date '2025-10-01'),
    (p_terminal_cleaner, 'retail', 240.00, true, date '2025-10-01')
  on conflict do nothing;

  insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location)
  values
    (p_oil_filter, 18, 0, 6, 12, '{"floor":1,"section":"A","shelf":"2"}'),
    (p_engine_oil, 24, 0, 8, 16, '{"floor":1,"section":"A","shelf":"3"}'),
    (p_drain_washer, 60, 0, 15, 30, '{"floor":1,"section":"A","shelf":"1"}'),
    (p_brake_pads, 12, 0, 4, 8, '{"floor":2,"section":"B","shelf":"2"}'),
    (p_brake_cleaner, 22, 0, 6, 12, '{"floor":2,"section":"B","shelf":"3"}'),
    (p_air_filter, 14, 0, 5, 10, '{"floor":1,"section":"C","shelf":"2"}'),
    (p_spark_plugs, 16, 0, 5, 10, '{"floor":1,"section":"C","shelf":"3"}'),
    (p_terminal_cleaner, 10, 0, 4, 8, '{"floor":2,"section":"D","shelf":"1"}')
  on conflict (product_id) do nothing;

  insert into app.services (code, name, description, standard_price, estimated_duration_minutes)
  values
    ('SVC-OIL', 'Comprehensive Oil Change Service', 'Oil, filter, washer replacement and inspection', 650.00, 45),
    ('SVC-BRAKE', 'Brake System Overhaul', 'Brake inspection, cleaning, and pad installation', 1200.00, 90),
    ('SVC-TUNE', 'Engine Diagnostic & Tuning', 'Tune-up with filter and spark plug inspection', 1500.00, 90),
    ('SVC-BATT', 'Battery Check & Terminal Cleaning', 'Battery health check and terminal service', 350.00, 30)
  on conflict (code) do nothing;

  select id into s_oil_change from app.services where code = 'SVC-OIL';
  select id into s_brake_service from app.services where code = 'SVC-BRAKE';
  select id into s_tune_up from app.services where code = 'SVC-TUNE';
  select id into s_battery_check from app.services where code = 'SVC-BATT';

  for v_idx in 0..5 loop
    v_month := (date '2025-10-01' + make_interval(months => v_idx));

    insert into app.customers (customer_type, name, phone, email, business_date)
    values (
      case when v_idx % 3 = 0 then 'repeat' else 'walk_in' end,
      'Demo Customer ' || (v_idx + 1),
      '091700000' || lpad((v_idx + 1)::text, 2, '0'),
      'demo' || (v_idx + 1) || '@limen.test',
      v_month + 2
    )
    returning id into v_customer_id;

    insert into app.vehicles (customer_id, plate_no, make, model_name, year, engine, mileage, business_date)
    values (
      v_customer_id,
      'DEM' || lpad((100 + v_idx)::text, 4, '0'),
      'Mitsubishi',
      case
        when v_idx % 3 = 0 then 'XPANDER (2017-PRESENT)'
        when v_idx % 3 = 1 then 'MONTERO (2015-PRESENT)'
        else 'MIRAGE G4 (2012-PRESENT)'
      end,
      2019 + (v_idx % 4),
      case when v_idx % 2 = 0 then '1.5L' else '2.4L' end,
      20000 + (v_idx * 7500),
      v_month + 2
    )
    returning id into v_vehicle_id;

    insert into app.estimates (
      estimate_number,
      customer_id,
      vehicle_id,
      status,
      source,
      note,
      subtotal,
      discount_total,
      tax_total,
      grand_total,
      issued_at,
      valid_until,
      business_date
    )
    values (
      'EST-DEMO-' || to_char(v_month, 'YYYYMM') || '-A',
      v_customer_id,
      v_vehicle_id,
      'approved',
      'public',
      'Oil service package estimate',
      3005.00 + (v_idx * 65),
      0,
      360.60 + (v_idx * 7.80),
      3365.60 + (v_idx * 72.80),
      (v_month + 2)::timestamp,
      v_month + 9,
      v_month + 2
    )
    returning id into v_estimate_id;

    insert into app.estimate_items (estimate_id, line_type, product_id, quantity, unit_price, line_total, business_date)
    values
      (v_estimate_id, 'product', p_oil_filter, 1, 450.00, 450.00, v_month + 2),
      (v_estimate_id, 'product', p_engine_oil, 1, 1850.00, 1850.00, v_month + 2),
      (v_estimate_id, 'product', p_drain_washer, 1, 55.00, 55.00, v_month + 2),
      (v_estimate_id, 'service', s_oil_change, 1, 650.00, 650.00, v_month + 2);

    insert into app.sales_transactions (
      transaction_number,
      estimate_id,
      customer_id,
      payment_method,
      status,
      subtotal,
      discount_total,
      tax_total,
      total_amount,
      business_date
    )
    values (
      'SALE-DEMO-' || to_char(v_month, 'YYYYMM') || '-A',
      v_estimate_id,
      v_customer_id,
      'cash',
      'completed',
      3005.00 + (v_idx * 65),
      0,
      360.60 + (v_idx * 7.80),
      3365.60 + (v_idx * 72.80),
      v_month + 2
    )
    returning id into v_sale_id;

    insert into app.sales_transaction_items (transaction_id, line_type, product_id, quantity, unit_price, line_total, business_date)
    values
      (v_sale_id, 'product', p_oil_filter, 1, 450.00, 450.00, v_month + 2),
      (v_sale_id, 'product', p_engine_oil, 1 + case when v_idx >= 4 then 1 else 0 end, 1850.00, 1850.00 * (1 + case when v_idx >= 4 then 1 else 0 end), v_month + 2),
      (v_sale_id, 'product', p_drain_washer, 1, 55.00, 55.00, v_month + 2),
      (v_sale_id, 'service', s_oil_change, 1, 650.00, 650.00, v_month + 2);

    insert into app.upsell_interactions (
      context_type,
      context_id,
      product_id,
      recommended_product_id,
      action,
      reason_label,
      business_date
    )
    values
      ('estimate', v_estimate_id, p_oil_filter, p_drain_washer, 'accepted', 'Frequently bought together', v_month + 2),
      ('estimate', v_estimate_id, p_engine_oil, p_oil_filter, 'accepted', 'Frequently bought together', v_month + 2);

    insert into app.estimates (
      estimate_number,
      customer_id,
      vehicle_id,
      status,
      source,
      note,
      subtotal,
      discount_total,
      tax_total,
      grand_total,
      issued_at,
      valid_until,
      business_date
    )
    values (
      'EST-DEMO-' || to_char(v_month, 'YYYYMM') || '-B',
      v_customer_id,
      v_vehicle_id,
      'approved',
      'internal',
      'Brake or tune-up estimate',
      case when v_idx % 2 = 0 then 4680.00 else 3960.00 end,
      0,
      case when v_idx % 2 = 0 then 561.60 else 475.20 end,
      case when v_idx % 2 = 0 then 5241.60 else 4435.20 end,
      (v_month + 15)::timestamp,
      v_month + 22,
      v_month + 15
    )
    returning id into v_estimate_id;

    if v_idx % 2 = 0 then
      insert into app.estimate_items (estimate_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_estimate_id, 'product', p_brake_pads, 1, 3200.00, 3200.00, v_month + 15),
        (v_estimate_id, 'product', p_brake_cleaner, 1, 280.00, 280.00, v_month + 15),
        (v_estimate_id, 'service', s_brake_service, 1, 1200.00, 1200.00, v_month + 15);
    else
      insert into app.estimate_items (estimate_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_estimate_id, 'product', p_air_filter, 1, 780.00, 780.00, v_month + 15),
        (v_estimate_id, 'product', p_spark_plugs, 1, 1680.00, 1680.00, v_month + 15),
        (v_estimate_id, 'service', s_tune_up, 1, 1500.00, 1500.00, v_month + 15);
    end if;

    insert into app.service_orders (
      order_number,
      estimate_id,
      customer_id,
      vehicle_id,
      status,
      note,
      subtotal,
      tax_total,
      total_amount,
      business_date
    )
    values (
      'SVC-DEMO-' || to_char(v_month, 'YYYYMM') || '-B',
      v_estimate_id,
      v_customer_id,
      v_vehicle_id,
      case when v_idx = 5 then 'pending' else 'completed' end,
      'Service package generated from estimate',
      case when v_idx % 2 = 0 then 4480.00 else 3960.00 end,
      case when v_idx % 2 = 0 then 537.60 else 475.20 end,
      case when v_idx % 2 = 0 then 5017.60 else 4435.20 end,
      v_month + 16
    )
    returning id into v_service_order_id;

    if v_idx % 2 = 0 then
      insert into app.service_order_items (service_order_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_service_order_id, 'product', p_brake_pads, 1, 3200.00, 3200.00, v_month + 16),
        (v_service_order_id, 'product', p_brake_cleaner, 1, 280.00, 280.00, v_month + 16),
        (v_service_order_id, 'service', s_brake_service, 1, 1200.00, 1200.00, v_month + 16);

      insert into app.upsell_interactions (
        context_type,
        context_id,
        product_id,
        recommended_product_id,
        action,
        reason_label,
        business_date
      )
      values
        ('service', v_service_order_id, p_brake_pads, p_brake_cleaner, 'accepted', 'Recommended installation add-on', v_month + 16);
    else
      insert into app.service_order_items (service_order_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_service_order_id, 'product', p_air_filter, 1, 780.00, 780.00, v_month + 16),
        (v_service_order_id, 'product', p_spark_plugs, 1, 1680.00, 1680.00, v_month + 16),
        (v_service_order_id, 'service', s_tune_up, 1, 1500.00, 1500.00, v_month + 16);

      insert into app.upsell_interactions (
        context_type,
        context_id,
        product_id,
        recommended_service_id,
        action,
        reason_label,
        business_date
      )
      values
        ('service', v_service_order_id, p_air_filter, s_tune_up, 'shown', 'Recommended service pairing', v_month + 16);
    end if;

    if v_idx in (3, 4, 5) then
      insert into app.sales_transactions (
        transaction_number,
        customer_id,
        payment_method,
        status,
        subtotal,
        discount_total,
        tax_total,
        total_amount,
        business_date
      )
      values (
        'SALE-DEMO-' || to_char(v_month, 'YYYYMM') || '-C',
        v_customer_id,
        'cash',
        'completed',
        590.00,
        0,
        70.80,
        660.80,
        v_month + 24
      )
      returning id into v_sale_id;

      insert into app.sales_transaction_items (transaction_id, line_type, product_id, quantity, unit_price, line_total, business_date)
      values
        (v_sale_id, 'product', p_terminal_cleaner, 1, 240.00, 240.00, v_month + 24),
        (v_sale_id, 'service', s_battery_check, 1, 350.00, 350.00, v_month + 24);

      insert into app.upsell_interactions (
        context_type,
        context_id,
        product_id,
        recommended_service_id,
        action,
        reason_label,
        business_date
      )
      values
        ('sale', v_sale_id, p_terminal_cleaner, s_battery_check, case when v_idx = 5 then 'accepted' else 'shown' end, 'Best upsell candidate this month', v_month + 24);
    end if;
  end loop;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'user_profiles',
    'products',
    'product_prices',
    'inventory_balances',
    'inventory_movements',
    'customers',
    'vehicles',
    'services',
    'estimates',
    'estimate_items',
    'sales_transactions',
    'sales_transaction_items',
    'service_orders',
    'service_order_items',
    'upsell_interactions'
  ] loop
    execute format('drop trigger if exists set_%1$s_updated_at on app.%1$s', tbl);
    execute format('create trigger set_%1$s_updated_at before update on app.%1$s for each row execute function app.touch_updated_at()', tbl);
    execute format('alter table app.%I enable row level security', tbl);
  end loop;

  execute 'alter table app.analytics_refresh_runs enable row level security';
end;
$$;

drop policy if exists user_profiles_self_select on app.user_profiles;
create policy user_profiles_self_select
on app.user_profiles
for select
to authenticated
using (user_id = auth.uid() or app.is_internal_user());

drop policy if exists user_profiles_self_update on app.user_profiles;
create policy user_profiles_self_update
on app.user_profiles
for update
to authenticated
using (user_id = auth.uid() or app.is_admin())
with check (user_id = auth.uid() or app.is_admin());

drop policy if exists user_profiles_self_insert on app.user_profiles;
create policy user_profiles_self_insert
on app.user_profiles
for insert
to authenticated
with check (user_id = auth.uid() or app.is_admin());

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'products',
    'product_prices',
    'inventory_balances',
    'inventory_movements',
    'customers',
    'vehicles',
    'services',
    'estimates',
    'estimate_items',
    'sales_transactions',
    'sales_transaction_items',
    'service_orders',
    'service_order_items',
    'upsell_interactions',
    'analytics_refresh_runs'
  ] loop
    execute format('drop policy if exists %1$s_internal_all on app.%1$s', tbl);
    execute format(
      'create policy %1$s_internal_all on app.%1$s for all to authenticated using (app.is_internal_user()) with check (app.is_internal_user())',
      tbl
    );
  end loop;
end;
$$;

revoke all on schema app from public;
revoke all on schema dw from public;
revoke all on schema ml from public;

grant usage on schema app to authenticated;
grant select, insert, update, delete on all tables in schema app to authenticated;
grant usage, select on all sequences in schema app to authenticated;

revoke execute on function public.create_estimate(jsonb) from public;
revoke execute on function public.convert_estimate_to_sale(uuid, text) from public;
revoke execute on function public.convert_estimate_to_service_order(uuid, uuid) from public;
revoke execute on function public.record_upsell_action(text, uuid, uuid, uuid, uuid, text, uuid, text) from public;
revoke execute on function public.run_full_analytics_refresh(text) from public;
revoke execute on function public.get_product_upsell_recommendations(uuid, text, integer) from public;
revoke execute on function public.get_monthly_product_forecasts(date) from public;
revoke execute on function public.get_monthly_service_forecasts(date) from public;
revoke execute on function public.get_analytics_dashboard_snapshot() from public;

grant execute on function public.create_estimate(jsonb) to anon, authenticated;
grant execute on function public.record_upsell_action(text, uuid, uuid, uuid, uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.get_product_upsell_recommendations(uuid, text, integer) to anon, authenticated;
grant execute on function public.convert_estimate_to_sale(uuid, text) to authenticated;
grant execute on function public.convert_estimate_to_service_order(uuid, uuid) to authenticated;
grant execute on function public.run_full_analytics_refresh(text) to authenticated;
grant execute on function public.get_monthly_product_forecasts(date) to authenticated;
grant execute on function public.get_monthly_service_forecasts(date) to authenticated;
grant execute on function public.get_analytics_dashboard_snapshot() to authenticated;

-- FILE: 20260316_000005_catalog_rpc.sql
create or replace function public.get_product_catalog()
returns table (
  id uuid,
  sku text,
  name text,
  model text,
  category text,
  price numeric,
  stock numeric,
  status text,
  uom text,
  brand text,
  location jsonb
)
language sql
security definer
set search_path = public, app
as $$
  select
    p.id,
    p.sku,
    p.name,
    p.model_name as model,
    p.category,
    coalesce(pp.amount, 0) as price,
    coalesce(ib.on_hand, 0) as stock,
    p.status,
    p.uom,
    p.brand,
    coalesce(ib.location, '{}'::jsonb) as location
  from app.products p
  left join lateral (
    select amount
    from app.product_prices pp
    where pp.product_id = p.id
      and pp.price_type = 'retail'
    order by pp.is_current desc, pp.effective_from desc, pp.created_at desc
    limit 1
  ) pp on true
  left join app.inventory_balances ib on ib.product_id = p.id
  where p.is_active
  order by p.name asc;
$$;

create or replace function public.get_analytics_refresh_runs(limit_count integer default 10)
returns table (
  id uuid,
  status text,
  notes text,
  error_message text,
  dimension_rows integer,
  fact_rows integer,
  rule_rows integer,
  forecast_rows integer,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  select
    ar.id,
    ar.status,
    ar.notes,
    ar.error_message,
    ar.dimension_rows,
    ar.fact_rows,
    ar.rule_rows,
    ar.forecast_rows,
    ar.started_at,
    ar.ended_at
  from app.analytics_refresh_runs ar
  order by ar.started_at desc
  limit greatest(limit_count, 1);
$$;

revoke execute on function public.get_product_catalog() from public;
revoke execute on function public.get_analytics_refresh_runs(integer) from public;

grant execute on function public.get_product_catalog() to anon, authenticated;
grant execute on function public.get_analytics_refresh_runs(integer) to authenticated;

-- FILE: 20260316_000006_user_role_alignment.sql
alter table app.user_profiles
  drop constraint if exists user_profiles_role_check;

alter table app.user_profiles
  add constraint user_profiles_role_check
  check (role in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer'));

create or replace function app.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_role() in ('admin', 'cashier', 'staff', 'stock_clerk');
$$;

-- FILE: 20260316_000007_auth_profile_sync.sql
create or replace function app.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = app, auth, public
as $$
begin
  insert into app.user_profiles (
    user_id,
    email,
    full_name,
    role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    case
      when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
        then new.raw_app_meta_data ->> 'role'
      else 'customer'
    end
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, app.user_profiles.full_name),
    updated_at = timezone('utc', now());

  return new;
end;
$$;

create or replace function app.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = app, auth, public
as $$
begin
  update app.user_profiles
  set
    email = new.email,
    full_name = coalesce(new.raw_user_meta_data ->> 'full_name', app.user_profiles.full_name),
    role = case
      when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
        then new.raw_app_meta_data ->> 'role'
      else app.user_profiles.role
    end,
    updated_at = timezone('utc', now())
  where user_id = new.id;

  if not found then
    insert into app.user_profiles (
      user_id,
      email,
      full_name,
      role
    )
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
      case
        when coalesce(new.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
          then new.raw_app_meta_data ->> 'role'
        else 'customer'
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_auth_user_created();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute function app.handle_auth_user_updated();

insert into app.user_profiles (
  user_id,
  email,
  full_name,
  role
)
select
  au.id,
  au.email,
  coalesce(au.raw_user_meta_data ->> 'full_name', split_part(coalesce(au.email, ''), '@', 1)),
  case
    when coalesce(au.raw_app_meta_data ->> 'role', '') in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
      then au.raw_app_meta_data ->> 'role'
    else 'customer'
  end
from auth.users au
on conflict (user_id) do update
set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, app.user_profiles.full_name),
  role = case
    when excluded.role in ('admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer')
      then excluded.role
    else app.user_profiles.role
  end,
  updated_at = timezone('utc', now());

-- FILE: seed_full.sql
-- Run this after all migrations have been applied.
-- This file combines the generated product catalog seed and the analytics demo seed.

-- Generated from web-app/src/data/productData.js
-- Usage: node supabase/scripts/export-product-seed.mjs > supabase/generated/product_catalog_seed.sql

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MS200124', 'SCREW,LOCK CYLINDER', 'XPANDER (2017-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 19.04, true, current_date from app.products where sku = 'MS200124' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 9.00, 0, 3, 5, '{"floor":2,"section":"B","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MS200124' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CPMW400258', 'PUMP KIT,FUEL', 'XPANDER (2017-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CPMW400258' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 8.00, 0, 2, 4, '{"floor":2,"section":"C","shelf":"3"}'::jsonb, current_date from app.products where sku = 'CPMW400258' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2782A103', 'SPRING,A/T PARKING LEVER', 'XPANDER (2017-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 86.24, true, current_date from app.products where sku = '2782A103' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":1,"section":"D","shelf":"4"}'::jsonb, current_date from app.products where sku = '2782A103' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1555B003', 'COLLAR,EXHAUST MANIFOLD', 'XPANDER (2017-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 336.00, true, current_date from app.products where sku = '1555B003' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"E","shelf":"5"}'::jsonb, current_date from app.products where sku = '1555B003' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1101A015', 'WASHER,CRANKSHAFT PULLEY', 'XPANDER (2017-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 327.04, true, current_date from app.products where sku = '1101A015' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 2.00, 0, 1, 1, '{"floor":2,"section":"F","shelf":"1"}'::jsonb, current_date from app.products where sku = '1101A015' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2921A006', 'O-RING,A/T CASE OIL FILTER', 'XPANDER (2017-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 148.96, true, current_date from app.products where sku = '2921A006' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 25.00, 0, 7, 13, '{"floor":1,"section":"G","shelf":"2"}'::jsonb, current_date from app.products where sku = '2921A006' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1355A520', 'BOLT,RADIATOR', 'XPANDER (2017-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 63.84, true, current_date from app.products where sku = '1355A520' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 38.00, 0, 10, 19, '{"floor":2,"section":"H","shelf":"3"}'::jsonb, current_date from app.products where sku = '1355A520' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MS810969', 'FUSE,CHASSIS WIRING (30A)', 'XPANDER (2017-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 73.92, true, current_date from app.products where sku = 'MS810969' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 31.00, 0, 8, 16, '{"floor":2,"section":"A","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MS810969' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MS240268', 'BOLT,RR DOOR LOCKING', 'XPANDER (2017-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 48.16, true, current_date from app.products where sku = 'MS240268' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":1,"section":"B","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MS240268' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7842A229', 'SCREW,RR A/C', 'XPANDER (2017-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 38.08, true, current_date from app.products where sku = '7842A229' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 37.00, 0, 10, 19, '{"floor":2,"section":"C","shelf":"1"}'::jsonb, current_date from app.products where sku = '7842A229' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MB409439', 'SCREW,STEERING COLUMN COVE', 'XPANDER (2017-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 67.20, true, current_date from app.products where sku = 'MB409439' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 29.00, 0, 8, 15, '{"floor":2,"section":"D","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MB409439' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1822A086', 'SPARK PLUG', 'XPANDER (2017-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1167.04, true, current_date from app.products where sku = '1822A086' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 33.00, 0, 9, 17, '{"floor":1,"section":"E","shelf":"3"}'::jsonb, current_date from app.products where sku = '1822A086' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2348A357', 'CLIP,M/T CLUTCH CONT EQUIP', 'XPANDER (2017-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 82.88, true, current_date from app.products where sku = '2348A357' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 13.00, 0, 4, 7, '{"floor":2,"section":"F","shelf":"4"}'::jsonb, current_date from app.products where sku = '2348A357' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN106321', 'SCREW,DOOR LAMP SWITCH', 'XPANDER (2017-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 60.48, true, current_date from app.products where sku = 'MN106321' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 33.00, 0, 9, 17, '{"floor":2,"section":"G","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MN106321' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2782A101', 'SHAFT,A/T PARKING PAWL', 'XPANDER (2017-PRESENT)', 'Transmission', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 299.04, true, current_date from app.products where sku = '2782A101' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 10.00, 0, 3, 5, '{"floor":1,"section":"H","shelf":"1"}'::jsonb, current_date from app.products where sku = '2782A101' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR478263', 'GROMMET,DRIP MOULDING', 'XPANDER (2017-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 95.20, true, current_date from app.products where sku = 'MR478263' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 43.00, 0, 11, 22, '{"floor":2,"section":"A","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MR478263' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF913160', 'BOLT,BRAKE BOOSTER', 'XPANDER (2017-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 60.48, true, current_date from app.products where sku = 'MF913160' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 8.00, 0, 2, 4, '{"floor":2,"section":"B","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MF913160' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('26120W010P', 'LAMP ASSY,FOG,FR', 'MONTERO (2015-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 5723.20, true, current_date from app.products where sku = '26120W010P' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 38.00, 0, 10, 19, '{"floor":1,"section":"C","shelf":"4"}'::jsonb, current_date from app.products where sku = '26120W010P' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF140208', 'BOLT,CYLINDER BLOCK', 'MONTERO CR45 (2008-2015)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 57.12, true, current_date from app.products where sku = 'MF140208' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 5.00, 0, 2, 3, '{"floor":2,"section":"D","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MF140208' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('6958A087', 'BOLT,3RD SEAT', 'MONTERO CR45 (2008-2015)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 14.56, true, current_date from app.products where sku = '6958A087' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 43.00, 0, 11, 22, '{"floor":2,"section":"E","shelf":"1"}'::jsonb, current_date from app.products where sku = '6958A087' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CP5802A709', 'SPRING,SET GAS', 'MONTERO CR45 (2008-2015)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CP5802A709' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 3.00, 0, 1, 2, '{"floor":1,"section":"F","shelf":"2"}'::jsonb, current_date from app.products where sku = 'CP5802A709' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1570A178', 'BRACKET,EXHAUST FR PIPE', 'MONTERO CR45 (2008-2015)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 257.60, true, current_date from app.products where sku = '1570A178' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"G","shelf":"3"}'::jsonb, current_date from app.products where sku = '1570A178' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8701A062', 'BRACKET,AUDIO EQUIP', 'MONTERO CR45 (2008-2015)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 151.20, true, current_date from app.products where sku = '8701A062' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"H","shelf":"4"}'::jsonb, current_date from app.products where sku = '8701A062' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN119812', 'WASHER,CRANKSHAFT PULLEY', 'MONTERO CR45 (2008-2015)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 264.32, true, current_date from app.products where sku = 'MN119812' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 40.00, 0, 10, 20, '{"floor":1,"section":"A","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MN119812' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8503A088', 'HARNESS,FUEL FILTER SENSOR', 'MONTERO CR45 (2008-2015)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 256.48, true, current_date from app.products where sku = '8503A088' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":2,"section":"B","shelf":"1"}'::jsonb, current_date from app.products where sku = '8503A088' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1370A249', 'CLIP,RADIATOR PIPING', 'MONTERO CR45 (2008-2015)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 115.36, true, current_date from app.products where sku = '1370A249' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":2,"section":"C","shelf":"2"}'::jsonb, current_date from app.products where sku = '1370A249' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2340A104', 'BUSHING,CLUTCH PEDAL', 'MONTERO CR45 (2008-2015)', 'Clutch', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 204.96, true, current_date from app.products where sku = '2340A104' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 37.00, 0, 10, 19, '{"floor":1,"section":"D","shelf":"3"}'::jsonb, current_date from app.products where sku = '2340A104' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5729A004', 'PLUG,FR DOOR', 'MONTERO CR45 (2008-2015)', 'Body Parts', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 53.76, true, current_date from app.products where sku = '5729A004' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 22.00, 0, 6, 11, '{"floor":2,"section":"E","shelf":"4"}'::jsonb, current_date from app.products where sku = '5729A004' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR360998', 'O-RING,A/C PIPING', 'MONTERO CR45 (2008-2015)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 49.28, true, current_date from app.products where sku = 'MR360998' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 40.00, 0, 10, 20, '{"floor":2,"section":"F","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MR360998' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8475A004', 'BULB,INST PANEL SWITCH', 'MONTERO CR45 (2008-2015)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 99.68, true, current_date from app.products where sku = '8475A004' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":1,"section":"G","shelf":"1"}'::jsonb, current_date from app.products where sku = '8475A004' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7430A161', 'LABEL,FUSE', 'MONTERO CR45 (2008-2015)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 101.92, true, current_date from app.products where sku = '7430A161' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 46.00, 0, 12, 23, '{"floor":2,"section":"H","shelf":"2"}'::jsonb, current_date from app.products where sku = '7430A161' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1863A001', 'BRACKET,GLOW PLUG RELAY', 'MONTERO CR45 (2008-2015)', 'Ignition', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 399.84, true, current_date from app.products where sku = '1863A001' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 10.00, 0, 3, 5, '{"floor":2,"section":"A","shelf":"3"}'::jsonb, current_date from app.products where sku = '1863A001' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR111091', 'GEAR,SPEEDOMETER DRIVEN', 'MONTERO CR45 (2008-2015)', 'Transmission', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1908.48, true, current_date from app.products where sku = 'MR111091' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":1,"section":"B","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MR111091' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4600A104', 'SNAP RING,RR BRAKE', 'MONTERO CR45 (2008-2015)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 49.28, true, current_date from app.products where sku = '4600A104' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 1.00, 0, 1, 1, '{"floor":2,"section":"C","shelf":"5"}'::jsonb, current_date from app.products where sku = '4600A104' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8050A186', 'GARNISH,I/PNL,CTR', 'MONTERO CR45 (2008-2015)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 85.12, true, current_date from app.products where sku = '8050A186' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 11.00, 0, 3, 6, '{"floor":2,"section":"D","shelf":"1"}'::jsonb, current_date from app.products where sku = '8050A186' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('ME193855', 'OIL JET,TIMING GEAR CASE', 'MONTERO CR45 (2008-2015)', 'Fluids & Oils', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 4887.68, true, current_date from app.products where sku = 'ME193855' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 18.00, 0, 5, 9, '{"floor":1,"section":"E","shelf":"2"}'::jsonb, current_date from app.products where sku = 'ME193855' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF241226', 'BOLT,CYLINDER HEAD', 'STRADA SU (2015-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 64.96, true, current_date from app.products where sku = 'MF241226' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"F","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MF241226' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('BL000002', 'NUTS AND BOLTS', 'STRADA SU (2015-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'BL000002' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 6.00, 0, 2, 3, '{"floor":2,"section":"G","shelf":"4"}'::jsonb, current_date from app.products where sku = 'BL000002' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1340A194', 'BELT,ALTERNATOR & OTHERS', 'STRADA SU (2015-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 498.40, true, current_date from app.products where sku = '1340A194' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 17.00, 0, 5, 9, '{"floor":1,"section":"H","shelf":"5"}'::jsonb, current_date from app.products where sku = '1340A194' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF243660', 'BOLT,RADIATOR', 'STRADA SU (2015-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 99.68, true, current_date from app.products where sku = 'MF243660' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 47.00, 0, 12, 24, '{"floor":2,"section":"A","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MF243660' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('6400J260', 'CLIP,RR BUMPER', 'STRADA SU (2015-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 51.52, true, current_date from app.products where sku = '6400J260' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 41.00, 0, 11, 21, '{"floor":2,"section":"B","shelf":"2"}'::jsonb, current_date from app.products where sku = '6400J260' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1570B869', 'PIPE,EXHAUST,FR', 'STRADA SU (2015-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 4024.16, true, current_date from app.products where sku = '1570B869' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 44.00, 0, 11, 22, '{"floor":1,"section":"C","shelf":"3"}'::jsonb, current_date from app.products where sku = '1570B869' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR568456', 'O-RING,A/C PIPING', 'STRADA SU (2015-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 88.48, true, current_date from app.products where sku = 'MR568456' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 38.00, 0, 10, 19, '{"floor":2,"section":"D","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MR568456' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7821A137', 'BULB,HEATER CONTROL PANEL', 'STRADA SU (2015-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 86.24, true, current_date from app.products where sku = '7821A137' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 22.00, 0, 6, 11, '{"floor":2,"section":"E","shelf":"5"}'::jsonb, current_date from app.products where sku = '7821A137' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MZ691066', 'CABIN AIR FILTER', 'STRADA SU (2015-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 566.72, true, current_date from app.products where sku = 'MZ691066' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 16.00, 0, 4, 8, '{"floor":1,"section":"F","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MZ691066' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF911698', 'BOLT,STARTER', 'STRADA SU (2015-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 161.28, true, current_date from app.products where sku = 'MF911698' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 48.00, 0, 12, 24, '{"floor":2,"section":"G","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MF911698' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7812A131', 'BRACKET,A/C CONDENSER', 'STRADA SU (2015-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 172.48, true, current_date from app.products where sku = '7812A131' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 48.00, 0, 12, 24, '{"floor":2,"section":"H","shelf":"3"}'::jsonb, current_date from app.products where sku = '7812A131' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8541F771', 'HARN,GLOW PLUG CONT RELAY', 'STRADA SU (2015-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 940.80, true, current_date from app.products where sku = '8541F771' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":1,"section":"A","shelf":"4"}'::jsonb, current_date from app.products where sku = '8541F771' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2345A075', 'RESERVOIR,CLUTCH FLUID', 'STRADA SU (2015-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 146.72, true, current_date from app.products where sku = '2345A075' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 3.00, 0, 1, 2, '{"floor":2,"section":"B","shelf":"5"}'::jsonb, current_date from app.products where sku = '2345A075' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2782A022', 'SHAFT,A/T PARKING PAWL', 'STRADA SU (2015-PRESENT)', 'Transmission', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 528.64, true, current_date from app.products where sku = '2782A022' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 5.00, 0, 2, 3, '{"floor":2,"section":"C","shelf":"1"}'::jsonb, current_date from app.products where sku = '2782A022' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4152A020', 'BUSHING,RR SUSP SPRING', 'STRADA SU (2015-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 79.52, true, current_date from app.products where sku = '4152A020' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 3.00, 0, 1, 2, '{"floor":1,"section":"D","shelf":"2"}'::jsonb, current_date from app.products where sku = '4152A020' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4600A495', 'PIN,RR BRAKE', 'STRADA SU (2015-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 85.12, true, current_date from app.products where sku = '4600A495' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 31.00, 0, 8, 16, '{"floor":2,"section":"E","shelf":"3"}'::jsonb, current_date from app.products where sku = '4600A495' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('BL000001', 'MOULDING', 'STRADA SU (2015-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'BL000001' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 1.00, 0, 1, 1, '{"floor":2,"section":"F","shelf":"4"}'::jsonb, current_date from app.products where sku = 'BL000001' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF660036', 'GASKET,ROCKER COVER (10)', 'STRADA CR (2005-2013)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 84.00, true, current_date from app.products where sku = 'MF660036' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 4.00, 0, 1, 2, '{"floor":1,"section":"G","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MF660036' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CP7030A879', 'INFLATOR KIT, AIR BAG', 'STRADA CR (2005-2013)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CP7030A879' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 1.00, 0, 1, 1, '{"floor":2,"section":"H","shelf":"1"}'::jsonb, current_date from app.products where sku = 'CP7030A879' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1225A052', 'TUBE,EXHAUST CAMSHAFT OIL', 'STRADA CR (2005-2013)', 'Exhaust', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 290.08, true, current_date from app.products where sku = '1225A052' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 40.00, 0, 10, 20, '{"floor":2,"section":"A","shelf":"2"}'::jsonb, current_date from app.products where sku = '1225A052' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MB958692', 'BELT,A/C (VSP-MZ690290)', 'STRADA CR (2005-2013)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 646.24, true, current_date from app.products where sku = 'MB958692' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 29.00, 0, 8, 15, '{"floor":1,"section":"B","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MB958692' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8002A290', 'BRACKET,INSTRUMENT PANEL', 'STRADA CR (2005-2013)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 128.80, true, current_date from app.products where sku = '8002A290' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 45.00, 0, 12, 23, '{"floor":2,"section":"C","shelf":"4"}'::jsonb, current_date from app.products where sku = '8002A290' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1770A050', 'PROTECTOR,FUEL FILTER', 'STRADA CR (2005-2013)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1219.68, true, current_date from app.products where sku = '1770A050' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":2,"section":"D","shelf":"5"}'::jsonb, current_date from app.products where sku = '1770A050' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN171605', 'SEAL,RADIATOR CONDENSER TANK', 'STRADA CR (2005-2013)', 'Cooling', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 104.16, true, current_date from app.products where sku = 'MN171605' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 18.00, 0, 5, 9, '{"floor":1,"section":"E","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MN171605' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8558A893', 'BRACKET,BATTERY', 'STRADA CR (2005-2013)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 178.08, true, current_date from app.products where sku = '8558A893' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"F","shelf":"2"}'::jsonb, current_date from app.products where sku = '8558A893' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1820A009', 'GLOW PLUG', 'STRADA CR (2005-2013)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 2110.08, true, current_date from app.products where sku = '1820A009' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 26.00, 0, 7, 13, '{"floor":2,"section":"G","shelf":"3"}'::jsonb, current_date from app.products where sku = '1820A009' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN171260', 'BOOT,CLUTCH RELEASE FORK', 'STRADA CR (2005-2013)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 115.36, true, current_date from app.products where sku = 'MN171260' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 23.00, 0, 6, 12, '{"floor":1,"section":"H","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MN171260' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2590A134', 'SPRING,M/T GEARSHIFT EQUIP', 'STRADA CR (2005-2013)', 'Suspension', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 47.04, true, current_date from app.products where sku = '2590A134' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":2,"section":"A","shelf":"5"}'::jsonb, current_date from app.products where sku = '2590A134' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2526A016', 'GEAR, MT O/PUT SHAFT 5TH SPEED', 'STRADA CR (2005-2013)', 'Transmission', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 3459.68, true, current_date from app.products where sku = '2526A016' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 2.00, 0, 1, 1, '{"floor":2,"section":"B","shelf":"1"}'::jsonb, current_date from app.products where sku = '2526A016' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4600A138', 'RETAINER, RR BRAKE', 'STRADA CR (2005-2013)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 90.72, true, current_date from app.products where sku = '4600A138' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":1,"section":"C","shelf":"2"}'::jsonb, current_date from app.products where sku = '4600A138' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8395A055', 'SOCKET,FR LAMP', 'STRADA CR (2005-2013)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 169.12, true, current_date from app.products where sku = '8395A055' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 36.00, 0, 9, 18, '{"floor":2,"section":"D","shelf":"3"}'::jsonb, current_date from app.products where sku = '8395A055' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5725A075', 'CLIP,FR DOOR', 'STRADA CR (2005-2013)', 'Body Parts', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 53.76, true, current_date from app.products where sku = '5725A075' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 48.00, 0, 12, 24, '{"floor":2,"section":"E","shelf":"4"}'::jsonb, current_date from app.products where sku = '5725A075' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8558A031HA', 'GARNISH,CLOCK', 'STRADA CR (2005-2013)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 38.08, true, current_date from app.products where sku = '8558A031HA' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 9.00, 0, 3, 5, '{"floor":1,"section":"F","shelf":"5"}'::jsonb, current_date from app.products where sku = '8558A031HA' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN123604', 'HOSE,A/C EVAPORATOR DRAIN', 'STRADA CR (2005-2013)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 372.96, true, current_date from app.products where sku = 'MN123604' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":2,"section":"G","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MN123604' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF911140', 'BOLT,CYLINDER BLOCK', 'MIRAGE G4 (2012-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 31.36, true, current_date from app.products where sku = 'MF911140' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 44.00, 0, 11, 22, '{"floor":2,"section":"H","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MF911140' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1748A246', 'CLIP,FUEL LINE', 'MIRAGE G4 (2012-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 20.16, true, current_date from app.products where sku = '1748A246' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 30.00, 0, 8, 15, '{"floor":1,"section":"A","shelf":"3"}'::jsonb, current_date from app.products where sku = '1748A246' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5736A401', 'W/STRIP,RR DOOR BELT,INR L', 'MIRAGE G4 (2012-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 928.48, true, current_date from app.products where sku = '5736A401' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 10.00, 0, 3, 5, '{"floor":2,"section":"B","shelf":"4"}'::jsonb, current_date from app.products where sku = '5736A401' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1300A108', 'O-RING,WATER PUMP', 'MIRAGE G4 (2012-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 147.84, true, current_date from app.products where sku = '1300A108' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"C","shelf":"5"}'::jsonb, current_date from app.products where sku = '1300A108' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5740A196', 'PAD,RR DOOR INR PANEL', 'MIRAGE G4 (2012-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 35.84, true, current_date from app.products where sku = '5740A196' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":1,"section":"D","shelf":"1"}'::jsonb, current_date from app.products where sku = '5740A196' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8558B181', 'BRACKET,INLET MANIFOLD', 'MIRAGE G4 (2012-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 140.00, true, current_date from app.products where sku = '8558B181' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 29.00, 0, 8, 15, '{"floor":2,"section":"E","shelf":"2"}'::jsonb, current_date from app.products where sku = '8558B181' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7810A044', 'BOLT,A/C', 'MIRAGE G4 (2012-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 40.32, true, current_date from app.products where sku = '7810A044' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 5.00, 0, 2, 3, '{"floor":2,"section":"F","shelf":"3"}'::jsonb, current_date from app.products where sku = '7810A044' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1577A415', 'BOLT,EXHAUST PIPE', 'MIRAGE G4 (2012-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 87.36, true, current_date from app.products where sku = '1577A415' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 36.00, 0, 9, 18, '{"floor":1,"section":"G","shelf":"4"}'::jsonb, current_date from app.products where sku = '1577A415' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8002B467XA', 'LID,INST PANEL FUSE BOX', 'MIRAGE G4 (2012-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 174.72, true, current_date from app.products where sku = '8002B467XA' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 12.00, 0, 3, 6, '{"floor":2,"section":"H","shelf":"5"}'::jsonb, current_date from app.products where sku = '8002B467XA' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7821A126', 'BULB,HEATER CONTROL PANEL', 'MIRAGE G4 (2012-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 70.56, true, current_date from app.products where sku = '7821A126' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 4.00, 0, 1, 2, '{"floor":2,"section":"A","shelf":"1"}'::jsonb, current_date from app.products where sku = '7821A126' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8606A002', 'SWITCH,CLUTCH', 'MIRAGE G4 (2012-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 580.16, true, current_date from app.products where sku = '8606A002' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 23.00, 0, 6, 12, '{"floor":1,"section":"B","shelf":"2"}'::jsonb, current_date from app.products where sku = '8606A002' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2528A439', 'GEAR,M/T OUTPUT SHAFT 3RD', 'MIRAGE G4 (2012-PRESENT)', 'Transmission', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 2521.12, true, current_date from app.products where sku = '2528A439' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":2,"section":"C","shelf":"3"}'::jsonb, current_date from app.products where sku = '2528A439' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2585A032', 'SPRING,M/T GEARSHIFT EQUIP', 'MIRAGE G4 (2012-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 49.28, true, current_date from app.products where sku = '2585A032' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 31.00, 0, 8, 16, '{"floor":2,"section":"D","shelf":"4"}'::jsonb, current_date from app.products where sku = '2585A032' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('288B4W040P', 'BLADE,WINDSHIELD WIPER,LH', 'MIRAGE G4 (2012-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 224.00, true, current_date from app.products where sku = '288B4W040P' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":1,"section":"E","shelf":"5"}'::jsonb, current_date from app.products where sku = '288B4W040P' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2921A007', 'OIL FILTER,A/T CASE', 'MIRAGE G4 (2012-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 390.88, true, current_date from app.products where sku = '2921A007' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 43.00, 0, 11, 22, '{"floor":2,"section":"F","shelf":"1"}'::jsonb, current_date from app.products where sku = '2921A007' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CP4650B874', 'CLIP,BRAKE FLUID LINE', 'MIRAGE G4 (2012-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CP4650B874' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"G","shelf":"2"}'::jsonb, current_date from app.products where sku = 'CP4650B874' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF201523', 'SCREW,SPARK PLUG CABLE', 'MIRAGE G4 (2012-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 154.56, true, current_date from app.products where sku = 'MF201523' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 44.00, 0, 11, 22, '{"floor":1,"section":"H","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MF201523' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF244824', 'BOLT,CRANKSHAFT', 'MIRAGE HB (2012-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 51.52, true, current_date from app.products where sku = 'MF244824' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 35.00, 0, 9, 18, '{"floor":2,"section":"A","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MF244824' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1010A412', 'RETAINER,VALVE SPRING', 'MIRAGE HB (2012-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 95.20, true, current_date from app.products where sku = '1010A412' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"B","shelf":"5"}'::jsonb, current_date from app.products where sku = '1010A412' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1577A390', 'HANGER,EXHAUST MUFFLER', 'MIRAGE HB (2012-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 271.04, true, current_date from app.products where sku = '1577A390' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 38.00, 0, 10, 19, '{"floor":1,"section":"C","shelf":"1"}'::jsonb, current_date from app.products where sku = '1577A390' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF911060', 'BOLT,ENG CONTROL UNIT', 'MIRAGE HB (2012-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 38.08, true, current_date from app.products where sku = 'MF911060' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":2,"section":"D","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MF911060' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1340A128', 'BELT,ALTERNATOR & OTHERS', 'MIRAGE HB (2012-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 766.08, true, current_date from app.products where sku = '1340A128' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 17.00, 0, 5, 9, '{"floor":2,"section":"E","shelf":"3"}'::jsonb, current_date from app.products where sku = '1340A128' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1120A069', 'RING GEAR,FLYWHEEL', 'MIRAGE HB (2012-PRESENT)', 'Transmission', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 6147.68, true, current_date from app.products where sku = '1120A069' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 24.00, 0, 6, 12, '{"floor":1,"section":"F","shelf":"4"}'::jsonb, current_date from app.products where sku = '1120A069' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('PA1351A054', 'INSULATOR,RADIATOR SUPPORT,UPR', 'MIRAGE HB (2012-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 124.32, true, current_date from app.products where sku = 'PA1351A054' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":2,"section":"G","shelf":"5"}'::jsonb, current_date from app.products where sku = 'PA1351A054' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5729A053', 'PAD,FR DOOR INR PANEL', 'MIRAGE HB (2012-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 38.08, true, current_date from app.products where sku = '5729A053' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":2,"section":"H","shelf":"1"}'::jsonb, current_date from app.products where sku = '5729A053' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7815A987', 'CLIP, A/C PIPING', 'MIRAGE HB (2012-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 86.24, true, current_date from app.products where sku = '7815A987' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 27.00, 0, 7, 14, '{"floor":1,"section":"A","shelf":"2"}'::jsonb, current_date from app.products where sku = '7815A987' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('DP010713', 'MOTOLITE SERVICE BATTERY [NS40', 'MIRAGE HB (2012-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'DP010713' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":2,"section":"B","shelf":"3"}'::jsonb, current_date from app.products where sku = 'DP010713' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1822A152', 'SPARK PLUG', 'MIRAGE HB (2012-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1321.60, true, current_date from app.products where sku = '1822A152' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 26.00, 0, 7, 13, '{"floor":2,"section":"C","shelf":"4"}'::jsonb, current_date from app.products where sku = '1822A152' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF913110', 'BOLT,FREEWHEEL CLUTCH CONT', 'MIRAGE HB (2012-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 41.44, true, current_date from app.products where sku = 'MF913110' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 13.00, 0, 4, 7, '{"floor":1,"section":"D","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MF913110' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2824A021', 'OIL FILTER,A/T VALVE BODY', 'MIRAGE HB (2012-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 776.16, true, current_date from app.products where sku = '2824A021' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 31.00, 0, 8, 16, '{"floor":2,"section":"E","shelf":"1"}'::jsonb, current_date from app.products where sku = '2824A021' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8558A932', 'BRACKET,A/T HARNESS', 'MIRAGE HB (2012-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 131.04, true, current_date from app.products where sku = '8558A932' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 48.00, 0, 12, 24, '{"floor":2,"section":"F","shelf":"2"}'::jsonb, current_date from app.products where sku = '8558A932' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MB870930', 'NUT,RR BRAKE', 'MIRAGE HB (2012-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 82.88, true, current_date from app.products where sku = 'MB870930' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 28.00, 0, 7, 14, '{"floor":1,"section":"G","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MB870930' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8341A171', 'LENS,LICENSE PLATE LAMP', 'MIRAGE HB (2012-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 79.52, true, current_date from app.products where sku = '8341A171' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 17.00, 0, 5, 9, '{"floor":2,"section":"H","shelf":"4"}'::jsonb, current_date from app.products where sku = '8341A171' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8253A103', 'GROMMET,RR WINDOW WIPER', 'MIRAGE HB (2012-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 123.20, true, current_date from app.products where sku = '8253A103' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":2,"section":"A","shelf":"5"}'::jsonb, current_date from app.products where sku = '8253A103' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN187145', 'GASKET,F/INJ NOZZLE HOLDER', 'PAJERO (2006-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 44.80, true, current_date from app.products where sku = 'MN187145' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 15.00, 0, 4, 8, '{"floor":1,"section":"B","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MN187145' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CP7030A829', 'INFLATOR KIT, AIR BAG', 'PAJERO (2006-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CP7030A829' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 11.00, 0, 3, 6, '{"floor":2,"section":"C","shelf":"2"}'::jsonb, current_date from app.products where sku = 'CP7030A829' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1010A330', 'SPRING,EXHAUST VALVE', 'PAJERO (2006-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 184.80, true, current_date from app.products where sku = '1010A330' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":2,"section":"D","shelf":"3"}'::jsonb, current_date from app.products where sku = '1010A330' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR529713', 'GASKET,CATALYTIC CONVERTER', 'PAJERO (2006-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 285.60, true, current_date from app.products where sku = 'MR529713' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 32.00, 0, 8, 16, '{"floor":1,"section":"E","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MR529713' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1125A218', 'GEAR,BAL SHAFT DRVN,L', 'PAJERO (2006-PRESENT)', 'Transmission', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 7912.80, true, current_date from app.products where sku = '1125A218' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 30.00, 0, 8, 15, '{"floor":2,"section":"F","shelf":"5"}'::jsonb, current_date from app.products where sku = '1125A218' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1141A045', 'TENSIONER,TIMING CHAIN', 'PAJERO (2006-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 2825.76, true, current_date from app.products where sku = '1141A045' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 30.00, 0, 8, 15, '{"floor":2,"section":"G","shelf":"1"}'::jsonb, current_date from app.products where sku = '1141A045' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1770A076', 'SENSOR,FUEL FILTER', 'PAJERO (2006-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 3240.16, true, current_date from app.products where sku = '1770A076' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 48.00, 0, 12, 24, '{"floor":1,"section":"H","shelf":"2"}'::jsonb, current_date from app.products where sku = '1770A076' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1375A212', 'HOSE,RADIATOR COND TANK', 'PAJERO (2006-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 131.04, true, current_date from app.products where sku = '1375A212' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 36.00, 0, 9, 18, '{"floor":2,"section":"A","shelf":"3"}'::jsonb, current_date from app.products where sku = '1375A212' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7801A412', 'THERMISTOR,A/C', 'PAJERO (2006-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 639.52, true, current_date from app.products where sku = '7801A412' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":2,"section":"B","shelf":"4"}'::jsonb, current_date from app.products where sku = '7801A412' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8652A011', 'BRKT,RR SUSP HEIGHT SENSOR', 'PAJERO (2006-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 255.36, true, current_date from app.products where sku = '8652A011' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 22.00, 0, 6, 11, '{"floor":1,"section":"C","shelf":"5"}'::jsonb, current_date from app.products where sku = '8652A011' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MS241187', 'BOLT,HEADLAMP', 'PAJERO (2006-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 109.76, true, current_date from app.products where sku = 'MS241187' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 28.00, 0, 7, 14, '{"floor":2,"section":"D","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MS241187' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2721A048', 'SNAP RING,A/T CLUTCH', 'PAJERO (2006-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 106.40, true, current_date from app.products where sku = '2721A048' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 43.00, 0, 11, 22, '{"floor":2,"section":"E","shelf":"2"}'::jsonb, current_date from app.products where sku = '2721A048' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4605A466', 'CLIP,FR BRAKE', 'PAJERO (2006-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 123.20, true, current_date from app.products where sku = '4605A466' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 41.00, 0, 11, 21, '{"floor":1,"section":"F","shelf":"3"}'::jsonb, current_date from app.products where sku = '4605A466' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5370B329', 'BRACKET,FR MUD GUARD,LH', 'PAJERO (2006-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 218.40, true, current_date from app.products where sku = '5370B329' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":2,"section":"G","shelf":"4"}'::jsonb, current_date from app.products where sku = '5370B329' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MS450973', 'SCREW,RR BUMPER', 'PAJERO (2006-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 109.76, true, current_date from app.products where sku = 'MS450973' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":2,"section":"H","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MS450973' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7405A505', 'GARNISH,FR DECK SIDE,LH', 'PAJERO (2006-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 274.40, true, current_date from app.products where sku = '7405A505' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 33.00, 0, 9, 17, '{"floor":1,"section":"A","shelf":"1"}'::jsonb, current_date from app.products where sku = '7405A505' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('11561A000P', 'BOLT,CYLINDER BLOCK', 'TRITON (2023-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 26.88, true, current_date from app.products where sku = '11561A000P' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":2,"section":"B","shelf":"2"}'::jsonb, current_date from app.products where sku = '11561A000P' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('6979A542', 'NUT,RR SEAT', 'TRITON (2023-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 10.08, true, current_date from app.products where sku = '6979A542' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":2,"section":"C","shelf":"3"}'::jsonb, current_date from app.products where sku = '6979A542' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MU001794', 'WASHER,RR SUSP SPRING', 'TRITON (2023-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 40.32, true, current_date from app.products where sku = 'MU001794' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":1,"section":"D","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MU001794' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1018A083', 'GEAR,BALANCER SHAFT DRIVE', 'TRITON (2023-PRESENT)', 'Transmission', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1090.88, true, current_date from app.products where sku = '1018A083' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 6.00, 0, 2, 3, '{"floor":2,"section":"E","shelf":"5"}'::jsonb, current_date from app.products where sku = '1018A083' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1555B094', 'BOLT,CATALYTIC CONVERTER', 'TRITON (2023-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 23.52, true, current_date from app.products where sku = '1555B094' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"F","shelf":"1"}'::jsonb, current_date from app.products where sku = '1555B094' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1101A044', 'WASHER,CRANKSHAFT PULLEY', 'TRITON (2023-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 359.52, true, current_date from app.products where sku = '1101A044' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 40.00, 0, 10, 20, '{"floor":1,"section":"G","shelf":"2"}'::jsonb, current_date from app.products where sku = '1101A044' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('11066A000P', 'NUT,GLOW PLUG COV SETTING', 'TRITON (2023-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 49.28, true, current_date from app.products where sku = '11066A000P' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 16.00, 0, 4, 8, '{"floor":2,"section":"H","shelf":"3"}'::jsonb, current_date from app.products where sku = '11066A000P' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MU001935', 'CLIP,RELAY', 'TRITON (2023-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 26.88, true, current_date from app.products where sku = 'MU001935' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 47.00, 0, 12, 24, '{"floor":2,"section":"A","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MU001935' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF911343', 'BOLT,A/C COMPRESSOR', 'TRITON (2023-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 36.96, true, current_date from app.products where sku = 'MF911343' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":1,"section":"B","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MF911343' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1230A225', 'GASKET,OIL FILTER BRACKET', 'TRITON (2023-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 131.04, true, current_date from app.products where sku = '1230A225' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"C","shelf":"1"}'::jsonb, current_date from app.products where sku = '1230A225' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MS240126', 'BOLT,RADIATOR COND TANK', 'TRITON (2023-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 56.00, true, current_date from app.products where sku = 'MS240126' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 8.00, 0, 2, 4, '{"floor":2,"section":"D","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MS240126' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8558B422', 'BRACKET,A/T HARNESS', 'TRITON (2023-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 33.60, true, current_date from app.products where sku = '8558B422' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 6.00, 0, 2, 3, '{"floor":1,"section":"E","shelf":"3"}'::jsonb, current_date from app.products where sku = '8558B422' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MU001368', 'GROMMET,TAIL LAMP', 'TRITON (2023-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 71.68, true, current_date from app.products where sku = 'MU001368' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"F","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MU001368' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF911245', 'BOLT,M/T CLUTCH CONT EQUIP', 'TRITON (2023-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 60.48, true, current_date from app.products where sku = 'MF911245' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 43.00, 0, 11, 22, '{"floor":2,"section":"G","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MF911245' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MU001516', 'PLUG,FR DOOR', 'TRITON (2023-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 38.08, true, current_date from app.products where sku = 'MU001516' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 17.00, 0, 5, 9, '{"floor":1,"section":"H","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MU001516' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4650B995', 'CLIP,BRAKE FLUID LINE', 'TRITON (2023-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 36.96, true, current_date from app.products where sku = '4650B995' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"A","shelf":"2"}'::jsonb, current_date from app.products where sku = '4650B995' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('96309A010P', 'SCREW,RR VIEW MIRROR', 'TRITON (2023-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 19.04, true, current_date from app.products where sku = '96309A010P' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 3.00, 0, 1, 2, '{"floor":2,"section":"B","shelf":"3"}'::jsonb, current_date from app.products where sku = '96309A010P' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MS101204', 'BOLT,A/T VALVE BODY INR', 'XFORCE (2024-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 45.92, true, current_date from app.products where sku = 'MS101204' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 41.00, 0, 11, 21, '{"floor":1,"section":"C","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MS101204' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF911346', 'BOLT,TAILGATE GAS SPRING', 'XFORCE (2024-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 56.00, true, current_date from app.products where sku = 'MF911346' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 21.00, 0, 6, 11, '{"floor":2,"section":"D","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MF911346' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF913017', 'BOLT,FLOOR CONSOLE', 'XFORCE (2024-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 15.68, true, current_date from app.products where sku = 'MF913017' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 48.00, 0, 12, 24, '{"floor":2,"section":"E","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MF913017' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('80834B010P', 'W/STRIP,FR DOOR BELT,INR R', 'XFORCE (2024-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1814.40, true, current_date from app.products where sku = '80834B010P' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":1,"section":"F","shelf":"2"}'::jsonb, current_date from app.products where sku = '80834B010P' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1230A236', 'GASKET,OIL FILTER BRACKET', 'XFORCE (2024-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 156.80, true, current_date from app.products where sku = '1230A236' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 18.00, 0, 5, 9, '{"floor":2,"section":"G","shelf":"3"}'::jsonb, current_date from app.products where sku = '1230A236' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MB906064', 'NUT,RADIATOR', 'XFORCE (2024-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 70.56, true, current_date from app.products where sku = 'MB906064' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 13.00, 0, 4, 7, '{"floor":2,"section":"H","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MB906064' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MU432003', 'NUT,RR LAMP', 'XFORCE (2024-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 79.52, true, current_date from app.products where sku = 'MU432003' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 12.00, 0, 3, 6, '{"floor":1,"section":"A","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MU432003' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR212302', 'NUT,EXHAUST MANIFOLD', 'XFORCE (2024-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 73.92, true, current_date from app.products where sku = 'MR212302' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 21.00, 0, 6, 11, '{"floor":2,"section":"B","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MR212302' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1801A264', 'NUT,ALTERNATOR', 'XFORCE (2024-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 62.72, true, current_date from app.products where sku = '1801A264' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 46.00, 0, 12, 23, '{"floor":2,"section":"C","shelf":"2"}'::jsonb, current_date from app.products where sku = '1801A264' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5251F078', 'BRACKET,RR WHEELHOUSE,RR', 'XFORCE (2024-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 41.44, true, current_date from app.products where sku = '5251F078' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 45.00, 0, 12, 23, '{"floor":1,"section":"D","shelf":"3"}'::jsonb, current_date from app.products where sku = '5251F078' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1822A085', 'SPARK PLUG', 'XFORCE (2024-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1221.92, true, current_date from app.products where sku = '1822A085' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":2,"section":"E","shelf":"4"}'::jsonb, current_date from app.products where sku = '1822A085' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5713A518', 'SCREW,FR DOOR WINDOW RGLTR', 'XFORCE (2024-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 38.08, true, current_date from app.products where sku = '5713A518' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 41.00, 0, 11, 21, '{"floor":2,"section":"F","shelf":"5"}'::jsonb, current_date from app.products where sku = '5713A518' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF913010', 'BOLT,A/C PIPING', 'XFORCE (2024-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 26.88, true, current_date from app.products where sku = 'MF913010' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 26.00, 0, 7, 13, '{"floor":1,"section":"G","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MF913010' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8250A605', 'NUT,WINDSHIELD WIPER', 'XFORCE (2024-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 52.64, true, current_date from app.products where sku = '8250A605' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":2,"section":"H","shelf":"2"}'::jsonb, current_date from app.products where sku = '8250A605' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MB950511', 'PIN,BRAKE M/CYL', 'XFORCE (2024-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 71.68, true, current_date from app.products where sku = 'MB950511' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 46.00, 0, 12, 23, '{"floor":2,"section":"A","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MB950511' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4620A408', 'BRACKET,CLUTCH PEDAL', 'XFORCE (2024-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 183.68, true, current_date from app.products where sku = '4620A408' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 26.00, 0, 7, 13, '{"floor":1,"section":"B","shelf":"4"}'::jsonb, current_date from app.products where sku = '4620A408' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('9499D171', 'VALVE,HEV O/CLR BY-PASS', 'OUTLANDER (2015-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 9060.80, true, current_date from app.products where sku = '9499D171' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 21.00, 0, 6, 11, '{"floor":2,"section":"C","shelf":"5"}'::jsonb, current_date from app.products where sku = '9499D171' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1000C528', 'GASKET KIT,ENG OVERHAUL', 'OUTLANDER (2015-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 28208.32, true, current_date from app.products where sku = '1000C528' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"D","shelf":"1"}'::jsonb, current_date from app.products where sku = '1000C528' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1340A130', 'BELT,WATER PUMP', 'OUTLANDER (2015-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 647.36, true, current_date from app.products where sku = '1340A130' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 9.00, 0, 3, 5, '{"floor":1,"section":"E","shelf":"2"}'::jsonb, current_date from app.products where sku = '1340A130' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1141A013', 'TENSIONER,TIMING CHAIN', 'OUTLANDER (2015-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 2709.28, true, current_date from app.products where sku = '1141A013' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 11.00, 0, 3, 6, '{"floor":2,"section":"F","shelf":"3"}'::jsonb, current_date from app.products where sku = '1141A013' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1310A079', 'HOSE,COOLING WATER LINE', 'OUTLANDER (2015-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 424.48, true, current_date from app.products where sku = '1310A079' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 4.00, 0, 1, 2, '{"floor":2,"section":"G","shelf":"4"}'::jsonb, current_date from app.products where sku = '1310A079' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MZ590921EX', 'FLR ILLUMI', 'OUTLANDER (2015-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 13501.60, true, current_date from app.products where sku = 'MZ590921EX' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 1.00, 0, 1, 1, '{"floor":1,"section":"H","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MZ590921EX' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1370A665', 'HOSE,RADIATOR,UPR', 'OUTLANDER (2015-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 3004.96, true, current_date from app.products where sku = '1370A665' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":2,"section":"A","shelf":"1"}'::jsonb, current_date from app.products where sku = '1370A665' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7450A643', 'GRILLE,RADIATOR', 'OUTLANDER (2015-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 21512.96, true, current_date from app.products where sku = '7450A643' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 44.00, 0, 11, 22, '{"floor":2,"section":"B","shelf":"2"}'::jsonb, current_date from app.products where sku = '7450A643' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1571B816', 'MUFFLER,EXHAUST MAIN', 'OUTLANDER (2015-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 15452.64, true, current_date from app.products where sku = '1571B816' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 28.00, 0, 7, 14, '{"floor":1,"section":"C","shelf":"3"}'::jsonb, current_date from app.products where sku = '1571B816' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1570D381', 'PIPE,EXHAUST,CTR', 'OUTLANDER (2015-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 23344.16, true, current_date from app.products where sku = '1570D381' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 11.00, 0, 3, 6, '{"floor":2,"section":"D","shelf":"4"}'::jsonb, current_date from app.products where sku = '1570D381' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1822A068', 'SPARK PLUG', 'OUTLANDER (2015-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1432.48, true, current_date from app.products where sku = '1822A068' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 34.00, 0, 9, 17, '{"floor":2,"section":"E","shelf":"5"}'::jsonb, current_date from app.products where sku = '1822A068' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1832A062', 'COIL,IGNITION', 'OUTLANDER (2015-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 7917.28, true, current_date from app.products where sku = '1832A062' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 14.00, 0, 4, 7, '{"floor":1,"section":"F","shelf":"1"}'::jsonb, current_date from app.products where sku = '1832A062' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8651A247XA', 'SENSOR,CORNER CLEARANCE', 'OUTLANDER (2015-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 8757.28, true, current_date from app.products where sku = '8651A247XA' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 19.00, 0, 5, 10, '{"floor":2,"section":"G","shelf":"2"}'::jsonb, current_date from app.products where sku = '8651A247XA' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8201A216', 'BATTERY', 'OUTLANDER (2015-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 41006.56, true, current_date from app.products where sku = '8201A216' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 22.00, 0, 6, 11, '{"floor":2,"section":"H","shelf":"3"}'::jsonb, current_date from app.products where sku = '8201A216' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN183955', 'LOCK,VALVE SPRING RETAINER', 'OUTLANDER (2015-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 86.24, true, current_date from app.products where sku = 'MN183955' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 30.00, 0, 8, 15, '{"floor":1,"section":"A","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MN183955' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4060A417', 'INSULATOR,FR SUSP STRUT', 'OUTLANDER (2015-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 3769.92, true, current_date from app.products where sku = '4060A417' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 47.00, 0, 12, 24, '{"floor":2,"section":"B","shelf":"5"}'::jsonb, current_date from app.products where sku = '4060A417' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4422A143', 'TIE ROD,STEERING', 'OUTLANDER (2015-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 3234.56, true, current_date from app.products where sku = '4422A143' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 25.00, 0, 7, 13, '{"floor":2,"section":"C","shelf":"1"}'::jsonb, current_date from app.products where sku = '4422A143' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7661A227', 'RACK,ROOF,LH', 'OUTLANDER (2015-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 24494.40, true, current_date from app.products where sku = '7661A227' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 9.00, 0, 3, 5, '{"floor":1,"section":"D","shelf":"2"}'::jsonb, current_date from app.products where sku = '7661A227' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4605B910', 'SEAL KIT,RR BRAKE CALIPER', 'OUTLANDER (2015-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1282.40, true, current_date from app.products where sku = '4605B910' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 47.00, 0, 12, 24, '{"floor":2,"section":"E","shelf":"3"}'::jsonb, current_date from app.products where sku = '4605B910' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4605B806', 'PAD SET,RR BRAKE', 'OUTLANDER (2015-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 5070.24, true, current_date from app.products where sku = '4605B806' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 9.00, 0, 3, 5, '{"floor":2,"section":"F","shelf":"4"}'::jsonb, current_date from app.products where sku = '4605B806' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('6405A209', 'COVER,FR BUMPER,LH', 'OUTLANDER (2015-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 259.84, true, current_date from app.products where sku = '6405A209' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 35.00, 0, 9, 18, '{"floor":1,"section":"G","shelf":"5"}'::jsonb, current_date from app.products where sku = '6405A209' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5706A584', 'GLASS,FR DOOR WINDOW,RH', 'OUTLANDER (2015-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 19824.00, true, current_date from app.products where sku = '5706A584' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 41.00, 0, 11, 21, '{"floor":2,"section":"H","shelf":"1"}'::jsonb, current_date from app.products where sku = '5706A584' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8264A312XA', 'COVER,HEADLAMP WASHER HOLE', 'OUTLANDER (2015-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1498.56, true, current_date from app.products where sku = '8264A312XA' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 4.00, 0, 1, 2, '{"floor":2,"section":"A","shelf":"2"}'::jsonb, current_date from app.products where sku = '8264A312XA' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8321A748', 'LAMP ASSY,FOG,FR RH', 'OUTLANDER (2015-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 10339.84, true, current_date from app.products where sku = '8321A748' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 32.00, 0, 8, 16, '{"floor":1,"section":"B","shelf":"3"}'::jsonb, current_date from app.products where sku = '8321A748' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8250B038', 'BLADE,WINDSHIELD WIPER,RH', 'OUTLANDER (2015-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 462.56, true, current_date from app.products where sku = '8250B038' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"C","shelf":"4"}'::jsonb, current_date from app.products where sku = '8250B038' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('6107A052', 'MOULDING,WINDSHILD SIDE', 'OUTLANDER (2015-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 2914.24, true, current_date from app.products where sku = '6107A052' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 49.00, 0, 13, 25, '{"floor":2,"section":"D","shelf":"5"}'::jsonb, current_date from app.products where sku = '6107A052' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('3200A102', 'GASKET,T/F OIL DRAIN PLUG', 'LANCER CY4 (2007-2014)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 110.88, true, current_date from app.products where sku = '3200A102' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 40.00, 0, 10, 20, '{"floor":1,"section":"E","shelf":"1"}'::jsonb, current_date from app.products where sku = '3200A102' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CP7030A950', 'INFLATOR KIT, AIR BAG', 'LANCER CY4 (2007-2014)', 'General Parts', 'Mitsubishi', 'PC', 'low_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CP7030A950' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 22.00, 0, 6, 11, '{"floor":2,"section":"F","shelf":"2"}'::jsonb, current_date from app.products where sku = 'CP7030A950' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF140275', 'BOLT,EXHAUST PIPE', 'LANCER CY4 (2007-2014)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 327.04, true, current_date from app.products where sku = 'MF140275' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 29.00, 0, 8, 15, '{"floor":2,"section":"G","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MF140275' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4429A001', 'SCREW,STEERING WHEEL', 'LANCER CY4 (2007-2014)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 143.36, true, current_date from app.products where sku = '4429A001' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 28.00, 0, 7, 14, '{"floor":1,"section":"H","shelf":"4"}'::jsonb, current_date from app.products where sku = '4429A001' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('11950W010P', 'BELT,P/S', 'LANCER CY4 (2007-2014)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1171.52, true, current_date from app.products where sku = '11950W010P' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 22.00, 0, 6, 11, '{"floor":2,"section":"A","shelf":"5"}'::jsonb, current_date from app.products where sku = '11950W010P' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN187246', 'GASKET,WATER PUMP', 'LANCER CY4 (2007-2014)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 268.80, true, current_date from app.products where sku = 'MN187246' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"B","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MN187246' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7815A656', 'CLIP,A/C PIPING', 'LANCER CY4 (2007-2014)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 116.48, true, current_date from app.products where sku = '7815A656' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 16.00, 0, 4, 8, '{"floor":1,"section":"C","shelf":"2"}'::jsonb, current_date from app.products where sku = '7815A656' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1801A079', 'BOLT,ALTERNATOR', 'LANCER CY4 (2007-2014)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 169.12, true, current_date from app.products where sku = '1801A079' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 46.00, 0, 12, 23, '{"floor":2,"section":"D","shelf":"3"}'::jsonb, current_date from app.products where sku = '1801A079' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MN163236', 'SPARK PLUG(FR6EI)', 'LANCER CY4 (2007-2014)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1093.12, true, current_date from app.products where sku = 'MN163236' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 30.00, 0, 8, 15, '{"floor":2,"section":"E","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MN163236' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2348A285', 'TUBE,CLUTCH M/CYL', 'LANCER CY4 (2007-2014)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1018.08, true, current_date from app.products where sku = '2348A285' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 34.00, 0, 9, 17, '{"floor":1,"section":"F","shelf":"5"}'::jsonb, current_date from app.products where sku = '2348A285' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MU440019', 'NUT,FR BUMPER', 'LANCER CY4 (2007-2014)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 85.12, true, current_date from app.products where sku = 'MU440019' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 22.00, 0, 6, 11, '{"floor":2,"section":"G","shelf":"1"}'::jsonb, current_date from app.products where sku = 'MU440019' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2528A234', 'GEAR,M/T INPUT SHAFT 5TH', 'LANCER CY4 (2007-2014)', 'Transmission', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 5974.08, true, current_date from app.products where sku = '2528A234' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 5.00, 0, 2, 3, '{"floor":2,"section":"H","shelf":"2"}'::jsonb, current_date from app.products where sku = '2528A234' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MB109960', 'COVER,FR SUSP STRUT', 'LANCER CY4 (2007-2014)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 172.48, true, current_date from app.products where sku = 'MB109960' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 12.00, 0, 3, 6, '{"floor":1,"section":"A","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MB109960' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CP4630A001', 'SEAL,BRAKE BOOSTER BODY', 'LANCER CY4 (2007-2014)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CP4630A001' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 11.00, 0, 3, 6, '{"floor":2,"section":"B","shelf":"4"}'::jsonb, current_date from app.products where sku = 'CP4630A001' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MU000367', 'GROMMET,TAIL LAMP', 'LANCER CY4 (2007-2014)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 108.64, true, current_date from app.products where sku = 'MU000367' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 36.00, 0, 9, 18, '{"floor":2,"section":"C","shelf":"5"}'::jsonb, current_date from app.products where sku = 'MU000367' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7403A143', 'CLIP,DRIP MOULDING', 'LANCER CY4 (2007-2014)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 152.32, true, current_date from app.products where sku = '7403A143' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 18.00, 0, 5, 9, '{"floor":1,"section":"D","shelf":"1"}'::jsonb, current_date from app.products where sku = '7403A143' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MD758684', 'OIL FILTER,A/T VALVE BOD', 'LANCER CY4 (2007-2014)', 'Filters', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 3925.60, true, current_date from app.products where sku = 'MD758684' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 50.00, 0, 13, 25, '{"floor":2,"section":"E","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MD758684' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1226A029', 'GASKET,T/C OIL RETURN TUBE', 'MONTERO QX (2015-PRESENT)', 'Engine', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 5.60, true, current_date from app.products where sku = '1226A029' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 30.00, 0, 8, 15, '{"floor":2,"section":"F","shelf":"3"}'::jsonb, current_date from app.products where sku = '1226A029' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF453107', 'SCREW,FUEL FILLER LID LOCK', 'MONTERO QX (2015-PRESENT)', 'General Parts', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 32.48, true, current_date from app.products where sku = 'MF453107' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 13.00, 0, 4, 7, '{"floor":1,"section":"G","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MF453107' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('CP5802A706', 'SPRING,SET GAS', 'MONTERO QX (2015-PRESENT)', 'Suspension', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'CP5802A706' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 43.00, 0, 11, 22, '{"floor":2,"section":"H","shelf":"5"}'::jsonb, current_date from app.products where sku = 'CP5802A706' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1515A190', 'BOLT,CATALYTIC CONVERTER', 'MONTERO QX (2015-PRESENT)', 'Exhaust', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 35.84, true, current_date from app.products where sku = '1515A190' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 44.00, 0, 11, 22, '{"floor":2,"section":"A","shelf":"1"}'::jsonb, current_date from app.products where sku = '1515A190' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('7814A037', 'BELT, A/C', 'MONTERO QX (2015-PRESENT)', 'Belts & Pulleys', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 577.92, true, current_date from app.products where sku = '7814A037' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 31.00, 0, 8, 16, '{"floor":1,"section":"B","shelf":"2"}'::jsonb, current_date from app.products where sku = '7814A037' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1130A230', 'GEAR,INJECTION PUMP DRIVE', 'MONTERO QX (2015-PRESENT)', 'Transmission', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 2992.64, true, current_date from app.products where sku = '1130A230' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":2,"section":"C","shelf":"3"}'::jsonb, current_date from app.products where sku = '1130A230' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1230A112', 'GASKET,OIL FILTER BRACKET', 'MONTERO QX (2015-PRESENT)', 'Filters', 'Mitsubishi', 'PC', 'out_of_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 310.24, true, current_date from app.products where sku = '1230A112' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 30.00, 0, 8, 15, '{"floor":2,"section":"D","shelf":"4"}'::jsonb, current_date from app.products where sku = '1230A112' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8558B397', 'BRACKET,THROTTLE BOD', 'MONTERO QX (2015-PRESENT)', 'Steering', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 26.88, true, current_date from app.products where sku = '8558B397' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 5.00, 0, 2, 3, '{"floor":1,"section":"E","shelf":"5"}'::jsonb, current_date from app.products where sku = '8558B397' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('1375A434', 'SEAL,RADIATOR COND TANK', 'MONTERO QX (2015-PRESENT)', 'Cooling', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 49.28, true, current_date from app.products where sku = '1375A434' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 7.00, 0, 2, 4, '{"floor":2,"section":"F","shelf":"1"}'::jsonb, current_date from app.products where sku = '1375A434' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR527683', 'STOPPER,CLUTCH PEDAL', 'MONTERO QX (2015-PRESENT)', 'Clutch', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 126.56, true, current_date from app.products where sku = 'MR527683' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 42.00, 0, 11, 21, '{"floor":2,"section":"G","shelf":"2"}'::jsonb, current_date from app.products where sku = 'MR527683' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MR568455', 'O-RING,A/C PIPING', 'MONTERO QX (2015-PRESENT)', 'Air Conditioning', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 72.80, true, current_date from app.products where sku = 'MR568455' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 15.00, 0, 4, 8, '{"floor":1,"section":"H","shelf":"3"}'::jsonb, current_date from app.products where sku = 'MR568455' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF911146', 'BOLT, HOOD LOCKING', 'MONTERO QX (2015-PRESENT)', 'Body Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 48.16, true, current_date from app.products where sku = 'MF911146' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 39.00, 0, 10, 20, '{"floor":2,"section":"A","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MF911146' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('2400A499', 'BULB,GEARSHIFT LINK', 'MONTERO QX (2015-PRESENT)', 'Lighting', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 92.96, true, current_date from app.products where sku = '2400A499' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":2,"section":"B","shelf":"5"}'::jsonb, current_date from app.products where sku = '2400A499' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('DP010712', 'MOTOLITE SERVICE BATTERY [3SM]', 'MONTERO QX (2015-PRESENT)', 'Electrical', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 0.01, true, current_date from app.products where sku = 'DP010712' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 29.00, 0, 8, 15, '{"floor":1,"section":"C","shelf":"1"}'::jsonb, current_date from app.products where sku = 'DP010712' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('8541F117', 'HARN,GLOW PLUG CONT RELAY', 'MONTERO QX (2015-PRESENT)', 'Ignition', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 1402.24, true, current_date from app.products where sku = '8541F117' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 48.00, 0, 12, 24, '{"floor":2,"section":"D","shelf":"2"}'::jsonb, current_date from app.products where sku = '8541F117' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('4800A067', 'WASHER,RR BRAKE', 'MONTERO QX (2015-PRESENT)', 'Brakes', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 92.96, true, current_date from app.products where sku = '4800A067' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 10.00, 0, 3, 5, '{"floor":2,"section":"E","shelf":"3"}'::jsonb, current_date from app.products where sku = '4800A067' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('MF205566', 'SCREW,ROOM MIRROR', 'MONTERO QX (2015-PRESENT)', 'Accessories', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 56.00, true, current_date from app.products where sku = 'MF205566' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 20.00, 0, 5, 10, '{"floor":1,"section":"F","shelf":"4"}'::jsonb, current_date from app.products where sku = 'MF205566' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5070A574', 'BRKT ASSY, NO.1 BODY MTG LH', 'L300', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 851.20, true, current_date from app.products where sku = '5070A574' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 29.00, 0, 8, 15, '{"floor":2,"section":"G","shelf":"5"}'::jsonb, current_date from app.products where sku = '5070A574' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

insert into app.products (sku, name, model_name, category, brand, uom, status, metadata) values ('5070A575', 'BRKT ASSY, NO.1 BODY MTG RH', 'L300', 'General Parts', 'Mitsubishi', 'PC', 'in_stock', '{"source":"productData.js"}'::jsonb) on conflict (sku) do update set name = excluded.name, model_name = excluded.model_name, category = excluded.category, status = excluded.status, updated_at = timezone('utc', now());
insert into app.product_prices (product_id, price_type, amount, is_current, effective_from) select id, 'retail', 851.20, true, current_date from app.products where sku = '5070A575' and not exists (select 1 from app.product_prices pp where pp.product_id = app.products.id and pp.price_type = 'retail' and pp.is_current);
insert into app.inventory_balances (product_id, on_hand, reserved, reorder_point, reorder_quantity, location, as_of_date) select id, 12.00, 0, 3, 6, '{"floor":2,"section":"H","shelf":"1"}'::jsonb, current_date from app.products where sku = '5070A575' on conflict (product_id) do update set on_hand = excluded.on_hand, reorder_point = excluded.reorder_point, reorder_quantity = excluded.reorder_quantity, location = excluded.location, updated_at = timezone('utc', now());

select app.seed_demo_data();
select app.run_full_analytics_refresh(''Initial demo analytics refresh'');

