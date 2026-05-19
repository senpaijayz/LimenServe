create or replace function catalog.receive_existing_supplier_invoice_stock(
  p_invoice jsonb,
  p_performed_by uuid default auth.uid()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_missing_parts text[];
begin
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then
    raise exception 'Invoice payload is required.';
  end if;

  if jsonb_typeof(p_invoice -> 'items') <> 'array' or jsonb_array_length(p_invoice -> 'items') = 0 then
    raise exception 'At least one invoice line item is required.';
  end if;

  select array_agg(distinct part_number order by part_number)
    into v_missing_parts
  from (
    select catalog.normalize_supplier_invoice_part_number(value ->> 'partNumber') as part_number
    from jsonb_array_elements(p_invoice -> 'items')
  ) normalized
  where part_number is not null
    and part_number <> ''
    and not exists (
      select 1
      from catalog.products
      where products.sku = normalized.part_number
    );

  if coalesce(array_length(v_missing_parts, 1), 0) > 0 then
    raise exception 'Invoice contains part numbers that are not yet products: %', array_to_string(v_missing_parts, ', ');
  end if;

  return catalog.receive_supplier_invoice_stock(p_invoice, p_performed_by);
end;
$$;

create or replace function public.receive_existing_supplier_invoice_stock(
  p_invoice jsonb,
  p_performed_by uuid default auth.uid()
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select catalog.receive_existing_supplier_invoice_stock(p_invoice, p_performed_by);
$$;

revoke execute on function catalog.receive_existing_supplier_invoice_stock(jsonb, uuid) from public;
revoke execute on function public.receive_existing_supplier_invoice_stock(jsonb, uuid) from public;

grant execute on function catalog.receive_existing_supplier_invoice_stock(jsonb, uuid) to service_role;
grant execute on function public.receive_existing_supplier_invoice_stock(jsonb, uuid) to service_role;
