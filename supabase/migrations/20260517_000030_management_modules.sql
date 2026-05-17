create table if not exists catalog.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text not null default '#1d4ed8',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_images_one_primary_per_product
  on catalog.product_images(product_id)
  where is_primary;

create table if not exists catalog.product_supplier_links (
  product_id uuid primary key references catalog.products(id) on delete cascade,
  supplier_id uuid not null references catalog.suppliers(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists catalog.stock_receiving_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references catalog.products(id) on delete cascade,
  supplier_id uuid references catalog.suppliers(id) on delete set null,
  movement_id uuid references catalog.inventory_movements(id) on delete set null,
  quantity_added numeric(12,2) not null,
  previous_stock numeric(12,2) not null default 0,
  updated_stock numeric(12,2) not null default 0,
  reference_number text not null,
  received_date date not null default current_date,
  notes text,
  performed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists stock_receiving_logs_product_created_idx
  on catalog.stock_receiving_logs(product_id, created_at desc);

insert into catalog.categories (name)
select distinct category
from catalog.products
where category is not null and btrim(category) <> ''
on conflict (name) do nothing;

alter table catalog.suppliers enable row level security;
alter table catalog.categories enable row level security;
alter table catalog.product_images enable row level security;
alter table catalog.product_supplier_links enable row level security;
alter table catalog.stock_receiving_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'catalog' and tablename = 'suppliers' and policyname = 'service_role_suppliers_all'
  ) then
    create policy service_role_suppliers_all on catalog.suppliers
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'catalog' and tablename = 'categories' and policyname = 'service_role_categories_all'
  ) then
    create policy service_role_categories_all on catalog.categories
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'catalog' and tablename = 'product_images' and policyname = 'service_role_product_images_all'
  ) then
    create policy service_role_product_images_all on catalog.product_images
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'catalog' and tablename = 'product_supplier_links' and policyname = 'service_role_product_supplier_links_all'
  ) then
    create policy service_role_product_supplier_links_all on catalog.product_supplier_links
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'catalog' and tablename = 'stock_receiving_logs' and policyname = 'service_role_stock_receiving_logs_all'
  ) then
    create policy service_role_stock_receiving_logs_all on catalog.stock_receiving_logs
      for all to service_role using (true) with check (true);
  end if;
end $$;
