create table if not exists public.store_layouts (
  id uuid primary key default gen_random_uuid(),
  layout_name text not null unique default 'main-store',
  layout_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_locations (
  product_id uuid primary key references catalog.products(id) on delete cascade,
  product_name text,
  sku text,
  aisle text not null,
  shelf_number integer not null check (shelf_number >= 1),
  bin_number integer not null check (bin_number >= 1),
  floor integer not null default 1 check (floor in (1, 2)),
  shelf_object_id text,
  assignment_data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists touch_store_layouts_updated_at on public.store_layouts;
create trigger touch_store_layouts_updated_at
before update on public.store_layouts
for each row execute function app.touch_updated_at();

drop trigger if exists touch_product_locations_updated_at on public.product_locations;
create trigger touch_product_locations_updated_at
before update on public.product_locations
for each row execute function app.touch_updated_at();

alter table public.store_layouts enable row level security;
alter table public.product_locations enable row level security;

drop policy if exists store_layouts_internal_select on public.store_layouts;
create policy store_layouts_internal_select
on public.store_layouts
for select
to authenticated
using (app.is_internal_user());

drop policy if exists store_layouts_admin_insert on public.store_layouts;
create policy store_layouts_admin_insert
on public.store_layouts
for insert
to authenticated
with check (app.is_admin());

drop policy if exists store_layouts_admin_update on public.store_layouts;
create policy store_layouts_admin_update
on public.store_layouts
for update
to authenticated
using (app.is_admin())
with check (app.is_admin());

drop policy if exists product_locations_internal_select on public.product_locations;
create policy product_locations_internal_select
on public.product_locations
for select
to authenticated
using (app.is_internal_user());

drop policy if exists product_locations_admin_insert on public.product_locations;
create policy product_locations_admin_insert
on public.product_locations
for insert
to authenticated
with check (app.is_admin());

drop policy if exists product_locations_admin_update on public.product_locations;
create policy product_locations_admin_update
on public.product_locations
for update
to authenticated
using (app.is_admin())
with check (app.is_admin());

drop policy if exists product_locations_admin_delete on public.product_locations;
create policy product_locations_admin_delete
on public.product_locations
for delete
to authenticated
using (app.is_admin());

grant select, insert, update, delete on public.store_layouts to authenticated;
grant select, insert, update, delete on public.product_locations to authenticated;
