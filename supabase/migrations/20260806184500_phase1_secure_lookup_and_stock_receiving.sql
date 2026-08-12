-- Phase 1 security and inventory-integrity hardening.
--
-- This is a forward-only migration. It intentionally fails when neither the
-- production schema layout (operations/catalog) nor the legacy local layout
-- (app) is complete. Do not weaken these checks with silent fallbacks.
--
-- Rollback guidance (use a reviewed forward corrective migration):
--   1. Revoke EXECUTE on the three public functions added/replaced below.
--   2. Restore the prior lookup definition only if its broader response and
--      direct grants are explicitly accepted as a security regression.
--   3. Keep catalog.stock_receipt_idempotency for the audit/retry retention
--      window. Drop it only after proving no deployed caller relies on replay.
-- No production migration is applied by this file on its own.

do $$
declare
  v_operations_count integer;
  v_app_count integer;
  v_missing_catalog text[];
begin
  select count(*)
  into v_operations_count
  from unnest(array[
    'operations.customers',
    'operations.estimates',
    'operations.estimate_items',
    'operations.vehicles'
  ]) as required_relation(name)
  where to_regclass(required_relation.name) is not null;

  select count(*)
  into v_app_count
  from unnest(array[
    'app.customers',
    'app.estimates',
    'app.estimate_items',
    'app.vehicles'
  ]) as required_relation(name)
  where to_regclass(required_relation.name) is not null;

  if v_operations_count between 1 and 3 then
    raise exception using
      errcode = '42P01',
      message = 'PHASE1_SCHEMA_INCOMPLETE: operations estimate tables are only partially present';
  end if;

  if v_operations_count = 4 then
    if to_regclass('operations.services') is null or to_regclass('catalog.products') is null then
      raise exception using
        errcode = '42P01',
        message = 'PHASE1_SCHEMA_INCOMPLETE: operations.services and catalog.products are required';
    end if;
  elsif v_app_count = 4 then
    if to_regclass('app.services') is null or to_regclass('app.products') is null then
      raise exception using
        errcode = '42P01',
        message = 'PHASE1_SCHEMA_INCOMPLETE: app.services and app.products are required';
    end if;
  else
    raise exception using
      errcode = '42P01',
      message = 'PHASE1_SCHEMA_INCOMPLETE: no complete estimate schema is available';
  end if;

  select array_agg(required_relation.name order by required_relation.name)
  into v_missing_catalog
  from unnest(array[
    'catalog.inventory_balances',
    'catalog.inventory_movements',
    'catalog.product_supplier_links',
    'catalog.products',
    'catalog.stock_receiving_logs',
    'catalog.suppliers'
  ]) as required_relation(name)
  where to_regclass(required_relation.name) is null;

  if coalesce(array_length(v_missing_catalog, 1), 0) > 0 then
    raise exception using
      errcode = '42P01',
      message = 'PHASE1_SCHEMA_INCOMPLETE: missing catalog relations: ' || array_to_string(v_missing_catalog, ', ');
  end if;

  if to_regprocedure('catalog.receive_supplier_invoice_stock(jsonb,uuid)') is null then
    raise exception using
      errcode = '42883',
      message = 'PHASE1_SCHEMA_INCOMPLETE: catalog.receive_supplier_invoice_stock(jsonb, uuid) is required';
  end if;

  if to_regprocedure('catalog.receive_existing_supplier_invoice_stock(jsonb,uuid)') is null then
    raise exception using
      errcode = '42883',
      message = 'PHASE1_SCHEMA_INCOMPLETE: catalog.receive_existing_supplier_invoice_stock(jsonb, uuid) is required';
  end if;

  if to_regprocedure('catalog.normalize_supplier_invoice_part_number(text)') is null then
    raise exception using
      errcode = '42883',
      message = 'PHASE1_SCHEMA_INCOMPLETE: catalog.normalize_supplier_invoice_part_number(text) is required';
  end if;
end;
$$;

create schema if not exists private;

