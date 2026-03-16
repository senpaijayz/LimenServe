-- Mitsubishi curated rule seed
-- Run this after SUPABASE_MITSUBISHI_RECOMMENDATION_PROFILE.sql and SUPABASE_CURATED_RECOMMENDATIONS_FIX.sql

with companion_map as (
  select *
  from (
    values
      ('oil_filter', 'engine_oil', 'Compatible engine oil for the same Mitsubishi model', 20),
      ('oil_filter', 'drain_washer', 'Compatible drain washer for the same Mitsubishi model', 30),
      ('engine_oil', 'oil_filter', 'Compatible oil filter for the same Mitsubishi model', 20),
      ('engine_oil', 'drain_washer', 'Compatible drain washer for the same Mitsubishi model', 30),
      ('drain_washer', 'engine_oil', 'Compatible engine oil for the same Mitsubishi model', 20),
      ('drain_washer', 'oil_filter', 'Compatible oil filter for the same Mitsubishi model', 30),
      ('brake_pad', 'disc_rotor', 'Compatible rotor for the same Mitsubishi model', 20),
      ('brake_pad', 'brake_cleaner', 'Brake cleaner for the same Mitsubishi model', 30),
      ('brake_pad', 'brake_fluid', 'Brake fluid for the same Mitsubishi model', 40),
      ('brake_shoe', 'brake_cleaner', 'Brake cleaner for the same Mitsubishi model', 30),
      ('brake_shoe', 'brake_fluid', 'Brake fluid for the same Mitsubishi model', 40),
      ('brake_fluid', 'brake_pad', 'Compatible brake pad for the same Mitsubishi model', 20),
      ('brake_cleaner', 'brake_pad', 'Compatible brake pad for the same Mitsubishi model', 20),
      ('spark_plug', 'air_filter', 'Air filter commonly paired in tune-up work for the same model', 20),
      ('spark_plug', 'cabin_filter', 'Cabin filter commonly checked during tune-up for the same model', 30),
      ('spark_plug', 'fuel_filter', 'Fuel filter commonly paired in tune-up work for the same model', 40),
      ('air_filter', 'cabin_filter', 'Cabin filter commonly paired with air filter service for the same model', 20),
      ('air_filter', 'fuel_filter', 'Fuel filter commonly paired with air filter service for the same model', 30),
      ('cabin_filter', 'air_filter', 'Air filter commonly paired with cabin filter service for the same model', 20),
      ('fuel_filter', 'air_filter', 'Air filter commonly paired with fuel filter service for the same model', 20),
      ('battery', 'battery_terminal', 'Battery terminal item for the same Mitsubishi model', 20),
      ('battery_terminal', 'battery', 'Battery for the same Mitsubishi model', 20),
      ('radiator', 'coolant', 'Compatible coolant-related item for the same Mitsubishi model', 20),
      ('radiator', 'thermostat', 'Compatible thermostat for the same Mitsubishi model', 30),
      ('radiator', 'water_pump', 'Compatible water pump for the same Mitsubishi model', 40),
      ('coolant', 'radiator', 'Compatible radiator item for the same Mitsubishi model', 20),
      ('thermostat', 'radiator', 'Compatible radiator item for the same Mitsubishi model', 20),
      ('water_pump', 'radiator', 'Compatible radiator item for the same Mitsubishi model', 20),
      ('tire', 'wheel', 'Compatible wheel item for the same Mitsubishi model', 20),
      ('tire', 'wheel_valve', 'Compatible valve item for the same Mitsubishi model', 30),
      ('tire', 'lug_nut', 'Compatible lug hardware for the same Mitsubishi model', 40),
      ('wheel', 'tire', 'Compatible tire item for the same Mitsubishi model', 20)
  ) as mapping(anchor_part_function, related_part_function, reason_label, priority)
),
ranked_exact_products as (
  select
    anchor.product_id as anchor_product_id,
    related.product_id as related_product_id,
    anchor.model_name,
    anchor.vehicle_family,
    anchor.service_group,
    mapping.reason_label,
    mapping.priority,
    row_number() over (
      partition by anchor.product_id, mapping.related_part_function
      order by related.sku asc
    ) as rn
  from app.product_recommendation_profile anchor
  join companion_map mapping on mapping.anchor_part_function = anchor.part_function
  join app.product_recommendation_profile related
    on related.part_function = mapping.related_part_function
   and related.model_name = anchor.model_name
   and related.product_id <> anchor.product_id
  where anchor.model_name is not null
    and anchor.service_group is not null
),
ranked_family_products as (
  select
    anchor.product_id as anchor_product_id,
    related.product_id as related_product_id,
    anchor.model_name,
    anchor.vehicle_family,
    anchor.service_group,
    replace(mapping.reason_label, 'same Mitsubishi model', 'same Mitsubishi family') as reason_label,
    mapping.priority + 100 as priority,
    row_number() over (
      partition by anchor.product_id, mapping.related_part_function
      order by related.sku asc
    ) as rn
  from app.product_recommendation_profile anchor
  join companion_map mapping on mapping.anchor_part_function = anchor.part_function
  join app.product_recommendation_profile related
    on related.part_function = mapping.related_part_function
   and related.vehicle_family = anchor.vehicle_family
   and related.product_id <> anchor.product_id
  where anchor.vehicle_family is not null
    and anchor.service_group is not null
    and not exists (
      select 1
      from app.product_recommendation_profile exact_related
      where exact_related.part_function = mapping.related_part_function
        and exact_related.model_name = anchor.model_name
        and exact_related.product_id <> anchor.product_id
    )
),
service_matches as (
  select
    anchor.product_id as anchor_product_id,
    service_map.service_id,
    anchor.model_name,
    anchor.vehicle_family,
    anchor.service_group,
    case anchor.service_group
      when 'oil_change' then 'Suggested oil change service for this Mitsubishi vehicle'
      when 'brake_service' then 'Suggested brake service for this Mitsubishi vehicle'
      when 'cooling_service' then 'Suggested cooling-system service for this Mitsubishi vehicle'
      when 'battery_service' then 'Suggested battery or electrical service for this Mitsubishi vehicle'
      when 'tune_up' then 'Suggested tune-up service for this Mitsubishi vehicle'
      when 'filter_service' then 'Suggested filter replacement service for this Mitsubishi vehicle'
      when 'tire_service' then 'Suggested tire service for this Mitsubishi vehicle'
      else 'Suggested compatible Mitsubishi service'
    end as reason_label,
    service_map.priority,
    row_number() over (
      partition by anchor.product_id, anchor.service_group
      order by service_map.priority asc, service_map.service_id asc
    ) as rn
  from app.product_recommendation_profile anchor
  join app.service_recommendation_groups service_map
    on service_map.service_group = anchor.service_group
   and service_map.is_active = true
  where anchor.service_group is not null
)
delete from app.quote_recommendation_rules
where package_key like 'auto-%';

