-- Transactional Phase 1 regression flows. All fixtures are rolled back.
-- Run only after applying 20260806184500_phase1_secure_lookup_and_stock_receiving.sql
-- to an isolated local/test database.

begin;

do $$
declare
  v_estimate_schema text;
  v_product_schema text;
  v_customer_id uuid := gen_random_uuid();
  v_vehicle_id uuid := gen_random_uuid();
  v_estimate_id uuid := gen_random_uuid();
  v_estimate_product_id uuid := gen_random_uuid();
  v_service_id uuid := gen_random_uuid();
  v_quote_number text := 'EST-PHASE1-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12));
  v_result jsonb;
  v_item jsonb;
begin
  if to_regclass('operations.estimates') is not null then
    v_estimate_schema := 'operations';
    v_product_schema := 'catalog';
  elsif to_regclass('app.estimates') is not null then
    v_estimate_schema := 'app';
    v_product_schema := 'app';
  else
    raise exception 'No complete estimate schema is available for the Phase 1 flow test.';
  end if;

  execute format(
    'insert into %I.customers (id, customer_type, name, phone, email, metadata, business_date)
     values ($1, ''walk_in'', $2, $3, $4, ''{}''::jsonb, current_date)',
    v_estimate_schema
  ) using v_customer_id, 'Phase 1 Verified Customer', '+63 (917) 123-4567', 'must-not-leak@example.test';

  execute format(
    'insert into %I.vehicles (id, customer_id, plate_no, make, model_name, year, engine, mileage, metadata, business_date)
     values ($1, $2, $3, ''Mitsubishi'', ''Montero Sport'', 2024, ''SECRET-ENGINE'', 45678, ''{"secret":true}''::jsonb, current_date)',
    v_estimate_schema
  ) using v_vehicle_id, v_customer_id, 'SECRET-PLATE';

  execute format(
    'insert into %I.products (id, sku, name, brand, uom, status, is_active, metadata, business_date)
     values ($1, $2, ''Public Quote Test Product'', ''Mitsubishi'', ''PC'', ''in_stock'', true, ''{}''::jsonb, current_date)',
    v_product_schema
  ) using v_estimate_product_id, 'QUOTE-' || substring(v_estimate_product_id::text from 1 for 8);

  execute format(
    'insert into %I.services (id, code, name, description, standard_price, estimated_duration_minutes, is_active, business_date)
     values ($1, $2, ''Public Quote Test Service'', ''Internal description must not leak'', 500, 30, true, current_date)',
    v_estimate_schema
  ) using v_service_id, 'SVC-' || substring(v_service_id::text from 1 for 8);

  execute format(
    'insert into %I.estimates (
       id, estimate_number, customer_id, vehicle_id, status, source, note,
       subtotal, discount_total, tax_total, grand_total, issued_at,
       valid_until, business_date
     ) values (
       $1, $2, $3, $4, ''sent'', ''public'', ''INTERNAL NOTE MUST NOT LEAK'',
       1000, 100, 108, 1008, now(), current_date + 7, current_date
     )',
    v_estimate_schema
  ) using v_estimate_id, v_quote_number, v_customer_id, v_vehicle_id;

  execute format(
    'insert into %I.estimate_items (
       id, estimate_id, line_type, product_id, service_id, quantity,
       unit_price, line_total, recommendation_rule_id, is_upsell, business_date
     ) values (
       gen_random_uuid(), $1, ''product'', $2, null, 2, 500, 1000, null, false, current_date
     )',
    v_estimate_schema
  ) using v_estimate_id, v_estimate_product_id;

  -- +63 storage and leading-zero lookup must normalize to the same number.
  v_result := public.lookup_public_estimate(lower(v_quote_number), '0917 123 4567');

  if v_result is null then
    raise exception 'Normalized verified estimate lookup returned no result.';
  end if;

  if v_result #>> '{estimate,estimate_number}' <> v_quote_number
    or v_result #>> '{estimate,source}' <> 'public'
    or v_result #>> '{customer,name}' <> 'Phase 1 Verified Customer' then
    raise exception 'Verified estimate lookup returned the wrong approved values: %', v_result;
  end if;

  if (select count(*) from jsonb_object_keys(v_result)) <> 4
    or exists (
      select 1
      from jsonb_object_keys(v_result) as allowed_key(key)
      where allowed_key.key <> all (array['estimate', 'customer', 'vehicle', 'items'])
    ) then
    raise exception 'Verified estimate response has unexpected top-level fields: %', v_result;
  end if;

  if (select count(*) from jsonb_object_keys(v_result -> 'estimate')) <> 9
    or exists (
      select 1
      from jsonb_object_keys(v_result -> 'estimate') as allowed_key(key)
      where allowed_key.key <> all (array[
        'estimate_number', 'status', 'source', 'subtotal', 'discount_total',
        'tax_total', 'grand_total', 'issued_at', 'valid_until'
      ])
    ) then
    raise exception 'Estimate response fields are not allowlisted: %', v_result -> 'estimate';
  end if;

  if (select count(*) from jsonb_object_keys(v_result -> 'customer')) <> 1
    or not (v_result -> 'customer' ? 'name')
    or (v_result -> 'customer') ?| array['phone', 'email', 'metadata', 'id', 'user_id'] then
    raise exception 'Customer response leaked a private field: %', v_result -> 'customer';
  end if;

  if (select count(*) from jsonb_object_keys(v_result -> 'vehicle')) <> 3
    or (v_result -> 'vehicle') ?| array['plate_no', 'engine', 'mileage', 'metadata', 'id', 'customer_id'] then
    raise exception 'Vehicle response leaked a private field: %', v_result -> 'vehicle';
  end if;

  for v_item in select value from jsonb_array_elements(v_result -> 'items')
  loop
    if (select count(*) from jsonb_object_keys(v_item)) <> 8
      or exists (
        select 1
        from jsonb_object_keys(v_item) as allowed_key(key)
        where allowed_key.key <> all (array[
          'line_type', 'quantity', 'unit_price', 'line_total',
          'product_name', 'product_sku', 'service_name', 'service_code'
        ])
      ) then
      raise exception 'Estimate item response fields are not allowlisted: %', v_item;
    end if;
  end loop;

  if public.lookup_public_estimate(v_quote_number, null) is not null
    or public.lookup_public_estimate(v_quote_number, '09170000000') is not null then
    raise exception 'Quote-number-only or wrong-phone lookup unexpectedly succeeded.';
  end if;

  -- Internal estimates must never be returned by the public lookup, even with
  -- a matching quote number and phone.
  execute format('update %I.estimates set source = ''internal'' where id = $1', v_estimate_schema)
    using v_estimate_id;

  if public.lookup_public_estimate(v_quote_number, '09171234567') is not null then
    raise exception 'Internal estimate was exposed by the public lookup.';
  end if;

  execute format('update %I.estimates set source = ''public'' where id = $1', v_estimate_schema)
    using v_estimate_id;

  -- An inactive quote must not be returned.
  execute format('update %I.estimates set status = ''rejected'' where id = $1', v_estimate_schema)
    using v_estimate_id;

  if public.lookup_public_estimate(v_quote_number, '09171234567') is not null then
    raise exception 'Rejected estimate was exposed by the public lookup.';
  end if;