create or replace function private.normalize_limen_phone(p_value text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(p_value, '[^0-9]', '', 'g');

  if v_digits = '' then
    return null;
  end if;

  -- Store Philippine numbers in local form so +63, 0063, and leading-zero
  -- representations compare consistently. Both mobile (11 digits) and
  -- area-code landline (10 digits) forms are accepted.
  if v_digits ~ '^0063' then
    v_digits := '0' || substring(v_digits from 5);
  elsif v_digits ~ '^63' then
    v_digits := '0' || substring(v_digits from 3);
  end if;

  if v_digits !~ '^0[0-9]{9,10}$' then
    return null;
  end if;

  return v_digits;
end;
$$;

revoke all on function private.normalize_limen_phone(text) from public, anon, authenticated, service_role;

-- Every Phase 1 receipt path derives its transaction-level product lock from
-- this helper. Keeping the namespace and normalization in one non-exposed
-- function prevents manual and invoice receiving from silently diverging.
create or replace function private.catalog_stock_receipt_product_lock_key(p_sku text)
returns bigint
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.hashtextextended(
    'limen:catalog:stock-receipt:product:'
      || catalog.normalize_supplier_invoice_part_number(p_sku),
    0
  );
$$;

revoke all on function private.catalog_stock_receipt_product_lock_key(text)
  from public, anon, authenticated, service_role;

create or replace function public.lookup_public_estimate(
  p_estimate_number text,
  p_phone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_estimate_number text := upper(nullif(btrim(p_estimate_number), ''));
  v_phone text := private.normalize_limen_phone(p_phone);
  v_result jsonb;
begin
  -- A missing/invalid phone must never degrade into quote-number-only access.
  if v_estimate_number is null or v_phone is null then
    return null;
  end if;

  if to_regclass('operations.estimates') is not null then
    -- `source` is the sole server-verification marker; the backend must verify
    -- it is `public` and omit it from the client DTO.
    select jsonb_build_object(
      'estimate', jsonb_build_object(
        'estimate_number', e.estimate_number,
        'status', e.status,
        'source', e.source,
        'subtotal', e.subtotal,
        'discount_total', e.discount_total,
        'tax_total', e.tax_total,
        'grand_total', e.grand_total,
        'issued_at', e.issued_at,
        'valid_until', e.valid_until
      ),
      'customer', jsonb_build_object('name', c.name),
      'vehicle', case
        when v.id is null then null
        else jsonb_build_object(
          'make', v.make,
          'model_name', v.model_name,
          'year', v.year
        )
      end,
      'items', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'line_type', ei.line_type,
              'quantity', ei.quantity,
              'unit_price', ei.unit_price,
              'line_total', ei.line_total,
              'product_name', product.name,
              'product_sku', product.sku,
              'service_name', service.name,
              'service_code', service.code
            )
            order by ei.created_at, ei.id
          ),
          '[]'::jsonb
        )
        from operations.estimate_items ei
        left join catalog.products product on product.id = ei.product_id
        left join operations.services service on service.id = ei.service_id
        where ei.estimate_id = e.id
      )
    )
    into v_result
    from operations.estimates e
    join operations.customers c on c.id = e.customer_id
    left join operations.vehicles v on v.id = e.vehicle_id
    where upper(btrim(e.estimate_number)) = v_estimate_number
      and private.normalize_limen_phone(c.phone) = v_phone
      and e.source = 'public'
      and e.status in ('draft', 'sent', 'approved')
      and (e.valid_until is null or e.valid_until >= current_date)
    limit 1;
  elsif to_regclass('app.estimates') is not null then
    select jsonb_build_object(
      'estimate', jsonb_build_object(
        'estimate_number', e.estimate_number,
        'status', e.status,
        'source', e.source,
        'subtotal', e.subtotal,
        'discount_total', e.discount_total,
        'tax_total', e.tax_total,
        'grand_total', e.grand_total,
        'issued_at', e.issued_at,
        'valid_until', e.valid_until
      ),
      'customer', jsonb_build_object('name', c.name),
      'vehicle', case
        when v.id is null then null
        else jsonb_build_object(
          'make', v.make,
          'model_name', v.model_name,
          'year', v.year
        )
      end,
      'items', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'line_type', ei.line_type,
              'quantity', ei.quantity,
              'unit_price', ei.unit_price,
              'line_total', ei.line_total,
              'product_name', product.name,
              'product_sku', product.sku,
              'service_name', service.name,
              'service_code', service.code
            )
            order by ei.created_at, ei.id
          ),
          '[]'::jsonb
        )
        from app.estimate_items ei
        left join app.products product on product.id = ei.product_id
        left join app.services service on service.id = ei.service_id
        where ei.estimate_id = e.id
      )
    )
    into v_result
    from app.estimates e
    join app.customers c on c.id = e.customer_id
    left join app.vehicles v on v.id = e.vehicle_id
    where upper(btrim(e.estimate_number)) = v_estimate_number
      and private.normalize_limen_phone(c.phone) = v_phone
      and e.source = 'public'
      and e.status in ('draft', 'sent', 'approved')
      and (e.valid_until is null or e.valid_until >= current_date)
    limit 1;
  else
    raise exception using
      errcode = '42P01',
      message = 'PHASE1_SCHEMA_INCOMPLETE: estimate schema disappeared after migration';
  end if;

  return v_result;