insert into app.quote_recommendation_rules (
  anchor_type,
  anchor_product_id,
  related_product_id,
  vehicle_model_name,
  vehicle_family,
  service_group,
  reason_label,
  package_key,
  package_name,
  package_description,
  priority,
  is_active
)
select
  'product',
  anchor_product_id,
  related_product_id,
  model_name,
  vehicle_family,
  service_group,
  reason_label,
  concat('auto-', service_group, '-exact'),
  initcap(replace(service_group, '_', ' ')) || ' Package',
  'Auto-generated same-vehicle Mitsubishi package based on the imported pricelist.',
  priority,
  true
from ranked_exact_products
where rn = 1;

insert into app.quote_recommendation_rules (
  anchor_type,
  anchor_product_id,
  related_product_id,
  vehicle_model_name,
  vehicle_family,
  service_group,
  reason_label,
  package_key,
  package_name,
  package_description,
  priority,
  is_active
)
select
  'product',
  anchor_product_id,
  related_product_id,
  null,
  vehicle_family,
  service_group,
  reason_label,
  concat('auto-', service_group, '-family'),
  initcap(replace(service_group, '_', ' ')) || ' Family Package',
  'Auto-generated Mitsubishi family fallback package based on the imported pricelist.',
  priority,
  true
from ranked_family_products
where rn = 1;

insert into app.quote_recommendation_rules (
  anchor_type,
  anchor_product_id,
  related_service_id,
  vehicle_model_name,
  vehicle_family,
  service_group,
  reason_label,
  package_key,
  package_name,
  package_description,
  priority,
  is_active
)
select
  'product',
  anchor_product_id,
  service_id,
  model_name,
  vehicle_family,
  service_group,
  reason_label,
  concat('auto-', service_group, '-service'),
  initcap(replace(service_group, '_', ' ')) || ' Service Package',
  'Auto-generated Mitsubishi service recommendation based on part function and vehicle match.',
  priority,
  true
from service_matches
where rn = 1;

select
  service_group,
  count(*) as rule_count
from app.quote_recommendation_rules
where package_key like 'auto-%'
group by service_group
order by service_group;
