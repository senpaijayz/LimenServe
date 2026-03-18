insert into app.services (code, name, description, standard_price, estimated_duration_minutes)
values
  ('SVC-BRAKE-INSTALL', 'Brake Pad Installation Service', 'Dedicated brake installation labor for matched brake packages', 950.00, 75),
  ('SVC-BRAKE-CLEAN', 'Brake Cleaning Service', 'Dedicated brake cleaning and dust removal service', 420.00, 35),
  ('SVC-TIRE-INSTALL', 'Tire Installation Service', 'Tire mounting and installation labor', 600.00, 45),
  ('SVC-WHEEL-BAL', 'Wheel Balancing Service', 'Wheel balancing for smoother handling and tire wear', 450.00, 45),
  ('SVC-WHEEL-ALIGN', 'Wheel Alignment Service', 'Wheel alignment and steering geometry adjustment', 850.00, 60),
  ('SVC-COOL', 'Cooling System Service', 'Cooling-system inspection, radiator and coolant service', 1250.00, 90),
  ('SVC-FILTER', 'Filter Replacement Service', 'Labor for air, cabin, or fuel filter replacement', 500.00, 45)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  standard_price = excluded.standard_price,
  estimated_duration_minutes = excluded.estimated_duration_minutes,
  updated_at = timezone('utc', now());

insert into app.service_recommendation_groups (service_id, service_group, priority, vehicle_model_name, vehicle_family, is_active, updated_at)
select
  svc.id,
  mapping.service_group,
  mapping.priority,
  null,
  null,
  true,
  timezone('utc', now())
from app.services svc
join (
  values
    ('SVC-OIL', 'oil_change', 5),
    ('SVC-BRAKE-INSTALL', 'brake_service', 5),
    ('SVC-BRAKE-CLEAN', 'brake_service', 8),
    ('SVC-BRAKE', 'brake_service', 12),
    ('SVC-TUNE', 'tune_up', 10),
    ('SVC-BATT', 'battery_service', 10),
    ('SVC-TIRE-INSTALL', 'tire_service', 5),
    ('SVC-WHEEL-BAL', 'tire_service', 10),
    ('SVC-WHEEL-ALIGN', 'tire_service', 15),
    ('SVC-COOL', 'cooling_service', 10),
    ('SVC-FILTER', 'filter_service', 10)
) as mapping(code, service_group, priority)
  on mapping.code = svc.code
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
      when 'oil_change' then 'Smart Oil Care Bundle'
      when 'brake_service' then 'Smart Brake Care Bundle'
      when 'cooling_service' then 'Smart Cooling Care Bundle'
      when 'battery_service' then 'Smart Battery Care Bundle'
      when 'tune_up' then 'Smart Tune-Up Bundle'
      when 'filter_service' then 'Smart Filter Service Bundle'
      when 'tire_service' then 'Smart Tire Care Bundle'
      else 'Smart Mitsubishi Bundle'
    end,
    case profile.service_group
      when 'oil_change' then 'Upsell bundle of oil, filter, washer, and labor with light package savings for this Mitsubishi vehicle.'
      when 'brake_service' then 'Upsell bundle of brake parts, installation, and cleaning labor for this Mitsubishi vehicle.'
      when 'cooling_service' then 'Upsell bundle of cooling-system parts and labor with smart package pricing for this Mitsubishi vehicle.'
      when 'battery_service' then 'Upsell bundle of battery, terminal, and electrical service recommendations for this Mitsubishi vehicle.'
      when 'tune_up' then 'Upsell bundle of ignition, filter, and tune-up labor tailored to this Mitsubishi vehicle.'
      when 'filter_service' then 'Upsell bundle of replacement filters and labor with light package savings for this Mitsubishi vehicle.'
      when 'tire_service' then 'Upsell bundle of tire, wheel, balancing, and alignment services for this Mitsubishi vehicle.'
      else 'Smart upsell bundle of Mitsubishi-matched parts and services for this vehicle.'
    end,
    case
      when profile.service_group = 'oil_change' and profile.part_function = 'engine_oil' then 4
      else 1
    end,
    case profile.service_group
      when 'oil_change' then 5
      when 'brake_service' then 10
      when 'tire_service' then 15
      when 'cooling_service' then 20
      when 'battery_service' then 25
      when 'filter_service' then 30
      when 'tune_up' then 35
      else 50
    end,
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
    price_override,
    is_active,
    business_date
  )
  select
    pkg.id,
    'product',
    rules.related_product_id,
    'part',
    case
      when related.model_name = pkg.vehicle_model_name then 'Smart upsell add-on for the same exact Mitsubishi model'
      when related.vehicle_family = pkg.vehicle_family then 'Smart upsell add-on for the same Mitsubishi family'
      else coalesce(rules.reason_label, 'Smart Mitsubishi upsell add-on')
    end,
    coalesce(rules.priority, 100),
    case
      when current_price.amount is not null then 'override'
      else 'catalog'
    end,
    case
      when current_price.amount is null then null
      when related.model_name = pkg.vehicle_model_name then round((current_price.amount * 0.95)::numeric, 2)
      else round((current_price.amount * 0.97)::numeric, 2)
    end,
    true,
    current_date
  from app.product_recommendation_packages pkg
  join app.quote_recommendation_rules rules
    on rules.anchor_product_id = pkg.anchor_product_id
   and rules.related_product_id is not null
   and rules.is_active = true
   and rules.package_key like 'auto-%'
  left join app.product_recommendation_profile related
    on related.product_id = rules.related_product_id
  left join lateral (
    select pp.amount
    from app.product_prices pp
    where pp.product_id = rules.related_product_id
      and pp.price_type = 'retail'
      and pp.is_current = true
    order by pp.effective_from desc, pp.created_at desc
    limit 1
  ) current_price on true;

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
    price_override,
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
      when pkg.service_group = 'brake_service' and svc.code = 'SVC-BRAKE-INSTALL' then 'Smart brake installation labor for this bundle'
      when pkg.service_group = 'brake_service' and svc.code = 'SVC-BRAKE-CLEAN' then 'Smart brake cleaning labor for this bundle'
      when pkg.service_group = 'tire_service' and svc.code = 'SVC-WHEEL-ALIGN' then 'Smart alignment service for the matched tire bundle'
      else 'Smart Mitsubishi service bundle recommendation'
    end,
    svc_group.priority,
    case
      when pkg.service_group = 'oil_change' and anchor.part_function = 'engine_oil' and svc.code = 'SVC-OIL' then 'complimentary'
      when coalesce(svc.standard_price, 0) > 0 then 'override'
      else 'catalog'
    end,
    case
      when pkg.service_group = 'oil_change' and anchor.part_function = 'engine_oil' and svc.code = 'SVC-OIL' then null
      when coalesce(svc.standard_price, 0) <= 0 then null
      when pkg.service_group in ('brake_service', 'tire_service') then round((svc.standard_price * 0.95)::numeric, 2)
      else round((svc.standard_price * 0.97)::numeric, 2)
    end,
    true,
    current_date
  from app.product_recommendation_packages pkg
  join app.product_recommendation_profile anchor
    on anchor.product_id = pkg.anchor_product_id
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