end;
$$;

-- All estimate reads and mutations must cross the backend authorization and
-- response-shaping boundary. Earlier migrations granted several SECURITY
-- DEFINER wrappers to anon/authenticated, allowing a browser to bypass the
-- backend's admin checks and public DTO. Revoke both inherited PUBLIC access
-- and direct client-role grants, then grant only the server-side role.
do $$
declare
  v_signature text;
  v_function oid;
begin
  foreach v_signature in array array[
    'public.create_estimate(jsonb)',
    'public.list_estimates(text,integer)',
    'public.get_estimate_detail(uuid)',
    'public.get_estimate_revisions(uuid)',
    'public.revise_estimate(uuid,jsonb,uuid,text)',
    'public.lookup_public_estimate(text,text)',
    'public.convert_estimate_to_sale(uuid,text)',
    'public.convert_estimate_to_service_order(uuid,uuid)'
  ] loop
    v_function := to_regprocedure(v_signature);

    if v_function is null then
      raise exception using
        errcode = '42883',
        message = 'PHASE1_SCHEMA_INCOMPLETE: required estimate RPC is missing: ' || v_signature;
    end if;

    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      v_function::regprocedure
    );
    execute format(
      'grant execute on function %s to service_role',
      v_function::regprocedure
    );
  end loop;

  -- These app-schema functions are implementation details. Some deployments
  -- retain only a subset, so harden every helper that exists without requiring
  -- a legacy helper to be recreated. In particular, build_estimate_snapshot()
  -- returns complete customer and vehicle rows.
  foreach v_signature in array array[
    'app.create_estimate_internal(jsonb)',
    'app.create_estimate_with_revision_internal(jsonb,uuid)',
    'app.list_estimates_internal(text,integer)',
    'app.build_estimate_snapshot(uuid)',
    'app.get_estimate_revisions_internal(uuid)',
    'app.ensure_estimate_revision(uuid,uuid,text)',
    'app.revise_estimate_internal(uuid,jsonb,uuid,text)',
    'app.lookup_public_estimate_internal(text,text)',
    'app.convert_estimate_to_sale_internal(uuid,text)',
    'app.convert_estimate_to_service_order_internal(uuid,uuid)'
  ] loop
    v_function := to_regprocedure(v_signature);

    if v_function is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated, service_role',
        v_function::regprocedure
      );
      execute format(
        'grant execute on function %s to service_role',
        v_function::regprocedure
      );
    end if;
  end loop;
end;
$$;

create table catalog.stock_receipt_idempotency (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('catalog_stock_receive', 'supplier_invoice_stock_receive')),
  idempotency_key text not null,
  request_payload jsonb not null,
  performed_by uuid,
  completed_response jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation, idempotency_key),
  check (char_length(idempotency_key) between 8 and 200),
  check ((completed_response is null) = (completed_at is null))
);

comment on table catalog.stock_receipt_idempotency is
  'Private replay ledger for atomic stock-receiving RPCs. Direct client access is intentionally denied.';

alter table catalog.stock_receipt_idempotency enable row level security;
revoke all on table catalog.stock_receipt_idempotency from public, anon, authenticated, service_role;

create index stock_receipt_idempotency_created_at_idx
  on catalog.stock_receipt_idempotency (created_at);

