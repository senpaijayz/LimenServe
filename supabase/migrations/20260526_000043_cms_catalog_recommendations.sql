create table if not exists cms.featured_catalog_items (
  id uuid primary key default gen_random_uuid(),
  placement_key text not null,
  product_id uuid not null references catalog.products(id) on delete cascade,
  label text,
  badge text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.recommendation_packages (
  id uuid primary key default gen_random_uuid(),
  anchor_product_id uuid not null references catalog.products(id) on delete cascade,
  vehicle_model_name text,
  vehicle_family text,
  service_group text not null default 'maintenance',
  package_key text not null unique,
  package_name text not null,
  package_description text,
  min_anchor_quantity integer not null default 1 check (min_anchor_quantity > 0),
  priority integer not null default 100,
  is_active boolean not null default true,
  business_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.recommendation_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references cms.recommendation_packages(id) on delete cascade,
  item_kind text not null check (item_kind in ('product', 'service')),
  product_id uuid references catalog.products(id) on delete cascade,
  service_id uuid references app.services(id) on delete cascade,
  item_role text not null check (item_role in ('part', 'service')),
  reason_label text,
  display_priority integer not null default 100,
  price_mode text not null default 'catalog' check (price_mode in ('catalog', 'complimentary', 'override')),
  price_override numeric(12,2),
  is_active boolean not null default true,
  business_date date not null default current_date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (item_kind = 'product' and product_id is not null and service_id is null and item_role = 'part') or
    (item_kind = 'service' and product_id is null and service_id is not null and item_role = 'service')
  )
);

create index if not exists featured_catalog_items_lookup_idx
  on cms.featured_catalog_items(placement_key, is_active, sort_order);

create unique index if not exists featured_catalog_items_placement_product_idx
  on cms.featured_catalog_items(placement_key, product_id);

create index if not exists recommendation_packages_lookup_idx
  on cms.recommendation_packages(anchor_product_id, is_active, priority);

create index if not exists recommendation_package_items_lookup_idx
  on cms.recommendation_package_items(package_id, is_active, display_priority);

alter table cms.featured_catalog_items enable row level security;
alter table cms.recommendation_packages enable row level security;
alter table cms.recommendation_package_items enable row level security;

drop policy if exists service_role_featured_catalog_items_all on cms.featured_catalog_items;
create policy service_role_featured_catalog_items_all
  on cms.featured_catalog_items
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_recommendation_packages_all on cms.recommendation_packages;
create policy service_role_recommendation_packages_all
  on cms.recommendation_packages
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_recommendation_package_items_all on cms.recommendation_package_items;
create policy service_role_recommendation_package_items_all
  on cms.recommendation_package_items
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists touch_updated_at on cms.featured_catalog_items;
create trigger touch_updated_at
before update on cms.featured_catalog_items
for each row execute function cms.touch_updated_at();

drop trigger if exists touch_updated_at on cms.recommendation_packages;
create trigger touch_updated_at
before update on cms.recommendation_packages
for each row execute function cms.touch_updated_at();

drop trigger if exists touch_updated_at on cms.recommendation_package_items;
create trigger touch_updated_at
before update on cms.recommendation_package_items
for each row execute function cms.touch_updated_at();

drop function if exists public.get_featured_catalog_items(text);
create or replace function public.get_featured_catalog_items(p_placement_key text)
returns table (
  id uuid,
  placement_key text,
  product_id uuid,
  sku text,
  name text,
  category text,
  label text,
  badge text,
  sort_order integer
)
language sql
stable
security definer
set search_path = public, cms, catalog
as $$
  select
    featured.id,
    featured.placement_key,
    product.id as product_id,
    product.sku,
    product.name,
    product.category,
    featured.label,
    featured.badge,
    featured.sort_order
  from cms.featured_catalog_items featured
  join catalog.products product on product.id = featured.product_id
  where featured.placement_key = p_placement_key
    and featured.is_active = true
    and product.is_active = true
    and (featured.starts_at is null or featured.starts_at <= now())
    and (featured.ends_at is null or featured.ends_at >= now())
  order by featured.sort_order, product.name;
