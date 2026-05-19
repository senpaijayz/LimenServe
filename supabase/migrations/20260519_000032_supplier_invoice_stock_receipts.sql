create table if not exists catalog.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references catalog.suppliers(id) on delete set null,
  supplier_name_snapshot text not null,
  invoice_number text not null,
  invoice_date date not null default current_date,
  po_reference text,
  status text not null default 'posted' check (status in ('draft', 'posted', 'void')),
  source text not null default 'manual_invoice',
  total_lines integer not null default 0 check (total_lines >= 0),
  total_quantity numeric(12,2) not null default 0 check (total_quantity >= 0),
  total_cost numeric(12,2) not null default 0 check (total_cost >= 0),
  metadata jsonb not null default '{}'::jsonb,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists catalog.stock_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references catalog.stock_receipts(id) on delete cascade,
  product_id uuid not null references catalog.products(id) on delete restrict,
  movement_id uuid references catalog.inventory_movements(id) on delete set null,
  line_number integer not null check (line_number >= 1),
  part_number text not null,
  description text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  line_total numeric(12,2) generated always as (round(quantity * unit_cost, 2)) stored,
  uom text not null default 'PC',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, line_number)
);

create unique index if not exists stock_receipts_supplier_invoice_idx
  on catalog.stock_receipts(supplier_id, invoice_number)
  where supplier_id is not null and invoice_number is not null;

create index if not exists stock_receipts_posted_at_idx
  on catalog.stock_receipts(posted_at desc);

create index if not exists stock_receipts_posted_by_idx
  on catalog.stock_receipts(posted_by);

create index if not exists stock_receipt_items_receipt_idx
  on catalog.stock_receipt_items(receipt_id, line_number);

create index if not exists stock_receipt_items_product_idx
  on catalog.stock_receipt_items(product_id, created_at desc);

create index if not exists stock_receipt_items_movement_idx
  on catalog.stock_receipt_items(movement_id)
  where movement_id is not null;

create index if not exists stock_receipt_items_part_number_idx
  on catalog.stock_receipt_items(part_number, created_at desc);

drop trigger if exists touch_stock_receipts_updated_at on catalog.stock_receipts;
create trigger touch_stock_receipts_updated_at
before update on catalog.stock_receipts
for each row execute function app.touch_updated_at();

drop trigger if exists touch_stock_receipt_items_updated_at on catalog.stock_receipt_items;
create trigger touch_stock_receipt_items_updated_at
before update on catalog.stock_receipt_items
for each row execute function app.touch_updated_at();

alter table catalog.stock_receipts enable row level security;
alter table catalog.stock_receipt_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'catalog'
      and tablename = 'stock_receipts'
      and policyname = 'service_role_stock_receipts_all'
  ) then
    create policy service_role_stock_receipts_all on catalog.stock_receipts
      for all to service_role using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'catalog'
      and tablename = 'stock_receipt_items'
      and policyname = 'service_role_stock_receipt_items_all'
  ) then
    create policy service_role_stock_receipt_items_all on catalog.stock_receipt_items
      for all to service_role using (true) with check (true);
  end if;
end $$;

create or replace function catalog.normalize_supplier_invoice_part_number(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(upper(btrim(coalesce(p_value, ''))), '^\*+|\*+$', '', 'g'),
          '\s+',
          '',
          'g'
        ),
        '[^A-Z0-9-]',
        '-',
        'g'
      ),
      '-+',
      '-',
      'g'
    ),
    '(^-+|-+$)',
    '',
    'g'
  );
$$;

create or replace function catalog.supplier_invoice_code(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(upper(btrim(coalesce(p_value, ''))), '[^A-Z0-9-]', '-', 'g'),
        '-+',
        '-',
        'g'
      ),
      ''
    ),
    'SUPPLIER'
  );
$$;

