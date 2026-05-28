-- Adds an admin CMS page delete RPC so page removal, section cleanup, audit logging,
-- and matching navigation cleanup happen in one database transaction.

create or replace function public.cms_admin_delete_page(p_slug text, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = cms, public, pg_temp
as $$
declare
  normalized_slug text;
  deleted_page cms.pages%rowtype;
  archived_navigation_count integer := 0;
begin
  normalized_slug := lower(regexp_replace(trim(coalesce(p_slug, '')), '[^a-z0-9\-]+', '-', 'g'));
  normalized_slug := regexp_replace(normalized_slug, '(^-+|-+$)', '', 'g');

  if normalized_slug = '' then
    raise exception 'Page slug is required.';
  end if;

  if normalized_slug in ('home', 'about', 'service-orders') then
    raise exception 'Default CMS pages cannot be deleted.';
  end if;

  delete from cms.pages p
  where p.slug = normalized_slug
    and p.status <> 'archived'
  returning p.* into deleted_page;

  if deleted_page.id is null then
    return null::jsonb;
  end if;

  update cms.navigation_links
  set status = 'archived',
      is_visible = false,
      updated_by = p_actor_id,
      updated_at = timezone('utc', now())
  where status <> 'archived'
    and href in (normalized_slug, '/' || normalized_slug, '/' || normalized_slug || '/');

  get diagnostics archived_navigation_count = row_count;

  perform cms.log_audit(
    p_actor_id,
    'delete_page',
    'page',
    deleted_page.id,
    jsonb_build_object(
      'id', deleted_page.id,
      'slug', deleted_page.slug,
      'title', deleted_page.title,
      'archivedNavigationLinks', archived_navigation_count
    )
  );

  return jsonb_build_object(
    'id', deleted_page.id,
    'slug', deleted_page.slug,
    'title', deleted_page.title,
    'archivedNavigationLinks', archived_navigation_count
  );
end;
$$;

grant execute on function public.cms_admin_delete_page(text, uuid) to authenticated, service_role;
