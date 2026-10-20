-- Renaming a saved CMS page must update its existing row and matching menu links
-- in the same transaction as the content save. The base save RPC keys by slug,
-- so calling it with a changed slug directly would otherwise create a second
-- page (or fail on the existing page ID).
create or replace function public.cms_admin_save_renamed_page(
  p_current_slug text,
  p_payload jsonb,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, cms, public, pg_temp
as $$
declare
  current_slug text;
  next_slug text;
  target_page_id uuid;
begin
  current_slug := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_current_slug, '')), '[^a-z0-9\-]+', '-', 'g'));
  current_slug := pg_catalog.regexp_replace(current_slug, '(^-+|-+$)', '', 'g');
  next_slug := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_payload->>'slug', '')), '[^a-z0-9\-]+', '-', 'g'));
  next_slug := pg_catalog.regexp_replace(next_slug, '(^-+|-+$)', '', 'g');

  if current_slug = '' or next_slug = '' then
    raise exception 'A page address is required.';
  end if;

  if pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Page content must be an object.';
  end if;

  if current_slug in ('home', 'about', 'service-orders') and current_slug <> next_slug then
    raise exception 'Default website pages cannot be renamed.';
  end if;

  select p.id
  into target_page_id
  from cms.pages p
  where p.slug = current_slug
    and p.status <> 'archived'
  for update;

  if target_page_id is null then
    raise exception 'The page you are editing could not be found. Refresh the page list and try again.';
  end if;

  if exists (
    select 1
    from cms.pages p
    where p.slug = next_slug
      and p.id <> target_page_id
  ) then
    raise exception 'That page address is already in use. Choose a different one.';
  end if;

  if current_slug <> next_slug then
    update cms.pages
    set slug = next_slug,
        updated_by = p_actor_id,
        updated_at = timezone('utc', now())
    where id = target_page_id;

    update cms.navigation_links
    set href = case href
          when current_slug then next_slug
          when '/' || current_slug then '/' || next_slug
          when '/' || current_slug || '/' then '/' || next_slug || '/'
          else href
        end,
        updated_by = p_actor_id,
        updated_at = timezone('utc', now())
    where status <> 'archived'
      and href in (current_slug, '/' || current_slug, '/' || current_slug || '/');
  end if;

  return public.cms_admin_save_page(
    p_payload || pg_catalog.jsonb_build_object('id', target_page_id::text, 'slug', next_slug),
    p_actor_id
  );
end;
$$;

revoke all on function public.cms_admin_save_renamed_page(text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.cms_admin_save_renamed_page(text, jsonb, uuid) to service_role;
