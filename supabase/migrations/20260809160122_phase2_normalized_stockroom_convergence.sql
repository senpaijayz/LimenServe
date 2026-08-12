-- Phase 2 stockroom convergence.
--
-- This migration is intentionally forward-only and additive. The normalized
-- stockroom schema is the canonical target, while the two legacy public tables
-- remain in place behind an archive/crosswalk compatibility boundary.
--
-- IMPORTANT: production-only compatibility migrations created the stockroom
-- schema. The repository baseline must recover those migrations before this
-- file can be replayed on a clean database. The preflight below fails closed so
-- a partially compatible database cannot be mutated accidentally.

do $preflight$
declare
  v_relation text;
begin
  foreach v_relation in array array[
    'catalog.products',
    'stockroom.stores',
    'stockroom.layouts',
    'stockroom.floors',
    'stockroom.zones',
    'stockroom.aisles',
    'stockroom.shelves',
    'stockroom.shelf_levels',
    'stockroom.shelf_slots',
    'stockroom.items',
    'stockroom.item_locations',
    'public.store_layouts',
    'public.product_locations'
  ] loop
    if to_regclass(v_relation) is null then
      raise exception
        'Phase 2 stockroom preflight failed: required relation % is missing.',
        v_relation;
    end if;
  end loop;

  if to_regprocedure('private.can_manage_stockroom()') is null
     or to_regprocedure('private.can_view_stockroom_layout(uuid)') is null then
    raise exception
      'Phase 2 stockroom preflight failed: private authorization helpers are missing.';
  end if;

  if exists (
    select 1
    from stockroom.item_locations location
    join stockroom.layouts layout on layout.id = location.layout_id
    join stockroom.floors floor on floor.id = location.floor_id
    join stockroom.zones zone on zone.id = location.zone_id
    join stockroom.aisles aisle on aisle.id = location.aisle_id
    join stockroom.shelves shelf on shelf.id = location.shelf_id
    join stockroom.shelf_levels shelf_level
      on shelf_level.id = location.shelf_level_id
    join stockroom.shelf_slots shelf_slot
      on shelf_slot.id = location.shelf_slot_id
    where floor.layout_id <> location.layout_id
       or zone.layout_id <> location.layout_id
       or zone.floor_id <> location.floor_id
       or aisle.layout_id <> location.layout_id
       or aisle.floor_id <> location.floor_id
       or aisle.zone_id <> location.zone_id
       or shelf.layout_id <> location.layout_id
       or shelf.floor_id <> location.floor_id
       or shelf.zone_id <> location.zone_id
       or shelf.aisle_id <> location.aisle_id
       or shelf_level.shelf_id <> location.shelf_id
       or shelf_slot.shelf_level_id <> location.shelf_level_id
       or layout.store_id is null
  ) then
    raise exception
      'Phase 2 stockroom preflight failed: normalized location hierarchy contains conflicts.';
  end if;
end
$preflight$;

-- Layout revisions are row-level compare-and-swap tokens. version_number is a
-- user-facing layout version; revision changes for every persisted edit.
alter table stockroom.layouts
  add column if not exists revision bigint not null default 1,
  add column if not exists parent_layout_id uuid,
  add column if not exists updated_by uuid;

comment on column stockroom.layouts.revision is
  'Optimistic-concurrency token. Writers must supply the expected revision to stockroom RPCs.';
comment on column stockroom.layouts.parent_layout_id is
  'Source layout from which this draft was cloned.';

alter table stockroom.item_locations
  add column if not exists store_id uuid;

-- Production moved the normalized tables from app to stockroom, but several
-- trigger bodies retained app-qualified table references. Repair those bodies
-- before the store_id backfill fires any UPDATE triggers.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at = pg_catalog.timezone('utc', pg_catalog.now());
  return new;
end
$function$;

create or replace function app.validate_stockroom_layout_publish()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_floor_count integer;
  v_floor_1_present boolean;
  v_floor_2_present boolean;
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if new.staircase_floor_1_anchor is null
       or new.staircase_floor_2_anchor is null then
      raise exception
        'A publishable layout must define staircase anchors for both floors.';
    end if;

    select
      count(*),
      bool_or(floor_number = 1),
      bool_or(floor_number = 2)
    into
      v_floor_count,
      v_floor_1_present,
      v_floor_2_present
    from stockroom.floors
    where layout_id = new.id;

    if coalesce(v_floor_count, 0) <> 2
       or not coalesce(v_floor_1_present, false)
       or not coalesce(v_floor_2_present, false) then
      raise exception
        'A publishable layout must contain exactly two floors numbered 1 and 2.';
    end if;

    new.published_at = pg_catalog.timezone('utc', pg_catalog.now());
  end if;

  if new.status <> 'published' then
    new.published_at = null;
  end if;

  return new;
end
$function$;

create or replace function app.validate_shelf_level_limit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_shelf_type text;
  v_existing_count integer;
  v_max_levels integer;
begin
  select shelf_type
  into v_shelf_type
  from stockroom.shelves
  where id = new.shelf_id;

  if v_shelf_type is null then
    raise exception 'Shelf % does not exist.', new.shelf_id;
  end if;

  v_max_levels := case when v_shelf_type = '2_level' then 2 else 4 end;

  if new.level_number > v_max_levels then
    raise exception
      'Shelf type % only allows % levels.',
      v_shelf_type,
      v_max_levels;
  end if;

  select count(*)
  into v_existing_count
  from stockroom.shelf_levels
  where shelf_id = new.shelf_id
    and id is distinct from new.id;

  if v_existing_count >= v_max_levels then
    raise exception
      'Shelf % already has the maximum number of levels for type %.',
      new.shelf_id,
      v_shelf_type;
  end if;

  return new;
end
$function$;

create or replace function app.validate_item_location_hierarchy()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_layout_id uuid;
  v_store_id uuid;
  v_floor_id uuid;
  v_zone_id uuid;
  v_aisle_id uuid;
  v_shelf_id uuid;
  v_level_id uuid;
  v_slot_id uuid;
begin
  select
    shelf.layout_id,
    layout.store_id,
    shelf.floor_id,
    shelf.zone_id,
    shelf.aisle_id,
    shelf.id,
    shelf_level.id,
    shelf_slot.id
  into
    v_layout_id,
    v_store_id,
    v_floor_id,
    v_zone_id,
    v_aisle_id,
    v_shelf_id,
    v_level_id,
    v_slot_id
  from stockroom.shelf_slots shelf_slot
  join stockroom.shelf_levels shelf_level
    on shelf_level.id = shelf_slot.shelf_level_id
  join stockroom.shelves shelf on shelf.id = shelf_level.shelf_id
  join stockroom.layouts layout on layout.id = shelf.layout_id
  where shelf_slot.id = new.shelf_slot_id;

  if v_slot_id is null then
    raise exception 'Shelf slot % does not exist.', new.shelf_slot_id;
  end if;

  if new.layout_id is distinct from v_layout_id
     or new.store_id is distinct from v_store_id
     or new.floor_id is distinct from v_floor_id
     or new.zone_id is distinct from v_zone_id
     or new.aisle_id is distinct from v_aisle_id
     or new.shelf_id is distinct from v_shelf_id
     or new.shelf_level_id is distinct from v_level_id then
    raise exception
      'Item location hierarchy is invalid for slot %.',
      new.shelf_slot_id;
  end if;

  return new;