create or replace function catalog.receive_supplier_invoice_stock(
  p_invoice jsonb,
  p_performed_by uuid default auth.uid()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_supplier_id uuid;
  v_supplier_name text;
  v_supplier_code text;
  v_invoice_number text;
  v_invoice_date date;
  v_po_reference text;
  v_notes text;
  v_receipt_id uuid;
  v_now timestamptz := now();
  v_business_date date := current_date;
  v_item jsonb;
  v_line_number integer;
  v_part_number text;
  v_description text;
  v_quantity numeric(12,2);
  v_unit_cost numeric(12,2);
  v_uom text;
  v_product_id uuid;
  v_product_name text;
  v_previous_stock numeric(12,2);
  v_updated_stock numeric(12,2);
  v_movement_id uuid;
  v_total_lines integer := 0;
  v_total_quantity numeric(12,2) := 0;
  v_total_cost numeric(12,2) := 0;
  v_result_items jsonb := '[]'::jsonb;
begin
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object' then
    raise exception 'Invoice payload is required.';
  end if;

  if jsonb_typeof(p_invoice -> 'items') <> 'array' or jsonb_array_length(p_invoice -> 'items') = 0 then
    raise exception 'At least one invoice line item is required.';
  end if;

  v_supplier_name := nullif(btrim(p_invoice ->> 'supplierName'), '');
  v_invoice_number := nullif(btrim(p_invoice ->> 'invoiceNumber'), '');
  v_invoice_date := coalesce(nullif(p_invoice ->> 'invoiceDate', '')::date, current_date);
  v_po_reference := nullif(btrim(p_invoice ->> 'poReference'), '');
  v_notes := nullif(btrim(p_invoice ->> 'notes'), '');

  if v_supplier_name is null then
    raise exception 'Supplier name is required.';
  end if;

  if v_invoice_number is null then
    raise exception 'Invoice number is required.';
  end if;

  v_supplier_id := nullif(p_invoice ->> 'supplierId', '')::uuid;

  if v_supplier_id is null then
    v_supplier_code := coalesce(nullif(btrim(p_invoice ->> 'supplierCode'), ''), 'SUP-' || catalog.supplier_invoice_code(v_supplier_name));

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
  end if;

  insert into catalog.stock_receipts (
    supplier_id,
    supplier_name_snapshot,
    invoice_number,
    invoice_date,
    po_reference,
    source,
    metadata,
    posted_by,
    posted_at
  )
  values (
    v_supplier_id,
    v_supplier_name,
    v_invoice_number,
    v_invoice_date,
    v_po_reference,
    coalesce(nullif(btrim(p_invoice ->> 'source'), ''), 'manual_invoice'),
    jsonb_build_object('notes', v_notes, 'ocrReady', coalesce((p_invoice ->> 'ocrReady')::boolean, false)),
    p_performed_by,
    v_now
  )
  returning id into v_receipt_id;

  for v_item, v_line_number in
    with raw_items as (
      select
        value,
        ordinality::integer as line_number
      from jsonb_array_elements(p_invoice -> 'items') with ordinality
    ),
    normalized_items as (
      select
        line_number,
        catalog.normalize_supplier_invoice_part_number(value ->> 'partNumber') as part_number,
        coalesce(nullif(btrim(value ->> 'description'), ''), catalog.normalize_supplier_invoice_part_number(value ->> 'partNumber')) as description,
        nullif(value ->> 'quantity', '')::numeric as quantity,
        coalesce(nullif(value ->> 'unitCost', '')::numeric, 0) as unit_cost,
        coalesce(nullif(btrim(value ->> 'uom'), ''), 'PC') as uom,
        coalesce(nullif(btrim(value ->> 'brand'), ''), 'Mitsubishi') as brand
      from raw_items
    )
    select
      jsonb_build_object(
        'partNumber', part_number,
        'description', (array_agg(description order by line_number))[1],
        'quantity', sum(quantity),
        'unitCost', round(sum(quantity * unit_cost) / nullif(sum(quantity), 0), 2),
        'uom', (array_agg(uom order by line_number))[1],
        'brand', (array_agg(brand order by line_number))[1]
      ),
      min(line_number)::integer
    from normalized_items
    group by part_number
    order by min(line_number)
  loop
    v_part_number := catalog.normalize_supplier_invoice_part_number(v_item ->> 'partNumber');
    v_description := coalesce(nullif(btrim(v_item ->> 'description'), ''), v_part_number);
    v_quantity := nullif(v_item ->> 'quantity', '')::numeric;
    v_unit_cost := coalesce(nullif(v_item ->> 'unitCost', '')::numeric, 0);
    v_uom := coalesce(nullif(btrim(v_item ->> 'uom'), ''), 'PC');

    if v_part_number is null or v_part_number = '' then
      raise exception 'Part number is required on invoice line %.', v_line_number;
    end if;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Quantity must be greater than zero on invoice line %.', v_line_number;
    end if;

    if v_unit_cost < 0 then
      raise exception 'Unit cost cannot be negative on invoice line %.', v_line_number;
    end if;

    insert into catalog.products (
      sku,
      name,
      brand,
      uom,
      status,
      metadata,
      business_date,
      updated_at
    )
    values (
      v_part_number,
      v_description,
      coalesce(nullif(btrim(v_item ->> 'brand'), ''), 'Mitsubishi'),
      v_uom,
      'in_stock',
      jsonb_build_object(
        'source', 'supplier_invoice',
        'supplierId', v_supplier_id,
        'supplierName', v_supplier_name,
        'lastInvoiceNumber', v_invoice_number,
        'lastPurchasePrice', v_unit_cost
      ),
      v_business_date,
      v_now
    )
    on conflict (sku) do update set
      name = case
        when catalog.products.name = catalog.products.sku and excluded.name <> excluded.sku then excluded.name
        else catalog.products.name
      end,
      uom = coalesce(nullif(excluded.uom, ''), catalog.products.uom),
      metadata = catalog.products.metadata || jsonb_build_object(
        'lastSupplierId', v_supplier_id,
        'lastSupplierName', v_supplier_name,
        'lastInvoiceNumber', v_invoice_number,
        'lastPurchasePrice', v_unit_cost
      ),
      updated_at = excluded.updated_at
    returning id, name into v_product_id, v_product_name;

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
    values (
      v_product_id,
      0,
      0,
      0,
      0,
      '{}'::jsonb,
      v_business_date,
      v_business_date
    )
    on conflict (product_id) do nothing;

    select on_hand
      into v_previous_stock
    from catalog.inventory_balances
    where product_id = v_product_id
    for update;

    update catalog.inventory_balances
    set
      on_hand = on_hand + v_quantity,
      as_of_date = v_business_date,
      business_date = v_business_date,
      updated_at = v_now
    where product_id = v_product_id
    returning on_hand into v_updated_stock;

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
      'supplier_invoice',
      v_receipt_id,
      concat_ws(' | ', 'Supplier: ' || v_supplier_name, 'Invoice: ' || v_invoice_number, v_notes),
      p_performed_by,
      v_business_date
    )
    returning id into v_movement_id;

    insert into catalog.stock_receipt_items (
      receipt_id,
      product_id,
      movement_id,
      line_number,
      part_number,
      description,
      quantity,
      unit_cost,
      uom,
      metadata
    )
    values (
      v_receipt_id,
      v_product_id,
      v_movement_id,
      v_line_number,
      v_part_number,
      v_description,
      v_quantity,
      v_unit_cost,
      v_uom,
      jsonb_build_object('previousStock', v_previous_stock, 'updatedStock', v_updated_stock)
    );

    if v_unit_cost > 0 then
      update catalog.product_prices
      set
        is_current = false,
        effective_to = v_business_date,
        updated_at = v_now
      where product_id = v_product_id
        and price_type = 'cost'
        and is_current = true;

      insert into catalog.product_prices (
        product_id,
        price_type,
        amount,
        currency,
        effective_from,
        effective_to,
        is_current,
        business_date
      )
      values (
        v_product_id,
        'cost',
        v_unit_cost,
        'PHP',
        v_business_date,
        null,
        true,
        v_business_date
      );
    end if;

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
      v_movement_id,
      v_quantity,
      v_previous_stock,
      v_updated_stock,
      v_invoice_number,
      v_invoice_date,
      v_notes,
      p_performed_by
    );

    insert into catalog.product_supplier_links (product_id, supplier_id)
    values (v_product_id, v_supplier_id)
    on conflict (product_id) do update set supplier_id = excluded.supplier_id;

    v_total_lines := v_total_lines + 1;
    v_total_quantity := v_total_quantity + v_quantity;
    v_total_cost := v_total_cost + round(v_quantity * v_unit_cost, 2);
    v_result_items := v_result_items || jsonb_build_array(jsonb_build_object(
      'lineNumber', v_line_number,
      'productId', v_product_id,
      'partNumber', v_part_number,
      'description', v_description,
      'quantity', v_quantity,
      'unitCost', v_unit_cost,
      'previousStock', v_previous_stock,
      'updatedStock', v_updated_stock,
      'movementId', v_movement_id
    ));
  end loop;

  update catalog.stock_receipts
  set
    total_lines = v_total_lines,
    total_quantity = v_total_quantity,
    total_cost = v_total_cost,
    updated_at = v_now
  where id = v_receipt_id;

  return jsonb_build_object(
    'receiptId', v_receipt_id,
    'supplierId', v_supplier_id,
    'supplierName', v_supplier_name,
    'invoiceNumber', v_invoice_number,
    'invoiceDate', v_invoice_date,
    'totalLines', v_total_lines,
    'totalQuantity', v_total_quantity,
    'totalCost', v_total_cost,
    'items', v_result_items
  );
end;
$$;

create or replace function public.receive_supplier_invoice_stock(
  p_invoice jsonb,
  p_performed_by uuid default auth.uid()
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select catalog.receive_supplier_invoice_stock(p_invoice, p_performed_by);
$$;

revoke execute on function catalog.normalize_supplier_invoice_part_number(text) from public;
revoke execute on function catalog.supplier_invoice_code(text) from public;
revoke execute on function catalog.receive_supplier_invoice_stock(jsonb, uuid) from public;
revoke execute on function public.receive_supplier_invoice_stock(jsonb, uuid) from public;

grant execute on function catalog.receive_supplier_invoice_stock(jsonb, uuid) to service_role;
grant execute on function public.receive_supplier_invoice_stock(jsonb, uuid) to service_role;
