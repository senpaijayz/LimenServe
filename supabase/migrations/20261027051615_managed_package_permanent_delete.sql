-- Remove the editable package only. Retain immutable publication/activity/seed
-- records, their original identity, and every issued quotation reference.
create table cms.package_deletions (
  original_package_id uuid primary key,
  package_key text not null,
  package_name text not null,
  package_type text not null,
  draft_revision integer not null,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now(),
  deletion_transaction bigint not null default txid_current()
);
create index package_deletions_actor_idx on cms.package_deletions(deleted_by) where deleted_by is not null;
alter table cms.package_deletions enable row level security;
revoke all on cms.package_deletions from public,anon,authenticated,service_role;
grant select,insert on cms.package_deletions to service_role;
create policy service_role_read on cms.package_deletions for select to service_role using (true);
create policy service_role_insert on cms.package_deletions for insert to service_role with check (true);

create function cms.keep_original_package_identity() returns trigger
language plpgsql security invoker set search_path=''
as $fn$
begin
  if TG_OP='INSERT' then
    new.original_package_id:=new.package_id;
  elsif new.original_package_id is distinct from old.original_package_id then
    raise exception using errcode='22023',message='The original package identity cannot change.';
  end if;
  return new;
end;
$fn$;
revoke all on function cms.keep_original_package_identity() from public,anon,authenticated;
grant execute on function cms.keep_original_package_identity() to service_role;

do $retained_history$
declare table_name text;
begin
  foreach table_name in array array['package_revisions','package_activity','package_seed_sources'] loop
    execute format('alter table cms.%I add column original_package_id uuid',table_name);
    execute format('update cms.%I set original_package_id=package_id',table_name);
    execute format('alter table cms.%I alter column original_package_id set not null, alter column package_id drop not null',table_name);
    execute format('alter table cms.%I drop constraint %I',table_name,table_name||'_package_id_fkey');
    execute format('alter table cms.%I add constraint %I foreign key(package_id) references cms.recommendation_packages(id) on delete set null',table_name,table_name||'_package_id_fkey');
    execute format('create trigger keep_original_package_identity before insert or update on cms.%I for each row execute function cms.keep_original_package_identity()',table_name);
    execute format('create index %I on cms.%I(original_package_id)',table_name||'_original_package_idx',table_name);
  end loop;
end;
$retained_history$;
create unique index package_revisions_original_revision_once on cms.package_revisions(original_package_id,revision_number);

create function cms.guard_managed_package_removal() returns trigger
language plpgsql security invoker set search_path=''
as $fn$
declare deletion cms.package_deletions%rowtype;
begin
  if TG_OP='INSERT' then
    if exists(select 1 from cms.package_deletions where original_package_id=new.id) then
      raise exception using errcode='22023',message='This package was permanently deleted. Create a new package instead.';
    end if;
    return new;
  end if;
  if old.publication_status<>'archived' then
    raise exception using errcode='22023',message='Archive this package before deleting it permanently.';
  end if;
  -- The package row is locked by DELETE/the RPC. New approved quote saves
  -- acquire a conflicting package lock and cannot race this reference check.
  if exists(select 1 from operations.estimate_package_snapshots s
      join cms.package_revisions r on r.id=s.package_revision_id where r.package_id=old.id)
    or exists(select 1 from operations.estimate_items i
      join cms.package_revisions r on r.id=i.managed_package_revision_id where r.package_id=old.id) then
    raise exception using errcode='23503',message='This package is used by a saved quotation. Keep it archived to preserve its history.';
  end if;
  select * into deletion from cms.package_deletions where original_package_id=old.id
    and draft_revision=old.draft_revision and deletion_transaction=txid_current();
  if not found then
    raise exception using errcode='42501',message='Use the confirmed package deletion action.';
  end if;
  perform cms.assert_package_admin(deletion.deleted_by);
  return old;
end;
$fn$;
revoke all on function cms.guard_managed_package_removal() from public,anon,authenticated;
grant execute on function cms.guard_managed_package_removal() to service_role;
create trigger guard_managed_package_removal before insert or delete on cms.recommendation_packages
  for each row execute function cms.guard_managed_package_removal();

create function cms.delete_archived_managed_package(
  p_package_id uuid,p_expected_revision integer,p_actor_id uuid,p_confirmation text
) returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare pkg cms.recommendation_packages%rowtype;
begin
  perform cms.assert_package_admin(p_actor_id);
  if p_confirmation is distinct from 'DELETE' then
    raise exception using errcode='22023',message='Type DELETE to confirm permanent deletion.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('managed-package:'||p_package_id::text,0));
  select * into pkg from cms.recommendation_packages where id=p_package_id for update;
  if not found then
    -- A repeated request after a lost response acknowledges only a recorded
    -- successful deletion; it never deletes a different package or new copy.
    if exists(select 1 from cms.package_deletions where original_package_id=p_package_id
        and draft_revision=p_expected_revision) then
      return jsonb_build_object('id',p_package_id,'deleted',true);
    end if;
    raise exception using errcode='22023',message='Package not found. Refresh the package list.';
  end if;
  if p_expected_revision is null or pkg.draft_revision<>p_expected_revision then
    raise exception using errcode='40001',message='This package changed. Reload it before deleting.';
  end if;
  if pkg.publication_status<>'archived' then
    raise exception using errcode='22023',message='Archive this package before deleting it permanently.';
  end if;
  insert into cms.package_deletions(original_package_id,package_key,package_name,package_type,draft_revision,deleted_by)
    values(pkg.id,pkg.package_key,pkg.package_name,pkg.package_type,pkg.draft_revision,p_actor_id);
  delete from cms.recommendation_packages where id=p_package_id;
  return jsonb_build_object('id',p_package_id,'deleted',true);
end;
$fn$;
revoke all on function cms.delete_archived_managed_package(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function cms.delete_archived_managed_package(uuid,integer,uuid,text) to service_role;
comment on function cms.delete_archived_managed_package(uuid,integer,uuid,text) is
  'Admin-only confirmed removal of archived, unquoted packages; immutable audit/publication/source records remain. No stock, catalog, sales or quotation deletion.';