end
$function$;

revoke all on function app.touch_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function app.validate_stockroom_layout_publish()
  from public, anon, authenticated, service_role;
revoke all on function app.validate_shelf_level_limit()
  from public, anon, authenticated, service_role;
revoke all on function app.validate_item_location_hierarchy()
  from public, anon, authenticated, service_role;

update stockroom.item_locations location
set store_id = layout.store_id
from stockroom.layouts layout
where layout.id = location.layout_id
  and location.store_id is distinct from layout.store_id;

do $scope_preflight$
begin
  if exists (
    select 1
    from stockroom.item_locations
    where store_id is null
  ) then
    raise exception
      'Cannot scope stockroom.item_locations: one or more rows have no store.';
  end if;
end
$scope_preflight$;

alter table stockroom.item_locations
  alter column store_id set not null;

-- Composite candidate keys make the layout/store and hierarchy scope available
-- to foreign keys. These keys include an existing primary key as their first
-- column, so they cannot discover duplicate data during creation.
do $candidate_keys$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.layouts'::regclass
      and conname = 'layouts_id_store_id_key'
  ) then
    alter table stockroom.layouts
      add constraint layouts_id_store_id_key unique (id, store_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.floors'::regclass
      and conname = 'floors_id_layout_id_key'
  ) then
    alter table stockroom.floors
      add constraint floors_id_layout_id_key unique (id, layout_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.zones'::regclass
      and conname = 'zones_id_layout_id_floor_id_key'
  ) then
    alter table stockroom.zones
      add constraint zones_id_layout_id_floor_id_key
      unique (id, layout_id, floor_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.aisles'::regclass
      and conname = 'aisles_id_layout_id_floor_id_zone_id_key'
  ) then
    alter table stockroom.aisles
      add constraint aisles_id_layout_id_floor_id_zone_id_key
      unique (id, layout_id, floor_id, zone_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.shelves'::regclass
      and conname = 'shelves_id_layout_floor_zone_aisle_key'
  ) then
    alter table stockroom.shelves
      add constraint shelves_id_layout_floor_zone_aisle_key
      unique (id, layout_id, floor_id, zone_id, aisle_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.shelf_levels'::regclass
      and conname = 'shelf_levels_id_shelf_id_key'
  ) then
    alter table stockroom.shelf_levels
      add constraint shelf_levels_id_shelf_id_key unique (id, shelf_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.shelf_slots'::regclass
      and conname = 'shelf_slots_id_shelf_level_id_key'
  ) then
    alter table stockroom.shelf_slots
      add constraint shelf_slots_id_shelf_level_id_key
      unique (id, shelf_level_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_id_layout_store_key'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_id_layout_store_key
      unique (id, layout_id, store_id);
  end if;
end
$candidate_keys$;

-- Add all new hierarchy constraints NOT VALID first. PostgreSQL enforces them
-- for new writes immediately; validation below is a separate, explicit gate.
do $foreign_keys$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.layouts'::regclass
      and conname = 'layouts_parent_layout_id_fkey'
  ) then
    alter table stockroom.layouts
      add constraint layouts_parent_layout_id_fkey
      foreign key (parent_layout_id)
      references stockroom.layouts(id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.layouts'::regclass
      and conname = 'layouts_updated_by_fkey'
  ) then
    alter table stockroom.layouts
      add constraint layouts_updated_by_fkey
      foreign key (updated_by)
      references auth.users(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.zones'::regclass
      and conname = 'zones_floor_layout_fkey'
  ) then
    alter table stockroom.zones
      add constraint zones_floor_layout_fkey
      foreign key (floor_id, layout_id)
      references stockroom.floors(id, layout_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.aisles'::regclass
      and conname = 'aisles_zone_layout_floor_fkey'
  ) then
    alter table stockroom.aisles
      add constraint aisles_zone_layout_floor_fkey
      foreign key (zone_id, layout_id, floor_id)
      references stockroom.zones(id, layout_id, floor_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.shelves'::regclass
      and conname = 'shelves_aisle_layout_floor_zone_fkey'
  ) then
    alter table stockroom.shelves
      add constraint shelves_aisle_layout_floor_zone_fkey
      foreign key (aisle_id, layout_id, floor_id, zone_id)
      references stockroom.aisles(id, layout_id, floor_id, zone_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_layout_store_fkey'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_layout_store_fkey
      foreign key (layout_id, store_id)
      references stockroom.layouts(id, store_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_floor_layout_fkey'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_floor_layout_fkey
      foreign key (floor_id, layout_id)
      references stockroom.floors(id, layout_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_zone_layout_floor_fkey'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_zone_layout_floor_fkey
      foreign key (zone_id, layout_id, floor_id)
      references stockroom.zones(id, layout_id, floor_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_aisle_layout_floor_zone_fkey'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_aisle_layout_floor_zone_fkey
      foreign key (aisle_id, layout_id, floor_id, zone_id)
      references stockroom.aisles(id, layout_id, floor_id, zone_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_shelf_hierarchy_fkey'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_shelf_hierarchy_fkey
      foreign key (shelf_id, layout_id, floor_id, zone_id, aisle_id)
      references stockroom.shelves(id, layout_id, floor_id, zone_id, aisle_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_level_shelf_fkey'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_level_shelf_fkey
      foreign key (shelf_level_id, shelf_id)
      references stockroom.shelf_levels(id, shelf_id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'stockroom.item_locations'::regclass
      and conname = 'item_locations_slot_level_fkey'
  ) then
    alter table stockroom.item_locations
      add constraint item_locations_slot_level_fkey
      foreign key (shelf_slot_id, shelf_level_id)
      references stockroom.shelf_slots(id, shelf_level_id)
      on delete cascade
      not valid;
  end if;
end
$foreign_keys$;

alter table stockroom.layouts
  validate constraint layouts_parent_layout_id_fkey;
alter table stockroom.layouts
  validate constraint layouts_updated_by_fkey;
alter table stockroom.zones
  validate constraint zones_floor_layout_fkey;
alter table stockroom.aisles
  validate constraint aisles_zone_layout_floor_fkey;
alter table stockroom.shelves
  validate constraint shelves_aisle_layout_floor_zone_fkey;
alter table stockroom.item_locations
  validate constraint item_locations_layout_store_fkey;
alter table stockroom.item_locations
  validate constraint item_locations_floor_layout_fkey;
alter table stockroom.item_locations
  validate constraint item_locations_zone_layout_floor_fkey;
alter table stockroom.item_locations
  validate constraint item_locations_aisle_layout_floor_zone_fkey;
alter table stockroom.item_locations
  validate constraint item_locations_shelf_hierarchy_fkey;
alter table stockroom.item_locations
  validate constraint item_locations_level_shelf_fkey;
alter table stockroom.item_locations
  validate constraint item_locations_slot_level_fkey;

-- Cover both the new composite foreign keys and the pre-existing single-column
-- foreign keys identified by the Supabase advisor. No existing index is removed.
create index if not exists layouts_created_by_idx
  on stockroom.layouts (created_by);
create index if not exists layouts_updated_by_idx
  on stockroom.layouts (updated_by);
create index if not exists layouts_parent_layout_id_idx
  on stockroom.layouts (parent_layout_id);

create index if not exists zones_floor_layout_idx
  on stockroom.zones (floor_id, layout_id);

create index if not exists aisles_floor_layout_idx
  on stockroom.aisles (floor_id, layout_id);
create index if not exists aisles_zone_layout_floor_idx
  on stockroom.aisles (zone_id, layout_id, floor_id);

create index if not exists shelves_floor_layout_idx
  on stockroom.shelves (floor_id, layout_id);
create index if not exists shelves_zone_layout_floor_idx
  on stockroom.shelves (zone_id, layout_id, floor_id);
create index if not exists shelves_aisle_layout_floor_zone_idx
  on stockroom.shelves (aisle_id, layout_id, floor_id, zone_id);

create index if not exists item_locations_layout_store_idx
  on stockroom.item_locations (layout_id, store_id);
create index if not exists item_locations_floor_layout_idx
  on stockroom.item_locations (floor_id, layout_id);
create index if not exists item_locations_zone_layout_floor_idx
  on stockroom.item_locations (zone_id, layout_id, floor_id);
create index if not exists item_locations_aisle_layout_floor_zone_idx
  on stockroom.item_locations (aisle_id, layout_id, floor_id, zone_id);
create index if not exists item_locations_shelf_layout_idx
  on stockroom.item_locations (shelf_id, layout_id);
create index if not exists item_locations_level_shelf_idx
  on stockroom.item_locations (shelf_level_id, shelf_id);
create index if not exists item_locations_slot_level_idx
  on stockroom.item_locations (shelf_slot_id, shelf_level_id);

-- Immutable layout history. This table is backend-only by design: RLS is
-- enabled with no client policies, and only service_role receives SELECT.
create table if not exists stockroom.layout_audit_history (
  id bigint generated always as identity primary key,
  layout_id uuid not null
    references stockroom.layouts(id) on delete restrict,
  store_id uuid not null
    references stockroom.stores(id) on delete restrict,
  revision bigint not null check (revision > 0),
  event_type text not null
    check (event_type in ('baseline', 'created', 'updated', 'published', 'archived')),
  actor_id uuid references auth.users(id) on delete set null,
  change_source text not null default 'direct_sql',
  change_reason text,
  previous_snapshot jsonb,
  new_snapshot jsonb,
  created_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  unique (layout_id, revision)
);

comment on table stockroom.layout_audit_history is
  'Immutable revision snapshots for normalized stockroom layouts.';

create index if not exists layout_audit_history_store_created_idx
  on stockroom.layout_audit_history (store_id, created_at desc);
create index if not exists layout_audit_history_actor_id_idx
  on stockroom.layout_audit_history (actor_id);

alter table stockroom.layout_audit_history enable row level security;
revoke all on stockroom.layout_audit_history
  from public, anon, authenticated, service_role;
grant select on stockroom.layout_audit_history to service_role;

create or replace function private.enforce_stockroom_layout_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.revision is not distinct from old.revision then
    new.revision := old.revision + 1;
  elsif new.revision <> old.revision + 1 then
    raise exception using
      errcode = '40001',
      message = 'Layout revision must advance by exactly one.';
  end if;

  new.updated_by := coalesce((select auth.uid()), new.updated_by, old.updated_by);
  return new;
end
$function$;

create or replace function private.audit_stockroom_layout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid;
  v_actor_setting text;
  v_event_type text;
  v_change_source text;
  v_change_reason text;
begin
  v_actor_id := (select auth.uid());

  if v_actor_id is null then
    v_actor_setting := nullif(
      pg_catalog.current_setting('limen.stockroom_actor_id', true),
      ''
    );
    if v_actor_setting is not null then
      v_actor_id := v_actor_setting::uuid;
    end if;
  end if;

  v_change_source := coalesce(
    nullif(
      pg_catalog.current_setting('limen.stockroom_change_source', true),
      ''
    ),
    'direct_sql'
  );
  v_change_reason := nullif(
    pg_catalog.current_setting('limen.stockroom_change_reason', true),
    ''
  );

  if tg_op = 'INSERT' then
    v_event_type := 'created';
  elsif new.status = 'published'
        and old.status is distinct from 'published' then
    v_event_type := 'published';
  elsif new.status = 'archived'
        and old.status is distinct from 'archived' then
    v_event_type := 'archived';
  else
    v_event_type := 'updated';
  end if;

  insert into stockroom.layout_audit_history (
    layout_id,
    store_id,
    revision,
    event_type,
    actor_id,
    change_source,
    change_reason,
    previous_snapshot,
    new_snapshot
  ) values (
    new.id,
    new.store_id,
    new.revision,
    v_event_type,
    v_actor_id,
    v_change_source,
    v_change_reason,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return new;
end
$function$;

create or replace function private.prevent_stockroom_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'Stockroom layout history is immutable.';
end
$function$;

create or replace function private.prevent_stockroom_layout_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'Stockroom layouts must be archived, not deleted.';
end
$function$;

revoke all on function private.enforce_stockroom_layout_revision()
  from public, anon, authenticated, service_role;
revoke all on function private.audit_stockroom_layout()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_stockroom_history_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.prevent_stockroom_layout_delete()
  from public, anon, authenticated, service_role;

-- Seed one immutable baseline event for each pre-existing layout before the
-- history trigger is enabled.
insert into stockroom.layout_audit_history (
  layout_id,
  store_id,
  revision,
  event_type,
  actor_id,
  change_source,
  change_reason,
  previous_snapshot,
  new_snapshot,
  created_at
)
select
  layout.id,
  layout.store_id,
  layout.revision,
  'baseline',
  coalesce(layout.updated_by, layout.created_by),
  'phase2_migration',
  'Baseline captured before optimistic concurrency was enabled.',
  null,
  to_jsonb(layout),
  coalesce(layout.updated_at, layout.created_at)
from stockroom.layouts layout
on conflict (layout_id, revision) do nothing;

drop trigger if exists enforce_layout_revision on stockroom.layouts;
create trigger enforce_layout_revision
before update on stockroom.layouts
for each row
execute function private.enforce_stockroom_layout_revision();

drop trigger if exists audit_layout_revision on stockroom.layouts;
create trigger audit_layout_revision
after insert or update on stockroom.layouts
for each row
execute function private.audit_stockroom_layout();

drop trigger if exists prevent_layout_delete on stockroom.layouts;
create trigger prevent_layout_delete
before delete on stockroom.layouts
for each row
execute function private.prevent_stockroom_layout_delete();

drop trigger if exists prevent_layout_history_update
  on stockroom.layout_audit_history;
create trigger prevent_layout_history_update
before update or delete on stockroom.layout_audit_history
for each row
execute function private.prevent_stockroom_history_mutation();

-- Preserve a first-seen copy of every legacy row and require explicit,
-- approved crosswalks. No heuristic in this migration marks a row as mapped.
create table if not exists stockroom.legacy_layout_archives (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  legacy_id text not null,
  layout_name text,
  description text,
  layout_data jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  created_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  unique (source_table, legacy_id)
);

alter table stockroom.legacy_layout_archives
  add column if not exists source_updated_at timestamptz,
  add column if not exists row_checksum text;

do $legacy_archive_key$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'stockroom.legacy_layout_archives'::regclass
      and conname = 'legacy_layout_archives_source_table_legacy_id_key'
  ) then
    alter table stockroom.legacy_layout_archives
      add constraint legacy_layout_archives_source_table_legacy_id_key
      unique (source_table, legacy_id);
  end if;
end
$legacy_archive_key$;

create table if not exists stockroom.legacy_location_archives (
  id bigint generated always as identity primary key,
  source_table text not null,
  legacy_product_id uuid not null,
  row_data jsonb not null,
  source_updated_at timestamptz,
  row_checksum text not null,
  archived_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  unique (source_table, legacy_product_id)
);

create table if not exists stockroom.legacy_layout_crosswalk (
  legacy_layout_id uuid primary key
    references public.store_layouts(id) on delete restrict,
  store_id uuid references stockroom.stores(id) on delete restrict,
  layout_id uuid,
  mapping_status text not null default 'pending'
    check (mapping_status in ('pending', 'conflict', 'mapped', 'ignored')),
  mapping_metadata jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint legacy_layout_crosswalk_layout_store_fkey
    foreign key (layout_id, store_id)
    references stockroom.layouts(id, store_id)
    on delete restrict,
  constraint legacy_layout_crosswalk_mapping_check check (
    (
      mapping_status = 'mapped'
      and store_id is not null
      and layout_id is not null
      and approved_by is not null
      and approved_at is not null
    )
    or (
      mapping_status = 'ignored'
      and store_id is null
      and layout_id is null
      and approved_by is not null
      and approved_at is not null
    )
    or (
      mapping_status in ('pending', 'conflict')
      and store_id is null
      and layout_id is null
      and approved_by is null
      and approved_at is null
    )
  )
);

create table if not exists stockroom.legacy_location_crosswalk (
  legacy_product_id uuid primary key
    references public.product_locations(product_id) on delete restrict,
  legacy_layout_id uuid
    references stockroom.legacy_layout_crosswalk(legacy_layout_id)
    on delete restrict,
  store_id uuid references stockroom.stores(id) on delete restrict,
  layout_id uuid,
  item_location_id uuid,
  mapping_status text not null default 'pending'
    check (mapping_status in ('pending', 'conflict', 'mapped', 'ignored')),
  mapping_metadata jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  updated_at timestamptz not null
    default pg_catalog.timezone('utc', pg_catalog.now()),
  constraint legacy_location_crosswalk_layout_store_fkey
    foreign key (layout_id, store_id)
    references stockroom.layouts(id, store_id)
    on delete restrict,
  constraint legacy_location_crosswalk_item_location_fkey
    foreign key (item_location_id, layout_id, store_id)
    references stockroom.item_locations(id, layout_id, store_id)
    on delete restrict,
  constraint legacy_location_crosswalk_mapping_check check (
    (
      mapping_status = 'mapped'
      and legacy_layout_id is not null
      and store_id is not null
      and layout_id is not null
      and item_location_id is not null
      and approved_by is not null
      and approved_at is not null
    )
    or (
      mapping_status = 'ignored'
      and legacy_layout_id is null
      and store_id is null
      and layout_id is null
      and item_location_id is null
      and approved_by is not null
      and approved_at is not null
    )
    or (
      mapping_status in ('pending', 'conflict')
      and legacy_layout_id is null
      and store_id is null
      and layout_id is null
      and item_location_id is null
      and approved_by is null
      and approved_at is null
    )
  )
);

comment on table stockroom.legacy_layout_crosswalk is
  'Human-approved mapping from legacy freeform layouts to normalized layouts.';
comment on table stockroom.legacy_location_crosswalk is
  'Human-approved mapping from unscoped legacy product locations to normalized store/layout locations.';

create index if not exists legacy_layout_crosswalk_store_id_idx
  on stockroom.legacy_layout_crosswalk (store_id);
create index if not exists legacy_layout_crosswalk_layout_store_idx
  on stockroom.legacy_layout_crosswalk (layout_id, store_id);
create index if not exists legacy_layout_crosswalk_approved_by_idx
  on stockroom.legacy_layout_crosswalk (approved_by);
create index if not exists legacy_location_crosswalk_legacy_layout_id_idx
  on stockroom.legacy_location_crosswalk (legacy_layout_id);
create index if not exists legacy_location_crosswalk_store_id_idx
  on stockroom.legacy_location_crosswalk (store_id);
create index if not exists legacy_location_crosswalk_layout_store_idx
  on stockroom.legacy_location_crosswalk (layout_id, store_id);
create index if not exists legacy_location_crosswalk_item_layout_store_idx
  on stockroom.legacy_location_crosswalk (
    item_location_id,
    layout_id,
    store_id
  );
create index if not exists legacy_location_crosswalk_approved_by_idx
  on stockroom.legacy_location_crosswalk (approved_by);

alter table stockroom.legacy_layout_archives enable row level security;
alter table stockroom.legacy_location_archives enable row level security;
alter table stockroom.legacy_layout_crosswalk enable row level security;
alter table stockroom.legacy_location_crosswalk enable row level security;

revoke all on stockroom.legacy_layout_archives
  from public, anon, authenticated, service_role;
revoke all on stockroom.legacy_location_archives
  from public, anon, authenticated, service_role;
revoke all on stockroom.legacy_layout_crosswalk
  from public, anon, authenticated, service_role;
revoke all on stockroom.legacy_location_crosswalk
  from public, anon, authenticated, service_role;

grant select on stockroom.legacy_layout_archives to service_role;
grant select on stockroom.legacy_location_archives to service_role;
grant select, insert, update on stockroom.legacy_layout_crosswalk
  to service_role;
grant select, insert, update on stockroom.legacy_location_crosswalk
  to service_role;

-- Capture existing rows before the foreign-key-backed crosswalks prevent their
-- deletion. ON CONFLICT preserves any earlier production snapshot verbatim.
insert into stockroom.legacy_layout_archives (
  source_table,
  legacy_id,
  layout_name,
  description,
  layout_data,
  metadata,
  source_updated_at,
  row_checksum
)
select
  'public.store_layouts',
  legacy.id::text,
  legacy.layout_name,
  null,
  legacy.layout_data,
  pg_catalog.jsonb_build_object(
    'createdBy', legacy.created_by,
    'updatedBy', legacy.updated_by,
    'createdAt', legacy.created_at
  ),
  legacy.updated_at,
  pg_catalog.md5(to_jsonb(legacy)::text)
from public.store_layouts legacy
on conflict (source_table, legacy_id) do nothing;

insert into stockroom.legacy_location_archives (
  source_table,
  legacy_product_id,
  row_data,
  source_updated_at,
  row_checksum
)
select
  'public.product_locations',
  legacy.product_id,
  to_jsonb(legacy),
  legacy.updated_at,
  pg_catalog.md5(to_jsonb(legacy)::text)
from public.product_locations legacy
on conflict (source_table, legacy_product_id) do nothing;

insert into stockroom.legacy_layout_crosswalk (legacy_layout_id)
select legacy.id
from public.store_layouts legacy
on conflict (legacy_layout_id) do nothing;

insert into stockroom.legacy_location_crosswalk (legacy_product_id)
select legacy.product_id
from public.product_locations legacy
on conflict (legacy_product_id) do nothing;

create or replace function private.register_legacy_store_layout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into stockroom.legacy_layout_archives (
    source_table,
    legacy_id,
    layout_name,
    description,
    layout_data,
    metadata,
    source_updated_at,
    row_checksum
  ) values (
    'public.store_layouts',
    new.id::text,
    new.layout_name,
    null,
    new.layout_data,
    pg_catalog.jsonb_build_object(
      'createdBy', new.created_by,
      'updatedBy', new.updated_by,
      'createdAt', new.created_at
    ),
    new.updated_at,
    pg_catalog.md5(to_jsonb(new)::text)
  )
  on conflict (source_table, legacy_id) do nothing;

  insert into stockroom.legacy_layout_crosswalk (legacy_layout_id)
  values (new.id)
  on conflict (legacy_layout_id) do nothing;

  return new;
end
$function$;

create or replace function private.register_legacy_product_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into stockroom.legacy_location_archives (
    source_table,
    legacy_product_id,
    row_data,
    source_updated_at,
    row_checksum
  ) values (
    'public.product_locations',
    new.product_id,
    to_jsonb(new),
    new.updated_at,
    pg_catalog.md5(to_jsonb(new)::text)
  )
  on conflict (source_table, legacy_product_id) do nothing;

  insert into stockroom.legacy_location_crosswalk (legacy_product_id)
  values (new.product_id)
  on conflict (legacy_product_id) do nothing;

  return new;
end
$function$;

revoke all on function private.register_legacy_store_layout()
  from public, anon, authenticated, service_role;
revoke all on function private.register_legacy_product_location()
  from public, anon, authenticated, service_role;

drop trigger if exists register_legacy_store_layout
  on public.store_layouts;
create trigger register_legacy_store_layout
after insert on public.store_layouts
for each row
execute function private.register_legacy_store_layout();

drop trigger if exists register_legacy_product_location
  on public.product_locations;
create trigger register_legacy_product_location
after insert on public.product_locations
for each row
execute function private.register_legacy_product_location();

drop trigger if exists touch_legacy_layout_crosswalk_updated_at
  on stockroom.legacy_layout_crosswalk;
create trigger touch_legacy_layout_crosswalk_updated_at
before update on stockroom.legacy_layout_crosswalk
for each row
execute function app.touch_updated_at();

drop trigger if exists touch_legacy_location_crosswalk_updated_at
  on stockroom.legacy_location_crosswalk;
create trigger touch_legacy_location_crosswalk_updated_at
before update on stockroom.legacy_location_crosswalk
for each row
execute function app.touch_updated_at();

drop trigger if exists prevent_legacy_layout_archive_mutation
  on stockroom.legacy_layout_archives;
create trigger prevent_legacy_layout_archive_mutation
before update or delete on stockroom.legacy_layout_archives
for each row
execute function private.prevent_stockroom_history_mutation();

drop trigger if exists prevent_legacy_location_archive_mutation
  on stockroom.legacy_location_archives;
create trigger prevent_legacy_location_archive_mutation
before update or delete on stockroom.legacy_location_archives
for each row
execute function private.prevent_stockroom_history_mutation();

-- Versioned compatibility reads prefer canonical published locations. Legacy
-- rows appear only while they remain pending/conflicted and have no published
-- canonical location for the same product. The views are service-role-only;
-- they are not a new anonymous Data API surface.
create or replace view public.stockroom_layout_compat_v1
with (security_invoker = true) as
select
  'normalized'::text as source_model,
  layout.store_id,
  layout.id as layout_id,
  null::uuid as legacy_layout_id,
  layout.id::text as layout_key,
  layout.name,
  layout.status,
  layout.revision,
  pg_catalog.jsonb_build_object(
    'sceneObjects', coalesce(layout.metadata -> 'sceneObjects', '[]'::jsonb),
    'cameraSettings', layout.camera_settings,
    'staircaseFloor1Anchor', layout.staircase_floor_1_anchor,
    'staircaseFloor2Anchor', layout.staircase_floor_2_anchor,
    'metadata', layout.metadata
  ) as layout_data,
  layout.updated_at
from stockroom.layouts layout
where layout.status = 'published'

union all

select
  'legacy'::text as source_model,
  null::uuid as store_id,
  null::uuid as layout_id,
  legacy.id as legacy_layout_id,
  legacy.id::text as layout_key,
  legacy.layout_name as name,
  'legacy'::text as status,
  0::bigint as revision,
  legacy.layout_data,
  legacy.updated_at
from public.store_layouts legacy
left join stockroom.legacy_layout_crosswalk crosswalk
  on crosswalk.legacy_layout_id = legacy.id
where coalesce(crosswalk.mapping_status, 'pending')
  in ('pending', 'conflict');

create or replace view public.stockroom_product_location_compat_v1
with (security_invoker = true) as
select
  'normalized'::text as source_model,
  location.store_id,
  location.layout_id,
  null::uuid as legacy_layout_id,
  location.id as item_location_id,
  location.item_id as product_id,
  product.name as product_name,
  product.sku,
  floor.floor_number,
  aisle.code as aisle_code,
  shelf.code as shelf_code,
  shelf_level.level_number,
  shelf_slot.slot_number,
  location.route_hint,
  location.updated_at
from stockroom.item_locations location
join stockroom.layouts layout
  on layout.id = location.layout_id
 and layout.store_id = location.store_id
join catalog.products product on product.id = location.item_id
join stockroom.floors floor
  on floor.id = location.floor_id
 and floor.layout_id = location.layout_id
join stockroom.aisles aisle
  on aisle.id = location.aisle_id
 and aisle.layout_id = location.layout_id
join stockroom.shelves shelf
  on shelf.id = location.shelf_id
 and shelf.layout_id = location.layout_id
join stockroom.shelf_levels shelf_level
  on shelf_level.id = location.shelf_level_id
 and shelf_level.shelf_id = location.shelf_id
join stockroom.shelf_slots shelf_slot
  on shelf_slot.id = location.shelf_slot_id
 and shelf_slot.shelf_level_id = location.shelf_level_id
where location.is_active
  and layout.status = 'published'

union all

select
  'legacy'::text as source_model,
  null::uuid as store_id,
  null::uuid as layout_id,
  null::uuid as legacy_layout_id,
  null::uuid as item_location_id,
  legacy.product_id,
  legacy.product_name,
  legacy.sku,
  legacy.floor as floor_number,
  legacy.aisle as aisle_code,
  legacy.shelf_number::text as shelf_code,
  null::integer as level_number,
  legacy.bin_number as slot_number,
  legacy.assignment_data as route_hint,
  legacy.updated_at
from public.product_locations legacy
left join stockroom.legacy_location_crosswalk crosswalk
  on crosswalk.legacy_product_id = legacy.product_id
where coalesce(crosswalk.mapping_status, 'pending')
  in ('pending', 'conflict')
  and not exists (
    select 1
    from stockroom.item_locations canonical_location
    join stockroom.layouts canonical_layout
      on canonical_layout.id = canonical_location.layout_id
     and canonical_layout.store_id = canonical_location.store_id
    where canonical_location.item_id = legacy.product_id
      and canonical_location.is_active
      and canonical_layout.status = 'published'
  );

create or replace view public.stockroom_location_migration_report_v1
with (security_invoker = true) as
select
  legacy.product_id as legacy_product_id,
  legacy.product_name,
  legacy.sku,
  legacy.floor as legacy_floor_number,
  legacy.aisle as legacy_aisle,
  legacy.shelf_number as legacy_shelf_number,
  legacy.bin_number as legacy_bin_number,
  coalesce(crosswalk.mapping_status, 'pending') as mapping_status,
  crosswalk.legacy_layout_id,
  crosswalk.store_id,
  crosswalk.layout_id,
  crosswalk.item_location_id,
  candidates.candidate_count,
  candidates.coordinate_match_count,
  candidates.candidate_location_ids,
  case
    when crosswalk.mapping_status = 'mapped' then 'mapped'
    when crosswalk.mapping_status = 'ignored' then 'ignored'
    when candidates.candidate_count = 0 then 'unmapped'
    when candidates.coordinate_match_count = 1 then 'exact_candidate'
    else 'conflict'
  end as migration_state
from public.product_locations legacy
left join stockroom.legacy_location_crosswalk crosswalk
  on crosswalk.legacy_product_id = legacy.product_id
cross join lateral (
  select
    count(*)::integer as candidate_count,
    count(*) filter (
      where floor.floor_number = legacy.floor
        and pg_catalog.lower(pg_catalog.btrim(aisle.code))
          = pg_catalog.lower(pg_catalog.btrim(legacy.aisle))
        and pg_catalog.regexp_replace(shelf.code, '[^0-9]+', '', 'g')
          = legacy.shelf_number::text
        and shelf_slot.slot_number = legacy.bin_number
    )::integer as coordinate_match_count,
    coalesce(
      pg_catalog.jsonb_agg(location.id order by location.id),
      '[]'::jsonb
    ) as candidate_location_ids
  from stockroom.item_locations location
  join stockroom.layouts layout on layout.id = location.layout_id
  join stockroom.floors floor on floor.id = location.floor_id
  join stockroom.aisles aisle on aisle.id = location.aisle_id
  join stockroom.shelves shelf on shelf.id = location.shelf_id
  join stockroom.shelf_slots shelf_slot
    on shelf_slot.id = location.shelf_slot_id
  where location.item_id = legacy.product_id
    and location.is_active
) candidates;

revoke all on public.stockroom_layout_compat_v1
  from public, anon, authenticated;
revoke all on public.stockroom_product_location_compat_v1
  from public, anon, authenticated;
revoke all on public.stockroom_location_migration_report_v1
  from public, anon, authenticated;

grant select on public.stockroom_layout_compat_v1 to service_role;
grant select on public.stockroom_product_location_compat_v1 to service_role;
grant select on public.stockroom_location_migration_report_v1 to service_role;

-- The original FOR ALL management policy overlapped each table's SELECT
-- policy. Split it into command-specific policies with identical predicates;
-- this removes advisor noise without adding a permissive path or weakening RLS.
do $split_management_policies$
declare
  v_table text;
begin
  foreach v_table in array array[
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
    execute format(
      'drop policy if exists %I on stockroom.%I',
      v_table || '_stockroom_manage',
      v_table
    );
    execute format(
      'drop policy if exists %I on stockroom.%I',
      v_table || '_stockroom_manage_insert',
      v_table
    );
    execute format(
      'drop policy if exists %I on stockroom.%I',
      v_table || '_stockroom_manage_update',
      v_table
    );
    execute format(
      'drop policy if exists %I on stockroom.%I',
      v_table || '_stockroom_manage_delete',
      v_table
    );

    execute format(
      'create policy %I on stockroom.%I for insert to authenticated with check ((select private.can_manage_stockroom()))',
      v_table || '_stockroom_manage_insert',
      v_table
    );
    execute format(
      'create policy %I on stockroom.%I for update to authenticated using ((select private.can_manage_stockroom())) with check ((select private.can_manage_stockroom()))',
      v_table || '_stockroom_manage_update',
      v_table
    );
    execute format(
      'create policy %I on stockroom.%I for delete to authenticated using ((select private.can_manage_stockroom()))',
      v_table || '_stockroom_manage_delete',
      v_table
    );
  end loop;
end
$split_management_policies$;

-- Atomic, service-role-only layout lifecycle RPCs. The backend supplies the
-- authenticated actor UUID; direct browser callers cannot execute these
-- SECURITY DEFINER functions.
create or replace function public.limen_stockroom_create_layout_draft(
  p_source_layout_id uuid,
  p_expected_source_revision bigint,
  p_name text default null,
  p_actor_id uuid default null,
  p_change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store_id uuid;
  v_source stockroom.layouts%rowtype;
  v_created stockroom.layouts%rowtype;
  v_next_version integer;
  v_floor record;
  v_zone record;
  v_aisle record;
  v_shelf record;
  v_level record;
  v_slot record;
  v_location record;
  v_new_floor_id uuid;
  v_new_zone_id uuid;
  v_new_aisle_id uuid;
  v_new_shelf_id uuid;
  v_new_level_id uuid;
  v_new_slot_id uuid;
begin
  if p_source_layout_id is null
     or p_expected_source_revision is null
     or p_expected_source_revision < 1 then
    raise exception using
      errcode = '22023',
      message = 'A source layout and positive expected revision are required.';
  end if;

  select layout.store_id
  into v_store_id
  from stockroom.layouts layout
  where layout.id = p_source_layout_id;

  if v_store_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Source layout not found.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'limen:stockroom:store:' || v_store_id::text,
      0
    )
  );

  select layout.*
  into v_source
  from stockroom.layouts layout
  where layout.id = p_source_layout_id
  for update;

  if v_source.revision <> p_expected_source_revision then
    raise exception using
      errcode = '40001',
      message = 'Layout revision conflict.';
  end if;

  -- Lock store layouts in a deterministic order before choosing a version.
  perform layout.id
  from stockroom.layouts layout
  where layout.store_id = v_store_id
  order by layout.id
  for update;

  select coalesce(max(layout.version_number), 0) + 1
  into v_next_version
  from stockroom.layouts layout
  where layout.store_id = v_store_id;

  perform pg_catalog.set_config(
    'limen.stockroom_change_source',
    'rpc:create_layout_draft',
    true
  );
  perform pg_catalog.set_config(
    'limen.stockroom_change_reason',
    coalesce(p_change_reason, 'Created draft from layout ' || v_source.id::text),
    true
  );
  perform pg_catalog.set_config(
    'limen.stockroom_actor_id',
    coalesce(p_actor_id::text, ''),
    true
  );

  insert into stockroom.layouts (
    store_id,
    name,
    version_number,
    revision,
    status,
    parent_layout_id,
    staircase_floor_1_anchor,
    staircase_floor_2_anchor,
    camera_settings,
    metadata,
    created_by,
    updated_by
  ) values (
    v_source.store_id,
    coalesce(
      nullif(pg_catalog.btrim(p_name), ''),
      'Layout v' || v_next_version::text
    ),
    v_next_version,
    1,
    'draft',
    v_source.id,
    v_source.staircase_floor_1_anchor,
    v_source.staircase_floor_2_anchor,
    v_source.camera_settings,
    v_source.metadata,
    p_actor_id,
    p_actor_id
  )
  returning * into v_created;

  -- Clone the complete normalized hierarchy in the same transaction. Nested
  -- traversal retains explicit old/new identifiers without temporary tables.
  for v_floor in
    select floor.*
    from stockroom.floors floor
    where floor.layout_id = v_source.id
    order by floor.floor_number, floor.id
  loop
    insert into stockroom.floors (
      layout_id,
      floor_number,
      name,
      width,
      depth,
      elevation,
      entry_anchor,
      metadata
    ) values (
      v_created.id,
      v_floor.floor_number,
      v_floor.name,
      v_floor.width,
      v_floor.depth,
      v_floor.elevation,
      v_floor.entry_anchor,
      v_floor.metadata
    )
    returning id into v_new_floor_id;

    for v_zone in
      select zone.*
      from stockroom.zones zone
      where zone.layout_id = v_source.id
        and zone.floor_id = v_floor.id
      order by zone.code, zone.id
    loop
      insert into stockroom.zones (
        layout_id,
        floor_id,
        code,
        name,
        position_x,
        position_y,
        width,
        depth,
        color_hex,
        metadata
      ) values (
        v_created.id,
        v_new_floor_id,
        v_zone.code,
        v_zone.name,
        v_zone.position_x,
        v_zone.position_y,
        v_zone.width,
        v_zone.depth,
        v_zone.color_hex,
        v_zone.metadata
      )
      returning id into v_new_zone_id;

      for v_aisle in
        select aisle.*
        from stockroom.aisles aisle
        where aisle.layout_id = v_source.id
          and aisle.floor_id = v_floor.id
          and aisle.zone_id = v_zone.id
        order by aisle.code, aisle.id
      loop
        insert into stockroom.aisles (
          layout_id,
          floor_id,
          zone_id,
          code,
          name,
          start_x,
          start_y,
          end_x,
          end_y,
          walkway_width,
          metadata
        ) values (
          v_created.id,
          v_new_floor_id,
          v_new_zone_id,
          v_aisle.code,
          v_aisle.name,
          v_aisle.start_x,
          v_aisle.start_y,
          v_aisle.end_x,
          v_aisle.end_y,
          v_aisle.walkway_width,
          v_aisle.metadata
        )
        returning id into v_new_aisle_id;

        for v_shelf in
          select shelf.*
          from stockroom.shelves shelf
          where shelf.layout_id = v_source.id
            and shelf.floor_id = v_floor.id
            and shelf.zone_id = v_zone.id
            and shelf.aisle_id = v_aisle.id
          order by shelf.code, shelf.id
        loop
          insert into stockroom.shelves (
            layout_id,
            floor_id,
            zone_id,
            aisle_id,
            code,
            name,
            shelf_type,
            position_x,
            position_y,
            rotation,
            width,
            depth,
            height,
            access_side,
            metadata
          ) values (
            v_created.id,
            v_new_floor_id,
            v_new_zone_id,
            v_new_aisle_id,
            v_shelf.code,
            v_shelf.name,
            v_shelf.shelf_type,
            v_shelf.position_x,
            v_shelf.position_y,
            v_shelf.rotation,
            v_shelf.width,
            v_shelf.depth,
            v_shelf.height,
            v_shelf.access_side,
            v_shelf.metadata
          )
          returning id into v_new_shelf_id;

          for v_level in
            select shelf_level.*
            from stockroom.shelf_levels shelf_level
            where shelf_level.shelf_id = v_shelf.id
            order by shelf_level.level_number, shelf_level.id
          loop
            insert into stockroom.shelf_levels (
              shelf_id,
              level_number,
              elevation,
              metadata
            ) values (
              v_new_shelf_id,
              v_level.level_number,
              v_level.elevation,
              v_level.metadata
            )
            returning id into v_new_level_id;

            for v_slot in
              select shelf_slot.*
              from stockroom.shelf_slots shelf_slot
              where shelf_slot.shelf_level_id = v_level.id
              order by shelf_slot.slot_number, shelf_slot.id
            loop
              insert into stockroom.shelf_slots (
                shelf_level_id,
                slot_number,
                slot_label,
                position_x,
                width,
                metadata
              ) values (
                v_new_level_id,
                v_slot.slot_number,
                v_slot.slot_label,
                v_slot.position_x,
                v_slot.width,
                v_slot.metadata
              )
              returning id into v_new_slot_id;

              for v_location in
                select location.*
                from stockroom.item_locations location
                where location.layout_id = v_source.id
                  and location.shelf_slot_id = v_slot.id
                  and location.is_active
                order by location.id
              loop
                insert into stockroom.item_locations (
                  store_id,
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
                ) values (
                  v_created.store_id,
                  v_created.id,
                  v_location.item_id,
                  v_new_floor_id,
                  v_new_zone_id,
                  v_new_aisle_id,
                  v_new_shelf_id,
                  v_new_level_id,
                  v_new_slot_id,
                  true,
                  v_location.route_hint
                );
              end loop;
            end loop;
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;

  return to_jsonb(v_created);
end
$function$;

create or replace function public.limen_stockroom_update_layout_draft(
  p_layout_id uuid,
  p_expected_revision bigint,
  p_patch jsonb,
  p_actor_id uuid default null,
  p_change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store_id uuid;
  v_current stockroom.layouts%rowtype;
  v_updated stockroom.layouts%rowtype;
begin
  if p_layout_id is null
     or p_expected_revision is null
     or p_expected_revision < 1 then
    raise exception using
      errcode = '22023',
      message = 'A layout and positive expected revision are required.';
  end if;

  p_patch := coalesce(p_patch, '{}'::jsonb);

  if pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Layout patch must be a JSON object.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_patch) patch_key
    where patch_key not in (
      'name',
      'staircaseFloor1Anchor',
      'staircaseFloor2Anchor',
      'cameraSettings',
      'metadata'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'Layout patch contains an unsupported field.';
  end if;

  if p_patch ? 'name'
     and nullif(pg_catalog.btrim(p_patch ->> 'name'), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Layout name cannot be empty.';
  end if;

  if p_patch ? 'cameraSettings'
     and pg_catalog.jsonb_typeof(p_patch -> 'cameraSettings') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'cameraSettings must be a JSON object.';
  end if;

  if p_patch ? 'metadata'
     and pg_catalog.jsonb_typeof(p_patch -> 'metadata') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'metadata must be a JSON object.';
  end if;

  select layout.store_id
  into v_store_id
  from stockroom.layouts layout
  where layout.id = p_layout_id;

  if v_store_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Layout not found.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'limen:stockroom:store:' || v_store_id::text,
      0
    )
  );

  select layout.*
  into v_current
  from stockroom.layouts layout
  where layout.id = p_layout_id
  for update;

  if v_current.status <> 'draft' then
    raise exception using
      errcode = '22023',
      message = 'Only draft layouts can be edited.';
  end if;

  if v_current.revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'Layout revision conflict.';
  end if;

  perform pg_catalog.set_config(
    'limen.stockroom_change_source',
    'rpc:update_layout_draft',
    true
  );
  perform pg_catalog.set_config(
    'limen.stockroom_change_reason',
    coalesce(p_change_reason, 'Updated draft layout metadata.'),
    true
  );
  perform pg_catalog.set_config(
    'limen.stockroom_actor_id',
    coalesce(p_actor_id::text, ''),
    true
  );

  update stockroom.layouts layout
  set
    name = case
      when p_patch ? 'name' then pg_catalog.btrim(p_patch ->> 'name')
      else layout.name
    end,
    staircase_floor_1_anchor = case
      when p_patch ? 'staircaseFloor1Anchor'
        then nullif(p_patch -> 'staircaseFloor1Anchor', 'null'::jsonb)
      else layout.staircase_floor_1_anchor
    end,
    staircase_floor_2_anchor = case
      when p_patch ? 'staircaseFloor2Anchor'
        then nullif(p_patch -> 'staircaseFloor2Anchor', 'null'::jsonb)
      else layout.staircase_floor_2_anchor
    end,
    camera_settings = case
      when p_patch ? 'cameraSettings' then p_patch -> 'cameraSettings'
      else layout.camera_settings
    end,
    metadata = case
      when p_patch ? 'metadata' then p_patch -> 'metadata'
      else layout.metadata
    end,
    updated_by = p_actor_id,
    revision = layout.revision + 1
  where layout.id = p_layout_id
    and layout.revision = p_expected_revision
    and layout.status = 'draft'
  returning layout.* into v_updated;

  if v_updated.id is null then
    raise exception using
      errcode = '40001',
      message = 'Layout revision conflict.';
  end if;

  return to_jsonb(v_updated);
end
$function$;

create or replace function public.limen_stockroom_publish_layout(
  p_layout_id uuid,
  p_expected_revision bigint,
  p_actor_id uuid default null,
  p_change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_store_id uuid;
  v_target stockroom.layouts%rowtype;
  v_published stockroom.layouts%rowtype;
  v_floor_count integer;
begin
  if p_layout_id is null
     or p_expected_revision is null
     or p_expected_revision < 1 then
    raise exception using
      errcode = '22023',
      message = 'A layout and positive expected revision are required.';
  end if;

  select layout.store_id
  into v_store_id
  from stockroom.layouts layout
  where layout.id = p_layout_id;

  if v_store_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Layout not found.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'limen:stockroom:store:' || v_store_id::text,
      0
    )
  );

  perform layout.id
  from stockroom.layouts layout
  where layout.store_id = v_store_id
  order by layout.id
  for update;

  select layout.*
  into v_target
  from stockroom.layouts layout
  where layout.id = p_layout_id;

  if v_target.status <> 'draft' then
    raise exception using
      errcode = '22023',
      message = 'Only a draft layout can be published.';
  end if;

  if v_target.revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'Layout revision conflict.';
  end if;

  if v_target.staircase_floor_1_anchor is null
     or v_target.staircase_floor_2_anchor is null then
    raise exception using
      errcode = '23514',
      message = 'A publishable layout requires both staircase anchors.';
  end if;

  select count(*)
  into v_floor_count
  from stockroom.floors floor
  where floor.layout_id = v_target.id
    and floor.floor_number in (1, 2);

  if v_floor_count <> 2 then
    raise exception using
      errcode = '23514',
      message = 'A publishable layout requires exactly floors 1 and 2.';
  end if;

  perform pg_catalog.set_config(
    'limen.stockroom_change_source',
    'rpc:publish_layout',
    true
  );
  perform pg_catalog.set_config(
    'limen.stockroom_change_reason',
    coalesce(p_change_reason, 'Published layout.'),
    true
  );
  perform pg_catalog.set_config(
    'limen.stockroom_actor_id',
    coalesce(p_actor_id::text, ''),
    true
  );

  update stockroom.layouts layout
  set
    status = 'archived',
    updated_by = p_actor_id,
    revision = layout.revision + 1
  where layout.store_id = v_store_id
    and layout.status = 'published'
    and layout.id <> p_layout_id;

  update stockroom.layouts layout
  set
    status = 'published',
    published_at = pg_catalog.timezone('utc', pg_catalog.now()),
    updated_by = p_actor_id,
    revision = layout.revision + 1
  where layout.id = p_layout_id
    and layout.status = 'draft'
    and layout.revision = p_expected_revision
  returning layout.* into v_published;

  if v_published.id is null then
    raise exception using
      errcode = '40001',
      message = 'Layout revision conflict.';
  end if;

  return to_jsonb(v_published);
end
$function$;

revoke all on function public.limen_stockroom_create_layout_draft(
  uuid,
  bigint,
  text,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.limen_stockroom_update_layout_draft(
  uuid,
  bigint,
  jsonb,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.limen_stockroom_publish_layout(
  uuid,
  bigint,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function public.limen_stockroom_create_layout_draft(
  uuid,
  bigint,
  text,
  uuid,
  text
) to service_role;
grant execute on function public.limen_stockroom_update_layout_draft(
  uuid,
  bigint,
  jsonb,
  uuid,
  text
) to service_role;
grant execute on function public.limen_stockroom_publish_layout(
  uuid,
  bigint,
  uuid,
  text
) to service_role;
