-- Read-only staff browsing. Keep the legacy list RPC for existing callers.
create function public.search_saved_estimates(
  p_search text default '', p_status text default '', p_validity text default 'current',
  p_page integer default 1, p_page_size integer default 8
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_search text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
  v_today date := (pg_catalog.statement_timestamp() at time zone 'Asia/Manila')::date;
begin
  if p_page is null or p_page < 1 or p_page > 100000
     or p_page_size is null or p_page_size < 1 or p_page_size > 24
     or pg_catalog.length(v_search) > 100
     or p_status is null or p_status not in ('', 'draft', 'sent', 'approved', 'rejected', 'expired', 'converted_sale', 'converted_service')
     or p_validity is null or p_validity not in ('current', 'past', 'all') then
    raise exception using errcode = '22023', message = 'Choose valid quotation filters and page details.';
  end if;
  return (
    with filtered as materialized (
      select e.id, e.estimate_number, c.name as customer_name, c.phone as customer_phone,
        v.model_name as vehicle_model_name, e.status, e.grand_total, e.valid_until,
        e.created_at, e.updated_at, coalesce(e.valid_until < v_today, false) as past_validity
      from operations.estimates e
      left join operations.customers c on c.id = e.customer_id
      left join operations.vehicles v on v.id = e.vehicle_id
      where e.archived_at is null
        and pg_catalog.left(pg_catalog.upper(e.estimate_number), 9) <> 'EST-DEMO-'
        and pg_catalog.strpos(pg_catalog.lower(coalesce(c.name, '')), 'demo customer') = 0
        and (p_status = '' or e.status = p_status)
        and (p_validity = 'all'
          or (p_validity = 'current' and (e.valid_until is null or e.valid_until >= v_today))
          or (p_validity = 'past' and e.valid_until < v_today))
        and (v_search = ''
          or pg_catalog.strpos(pg_catalog.lower(e.estimate_number), v_search) > 0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(c.name, '')), v_search) > 0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(c.phone, '')), v_search) > 0
          or pg_catalog.strpos(pg_catalog.lower(coalesce(v.model_name, '')), v_search) > 0)
    ), totals as (select count(*)::integer as total from filtered),
    bounds as (
      select total, greatest(1, least(p_page, greatest(1, (total + p_page_size - 1) / p_page_size))) as page
      from totals
    ), page_rows as (
      select * from filtered order by updated_at desc nulls last, id desc
      limit p_page_size offset (select (page - 1) * p_page_size from bounds)
    )
    select pg_catalog.jsonb_build_object(
      'quotes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.updated_at desc nulls last, r.id desc) from page_rows r), '[]'::jsonb),
      'total', b.total, 'page', b.page, 'pageSize', p_page_size,
      'generatedAt', pg_catalog.statement_timestamp(), 'businessDate', v_today
    ) from bounds b
  );
end;
$$;
revoke all on function public.search_saved_estimates(text,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.search_saved_estimates(text,text,text,integer,integer) to service_role;
