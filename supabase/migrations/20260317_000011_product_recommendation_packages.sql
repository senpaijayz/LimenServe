alter table app.quote_recommendation_rules
  add column if not exists vehicle_family text,
  add column if not exists service_group text;

create table if not exists app.product_recommendation_profile (
  product_id uuid primary key references app.products(id) on delete cascade,
  sku text not null,
  model_name text,
  vehicle_family text,
  part_function text,
  service_group text,
  keywords text[] not null default '{}'::text[],
  is_vehicle_specific boolean not null default true,
  analysis_source text not null default 'sql_profile_builder',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.service_recommendation_groups (
  service_id uuid primary key references app.services(id) on delete cascade,
  service_group text not null,
  priority integer not null default 100,
  vehicle_model_name text,
  vehicle_family text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.product_recommendation_packages (
  id uuid primary key default gen_random_uuid(),
  anchor_product_id uuid not null references app.products(id) on delete cascade,
  vehicle_model_name text,
  vehicle_family text,
  service_group text not null,
  package_key text not null unique,
  package_name text not null,
  package_description text,
  min_anchor_quantity integer not null default 1 check (min_anchor_quantity > 0),
  priority integer not null default 100,
  is_active boolean not null default true,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app.product_recommendation_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references app.product_recommendation_packages(id) on delete cascade,
  item_kind text not null check (item_kind in ('product', 'service')),
  product_id uuid references app.products(id) on delete cascade,
  service_id uuid references app.services(id) on delete cascade,
  item_role text not null check (item_role in ('part', 'service')),
  reason_label text,
  display_priority integer not null default 100,
  price_mode text not null default 'catalog' check (price_mode in ('catalog', 'complimentary', 'override')),
  price_override numeric(12,2),
  is_active boolean not null default true,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (item_kind = 'product' and product_id is not null and service_id is null and item_role = 'part') or
    (item_kind = 'service' and product_id is null and service_id is not null and item_role = 'service')
  )
);

create index if not exists idx_product_recommendation_packages_anchor
  on app.product_recommendation_packages (anchor_product_id, is_active, priority);

create index if not exists idx_product_recommendation_package_items_package
  on app.product_recommendation_package_items (package_id, item_kind, display_priority);

create unique index if not exists idx_product_recommendation_package_items_product
  on app.product_recommendation_package_items (package_id, product_id)
  where product_id is not null;

create unique index if not exists idx_product_recommendation_package_items_service
  on app.product_recommendation_package_items (package_id, service_id)
  where service_id is not null;

drop trigger if exists trg_product_recommendation_packages_updated_at on app.product_recommendation_packages;
create trigger trg_product_recommendation_packages_updated_at
before update on app.product_recommendation_packages
for each row execute function app.touch_updated_at();

drop trigger if exists trg_product_recommendation_package_items_updated_at on app.product_recommendation_package_items;
create trigger trg_product_recommendation_package_items_updated_at
before update on app.product_recommendation_package_items
for each row execute function app.touch_updated_at();

insert into app.services (code, name, description, standard_price, estimated_duration_minutes)
values
  ('SVC-BRAKE-INSTALL', 'Brake Pad Installation Service', 'Dedicated brake installation labor for matched brake packages', 950.00, 75),
  ('SVC-BRAKE-CLEAN', 'Brake Cleaning Service', 'Dedicated brake cleaning and dust removal service', 420.00, 35)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  standard_price = excluded.standard_price,
  estimated_duration_minutes = excluded.estimated_duration_minutes,
  updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select id, 'brake_service',
  case code
    when 'SVC-BRAKE-INSTALL' then 5
    when 'SVC-BRAKE-CLEAN' then 10
    else 20
  end,
  null, null, true, timezone('utc', now())
from app.services
where code in ('SVC-BRAKE-INSTALL', 'SVC-BRAKE-CLEAN', 'SVC-BRAKE')
on conflict (service_id) do update
set
  service_group = excluded.service_group,
  priority = excluded.priority,
  vehicle_model_name = excluded.vehicle_model_name,
  vehicle_family = excluded.vehicle_family,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

create or replace function app.refresh_product_recommendation_packages()
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_rows integer := 0;
  v_total integer := 0;
begin
  delete from app.product_recommendation_package_items;
  delete from app.product_recommendation_packages;

  insert into app.product_recommendation_packages (
    anchor_product_id,
    vehicle_model_name,
    vehicle_family,
    service_group,
    package_key,
    package_name,
    package_description,
    min_anchor_quantity,
    priority,
    is_active,
    business_date
  )
  select
    profile.product_id,
    profile.model_name,
    profile.vehicle_family,
    profile.service_group,
    concat('pkg-', profile.service_group, '-', replace(profile.product_id::text, '-', '')),
    case profile.service_group
      when 'oil_change' then 'Compatible Oil Change Package'
      when 'brake_service' then 'Compatible Brake Service Package'
      when 'cooling_service' then 'Compatible Cooling System Package'
      when 'battery_service' then 'Compatible Battery Service Package'
      when 'tune_up' then 'Compatible Tune-Up Package'
      when 'filter_service' then 'Compatible Filter Service Package'
      when 'tire_service' then 'Compatible Tire Service Package'
      else 'Compatible Mitsubishi Service Package'
    end,
    case profile.service_group
      when 'oil_change' then 'Matched oil parts and service labor for this Mitsubishi vehicle.'
      when 'brake_service' then 'Matched brake parts plus installation and cleaning services for this Mitsubishi vehicle.'
      when 'cooling_service' then 'Matched cooling-system parts and labor for this Mitsubishi vehicle.'
      when 'battery_service' then 'Matched battery and electrical service recommendations for this Mitsubishi vehicle.'
      when 'tune_up' then 'Matched tune-up parts and labor for this Mitsubishi vehicle.'
      when 'filter_service' then 'Matched filter parts and replacement labor for this Mitsubishi vehicle.'
      when 'tire_service' then 'Matched tire, wheel, and alignment services for this Mitsubishi vehicle.'
      else 'Matched Mitsubishi parts and services for this vehicle.'
    end,
    case
      when profile.service_group = 'oil_change' and profile.part_function = 'engine_oil' then 4
      else 1
    end,
    10,
    true,
    current_date
  from app.product_recommendation_profile profile
  where profile.service_group is not null
    and profile.is_vehicle_specific = true
    and coalesce(profile.model_name, '') <> '';

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into app.product_recommendation_package_items (
    package_id,
    item_kind,
    product_id,
    item_role,
    reason_label,
    display_priority,
    price_mode,
    is_active,
    business_date
  )
  select
    pkg.id,
    'product',
    rules.related_product_id,
    'part',
    rules.reason_label,
    rules.priority,
    'catalog',
    true,
    current_date
  from app.product_recommendation_packages pkg
  join app.quote_recommendation_rules rules
    on rules.anchor_product_id = pkg.anchor_product_id
   and rules.related_product_id is not null
   and rules.is_active = true
   and rules.package_key like 'auto-%';

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  insert into app.product_recommendation_package_items (
    package_id,
    item_kind,
    service_id,
    item_role,
    reason_label,
    display_priority,
    price_mode,
    is_active,
    business_date
  )
  select
    pkg.id,
    'service',
    svc_group.service_id,
    'service',
    case
      when pkg.service_group = 'oil_change' and anchor.part_function = 'engine_oil' and svc.code = 'SVC-OIL' then 'Free oil change labor when the matched oil quantity threshold is met'
      when pkg.service_group = 'brake_service' and svc.code = 'SVC-BRAKE-INSTALL' then 'Brake installation labor for the matched Mitsubishi package'
      when pkg.service_group = 'brake_service' and svc.code = 'SVC-BRAKE-CLEAN' then 'Brake cleaning labor for the matched Mitsubishi package'
      else 'Recommended compatible Mitsubishi service'
    end,
    svc_group.priority,
    case
      when pkg.service_group = 'oil_change' and anchor.part_function = 'engine_oil' and svc.code = 'SVC-OIL' then 'complimentary'
      else 'catalog'
    end,
    true,
    current_date
  from app.product_recommendation_packages pkg
  join app.product_recommendation_profile anchor on anchor.product_id = pkg.anchor_product_id
  join app.service_recommendation_groups svc_group
    on svc_group.service_group = pkg.service_group
   and svc_group.is_active = true
  join app.services svc
    on svc.id = svc_group.service_id
   and svc.is_active = true;

  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  return v_total;
end;
$$;

create or replace function public.get_product_recommendation_packages(
  p_product_id uuid,
  p_vehicle_model_name text default null,
  p_part_limit integer default 6,
  p_service_limit integer default 4
)
returns table (
  package_id uuid,
  package_key text,
  package_name text,
  package_description text,
  service_group text,
  vehicle_model_name text,
  vehicle_family text,
  min_anchor_quantity integer,
  package_priority integer,
  package_item_id uuid,
  item_kind text,
  item_role text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_product_sku text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_service_code text,
  reason_label text,
  display_priority integer,
  pricing_mode text,
  resolved_price numeric,
  display_price_label text,
  match_level text
)
language sql
security definer
set search_path = public, app
as $$
  with packages as (
    select pkg.*
    from app.product_recommendation_packages pkg
    where pkg.anchor_product_id = p_product_id
      and pkg.is_active = true
  ),
  ranked_items as (
    select
      pkg.id as package_id,
      pkg.package_key,
      pkg.package_name,
      pkg.package_description,
      pkg.service_group,
      pkg.vehicle_model_name,
      pkg.vehicle_family,
      pkg.min_anchor_quantity,
      pkg.priority as package_priority,
      item.id as package_item_id,
      item.item_kind,
      item.item_role,
      item.product_id as recommended_product_id,
      product.name as recommended_product_name,
      product.sku as recommended_product_sku,
      item.service_id as recommended_service_id,
      service.name as recommended_service_name,
      service.code as recommended_service_code,
      item.reason_label,
      item.display_priority,
      item.price_mode as pricing_mode,
      case
        when item.price_mode = 'complimentary' then 0::numeric
        when item.price_mode = 'override' then coalesce(item.price_override, 0)::numeric
        else coalesce(price.amount, service.standard_price, 0)::numeric
      end as resolved_price,
      case
        when item.price_mode = 'complimentary' then 'Free With Package'
        when item.price_mode = 'override' then 'Package Rate'
        else null
      end as display_price_label,
      case
        when item.item_kind = 'service' then 'service_bundle'
        when related.model_name = pkg.vehicle_model_name then 'exact_model'
        when related.vehicle_family = pkg.vehicle_family then 'family_match'
        else 'curated_override'
      end as match_level,
      row_number() over (
        partition by pkg.id, item.item_kind
        order by item.display_priority asc, coalesce(product.name, service.name) asc
      ) as kind_rank
    from packages pkg
    join app.product_recommendation_package_items item
      on item.package_id = pkg.id
     and item.is_active = true
    left join app.products product on product.id = item.product_id
    left join app.services service on service.id = item.service_id
    left join app.product_recommendation_profile related on related.product_id = item.product_id
    left join lateral (
      select pp.amount
      from app.product_prices pp
      where pp.product_id = item.product_id
        and pp.price_type = 'retail'
        and pp.is_current = true
      order by pp.effective_from desc, pp.created_at desc
      limit 1
    ) price on true
  )
  select
    package_id,
    package_key,
    package_name,
    package_description,
    service_group,
    vehicle_model_name,
    vehicle_family,
    min_anchor_quantity,
    package_priority,
    package_item_id,
    item_kind,
    item_role,
    recommended_product_id,
    recommended_product_name,
    recommended_product_sku,
    recommended_service_id,
    recommended_service_name,
    recommended_service_code,
    reason_label,
    display_priority,
    pricing_mode,
    resolved_price,
    display_price_label,
    match_level
  from ranked_items
  where (item_kind = 'product' and kind_rank <= greatest(coalesce(p_part_limit, 6), 1))
     or (item_kind = 'service' and kind_rank <= greatest(coalesce(p_service_limit, 4), 1))
  order by package_priority asc, package_name asc, item_kind asc, display_priority asc;
$$;

select app.refresh_product_recommendation_packages();
