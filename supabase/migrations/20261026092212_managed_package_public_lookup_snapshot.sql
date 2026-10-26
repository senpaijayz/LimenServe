-- Keep phone + quote-number retrieval read-only, but use the same frozen
-- document source as creation, revisions and the administrator editor.
-- The old lookup assembled a second live-catalog projection that discarded
-- package identities, allocations, saved labels and the quotation revision.
-- No quote, catalog, stock, sale or payment records are rewritten here.

-- This existing helper is immutable, strict and only normalizes its text
-- argument. The backend role needs this narrow permission for invoker lookup;
-- no anonymous/authenticated execution is added.
grant execute on function private.normalize_limen_phone(text) to service_role;

create or replace function public.lookup_public_estimate(p_estimate_number text, p_phone text)
returns jsonb
language plpgsql stable security invoker set search_path=''
as $fn$
declare
  quote_number text := upper(nullif(btrim(p_estimate_number), ''));
  recovery_phone text := private.normalize_limen_phone(p_phone);
  result jsonb;
begin
  if quote_number is null or recovery_phone is null then
    return null;
  end if;

  select app.build_estimate_snapshot(e.id)
  into result
  from operations.estimates e
  left join operations.customers c on c.id=e.customer_id
  left join lateral (
    select er.estimate_snapshot#>>'{customer,phone}' as phone
    from operations.estimate_revisions er
    where er.estimate_id=e.id
    order by er.revision_number desc
    limit 1
  ) recorded_customer on true
  where upper(btrim(e.estimate_number))=quote_number
    and private.normalize_limen_phone(coalesce(
      nullif(e.customer_snapshot->>'phone',''),
      nullif(recorded_customer.phone,''),c.phone
    ))=recovery_phone
    and e.source='public'
    and e.status in ('draft','sent','approved')
    and e.archived_at is null
    and (e.valid_until is null or e.valid_until>=current_date)
  order by e.created_at desc,e.id
  limit 1;

  return result;
end;
$fn$;

-- The full snapshot is backend-only. The HTTP handler projects the customer
-- DTO explicitly, omitting private eligibility evidence, source notes, actor
-- data and internal package definitions. Retrieval never grants edit access.
revoke all on function public.lookup_public_estimate(text,text) from public,anon,authenticated;
grant execute on function public.lookup_public_estimate(text,text) to service_role;

notify pgrst,'reload schema';