end;
$$;

do $$
declare
  v_product_id uuid := gen_random_uuid();
  v_failure_product_id uuid := gen_random_uuid();
  v_missing_user_id uuid := gen_random_uuid();
  v_key text := 'manual-' || replace(gen_random_uuid()::text, '-', '');
  v_failure_key text := 'manual-fail-' || replace(gen_random_uuid()::text, '-', '');
  v_supplier_name text := 'Phase 1 Supplier ' || substring(gen_random_uuid()::text from 1 for 8);
  v_failure_supplier_name text := 'Phase 1 Rollback Supplier ' || substring(gen_random_uuid()::text from 1 for 8);
  v_response jsonb;
  v_replay jsonb;
  v_balance numeric;
  v_count integer;
  v_conflict_seen boolean := false;
  v_failure_seen boolean := false;
begin
  insert into catalog.products (
    id, sku, name, brand, uom, status, is_active, metadata, business_date
  ) values (
    v_product_id,
    'RCV-' || substring(v_product_id::text from 1 for 8),
    'Phase 1 Receipt Product',
    'Mitsubishi',
    'PC',
    'in_stock',
    true,
    '{}'::jsonb,
    current_date
  );

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date
  ) values (
    v_product_id, 5, 0, 0, 0, '{}'::jsonb, current_date, current_date
  );

  v_response := public.receive_catalog_stock(
    jsonb_build_object(
      'productId', v_product_id,
      'quantity', 3,
      'supplierName', v_supplier_name,
      'referenceNumber', 'TEST-RCV-' || substring(v_key from 1 for 12),
      'receivedDate', current_date,
      'reason', 'Phase 1 regression'
    ),
    null,
    v_key
  );

  v_replay := public.receive_catalog_stock(
    jsonb_build_object(
      'productId', v_product_id,
      'quantity', 3,
      'supplierName', v_supplier_name,
      'referenceNumber', 'TEST-RCV-' || substring(v_key from 1 for 12),
      'receivedDate', current_date,
      'reason', 'Phase 1 regression'
    ),
    null,
    v_key
  );

  if coalesce((v_response ->> 'idempotentReplay')::boolean, true)
    or not coalesce((v_replay ->> 'idempotentReplay')::boolean, false)
    or v_response #>> '{movement,id}' <> v_replay #>> '{movement,id}' then
    raise exception 'Manual receipt replay did not return the original result.';
  end if;

  select on_hand into v_balance
  from catalog.inventory_balances
  where product_id = v_product_id;

  if v_balance <> 8 then
    raise exception 'Manual receipt was applied more or less than once; balance is %.', v_balance;
  end if;

  select count(*) into v_count
  from catalog.inventory_movements
  where id = (v_response #>> '{movement,id}')::uuid;

  if v_count <> 1 then
    raise exception 'Manual receipt did not create exactly one movement.';
  end if;

  select count(*) into v_count
  from catalog.stock_receiving_logs
  where movement_id = (v_response #>> '{movement,id}')::uuid;

  if v_count <> 1 then
    raise exception 'Manual receipt did not create exactly one receiving audit row.';
  end if;

  select count(*) into v_count
  from catalog.product_supplier_links
  where product_id = v_product_id;

  if v_count <> 1 then
    raise exception 'Manual receipt did not create exactly one supplier link.';
  end if;

  begin
    perform public.receive_catalog_stock(
      jsonb_build_object(
        'productId', v_product_id,
        'quantity', 4,
        'supplierName', v_supplier_name,
        'referenceNumber', 'TEST-RCV-' || substring(v_key from 1 for 12),
        'receivedDate', current_date,
        'reason', 'Changed payload'
      ),
      null,
      v_key
    );
  exception
    when sqlstate '22023' then
      if position('IDEMPOTENCY_KEY_REUSED' in sqlerrm) = 0 then
        raise;
      end if;
      v_conflict_seen := true;
  end;

  if not v_conflict_seen then
    raise exception 'Manual receipt key reuse with changed payload did not conflict.';
  end if;

  insert into catalog.products (
    id, sku, name, brand, uom, status, is_active, metadata, business_date
  ) values (
    v_failure_product_id,
    'FAIL-' || substring(v_failure_product_id::text from 1 for 8),
    'Phase 1 Rollback Product',
    'Mitsubishi',
    'PC',
    'in_stock',
    true,
    '{}'::jsonb,
    current_date
  );

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date
  ) values (
    v_failure_product_id, 5, 0, 0, 0, '{}'::jsonb, current_date, current_date
  );

  -- performed_by is checked by the movement FK after balance and supplier-link
  -- writes. Catching that late failure verifies the whole function rolled back.
  begin
    perform public.receive_catalog_stock(
      jsonb_build_object(
        'productId', v_failure_product_id,
        'quantity', 7,
        'supplierName', v_failure_supplier_name,
        'referenceNumber', 'TEST-ROLLBACK',
        'receivedDate', current_date,
        'reason', 'Expected late FK failure'
      ),
      v_missing_user_id,
      v_failure_key
    );
  exception
    when foreign_key_violation then
      v_failure_seen := true;
  end;

  if not v_failure_seen then
    raise exception 'Late stock receipt failure was not triggered as expected.';
  end if;

  select on_hand into v_balance
  from catalog.inventory_balances
  where product_id = v_failure_product_id;

  if v_balance <> 5 then
    raise exception 'Failed receipt did not roll its balance update back; balance is %.', v_balance;
  end if;

  select count(*) into v_count
  from catalog.product_supplier_links
  where product_id = v_failure_product_id;

  if v_count <> 0 then
    raise exception 'Failed receipt left a supplier link behind.';
  end if;

  select count(*) into v_count
  from catalog.stock_receipt_idempotency
  where operation = 'catalog_stock_receive'
    and idempotency_key = v_failure_key;

  if v_count <> 0 then
    raise exception 'Failed receipt left an idempotency row behind.';
  end if;
end;
$$;

do $$
declare
  v_product_id uuid := gen_random_uuid();
  v_key text := 'invoice-' || replace(gen_random_uuid()::text, '-', '');
  v_failure_key text := 'invoice-fail-' || replace(gen_random_uuid()::text, '-', '');
  v_invoice_number text := 'INV-PHASE1-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);
  v_failure_invoice_number text := 'INV-ROLLBACK-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);
  v_supplier_name text := 'Phase 1 Invoice Supplier ' || substring(gen_random_uuid()::text from 1 for 8);
  v_invoice jsonb;
  v_response jsonb;
  v_replay jsonb;
  v_balance numeric;
  v_count integer;
  v_conflict_seen boolean := false;
  v_failure_seen boolean := false;
  v_failure_message text;
begin
  insert into catalog.products (
    id, sku, name, brand, uom, status, is_active, metadata, business_date
  ) values (
    v_product_id,
    'INV-' || substring(v_product_id::text from 1 for 8),
    'Phase 1 Invoice Product',
    'Mitsubishi',
    'PC',
    'in_stock',
    true,
    '{}'::jsonb,
    current_date
  );

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date
  ) values (
    v_product_id, 10, 0, 0, 0, '{}'::jsonb, current_date, current_date
  );

  v_invoice := jsonb_build_object(
    'invoiceNumber', v_invoice_number,
    'invoiceDate', current_date,
    'supplierName', v_supplier_name,
    'source', 'phase1_regression',
    'items', jsonb_build_array(jsonb_build_object(
      'partNumber', 'INV-' || substring(v_product_id::text from 1 for 8),
      'description', 'Phase 1 Invoice Product',
      'quantity', 2,
      'unitCost', 100,
      'uom', 'PC'
    ))
  );

  v_response := public.receive_supplier_invoice_stock_idempotent(v_invoice, null, v_key, false);
  v_replay := public.receive_supplier_invoice_stock_idempotent(v_invoice, null, v_key, false);

  if coalesce((v_response ->> 'idempotentReplay')::boolean, true)
    or not coalesce((v_replay ->> 'idempotentReplay')::boolean, false)
    or v_response ->> 'receiptId' <> v_replay ->> 'receiptId' then
    raise exception 'Invoice receipt replay did not return the original receipt.';
  end if;

  select on_hand into v_balance
  from catalog.inventory_balances
  where product_id = v_product_id;

  if v_balance <> 12 then
    raise exception 'Invoice receipt was applied more or less than once; balance is %.', v_balance;
  end if;

  begin
    perform public.receive_supplier_invoice_stock_idempotent(
      jsonb_set(v_invoice, '{items,0,quantity}', '3'::jsonb),
      null,
      v_key,
      false
    );
  exception
    when sqlstate '22023' then
      if position('IDEMPOTENCY_KEY_REUSED' in sqlerrm) = 0 then
        raise;
      end if;
      v_conflict_seen := true;
  end;

  if not v_conflict_seen then
    raise exception 'Invoice key reuse with changed payload did not conflict.';
  end if;

  -- The existing invoice receiver processes lines in source order. Its second
  -- invalid line fails after the first line has updated inventory, proving the
  -- wrapper, replay claim, receipt, movement, and balance share one transaction.
  begin
    perform public.receive_supplier_invoice_stock_idempotent(
      jsonb_build_object(
        'invoiceNumber', v_failure_invoice_number,
        'invoiceDate', current_date,
        'supplierName', v_supplier_name || ' Rollback',
        'source', 'phase1_regression',
        'items', jsonb_build_array(
          jsonb_build_object(
            'partNumber', 'INV-' || substring(v_product_id::text from 1 for 8),
            'description', 'Valid line that must roll back',
            'quantity', 5,
            'unitCost', 100,
            'uom', 'PC'
          ),
          jsonb_build_object(
            'partNumber', 'BAD-' || substring(gen_random_uuid()::text from 1 for 8),
            'description', 'Invalid second line',
            'quantity', -1,
            'unitCost', 10,
            'uom', 'PC'
          )
        )
      ),
      null,
      v_failure_key,
      true
    );
  exception
    when others then
      v_failure_seen := true;
      v_failure_message := sqlerrm;
  end;

  if not v_failure_seen or position('Quantity must be greater than zero' in coalesce(v_failure_message, '')) = 0 then
    raise exception 'Partially failing invoice did not reach the expected second-line validation: %', v_failure_message;
  end if;

  select on_hand into v_balance
  from catalog.inventory_balances
  where product_id = v_product_id;

  if v_balance <> 12 then
    raise exception 'Partially failing invoice did not roll its balance update back; balance is %.', v_balance;
  end if;

  select count(*) into v_count
  from catalog.stock_receipt_idempotency
  where operation = 'supplier_invoice_stock_receive'
    and idempotency_key = v_failure_key;

  if v_count <> 0 then
    raise exception 'Partially failing invoice left an idempotency row behind.';
  end if;

  select count(*) into v_count
  from catalog.stock_receipts
  where invoice_number = v_failure_invoice_number;

  if v_count <> 0 then
    raise exception 'Partially failing invoice left a receipt row behind.';
  end if;