create or replace function public.receive_catalog_stock(
  p_payload jsonb,
  p_performed_by uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_product_id uuid;
  v_product_sku text;
  v_product_lock_key bigint;
  v_quantity numeric(12,2);
  v_supplier_id uuid;
  v_supplier_name text;
  v_supplier_code text;
  v_supplier_phone text;
  v_supplier_address text;
  v_reference_number text;
  v_received_date date;
  v_reason text;
  v_request_payload jsonb;
  v_stored_payload jsonb;
  v_request_id uuid;
  v_response jsonb;
  v_previous_stock numeric(12,2);
  v_updated_stock numeric(12,2);
  v_product record;
  v_movement record;
  v_now timestamptz := now();
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'Stock receipt payload must be a JSON object.';
  end if;

  if char_length(v_key) not between 8 and 200
    or v_key !~ '^[A-Za-z0-9._:-]+$'
    or v_key !~ '[A-Za-z0-9]' then
    raise exception using errcode = '22023', message = 'Idempotency key must be 8-200 URL-safe characters.';
  end if;

  if nullif(btrim(p_payload ->> 'productId'), '') is null then
    raise exception using errcode = '22023', message = 'Product is required.';
  end if;

  v_product_id := (p_payload ->> 'productId')::uuid;
  v_quantity := nullif(btrim(p_payload ->> 'quantity'), '')::numeric;

  if v_quantity is null
    or v_quantity <= 0
    or v_quantity::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = '22023', message = 'Quantity must be greater than zero.';
  end if;

  if nullif(btrim(p_payload ->> 'supplierId'), '') is not null then
    v_supplier_id := (p_payload ->> 'supplierId')::uuid;
  end if;

  v_supplier_name := nullif(btrim(p_payload ->> 'supplierName'), '');
  v_supplier_phone := nullif(btrim(p_payload ->> 'supplierContact'), '');
  v_supplier_address := nullif(btrim(p_payload ->> 'supplierAddress'), '');
  v_reason := nullif(btrim(p_payload ->> 'reason'), '');

  if nullif(btrim(p_payload ->> 'receivedDate'), '') is not null then
    v_received_date := (p_payload ->> 'receivedDate')::date;
  end if;

  v_reference_number := coalesce(
    nullif(btrim(p_payload ->> 'referenceNumber'), ''),
    'RCV-' || upper(substring(regexp_replace(v_key, '[^A-Za-z0-9]', '', 'g') from 1 for 16))
  );

  v_request_payload := jsonb_build_object(
    'productId', v_product_id,
    'quantity', v_quantity,
    'supplierId', v_supplier_id,
    'supplierName', v_supplier_name,
    'supplierContact', v_supplier_phone,
    'supplierAddress', v_supplier_address,
    'referenceNumber', nullif(btrim(p_payload ->> 'referenceNumber'), ''),
    'receivedDate', v_received_date,
    'reason', v_reason,
    'performedBy', p_performed_by
  );

  insert into catalog.stock_receipt_idempotency (
    operation,
    idempotency_key,
    request_payload,
    performed_by
  )
  values (
    'catalog_stock_receive',
    v_key,
    v_request_payload,
    p_performed_by
  )
  on conflict (operation, idempotency_key) do nothing
  returning id into v_request_id;

  if not found then
    select request_payload, completed_response
    into v_stored_payload, v_response
    from catalog.stock_receipt_idempotency
    where operation = 'catalog_stock_receive'
      and idempotency_key = v_key
    for update;

    if v_stored_payload is distinct from v_request_payload then
      raise exception using
        errcode = '22023',
        message = 'IDEMPOTENCY_KEY_REUSED: the key was already used with a different stock receipt payload';
    end if;

    if v_response is null then
      raise exception using
        errcode = '55000',
        message = 'IDEMPOTENCY_REQUEST_INCOMPLETE: receipt replay record has no completed response';
    end if;

    return v_response || jsonb_build_object('idempotentReplay', true);
  end if;

  -- Resolve the canonical SKU before taking any row lock, then enter the same
  -- product advisory-lock namespace used by invoice receiving. The second
  -- lookup locks and revalidates the row after the logical lock is held.
  select product.sku
  into v_product_sku
  from catalog.products as product
  where product.id = v_product_id
    and product.is_active = true;

  if not found then
    raise exception using errcode = 'P0002', message = 'Product was not found in the active catalog.';
  end if;

  v_product_lock_key := private.catalog_stock_receipt_product_lock_key(v_product_sku);
  if v_product_lock_key is null then
    raise exception using errcode = '55000', message = 'Product stock lock key could not be derived.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(v_product_lock_key);

  select product.id, product.sku, product.name
  into v_product
  from catalog.products as product
  where product.id = v_product_id
    and product.sku = v_product_sku
    and product.is_active = true
  for update of product;

  if not found then
    raise exception using errcode = '40001', message = 'Product changed while the stock receipt was starting; retry with the same idempotency key.';
  end if;

  if v_supplier_id is not null then
    select supplier.id, coalesce(v_supplier_name, supplier.name)
    into v_supplier_id, v_supplier_name
    from catalog.suppliers as supplier
    where supplier.id = v_supplier_id
    for update of supplier;

    if not found then
      raise exception using errcode = 'P0002', message = 'Supplier was not found.';
    end if;
  else
    if v_supplier_name is null then
      raise exception using errcode = '22023', message = 'Supplier name is required.';
    end if;

    v_supplier_code := 'SUP-' || coalesce(
      nullif(trim(both '-' from regexp_replace(upper(v_supplier_name), '[^A-Z0-9]+', '-', 'g')), ''),
      'SUPPLIER'
    );

    insert into catalog.suppliers (
      supplier_code,
      name,
      phone,
      address,
      updated_at
    )
    values (
      v_supplier_code,
      v_supplier_name,
      v_supplier_phone,
      v_supplier_address,
      v_now
    )
    on conflict (supplier_code) do update set
      name = excluded.name,
      phone = coalesce(excluded.phone, catalog.suppliers.phone),
      address = coalesce(excluded.address, catalog.suppliers.address),
      updated_at = excluded.updated_at
    returning id into v_supplier_id;
  end if;

  insert into catalog.inventory_balances (
    product_id,
    on_hand,
    reserved,
    reorder_point,
    reorder_quantity,
    location,
    as_of_date,
    business_date,
    updated_at
  )
  values (
    v_product_id,
    0,
    0,
    0,
    0,
    '{}'::jsonb,
    coalesce(v_received_date, current_date),
    coalesce(v_received_date, current_date),
    v_now
  )
  on conflict (product_id) do nothing;

  select on_hand
  into v_previous_stock
  from catalog.inventory_balances
  where product_id = v_product_id
  for update;

  if not found then
    raise exception using errcode = '55000', message = 'Inventory balance could not be initialized.';
  end if;

  update catalog.inventory_balances
  set
    on_hand = on_hand + v_quantity,
    as_of_date = coalesce(v_received_date, current_date),
    business_date = coalesce(v_received_date, current_date),
    updated_at = v_now
  where product_id = v_product_id
  returning on_hand into v_updated_stock;

  insert into catalog.product_supplier_links (product_id, supplier_id)
  values (v_product_id, v_supplier_id)
  on conflict (product_id) do update set supplier_id = excluded.supplier_id;

  insert into catalog.inventory_movements (
    product_id,
    movement_type,
    quantity,
    reference_type,
    reference_id,
    notes,
    performed_by,
    business_date
  )
  values (
    v_product_id,
    'stock_in',
    v_quantity,
    'supplier_receipt',
    v_request_id,
    concat_ws(
      ' | ',
      'Supplier: ' || v_supplier_name,
      'Reference: ' || v_reference_number,
      case when v_reason is not null then 'Reason: ' || v_reason end
    ),
    p_performed_by,
    coalesce(v_received_date, current_date)
  )
  returning id, created_at into v_movement;

  insert into catalog.stock_receiving_logs (
    product_id,
    supplier_id,
    movement_id,
    quantity_added,
    previous_stock,
    updated_stock,
    reference_number,
    received_date,
    notes,
    performed_by
  )
  values (
    v_product_id,
    v_supplier_id,
    v_movement.id,
    v_quantity,
    v_previous_stock,
    v_updated_stock,
    v_reference_number,
    coalesce(v_received_date, current_date),
    v_reason,
    p_performed_by
  );

  v_response := jsonb_build_object(
    'product', jsonb_build_object(
      'id', v_product.id,
      'sku', v_product.sku,
      'name', v_product.name
    ),
    'movement', jsonb_build_object(
      'id', v_movement.id,
      'createdAt', v_movement.created_at
    ),
    'previousStock', v_previous_stock,
    'quantityAdded', v_quantity,
    'updatedStock', v_updated_stock,
    'supplierName', v_supplier_name,
    'referenceNumber', v_reference_number,
    'idempotentReplay', false
  );

  update catalog.stock_receipt_idempotency
  set
    completed_response = v_response,
    completed_at = v_now,
    updated_at = v_now
  where id = v_request_id;

  return v_response;
end;
$$;

revoke all on function public.receive_catalog_stock(jsonb, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.receive_catalog_stock(jsonb, uuid, text) to service_role;

create or replace function public.receive_supplier_invoice_stock_idempotent(
  p_invoice jsonb,
  p_performed_by uuid,
  p_idempotency_key text,
  p_allow_new_products boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_request_payload jsonb;
  v_stored_payload jsonb;
  v_request_id uuid;
  v_response jsonb;
  v_now timestamptz := now();
  v_business_date date := current_date;
  v_part_numbers text[] := array[]::text[];
  v_product_lock_keys bigint[] := array[]::bigint[];
  v_product_lock_key bigint;
  v_supplier_id uuid;
  v_supplier_name text;
  v_supplier_code text;
begin
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then
    raise exception using errcode = '22023', message = 'Invoice payload must be a JSON object.';
  end if;

  if jsonb_typeof(p_invoice -> 'items') <> 'array'
    or jsonb_array_length(p_invoice -> 'items') = 0 then
    raise exception using errcode = '22023', message = 'At least one invoice line item is required.';
  end if;

  if char_length(v_key) not between 8 and 200
    or v_key !~ '^[A-Za-z0-9._:-]+$'
    or v_key !~ '[A-Za-z0-9]' then
    raise exception using errcode = '22023', message = 'Idempotency key must be 8-200 URL-safe characters.';
  end if;

  v_request_payload := jsonb_build_object(
    'invoice', p_invoice,
    'allowNewProducts', coalesce(p_allow_new_products, true),
    'performedBy', p_performed_by
  );

  insert into catalog.stock_receipt_idempotency (
    operation,
    idempotency_key,
    request_payload,
    performed_by
  )
  values (
    'supplier_invoice_stock_receive',
    v_key,
    v_request_payload,
    p_performed_by
  )
  on conflict (operation, idempotency_key) do nothing
  returning id into v_request_id;

  if not found then
    select request_payload, completed_response
    into v_stored_payload, v_response
    from catalog.stock_receipt_idempotency
    where operation = 'supplier_invoice_stock_receive'
      and idempotency_key = v_key
    for update;

    if v_stored_payload is distinct from v_request_payload then
      raise exception using
        errcode = '22023',
        message = 'IDEMPOTENCY_KEY_REUSED: the key was already used with a different supplier invoice payload';
    end if;

    if v_response is null then
      raise exception using
        errcode = '55000',
        message = 'IDEMPOTENCY_REQUEST_INCOMPLETE: invoice replay record has no completed response';
    end if;

    return v_response || jsonb_build_object('idempotentReplay', true);
  end if;

  select coalesce(
    array_agg(distinct normalized.part_number order by normalized.part_number),
    array[]::text[]
  )
  into v_part_numbers
  from (
    select catalog.normalize_supplier_invoice_part_number(item.value ->> 'partNumber') as part_number
    from jsonb_array_elements(p_invoice -> 'items') as item(value)
  ) normalized
  where normalized.part_number is not null
    and normalized.part_number <> '';

  v_supplier_name := nullif(btrim(p_invoice ->> 'supplierName'), '');
  if v_supplier_name is null then
    raise exception using errcode = '22023', message = 'Supplier name is required.';
  end if;

  v_supplier_id := nullif(p_invoice ->> 'supplierId', '')::uuid;

  select coalesce(array_agg(keys.lock_key order by keys.lock_key), array[]::bigint[])
  into v_product_lock_keys
  from (
    select distinct private.catalog_stock_receipt_product_lock_key(parts.part_number) as lock_key
    from unnest(v_part_numbers) as parts(part_number)
  ) as keys
  where keys.lock_key is not null;

  -- Acquire every logical product lock before taking any row lock. Both Phase
  -- 1 receipt paths use this helper/namespace, so a manual receipt and an
  -- invoice for the same SKU serialize before either can form a product ->
  -- supplier -> balance cycle. Sorting the actual bigint lock keys also keeps
  -- the order deterministic in the unlikely event of a hash collision.
  foreach v_product_lock_key in array v_product_lock_keys
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_product_lock_key);
  end loop;

  -- Lock existing products in one global order before resolving the supplier.
  -- The advisory lock is the product lock for not-yet-created invoice items;
  -- the legacy receiver creates those rows later in this same transaction.
  perform product.id
  from catalog.products as product
  where product.sku = any (v_part_numbers)
  order by product.id
  for update of product;

  -- Product -> supplier -> balance is the shared row-lock order. The legacy
  -- receiver repeats this supplier upsert inside the same transaction.
  if v_supplier_id is null then
    v_supplier_code := coalesce(
      nullif(btrim(p_invoice ->> 'supplierCode'), ''),
      'SUP-' || catalog.supplier_invoice_code(v_supplier_name)
    );

    insert into catalog.suppliers (
      supplier_code,
      name,
      contact_name,
      phone,
      email,
      address,
      updated_at
    )
    values (
      v_supplier_code,
      v_supplier_name,
      nullif(btrim(p_invoice ->> 'supplierContactName'), ''),
      nullif(btrim(p_invoice ->> 'supplierPhone'), ''),
      nullif(btrim(p_invoice ->> 'supplierEmail'), ''),
      nullif(btrim(p_invoice ->> 'supplierAddress'), ''),
      v_now
    )
    on conflict (supplier_code) do update set
      name = excluded.name,
      contact_name = coalesce(excluded.contact_name, catalog.suppliers.contact_name),
      phone = coalesce(excluded.phone, catalog.suppliers.phone),
      email = coalesce(excluded.email, catalog.suppliers.email),
      address = coalesce(excluded.address, catalog.suppliers.address),
      updated_at = excluded.updated_at
    returning id into v_supplier_id;
  else
    perform supplier.id
    from catalog.suppliers as supplier
    where supplier.id = v_supplier_id
    for update of supplier;

    if not found then
      raise exception using errcode = 'P0002', message = 'Supplier was not found.';
    end if;
  end if;

  -- Missing balance rows are created transactionally in product order and then
  -- locked in that same order. Any later validation/error rolls these inserts
  -- and all receipt-side effects back together.
  insert into catalog.inventory_balances (
    product_id,
    on_hand,
    reserved,
    reorder_point,
    reorder_quantity,
    location,
    as_of_date,
    business_date
  )
  select
    product.id,
    0,
    0,
    0,
    0,
    '{}'::jsonb,
    v_business_date,
    v_business_date
  from catalog.products as product
  where product.sku = any (v_part_numbers)
  order by product.id
  on conflict (product_id) do nothing;

  perform balance.product_id
  from catalog.inventory_balances as balance
  join catalog.products as product on product.id = balance.product_id
  where product.sku = any (v_part_numbers)
  order by balance.product_id
  for update of balance;

  if coalesce(p_allow_new_products, true) then
    v_response := catalog.receive_supplier_invoice_stock(p_invoice, p_performed_by);
  else
    v_response := catalog.receive_existing_supplier_invoice_stock(p_invoice, p_performed_by);
  end if;

  if v_response is null or jsonb_typeof(v_response) <> 'object' then
    raise exception using
      errcode = '55000',
      message = 'Supplier invoice receiver returned an invalid response.';
  end if;

  v_response := v_response || jsonb_build_object('idempotentReplay', false);

  update catalog.stock_receipt_idempotency
  set
    completed_response = v_response,
    completed_at = v_now,
    updated_at = v_now
  where id = v_request_id;

  return v_response;
end;
$$;

revoke all on function public.receive_supplier_invoice_stock_idempotent(jsonb, uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.receive_supplier_invoice_stock_idempotent(jsonb, uuid, text, boolean)
  to service_role;

comment on function public.lookup_public_estimate(text, text) is
  'Service-role-only verified estimate lookup with normalized phone matching and an allowlisted response.';
comment on function public.receive_catalog_stock(jsonb, uuid, text) is
  'Service-role-only atomic manual stock receipt with durable idempotent replay and shared product-first lock ordering.';
comment on function public.receive_supplier_invoice_stock_idempotent(jsonb, uuid, text, boolean) is
  'Service-role-only idempotent wrapper for atomic supplier invoice receiving with shared advisory, product, supplier, and balance lock ordering.';
