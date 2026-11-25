-- Add a human-editable display name and tightly guarded revision actions.
-- Published/activated history is retained; only never-published drafts may be
-- permanently removed. Product, sales, quotation, and current-price rows are
-- never modified or deleted by this function.

begin;

alter table catalog.pricelist_versions
  add column if not exists display_name text;

update catalog.pricelist_versions
   set display_name = coalesce(
     nullif(pg_catalog.btrim(regexp_replace(source_filename, '\.[^.]+$', '')), ''),
     pg_catalog.format('Price list %s · revision %s', version_year, revision)
   )
 where display_name is null or pg_catalog.btrim(display_name) = '';

create or replace function catalog.set_pricelist_display_name()
returns trigger
language plpgsql
set search_path = pg_catalog, catalog
as $function$
begin
  if new.display_name is null or pg_catalog.btrim(new.display_name) = '' then
    new.display_name := coalesce(
      nullif(pg_catalog.btrim(regexp_replace(new.source_filename, '\.[^.]+$', '')), ''),
      pg_catalog.format('Price list %s · revision %s', new.version_year, new.revision)
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists pricelist_versions_default_display_name on catalog.pricelist_versions;
create trigger pricelist_versions_default_display_name
before insert on catalog.pricelist_versions
for each row execute function catalog.set_pricelist_display_name();

revoke all on function catalog.set_pricelist_display_name() from public, anon, authenticated;
grant execute on function catalog.set_pricelist_display_name() to service_role;

create or replace function public.manage_retail_pricelist_version(
  p_version_id uuid,
  p_action text,
  p_display_name text default null,
  p_effective_from date default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, catalog, cms
as $function$
declare
  v_version catalog.pricelist_versions%rowtype;
  v_upload catalog.pricelist_uploads%rowtype;
  v_name text;
  v_item_count integer;
  v_change_set jsonb;
begin
  if p_action is null or p_action not in ('rename', 'effective_date', 'archive', 'delete') then
    raise exception using errcode = '22023', message = 'Choose a supported price list action.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);
  select * into v_version from catalog.pricelist_versions
   where id = p_version_id and price_type = 'retail' for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The price list revision was not found.';
  end if;

  if p_action = 'rename' then
    v_name := nullif(pg_catalog.btrim(p_display_name), '');
    if v_name is null or pg_catalog.length(v_name) > 140 then
      raise exception using errcode = '22023', message = 'Enter a revision name up to 140 characters.';
    end if;
    if v_name = v_version.display_name then
      return pg_catalog.jsonb_build_object('versionId', v_version.id, 'displayName', v_name, 'noChange', true);
    end if;
    update catalog.pricelist_versions set display_name = v_name, updated_at = now()
     where id = p_version_id;
    perform cms.log_audit(p_actor_id, 'pricelist_revision_renamed', 'pricelist_version', p_version_id,
      pg_catalog.jsonb_build_object('before', pg_catalog.jsonb_build_object('displayName', v_version.display_name),
        'after', pg_catalog.jsonb_build_object('displayName', v_name)));
    return pg_catalog.jsonb_build_object('versionId', p_version_id, 'displayName', v_name, 'status', v_version.status, 'isActive', v_version.is_active);
  elsif p_action = 'effective_date' then
    if p_effective_from is null then
      raise exception using errcode = '22023', message = 'Choose a valid effective date.';
    end if;
    if exists (select 1 from catalog.pricelist_versions other
      where other.price_type = 'retail' and other.version_year = v_version.version_year
        and other.effective_from = p_effective_from and other.id <> p_version_id) then
      raise exception using errcode = '23505', message = 'Another revision already uses this effective date for the same list year.';
    end if;
    if p_effective_from = v_version.effective_from then
      return pg_catalog.jsonb_build_object('versionId', v_version.id, 'effectiveFrom', p_effective_from, 'noChange', true);
    end if;
    update catalog.pricelist_versions set effective_from = p_effective_from, updated_at = now()
     where id = p_version_id;
    update catalog.pricelist_uploads set effective_date = p_effective_from, updated_at = now()
     where pricelist_version_id = p_version_id;
    perform cms.log_audit(p_actor_id, 'pricelist_revision_effective_date_changed', 'pricelist_version', p_version_id,
      pg_catalog.jsonb_build_object('before', pg_catalog.jsonb_build_object('effectiveFrom', v_version.effective_from),
        'after', pg_catalog.jsonb_build_object('effectiveFrom', p_effective_from),
        'priceAmountsChanged', false));
    return pg_catalog.jsonb_build_object('versionId', p_version_id, 'effectiveFrom', p_effective_from, 'status', v_version.status, 'isActive', v_version.is_active, 'priceAmountsChanged', false);
  elsif p_action = 'archive' then
    if v_version.is_active then
      raise exception using errcode = '22023', message = 'The active revision cannot be archived.';
    end if;
    if v_version.status <> 'published' then
      raise exception using errcode = '22023', message = 'Only an inactive published revision can be archived. Drafts can be deleted instead.';
    end if;
    update catalog.pricelist_versions set status = 'archived', updated_at = now()
     where id = p_version_id;
    perform cms.log_audit(p_actor_id, 'pricelist_revision_archived', 'pricelist_version', p_version_id,
      pg_catalog.jsonb_build_object('beforeStatus', v_version.status, 'afterStatus', 'archived'));
    return pg_catalog.jsonb_build_object('versionId', p_version_id, 'status', 'archived', 'isActive', false);
  end if;

  if v_version.is_active or v_version.status <> 'draft' or v_version.activated_at is not null
    or exists (select 1 from catalog.pricelist_activation_events event
      where event.activated_version_id = p_version_id) then
    raise exception using errcode = '22023', message = 'Only a never-published draft can be deleted. Published revisions are retained as price history.';
  end if;

  select count(*)::integer into v_item_count from catalog.pricelist_version_items where pricelist_version_id = p_version_id;
  select * into v_upload from catalog.pricelist_uploads where pricelist_version_id = p_version_id for update;
  v_change_set := pg_catalog.jsonb_build_object(
    'displayName', v_version.display_name,
    'versionYear', v_version.version_year,
    'revision', v_version.revision,
    'effectiveFrom', v_version.effective_from,
    'rowCount', v_item_count,
    'sourceFilename', v_upload.original_filename,
    'uploadId', v_upload.id,
    'storageBucket', v_upload.storage_bucket,
    'storagePath', v_upload.storage_path,
    'deletedStatus', v_version.status
  );
  perform cms.log_audit(p_actor_id, 'pricelist_revision_deleted', 'pricelist_version', p_version_id, v_change_set);
  delete from catalog.pricelist_versions where id = p_version_id;
  return pg_catalog.jsonb_build_object(
    'versionId', p_version_id,
    'deleted', true,
    'uploadId', v_upload.id,
    'storageBucket', v_upload.storage_bucket,
    'storagePath', v_upload.storage_path,
    'sourceFilename', v_upload.original_filename
  );
end;
$function$;

revoke all on function public.manage_retail_pricelist_version(uuid, text, text, date, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_retail_pricelist_version(uuid, text, text, date, uuid)
  to service_role;

commit;

notify pgrst, 'reload schema';