end;
$$;

-- A single SQL session cannot prove lock contention, but this flow exercises
-- both invoice line orders and the wrapper's absent-balance initialization.
-- The local integration harness runs the same shapes concurrently.
do $$
declare
  v_product_a uuid := gen_random_uuid();
  v_product_b uuid := gen_random_uuid();
  v_sku_a text;
  v_sku_b text;
  v_supplier_ab_name text := 'Phase 1 Inverse AB Supplier ' || substring(gen_random_uuid()::text from 1 for 8);
  v_supplier_ba_name text := 'Phase 1 Inverse BA Supplier ' || substring(gen_random_uuid()::text from 1 for 8);
  v_invoice_ab_number text := 'INV-AB-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);
  v_invoice_ba_number text := 'INV-BA-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);
  v_invoice_ab jsonb;
  v_invoice_ba jsonb;
  v_response_ab jsonb;
  v_response_ba jsonb;
  v_balance_a numeric;
  v_balance_b numeric;
  v_count integer;
begin
  v_sku_a := 'LOCK-A-' || substring(v_product_a::text from 1 for 8);
  v_sku_b := 'LOCK-B-' || substring(v_product_b::text from 1 for 8);

  insert into catalog.products (
    id, sku, name, brand, uom, status, is_active, metadata, business_date
  ) values
    (v_product_a, v_sku_a, 'Phase 1 Lock Product A', 'Mitsubishi', 'PC', 'in_stock', true, '{}'::jsonb, current_date),
    (v_product_b, v_sku_b, 'Phase 1 Lock Product B', 'Mitsubishi', 'PC', 'in_stock', true, '{}'::jsonb, current_date);

  -- Product B intentionally has no balance row. The wrapper must create it
  -- before taking the ordered balance locks, inside the receipt transaction.
  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date
  ) values (
    v_product_a, 10, 0, 0, 0, '{}'::jsonb, current_date, current_date
  );

  v_invoice_ab := jsonb_build_object(
    'invoiceNumber', v_invoice_ab_number,
    'invoiceDate', current_date,
    'supplierName', v_supplier_ab_name,
    'source', 'phase1_lock_order_regression',
    'items', jsonb_build_array(
      jsonb_build_object('partNumber', v_sku_a, 'description', 'Product A', 'quantity', 2, 'unitCost', 0, 'uom', 'PC'),
      jsonb_build_object('partNumber', v_sku_b, 'description', 'Product B', 'quantity', 3, 'unitCost', 0, 'uom', 'PC')
    )
  );

  v_invoice_ba := jsonb_build_object(
    'invoiceNumber', v_invoice_ba_number,
    'invoiceDate', current_date,
    'supplierName', v_supplier_ba_name,
    'source', 'phase1_lock_order_regression',
    'items', jsonb_build_array(
      jsonb_build_object('partNumber', v_sku_b, 'description', 'Product B', 'quantity', 5, 'unitCost', 0, 'uom', 'PC'),
      jsonb_build_object('partNumber', v_sku_a, 'description', 'Product A', 'quantity', 7, 'unitCost', 0, 'uom', 'PC')
    )
  );

  v_response_ab := public.receive_supplier_invoice_stock_idempotent(
    v_invoice_ab,
    null,
    'invoice-lock-ab-' || replace(gen_random_uuid()::text, '-', ''),
    false
  );
  v_response_ba := public.receive_supplier_invoice_stock_idempotent(
    v_invoice_ba,
    null,
    'invoice-lock-ba-' || replace(gen_random_uuid()::text, '-', ''),
    false
  );

  if (v_response_ab ->> 'totalLines')::integer <> 2
    or (v_response_ba ->> 'totalLines')::integer <> 2 then
    raise exception 'Inverse-order invoice responses did not contain both product lines.';
  end if;

  select on_hand into v_balance_a
  from catalog.inventory_balances
  where product_id = v_product_a;

  select on_hand into v_balance_b
  from catalog.inventory_balances
  where product_id = v_product_b;

  if v_balance_a <> 19 or v_balance_b <> 8 then
    raise exception 'Inverse-order invoice balances are incorrect: A=%, B=%.', v_balance_a, v_balance_b;
  end if;

  select count(*) into v_count
  from catalog.inventory_movements
  where product_id in (v_product_a, v_product_b)
    and reference_type = 'supplier_invoice';

  if v_count <> 4 then
    raise exception 'Inverse-order invoices created % movements instead of 4.', v_count;
  end if;

  select count(*) into v_count
  from catalog.stock_receipt_items
  where product_id in (v_product_a, v_product_b);

  if v_count <> 4 then
    raise exception 'Inverse-order invoices created % receipt items instead of 4.', v_count;
  end if;
