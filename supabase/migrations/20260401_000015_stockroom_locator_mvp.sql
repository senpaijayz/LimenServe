create extension if not exists pg_trgm;

create table if not exists app.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists stores_single_active_idx
  on app.stores ((is_active))
  where is_active;

create table if not exists app.layouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references app.stores(id) on delete cascade,
  name text not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  staircase_floor_1_anchor jsonb,
  staircase_floor_2_anchor jsonb,
  camera_settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (store_id, version_number)
);

create unique index if not exists layouts_single_published_idx
  on app.layouts (store_id)
  where status = 'published';

create table if not exists app.floors (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references app.layouts(id) on delete cascade,
  floor_number integer not null check (floor_number in (1, 2)),
  name text not null,
  width numeric(10,2) not null default 28.00 check (width > 0),
  depth numeric(10,2) not null default 18.00 check (depth > 0),
  elevation numeric(10,2) not null default 0.00,
  entry_anchor jsonb not null default '{"x":0,"y":0}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (layout_id, floor_number)
);

create table if not exists app.zones (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references app.layouts(id) on delete cascade,
  floor_id uuid not null references app.floors(id) on delete cascade,
  code text not null,
  name text not null,
  position_x numeric(10,2) not null default 0.00,
  position_y numeric(10,2) not null default 0.00,
  width numeric(10,2) not null default 8.00 check (width > 0),
  depth numeric(10,2) not null default 6.00 check (depth > 0),
  color_hex text not null default '#2563eb',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (layout_id, floor_id, code)
);

