with classified as (
  select
    id,
    case
      when search_text ~ '(sandpaper|cleaner|degreaser|adhesive|sealant|paint|spray|polish|compound|tape)' then 'Tools & Consumables'
      when search_text ~ '(brake|disc rotor|rotor|caliper|booster|master cylinder|m cyl|pad set|brake pad|brake shoe|parking brake|susp|suspension|strut|shock|coil spring|leaf spring|stabilizer|control arm|ball joint|knuckle|hub bearing|wheel bearing|tie rod|rack end|power steering|steering rack|steering gear|steering column|bushing|link assy)' then 'Brakes & Suspension'
      when search_text ~ '(radiator|coolant|cooling|thermostat|water pump|condenser|compressor|evaporator|heater core|fan shroud|fan motor|intercooler|overflow tank|cond tank|aircon|a c)' then 'Cooling & A/C'
      when search_text ~ '(transmission|gearshift|shift lever|shift cable|drive shaft|driveshaft|propeller shaft|cv joint|axle|differential|flywheel|clutch|release fork|input shaft|output shaft|torque converter|parking pawl|parking lever|transfer)' then 'Transmission & Drivetrain'
      when search_text ~ '(sensor|switch|relay|fuse|harness|wiring|wire|alternator|starter|battery|motor|solenoid|control unit|module|ecu|socket|bulb holder|connector|terminal|horn|lamp|headlamp|tail lamp|fog lamp|bulb)' then 'Electrical & Lighting'
      when search_text ~ '(filter|strainer|engine oil|motor oil|gear oil|transmission oil|atf|mtf|lubricant|grease|fluid|washer fluid)' then 'Filters & Fluids'
      when search_text ~ '(engine|cylinder|crankshaft|camshaft|valve|piston|gasket|o ring|oil seal|seal kit|rocker|manifold|injector|throttle|timing|oil pan|fuel pump|turbo|spark plug|glow plug|ignition coil|pcv|breather|head gasket|engine mount|mounting)' then 'Engine & Ignition'
      when search_text ~ '(door|bumper|hood|fender|panel|mirror|glass|window|grille|weatherstrip|w strip|tailgate|roof|wheelhouse|windshield|door lock|door lamp|quarter panel|side sill|apron)' then 'Body & Exterior'
      when search_text ~ '(seat|trim|garnish|moulding|molding|console|instrument panel|dashboard|room mirror|interior|steering wheel|seat belt|floor console|bezel|meter hood|sunvisor)' then 'Interior & Trim'
      when search_text ~ '(clip|screw|bolt|nut|washer|grommet|bracket|retainer|rivet|spacer|pin|plug|cap|lug nut|wheel nut|wheel bolt|valve stem|wheel valve|hub cap|hubcap)' then 'Hardware & Fasteners'
      when lower(coalesce(source_category, category, '')) in ('air conditioning', 'cooling', 'cooling system') then 'Cooling & A/C'
      when lower(coalesce(source_category, category, '')) in ('electrical', 'lighting', 'electrical & sensors') then 'Electrical & Lighting'
      when lower(coalesce(source_category, category, '')) in ('engine', 'ignition', 'exhaust', 'belts & pulleys', 'ignition & engine components') then 'Engine & Ignition'
      when lower(coalesce(source_category, category, '')) in ('body parts', 'body & interior') then 'Body & Exterior'
      when lower(coalesce(source_category, category, '')) in ('filters', 'fluids & oils', 'filters & fluids') then 'Filters & Fluids'
      when lower(coalesce(source_category, category, '')) in ('brakes', 'steering', 'suspension', 'brakes & suspension') then 'Brakes & Suspension'
      when lower(coalesce(source_category, category, '')) in ('clutch', 'transmission', 'transmission & drivetrain') then 'Transmission & Drivetrain'
      else 'General Parts & Accessories'
    end as new_category
  from (
    select
      id,
      category,
      source_category,
      lower(regexp_replace(concat_ws(' ', name, model_name, source_category), '[\\.,/()\\-_:;+\\[\\]{}]+', ' ', 'g')) as search_text
    from catalog.products
  ) normalized
),
updated as (
  update catalog.products p
  set
    category = c.new_category,
    metadata = jsonb_set(
      coalesce(p.metadata, '{}'::jsonb),
      '{classification}',
      jsonb_build_object(
        'version', '2026-05-22-v2',
        'strategy', 'bulk_reclassification',
        'confidence', case when c.new_category = 'General Parts & Accessories' then 'low' else 'medium' end,
        'ruleKey', 'catalog-category-refinement',
        'matchedTokens', '[]'::jsonb
      ),
      true
    ),
    updated_at = timezone('utc', now())
  from classified c
  where p.id = c.id
    and (
      p.category is distinct from c.new_category
      or p.metadata->'classification'->>'version' is distinct from '2026-05-22-v2'
    )
  returning p.id
)
select count(*) as reclassified_count from updated;

delete from catalog.categories
where name not in (
  'Brakes & Suspension',
  'Electrical & Lighting',
  'Filters & Fluids',
  'Engine & Ignition',
  'Cooling & A/C',
  'Transmission & Drivetrain',
  'Body & Exterior',
  'Interior & Trim',
  'Hardware & Fasteners',
  'Tools & Consumables',
  'General Parts & Accessories'
);

insert into catalog.categories (name, description, color)
values
  ('Brakes & Suspension', 'Brake, chassis, steering linkage, hub bearing, and suspension service parts.', '#2563eb'),
  ('Electrical & Lighting', 'Sensors, switches, harnesses, modules, lamps, bulbs, and electrical controls.', '#7c3aed'),
  ('Filters & Fluids', 'Filters, lubricants, coolants, washer fluid, grease, and maintenance fluids.', '#059669'),
  ('Engine & Ignition', 'Engine mechanical, fuel, gasket, seal, turbo, ignition, and tune-up components.', '#dc2626'),
  ('Cooling & A/C', 'Radiator, coolant, condenser, compressor, heater, fan, and air-conditioning parts.', '#0891b2'),
  ('Transmission & Drivetrain', 'Transmission, clutch, axle, differential, transfer, and driveline parts.', '#9333ea'),
  ('Body & Exterior', 'Exterior panels, doors, bumpers, glass, mirrors, grille, tailgate, and body shell parts.', '#ea580c'),
  ('Interior & Trim', 'Cabin trim, seats, consoles, dashboard, instrument panel, steering wheel trim, and garnish parts.', '#4f46e5'),
  ('Hardware & Fasteners', 'Clips, bolts, screws, nuts, washers, grommets, brackets, retainers, plugs, and caps.', '#64748b'),
  ('Tools & Consumables', 'Sandpaper, cleaners, adhesive, sealant, paint, spray, polish, tape, and shop consumables.', '#0f766e'),
  ('General Parts & Accessories', 'Accessories and uncategorized Mitsubishi parts that do not fit a more specific group.', '#1d4ed8')
on conflict (name) do update set
  description = excluded.description,
  color = excluded.color,
  updated_at = now();
