-- Backend-only read; the HTTP adapter emits a customer-safe, unpriced directory.
create function public.browse_published_package_directory(
  p_search text default '', p_type text default '', p_page integer default 1,
  p_page_size integer default 4, p_package_id uuid default null
) returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare v_search text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
begin
  if pg_catalog.length(v_search) > 100 or p_type is null
     or p_type not in ('','parts','service','vehicle','combination','promotion','maintenance','custom')
     or p_page is null or p_page < 1 or p_page > 10000
     or p_page_size is null or p_page_size < 1 or p_page_size > 12 then
    raise exception using errcode='22023', message='Choose valid package search and page details.';
  end if;
  return (
    with eligible as materialized (
      select p.id, r.id as revision_id, r.revision_number, r.definition,
        pg_catalog.lower(r.definition->>'name') as sort_name
      from cms.recommendation_packages p
      join cms.package_revisions r on r.id=p.published_revision_id and r.package_id=p.id
      where p.publication_status='published' and r.definition->>'id'=p.id::text
        and (p_package_id is null or p.id=p_package_id)
        and (p_type='' or r.definition->>'type'=p_type)
        and exists (select 1 from pg_catalog.jsonb_array_elements(
          case when pg_catalog.jsonb_typeof(r.definition->'variants')='array' then r.definition->'variants' else '[]'::jsonb end
        ) v where v->>'active'='true')
        and (v_search=''
          or pg_catalog.strpos(pg_catalog.lower(coalesce(r.definition->>'name','')),v_search)>0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(r.definition->>'description','')),v_search)>0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(r.definition->>'packageKey','')),v_search)>0)
    ), totals as (select count(*)::integer as total from eligible), bounds as (
      select total, greatest(1,least(p_page,greatest(1,(total+p_page_size-1)/p_page_size))) as page from totals
    ), selected as (
      select * from eligible order by sort_name,id
      limit p_page_size offset (select (page-1)*p_page_size from bounds)
    )
    select pg_catalog.jsonb_build_object('publications',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id',s.id,'revisionId',s.revision_id,'revisionNumber',s.revision_number,'definition',s.definition)
      order by s.sort_name,s.id) from selected s),'[]'::jsonb),
      'pagination',pg_catalog.jsonb_build_object('page',b.page,'pageSize',p_page_size,'totalCount',b.total,
        'totalPages',greatest(1,(b.total+p_page_size-1)/p_page_size))) from bounds b
  );
end;
$$;
revoke all on function public.browse_published_package_directory(text,text,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.browse_published_package_directory(text,text,integer,integer,uuid) to service_role;
