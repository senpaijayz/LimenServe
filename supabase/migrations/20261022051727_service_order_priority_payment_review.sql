begin;

alter table operations.service_orders
  add column if not exists priority text not null default 'normal',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_method text;

-- The live sales table restricts source_type. Preserve its existing values
-- while allowing a posted service order to retain its own source label.
do $migration$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition
  from pg_constraint
  where conrelid = 'operations.sales_transactions'::regclass
    and conname = 'sales_transactions_source_type_check';

  if v_definition is null then
    raise exception 'The sales source-type constraint is missing; review the live schema before continuing.';
  end if;

  if v_definition not like '%''service_order''%' then
    if v_definition <> 'CHECK ((source_type = ANY (ARRAY[''pos''::text, ''historical_encoded''::text, ''estimate_conversion''::text, ''service_conversion''::text, ''demo_seed''::text])))' then
      raise exception 'The sales source-type constraint differs from the reviewed live schema.';
    end if;

    alter table operations.sales_transactions
      drop constraint sales_transactions_source_type_check;
    alter table operations.sales_transactions
      add constraint sales_transactions_source_type_check
      check (source_type in (
        'pos', 'historical_encoded', 'estimate_conversion',
        'service_conversion', 'demo_seed', 'service_order'
      ));
  end if;
end;
$migration$;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'operations.service_orders'::regclass
      and conname = 'service_orders_priority_valid'
  ) then
    alter table operations.service_orders
      add constraint service_orders_priority_valid
      check (priority in ('low', 'normal', 'high', 'urgent')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'operations.service_orders'::regclass
      and conname = 'service_orders_payment_status_valid'
  ) then
    alter table operations.service_orders
      add constraint service_orders_payment_status_valid
      check (payment_status in ('unpaid', 'paid')) not valid;
  end if;
end;
$migration$;

-- Keep sale creation and its service-order idempotency reference in one
-- database transaction. A retry returns the original sale instead of
-- deducting stock and posting a second sale.
create or replace function public.create_service_order_sale(
  payload jsonb,
  p_operator_id uuid,
  p_original_reference text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_reference text := nullif(btrim(coalesce(p_original_reference, '')), '');
  v_sale_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service order sales are server-managed.' using errcode = '42501';
  end if;
  if v_reference is null then
    raise exception 'A service order reference is required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_reference, 0));

  select id into v_sale_id
  from operations.sales_transactions
  where original_reference = v_reference
  order by created_at
  limit 1
  for update;

  if v_sale_id is not null then
    return v_sale_id;
  end if;

  v_sale_id := public.create_pos_sale(payload, p_operator_id);

  update operations.sales_transactions
  set source_type = 'service_order',
      original_reference = v_reference,
      inventory_applied = true,
      sale_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_sale_id;

  if not found then
    raise exception 'The service sale could not be linked to its order.';
  end if;

  return v_sale_id;
end;
$function$;

revoke all on function public.create_service_order_sale(jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_service_order_sale(jsonb, uuid, text) to service_role;

commit;