create table if not exists app.aisles (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references app.layouts(id) on delete cascade,
  floor_id uuid not null references app.floors(id) on delete cascade,
  zone_id uuid not null references app.zones(id) on delete cascade,
  code text not null,
  name text not null,
  start_x numeric(10,2) not null default 0.00,
  start_y numeric(10,2) not null default 0.00,
  end_x numeric(10,2) not null default 5.00,
  end_y numeric(10,2) not null default 0.00,
  walkway_width numeric(10,2) not null default 1.80 check (walkway_width > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (layout_id, floor_id, code)
);

create table if not exists app.shelves (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references app.layouts(id) on delete cascade,
  floor_id uuid not null references app.floors(id) on delete cascade,
  zone_id uuid not null references app.zones(id) on delete cascade,
  aisle_id uuid not null references app.aisles(id) on delete cascade,
  code text not null,
  name text not null,
  shelf_type text not null check (shelf_type in ('2_level', '4_level')),
  position_x numeric(10,2) not null default 0.00,
  position_y numeric(10,2) not null default 0.00,
  rotation numeric(10,2) not null default 0.00,
  width numeric(10,2) not null default 2.40 check (width > 0),
  depth numeric(10,2) not null default 0.90 check (depth > 0),
  height numeric(10,2) not null default 2.20 check (height > 0),
  access_side text not null default 'front' check (access_side in ('front', 'back', 'left', 'right')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (layout_id, floor_id, code)
);

create table if not exists app.shelf_levels (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references app.shelves(id) on delete cascade,
  level_number integer not null check (level_number between 1 and 4),
  elevation numeric(10,2) not null default 0.50,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (shelf_id, level_number)
);

create table if not exists app.shelf_slots (
  id uuid primary key default gen_random_uuid(),
  shelf_level_id uuid not null references app.shelf_levels(id) on delete cascade,
  slot_number integer not null check (slot_number > 0),
  slot_label text,
  position_x numeric(10,2) not null default 0.00,
  width numeric(10,2) not null default 0.55 check (width > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (shelf_level_id, slot_number)
);

create table if not exists app.items (
  product_id uuid primary key references app.products(id) on delete cascade,
  part_code text,
  keywords text[] not null default '{}'::text[],
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists items_part_code_unique_idx
  on app.items (part_code)
  where part_code is not null;

create table if not exists app.admin_users (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references app.stores(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'editor')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (store_id, user_id)
);

create table if not exists app.item_locations (
  id uuid primary key default gen_random_uuid(),
  layout_id uuid not null references app.layouts(id) on delete cascade,
  item_id uuid not null references app.items(product_id) on delete cascade,
  floor_id uuid not null references app.floors(id) on delete cascade,
  zone_id uuid not null references app.zones(id) on delete cascade,
  aisle_id uuid not null references app.aisles(id) on delete cascade,
  shelf_id uuid not null references app.shelves(id) on delete cascade,
  shelf_level_id uuid not null references app.shelf_levels(id) on delete cascade,
  shelf_slot_id uuid not null references app.shelf_slots(id) on delete cascade,
  is_active boolean not null default true,
  route_hint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists item_locations_active_item_idx
  on app.item_locations (layout_id, item_id)
  where is_active;

create unique index if not exists item_locations_active_slot_idx
  on app.item_locations (layout_id, shelf_slot_id)
  where is_active;

create index if not exists items_keywords_gin_idx
  on app.items
  using gin (keywords);

create index if not exists products_name_trgm_idx
  on app.products
  using gin (name gin_trgm_ops);

create index if not exists products_sku_trgm_idx
  on app.products
  using gin (sku gin_trgm_ops);

create index if not exists item_locations_item_id_idx
  on app.item_locations (item_id);

create index if not exists floors_layout_idx
  on app.floors (layout_id, floor_number);

create index if not exists zones_layout_floor_idx
  on app.zones (layout_id, floor_id);

create index if not exists aisles_layout_floor_zone_idx
  on app.aisles (layout_id, floor_id, zone_id);

create index if not exists shelves_layout_floor_zone_aisle_idx
  on app.shelves (layout_id, floor_id, zone_id, aisle_id);

create or replace function app.can_manage_stockroom()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_role() = 'admin'
    or exists (
      select 1
      from app.admin_users au
      where au.user_id = auth.uid()
        and au.is_active
    );
$$;

create or replace function app.can_view_stockroom_layout(p_layout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.can_manage_stockroom()
    or exists (
      select 1
      from app.layouts l
      where l.id = p_layout_id
        and l.status = 'published'
    );
$$;

create or replace function app.sync_stockroom_item_from_product()
returns trigger
language plpgsql
set search_path = app, public
as $$
begin
  insert into app.items (product_id, part_code, keywords, is_active)
  values (
    new.id,
    nullif(new.sku, ''),
    array_remove(array[new.category, new.model_name, new.brand], null),
    coalesce(new.is_active, true)
  )
  on conflict (product_id) do update
    set part_code = coalesce(app.items.part_code, excluded.part_code),
        keywords = case
          when coalesce(array_length(app.items.keywords, 1), 0) = 0 then excluded.keywords
          else app.items.keywords
        end,
        is_active = excluded.is_active;

  return new;
end;
$$;

create or replace function app.validate_stockroom_layout_publish()
returns trigger
language plpgsql
set search_path = app, public
as $$
declare
  v_floor_count integer;
  v_floor_1_present boolean;
  v_floor_2_present boolean;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    if new.staircase_floor_1_anchor is null or new.staircase_floor_2_anchor is null then
      raise exception 'A publishable layout must define staircase anchors for both floors.';
    end if;

    select
      count(*),
      bool_or(floor_number = 1),
      bool_or(floor_number = 2)
    into
      v_floor_count,
      v_floor_1_present,
      v_floor_2_present
    from app.floors
    where layout_id = new.id;

    if coalesce(v_floor_count, 0) <> 2 or not coalesce(v_floor_1_present, false) or not coalesce(v_floor_2_present, false) then
      raise exception 'A publishable layout must contain exactly two floors numbered 1 and 2.';
    end if;

    new.published_at = timezone('utc', now());
  end if;

  if new.status <> 'published' then
    new.published_at = null;
  end if;

  return new;
end;
$$;

create or replace function app.validate_shelf_level_limit()
returns trigger
language plpgsql
set search_path = app, public
as $$
declare
  v_shelf_type text;
  v_existing_count integer;
  v_max_levels integer;
begin
  select shelf_type
  into v_shelf_type
  from app.shelves
  where id = new.shelf_id;

  if v_shelf_type is null then
    raise exception 'Shelf % does not exist.', new.shelf_id;
  end if;

  v_max_levels := case when v_shelf_type = '2_level' then 2 else 4 end;

  if new.level_number > v_max_levels then
    raise exception 'Shelf type % only allows % levels.', v_shelf_type, v_max_levels;
  end if;

  select count(*)
  into v_existing_count
  from app.shelf_levels
  where shelf_id = new.shelf_id
    and id <> coalesce(new.id, gen_random_uuid());

  if v_existing_count >= v_max_levels then
    raise exception 'Shelf % already has the maximum number of levels for type %.', new.shelf_id, v_shelf_type;
  end if;

  return new;
end;
$$;

create or replace function app.validate_item_location_hierarchy()
returns trigger
language plpgsql
set search_path = app, public
as $$
declare
  v_floor_id uuid;
  v_zone_id uuid;
  v_aisle_id uuid;
  v_shelf_id uuid;
  v_level_id uuid;
  v_slot_id uuid;
begin
  select
    sh.floor_id,
    sh.zone_id,
    sh.aisle_id,
    sh.id,
    sl.id,
    ss.id
  into
    v_floor_id,
    v_zone_id,
    v_aisle_id,
    v_shelf_id,
    v_level_id,
    v_slot_id
  from app.shelf_slots ss
  join app.shelf_levels sl on sl.id = ss.shelf_level_id
  join app.shelves sh on sh.id = sl.shelf_id
  where ss.id = new.shelf_slot_id;

  if v_slot_id is null then
    raise exception 'Shelf slot % does not exist.', new.shelf_slot_id;
  end if;

  if new.layout_id <> (select layout_id from app.shelves where id = v_shelf_id) then
    raise exception 'Item location layout does not match the selected shelf.';
  end if;

  if new.floor_id <> v_floor_id
    or new.zone_id <> v_zone_id
    or new.aisle_id <> v_aisle_id
    or new.shelf_id <> v_shelf_id
    or new.shelf_level_id <> v_level_id then
    raise exception 'Item location hierarchy is invalid for slot %.', new.shelf_slot_id;
  end if;

  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'stores',
    'layouts',
    'floors',
    'zones',
    'aisles',
    'shelves',
    'shelf_levels',
    'shelf_slots',
    'items',
    'admin_users',
    'item_locations'
  ] loop
    execute format('drop trigger if exists set_%1$s_updated_at on app.%1$s', tbl);
    execute format('create trigger set_%1$s_updated_at before update on app.%1$s for each row execute function app.touch_updated_at()', tbl);
    execute format('alter table app.%I enable row level security', tbl);
  end loop;
end;
$$;

drop trigger if exists sync_stockroom_item_from_product on app.products;
create trigger sync_stockroom_item_from_product
after insert on app.products
for each row
execute function app.sync_stockroom_item_from_product();

drop trigger if exists validate_stockroom_layout_publish on app.layouts;
create trigger validate_stockroom_layout_publish
before insert or update on app.layouts
for each row
execute function app.validate_stockroom_layout_publish();

drop trigger if exists validate_shelf_level_limit on app.shelf_levels;
create trigger validate_shelf_level_limit
before insert or update on app.shelf_levels
for each row
execute function app.validate_shelf_level_limit();

drop trigger if exists validate_item_location_hierarchy on app.item_locations;
create trigger validate_item_location_hierarchy
before insert or update on app.item_locations
for each row
execute function app.validate_item_location_hierarchy();

insert into app.items (product_id, part_code, keywords, is_active)
select
  p.id,
  nullif(p.sku, ''),
  array_remove(array[p.category, p.model_name, p.brand], null),
  p.is_active
from app.products p
on conflict (product_id) do update
  set is_active = excluded.is_active;

drop policy if exists stores_stockroom_select on app.stores;
create policy stores_stockroom_select
on app.stores
for select
to authenticated
using (app.is_internal_user());

drop policy if exists stores_stockroom_manage on app.stores;
create policy stores_stockroom_manage
on app.stores
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists layouts_stockroom_select on app.layouts;
create policy layouts_stockroom_select
on app.layouts
for select
to authenticated
using (app.can_view_stockroom_layout(id));

drop policy if exists layouts_stockroom_manage on app.layouts;
create policy layouts_stockroom_manage
on app.layouts
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists floors_stockroom_select on app.floors;
create policy floors_stockroom_select
on app.floors
for select
to authenticated
using (app.can_view_stockroom_layout(layout_id));

drop policy if exists floors_stockroom_manage on app.floors;
create policy floors_stockroom_manage
on app.floors
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists zones_stockroom_select on app.zones;
create policy zones_stockroom_select
on app.zones
for select
to authenticated
using (app.can_view_stockroom_layout(layout_id));

drop policy if exists zones_stockroom_manage on app.zones;
create policy zones_stockroom_manage
on app.zones
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists aisles_stockroom_select on app.aisles;
create policy aisles_stockroom_select
on app.aisles
for select
to authenticated
using (app.can_view_stockroom_layout(layout_id));

drop policy if exists aisles_stockroom_manage on app.aisles;
create policy aisles_stockroom_manage
on app.aisles
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists shelves_stockroom_select on app.shelves;
create policy shelves_stockroom_select
on app.shelves
for select
to authenticated
using (app.can_view_stockroom_layout(layout_id));

drop policy if exists shelves_stockroom_manage on app.shelves;
create policy shelves_stockroom_manage
on app.shelves
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists shelf_levels_stockroom_select on app.shelf_levels;
create policy shelf_levels_stockroom_select
on app.shelf_levels
for select
to authenticated
using (
  app.can_view_stockroom_layout(
    (select sh.layout_id from app.shelves sh where sh.id = shelf_id)
  )
);

drop policy if exists shelf_levels_stockroom_manage on app.shelf_levels;
create policy shelf_levels_stockroom_manage
on app.shelf_levels
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists shelf_slots_stockroom_select on app.shelf_slots;
create policy shelf_slots_stockroom_select
on app.shelf_slots
for select
to authenticated
using (
  app.can_view_stockroom_layout(
    (
      select sh.layout_id
      from app.shelf_levels sl
      join app.shelves sh on sh.id = sl.shelf_id
      where sl.id = shelf_level_id
    )
  )
);

drop policy if exists shelf_slots_stockroom_manage on app.shelf_slots;
create policy shelf_slots_stockroom_manage
on app.shelf_slots
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists items_stockroom_select on app.items;
create policy items_stockroom_select
on app.items
for select
to authenticated
using (app.is_internal_user());

drop policy if exists items_stockroom_manage on app.items;
create policy items_stockroom_manage
on app.items
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists admin_users_stockroom_select on app.admin_users;
create policy admin_users_stockroom_select
on app.admin_users
for select
to authenticated
using (app.can_manage_stockroom());

drop policy if exists admin_users_stockroom_manage on app.admin_users;
create policy admin_users_stockroom_manage
on app.admin_users
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

drop policy if exists item_locations_stockroom_select on app.item_locations;
create policy item_locations_stockroom_select
on app.item_locations
for select
to authenticated
using (app.can_view_stockroom_layout(layout_id));

drop policy if exists item_locations_stockroom_manage on app.item_locations;
create policy item_locations_stockroom_manage
on app.item_locations
for all
to authenticated
using (app.can_manage_stockroom())
with check (app.can_manage_stockroom());

grant select, insert, update, delete on app.stores to authenticated;
grant select, insert, update, delete on app.layouts to authenticated;
grant select, insert, update, delete on app.floors to authenticated;
grant select, insert, update, delete on app.zones to authenticated;
grant select, insert, update, delete on app.aisles to authenticated;
grant select, insert, update, delete on app.shelves to authenticated;
grant select, insert, update, delete on app.shelf_levels to authenticated;
grant select, insert, update, delete on app.shelf_slots to authenticated;
grant select, insert, update, delete on app.items to authenticated;
grant select, insert, update, delete on app.admin_users to authenticated;
grant select, insert, update, delete on app.item_locations to authenticated;

do $$
declare
  v_store_id uuid;
  v_layout_id uuid;
  v_floor_1_id uuid;
  v_floor_2_id uuid;
begin
  insert into app.stores (code, name, description, is_active, metadata)
  values (
    'LIMEN_MAIN',
    'Limen Main Store',
    'Two-floor inventory locator store.',
    true,
    '{"floors":2}'::jsonb
  )
  on conflict (code) do update
    set name = excluded.name,
        description = excluded.description,
        metadata = excluded.metadata,
        is_active = true
  returning id into v_store_id;

  if v_store_id is null then
    select id into v_store_id
    from app.stores
    where code = 'LIMEN_MAIN'
    limit 1;
  end if;

  insert into app.layouts (
    store_id,
    name,
    version_number,
    status,
    staircase_floor_1_anchor,
    staircase_floor_2_anchor,
    camera_settings,
    metadata
  )
  values (
    v_store_id,
    'Default Locator Layout',
    1,
    'draft',
    '{"x": 13.5, "y": 8.5}'::jsonb,
    '{"x": 13.5, "y": 8.5}'::jsonb,
    '{"currentFloor":1,"zoom":1.05}'::jsonb,
    '{"staircaseLabel":"Central Staircase"}'::jsonb
  )
  on conflict (store_id, version_number) do update
    set name = excluded.name,
        status = case when app.layouts.status = 'published' then app.layouts.status else excluded.status end,
        staircase_floor_1_anchor = excluded.staircase_floor_1_anchor,
        staircase_floor_2_anchor = excluded.staircase_floor_2_anchor,
        camera_settings = excluded.camera_settings,
        metadata = excluded.metadata
  returning id into v_layout_id;

  if v_layout_id is null then
    select id into v_layout_id
    from app.layouts
    where store_id = v_store_id
      and version_number = 1
    limit 1;
  end if;

  insert into app.floors (layout_id, floor_number, name, width, depth, elevation, entry_anchor, metadata)
  values
    (v_layout_id, 1, 'Floor 1 - Customer Counter', 28.00, 18.00, 0.00, '{"x": 2.0, "y": 9.0}'::jsonb, '{"theme":"ground"}'::jsonb),
    (v_layout_id, 2, 'Floor 2 - Upper Stockroom', 28.00, 18.00, 4.80, '{"x": 2.0, "y": 9.0}'::jsonb, '{"theme":"upper"}'::jsonb)
  on conflict (layout_id, floor_number) do update
    set name = excluded.name,
        width = excluded.width,
        depth = excluded.depth,
        elevation = excluded.elevation,
        entry_anchor = excluded.entry_anchor,
        metadata = excluded.metadata;

  select id into v_floor_1_id
  from app.floors
  where layout_id = v_layout_id
    and floor_number = 1;

  select id into v_floor_2_id
  from app.floors
  where layout_id = v_layout_id
    and floor_number = 2;

  insert into app.zones (layout_id, floor_id, code, name, position_x, position_y, width, depth, color_hex, metadata)
  values
    (v_layout_id, v_floor_1_id, 'F1-A', 'Fast Moving', 3.00, 2.00, 10.00, 13.00, '#2563eb', '{"floor":1}'::jsonb),
    (v_layout_id, v_floor_1_id, 'F1-B', 'Counter Support', 15.50, 2.00, 9.50, 13.00, '#0f766e', '{"floor":1}'::jsonb),
    (v_layout_id, v_floor_2_id, 'F2-A', 'Bulk Storage', 3.00, 2.00, 10.00, 13.00, '#ea580c', '{"floor":2}'::jsonb),
    (v_layout_id, v_floor_2_id, 'F2-B', 'Reserve Storage', 15.50, 2.00, 9.50, 13.00, '#7c3aed', '{"floor":2}'::jsonb)
  on conflict (layout_id, floor_id, code) do update
    set name = excluded.name,
        position_x = excluded.position_x,
        position_y = excluded.position_y,
        width = excluded.width,
        depth = excluded.depth,
        color_hex = excluded.color_hex,
        metadata = excluded.metadata;

  insert into app.aisles (layout_id, floor_id, zone_id, code, name, start_x, start_y, end_x, end_y, walkway_width, metadata)
  select
    v_layout_id,
    z.floor_id,
    z.id,
    case z.code
      when 'F1-A' then 'A1'
      when 'F1-B' then 'A2'
      when 'F2-A' then 'A3'
      else 'A4'
    end,
    z.name || ' Aisle',
    z.position_x + (z.width / 2.0),
    z.position_y + 0.50,
    z.position_x + (z.width / 2.0),
    z.position_y + z.depth - 0.50,
    1.80,
    jsonb_build_object('zoneCode', z.code)
  from app.zones z
  where z.layout_id = v_layout_id
  on conflict (layout_id, floor_id, code) do update
    set name = excluded.name,
        zone_id = excluded.zone_id,
        start_x = excluded.start_x,
        start_y = excluded.start_y,
        end_x = excluded.end_x,
        end_y = excluded.end_y,
        walkway_width = excluded.walkway_width,
        metadata = excluded.metadata;

  insert into app.shelves (layout_id, floor_id, zone_id, aisle_id, code, name, shelf_type, position_x, position_y, rotation, width, depth, height, access_side, metadata)
  select
    v_layout_id,
    z.floor_id,
    z.id,
    a.id,
    shelf_seed.code,
    shelf_seed.name,
    shelf_seed.shelf_type,
    shelf_seed.position_x,
    shelf_seed.position_y,
    shelf_seed.rotation,
    2.20,
    0.90,
    case when shelf_seed.shelf_type = '2_level' then 1.45 else 2.40 end,
    'front',
    jsonb_build_object('zoneCode', z.code)
  from (
    values
      ('F1-A', 'S-101', 'Shelf 101', '4_level', 6.40, 4.50, 0.00),
      ('F1-A', 'S-102', 'Shelf 102', '4_level', 6.40, 10.10, 0.00),
      ('F1-B', 'S-103', 'Shelf 103', '2_level', 18.80, 4.50, 0.00),
      ('F1-B', 'S-104', 'Shelf 104', '2_level', 18.80, 10.10, 0.00),
      ('F2-A', 'S-201', 'Shelf 201', '4_level', 6.40, 4.50, 0.00),
      ('F2-A', 'S-202', 'Shelf 202', '4_level', 6.40, 10.10, 0.00),
      ('F2-B', 'S-203', 'Shelf 203', '4_level', 18.80, 4.50, 0.00),
      ('F2-B', 'S-204', 'Shelf 204', '2_level', 18.80, 10.10, 0.00)
  ) as shelf_seed(zone_code, code, name, shelf_type, position_x, position_y, rotation)
  join app.zones z on z.layout_id = v_layout_id and z.code = shelf_seed.zone_code
  join app.aisles a on a.layout_id = v_layout_id and a.zone_id = z.id
  on conflict (layout_id, floor_id, code) do update
    set zone_id = excluded.zone_id,
        aisle_id = excluded.aisle_id,
        name = excluded.name,
        shelf_type = excluded.shelf_type,
        position_x = excluded.position_x,
        position_y = excluded.position_y,
        rotation = excluded.rotation,
        width = excluded.width,
        depth = excluded.depth,
        height = excluded.height,
        access_side = excluded.access_side,
        metadata = excluded.metadata;

  insert into app.shelf_levels (shelf_id, level_number, elevation, metadata)
  select
    sh.id,
    gs.level_number,
    case
      when sh.shelf_type = '2_level' then 0.55 + ((gs.level_number - 1) * 0.55)
      else 0.35 + ((gs.level_number - 1) * 0.45)
    end,
    jsonb_build_object('autoSeeded', true)
  from app.shelves sh
  cross join lateral generate_series(
    1,
    case when sh.shelf_type = '2_level' then 2 else 4 end
  ) as gs(level_number)
  where sh.layout_id = v_layout_id
    and not exists (
      select 1
      from app.shelf_levels sl
      where sl.shelf_id = sh.id
        and sl.level_number = gs.level_number
    );

  insert into app.shelf_slots (shelf_level_id, slot_number, slot_label, position_x, width, metadata)
  select
    sl.id,
    gs.slot_number,
    'Slot ' || gs.slot_number,
    (gs.slot_number - 1) * 0.55,
    0.52,
    jsonb_build_object('autoSeeded', true)
  from app.shelf_levels sl
  cross join lateral generate_series(1, 4) as gs(slot_number)
  where not exists (
    select 1
    from app.shelf_slots ss
    where ss.shelf_level_id = sl.id
      and ss.slot_number = gs.slot_number
  );

  insert into app.admin_users (store_id, user_id, role, is_active)
  select
    v_store_id,
    up.user_id,
    'admin',
    true
  from app.user_profiles up
  where up.role = 'admin'
  on conflict (user_id) do update
    set store_id = excluded.store_id,
        role = excluded.role,
        is_active = true;

  insert into app.item_locations (
    layout_id,
    item_id,
    floor_id,
    zone_id,
    aisle_id,
    shelf_id,
    shelf_level_id,
    shelf_slot_id,
    is_active,
    route_hint
  )
  select
    slot.layout_id,
    ranked.item_id,
    slot.floor_id,
    slot.zone_id,
    slot.aisle_id,
    slot.shelf_id,
    slot.shelf_level_id,
    slot.shelf_slot_id,
    true,
    jsonb_build_object('seeded', true)
  from (
    select
      i.product_id as item_id,
      row_number() over (order by p.name, p.sku) as row_num
    from app.items i
    join app.products p on p.id = i.product_id
    where i.is_active
  ) ranked
  join (
    select
      sh.layout_id,
      sh.floor_id,
      sh.zone_id,
      sh.aisle_id,
      sh.id as shelf_id,
      sl.id as shelf_level_id,
      ss.id as shelf_slot_id,
      row_number() over (
        order by f.floor_number, z.code, a.code, sh.code, sl.level_number, ss.slot_number
      ) as row_num
    from app.shelf_slots ss
    join app.shelf_levels sl on sl.id = ss.shelf_level_id
    join app.shelves sh on sh.id = sl.shelf_id
    join app.floors f on f.id = sh.floor_id
    join app.zones z on z.id = sh.zone_id
    join app.aisles a on a.id = sh.aisle_id
    where sh.layout_id = v_layout_id
  ) slot on slot.row_num = ranked.row_num
  where not exists (
    select 1
    from app.item_locations il
    where il.layout_id = slot.layout_id
      and il.item_id = ranked.item_id
      and il.is_active
  );

  update app.layouts
  set status = 'published'
  where id = v_layout_id
    and status <> 'published';
end;
$$;