end;
$$;

-- Single-session functional coverage for the common manual/invoice path. The
-- separate Node harness runs these calls concurrently; this block verifies the
-- resulting ledger, audit, and balance semantics without requiring dblink.
do $$
declare
  v_product_id uuid := gen_random_uuid();
  v_sku text;
  v_manual_supplier_name text := 'Phase 1 Cross Manual Supplier ' || substring(gen_random_uuid()::text from 1 for 8);
  v_invoice_supplier_name text := 'Phase 1 Cross Invoice Supplier ' || substring(gen_random_uuid()::text from 1 for 8);
  v_invoice_number text := 'INV-CROSS-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10);
  v_manual_response jsonb;
  v_invoice_response jsonb;
  v_balance numeric;
  v_count integer;
begin
  v_sku := 'LOCK-CROSS-' || substring(v_product_id::text from 1 for 8);

  insert into catalog.products (
    id, sku, name, brand, uom, status, is_active, metadata, business_date
  ) values (
    v_product_id, v_sku, 'Phase 1 Cross Path Product', 'Mitsubishi', 'PC',
    'in_stock', true, '{}'::jsonb, current_date
  );

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date
  ) values (
    v_product_id, 10, 0, 0, 0, '{}'::jsonb, current_date, current_date
  );

  v_manual_response := public.receive_catalog_stock(
    jsonb_build_object(
      'productId', v_product_id,
      'quantity', 4,
      'supplierName', v_manual_supplier_name,
      'referenceNumber', 'CROSS-MANUAL-' || substring(v_product_id::text from 1 for 8),
      'receivedDate', current_date,
      'reason', 'Phase 1 common lock-order SQL flow'
    ),
    null,
    'cross-manual-' || replace(gen_random_uuid()::text, '-', '')
  );

  v_invoice_response := public.receive_supplier_invoice_stock_idempotent(
    jsonb_build_object(
      'invoiceNumber', v_invoice_number,
      'invoiceDate', current_date,
      'supplierName', v_invoice_supplier_name,
      'source', 'phase1_cross_path_regression',
      'items', jsonb_build_array(
        jsonb_build_object(
          'partNumber', v_sku,
          'description', 'Phase 1 Cross Path Product',
          'quantity', 7,
          'unitCost', 0,
          'uom', 'PC'
        )
      )
    ),
    null,
    'cross-invoice-' || replace(gen_random_uuid()::text, '-', ''),
    false
  );

  if (v_manual_response ->> 'previousStock')::numeric <> 10
    or (v_manual_response ->> 'updatedStock')::numeric <> 14
    or (v_invoice_response ->> 'totalLines')::integer <> 1
    or (v_invoice_response -> 'items' -> 0 ->> 'previousStock')::numeric <> 14
    or (v_invoice_response -> 'items' -> 0 ->> 'updatedStock')::numeric <> 21 then
    raise exception 'Manual/invoice common-path responses did not preserve ordered balance semantics.';
  end if;

  select on_hand into v_balance
  from catalog.inventory_balances
  where product_id = v_product_id;

  if v_balance <> 21 then
    raise exception 'Manual/invoice common-path balance is %, expected 21.', v_balance;
  end if;

  select count(*) into v_count
  from catalog.inventory_movements
  where product_id = v_product_id
    and reference_type in ('supplier_receipt', 'supplier_invoice');

  if v_count <> 2 then
    raise exception 'Manual/invoice common path created % movements instead of 2.', v_count;
  end if;

  select count(*) into v_count
  from catalog.stock_receiving_logs
  where product_id = v_product_id;

  if v_count <> 2 then
    raise exception 'Manual/invoice common path created % audit rows instead of 2.', v_count;
  end if;

  select count(*) into v_count
  from catalog.stock_receipt_items
  where product_id = v_product_id;

  if v_count <> 1 then
    raise exception 'Manual/invoice common path created % invoice items instead of 1.', v_count;
  end if;

  select count(*) into v_count
  from catalog.product_supplier_links
  where product_id = v_product_id;

  if v_count <> 1 then
    raise exception 'Manual/invoice common path created % supplier links instead of 1.', v_count;
  end if;
end;
$$;

rollback;
