-- 04 Sales, Service Orders, and Upsell Events
-- Source: 20260316_000001_core_schema.sql

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

