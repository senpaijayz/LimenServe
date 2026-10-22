-- Keep business and CMS records when an inactive staff login is removed.
-- The existing foreign keys are all nullable, so their actor fields can be
-- cleared while the records themselves remain intact.
do $migration$
declare
  v_count integer;
  v_link record;
begin
  select count(*)
    into v_count
  from pg_catalog.pg_constraint as fk
  join pg_catalog.pg_class as target on target.oid = fk.conrelid
  join pg_catalog.pg_namespace as schema_name on schema_name.oid = target.relnamespace
  where fk.contype = 'f'
    and fk.confrelid = 'auth.users'::regclass
    and fk.confdeltype = 'a'
    and (
      schema_name.nspname = 'cms'
      or (schema_name.nspname = 'operations' and target.relname = 'part_reservations')
    );

  if v_count <> 25 then
    raise exception 'Expected 25 nullable user references, found %. Review the schema before applying.', v_count;
  end if;

  for v_link in
    select schema_name.nspname as schema_name,
           target.relname as table_name,
           fk.conname as constraint_name,
           column_name.attname as column_name,
           column_name.attnotnull as is_required
    from pg_catalog.pg_constraint as fk
    join pg_catalog.pg_class as target on target.oid = fk.conrelid
    join pg_catalog.pg_namespace as schema_name on schema_name.oid = target.relnamespace
    join pg_catalog.pg_attribute as column_name
      on column_name.attrelid = target.oid and column_name.attnum = fk.conkey[1]
    where fk.contype = 'f'
      and fk.confrelid = 'auth.users'::regclass
      and fk.confdeltype = 'a'
      and pg_catalog.array_length(fk.conkey, 1) = 1
      and pg_catalog.array_length(fk.confkey, 1) = 1
      and (
        schema_name.nspname = 'cms'
        or (schema_name.nspname = 'operations' and target.relname = 'part_reservations')
      )
    order by schema_name.nspname, target.relname, fk.conname
  loop
    if v_link.is_required then
      raise exception 'Cannot clear required actor column %.%.%',
        v_link.schema_name, v_link.table_name, v_link.column_name;
    end if;

    execute pg_catalog.format(
      'alter table %I.%I drop constraint %I',
      v_link.schema_name, v_link.table_name, v_link.constraint_name
    );
    execute pg_catalog.format(
      'alter table %I.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
      v_link.schema_name, v_link.table_name, v_link.constraint_name, v_link.column_name
    );
  end loop;
end;
$migration$;

-- Assignment rows are part of service history. Keep them when the staff
-- member who made the assignment is deleted.
alter table operations.mechanic_assignments
  alter column assigned_by drop not null;
alter table operations.mechanic_assignments
  drop constraint mechanic_assignments_assigned_by_fkey;
alter table operations.mechanic_assignments
  add constraint mechanic_assignments_assigned_by_fkey
  foreign key (assigned_by) references auth.users(id) on delete set null;

-- A restored or active staff account must never be removed through the Auth
-- admin API, even if its status changes between the HTTP check and deletion.
create or replace function core.guard_active_staff_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.raw_app_meta_data ->> 'role' in ('admin', 'cashier', 'stock_clerk')
    or exists (
      select 1
      from core.user_profiles as profile
      where profile.user_id = old.id
        and profile.role in ('admin', 'cashier', 'stock_clerk')
    ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVE_STAFF_ACCOUNT_DELETE_BLOCKED';
  end if;

  return old;
end;
$function$;

revoke all on function core.guard_active_staff_hard_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists guard_active_staff_hard_delete_before_delete on auth.users;
create trigger guard_active_staff_hard_delete_before_delete
before delete on auth.users
for each row execute function core.guard_active_staff_hard_delete();