$$;

drop function if exists public.get_cms_recommendation_packages(uuid, text, integer, integer);
create or replace function public.get_cms_recommendation_packages(
  p_anchor_product_id uuid,
  p_vehicle_model_name text default null,
  p_part_limit integer default 8,
  p_service_limit integer default 4
)
returns table (
  package_id uuid,
  package_key text,
  package_name text,
  package_description text,
  anchor_product_id uuid,
  vehicle_model_name text,
  vehicle_family text,
  service_group text,
  min_anchor_quantity integer,
  priority integer,
  package_item_id uuid,
  item_kind text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_product_sku text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_service_code text,
  reason_label text,
  display_priority integer,
  price_mode text,
  price_override numeric,
  catalog_price numeric,
  recommendation_mode text,
  recommendation_label text
)
language sql
stable
security definer
set search_path = public, cms, catalog, app
as $$
  with package_rows as (
    select pkg.*
    from cms.recommendation_packages pkg
    where pkg.anchor_product_id = p_anchor_product_id
      and pkg.is_active = true
      and (
        coalesce(p_vehicle_model_name, '') = ''
        or coalesce(pkg.vehicle_model_name, '') = ''
        or lower(pkg.vehicle_model_name) = lower(p_vehicle_model_name)
      )
    order by pkg.priority, pkg.package_name
  ),
  item_rows as (
    select
      pkg.id as package_id,
      item.*,
      row_number() over (
        partition by pkg.id, item.item_kind
        order by item.display_priority, item.created_at
      ) as item_rank
    from package_rows pkg
    join cms.recommendation_package_items item on item.package_id = pkg.id
    where item.is_active = true
  )
  select
    pkg.id as package_id,
    pkg.package_key,
    pkg.package_name,
    pkg.package_description,
    pkg.anchor_product_id,
    pkg.vehicle_model_name,
    pkg.vehicle_family,
    pkg.service_group,
    pkg.min_anchor_quantity,
    pkg.priority,
    item.id as package_item_id,
    item.item_kind,
    product.id as recommended_product_id,
    product.name as recommended_product_name,
    product.sku as recommended_product_sku,
    service.id as recommended_service_id,
    service.name as recommended_service_name,
    service.code as recommended_service_code,
    item.reason_label,
    item.display_priority,
    item.price_mode,
    item.price_override,
    case
      when item.item_kind = 'product' then coalesce(price.amount, 0)
      else coalesce(service.standard_price, 0)
    end as catalog_price,
    'cms_curated_bundle'::text as recommendation_mode,
    'CMS Curated Bundle'::text as recommendation_label
  from package_rows pkg
  join item_rows item on item.package_id = pkg.id
  left join catalog.products product on product.id = item.product_id and product.is_active = true
  left join lateral (
    select amount
    from catalog.product_prices pp
    where pp.product_id = product.id
      and pp.price_type = 'retail'
      and pp.is_current = true
    order by pp.effective_from desc, pp.created_at desc
    limit 1
  ) price on true
  left join app.services service on service.id = item.service_id
  where
    (item.item_kind = 'product' and product.id is not null and item.item_rank <= greatest(coalesce(p_part_limit, 8), 1))
    or
    (item.item_kind = 'service' and service.id is not null and item.item_rank <= greatest(coalesce(p_service_limit, 4), 1))
  order by pkg.priority, item.display_priority;
$$;

revoke execute on function public.get_featured_catalog_items(text) from public;
grant execute on function public.get_featured_catalog_items(text) to anon, authenticated;

revoke execute on function public.get_cms_recommendation_packages(uuid, text, integer, integer) from public;
grant execute on function public.get_cms_recommendation_packages(uuid, text, integer, integer) to anon, authenticated;