drop function if exists public.get_product_recommendation_packages(uuid, text, integer, integer);

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
  catalog_price numeric,
  resolved_price numeric,
  discount_amount numeric,
  discount_percent integer,
  display_price_label text,
  match_level text,
  recommendation_label text
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
  base_items as (
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
        when item.item_kind = 'service' then coalesce(service.standard_price, 0)::numeric
        else coalesce(price.amount, 0)::numeric
      end as catalog_price,
      case
        when item.price_mode = 'complimentary' then 0::numeric
        when item.price_mode = 'override' then coalesce(item.price_override, 0)::numeric
        when item.item_kind = 'service' then coalesce(service.standard_price, 0)::numeric
        else coalesce(price.amount, 0)::numeric
      end as resolved_price,
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
  ),
  ranked_items as (
    select
      base_items.*,
      greatest(base_items.catalog_price - base_items.resolved_price, 0)::numeric as discount_amount,
      case
        when base_items.catalog_price > 0 and base_items.resolved_price < base_items.catalog_price
          then round(((base_items.catalog_price - base_items.resolved_price) / base_items.catalog_price) * 100)::integer
        else 0
      end as discount_percent,
      case
        when base_items.pricing_mode = 'complimentary' then 'Free With Package'
        when base_items.pricing_mode = 'override'
          and base_items.catalog_price > 0
          and base_items.resolved_price < base_items.catalog_price
          then concat('Smart Save ', round(((base_items.catalog_price - base_items.resolved_price) / base_items.catalog_price) * 100)::integer, '%')
        when base_items.pricing_mode = 'override' then 'Smart Package Rate'
        else null
      end as display_price_label,
      'Smart Recommendation'::text as recommendation_label
    from base_items
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
    catalog_price,
    resolved_price,
    discount_amount,
    discount_percent,
    display_price_label,
    match_level,
    recommendation_label
  from ranked_items
  where (item_kind = 'product' and kind_rank <= greatest(coalesce(p_part_limit, 6), 1))
     or (item_kind = 'service' and kind_rank <= greatest(coalesce(p_service_limit, 4), 1))
  order by package_priority asc, package_name asc, item_kind asc, display_priority asc;
$$;

select app.refresh_product_recommendation_packages();
