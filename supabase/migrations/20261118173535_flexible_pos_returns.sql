-- Support practical returns for released-but-unpaid POS orders, better fitment
-- reasons, inspected/opened parts, and credited balances without double stock moves.

alter table operations.sales_returns
  add column settlement_type text not null default 'refund'
    check (settlement_type in ('refund', 'balance_credit'));

alter table operations.sales_returns
  drop constraint sales_returns_reason_check,
  add constraint sales_returns_reason_check
    check (reason in ('wrong_part', 'wrong_fitment', 'ordered_by_mistake', 'defective', 'excess', 'changed_mind', 'other')),
  drop constraint sales_returns_refund_method_check,
  add constraint sales_returns_refund_method_check
    check (refund_method in ('cash', 'check', 'store_credit', 'account_credit'));

alter table operations.sales_return_items
  drop constraint sales_return_items_item_condition_check,
  add constraint sales_return_items_item_condition_check
    check (item_condition in ('resalable', 'opened_resalable', 'inspection', 'installed', 'damaged'));

create or replace function public.get_pos_sale_return_context(p_sale_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with sale_header as (
    select st.id, st.transaction_number, st.status, st.payment_method,
      st.subtotal, st.total_amount, st.source_type, st.inventory_applied,
      st.pos_issued_at, st.pos_paid_at,
      coalesce(c.name, st.customer_name_snapshot, 'Walk-in Customer') as customer_name,
      (
        st.source_type in ('pos', 'estimate_conversion')
        and st.inventory_applied
        and st.pos_issued_at is not null
        and st.subtotal > 0
        and (
          (st.status = 'completed' and st.payment_method <> 'to_follow' and st.pos_paid_at is not null)
          or (st.status = 'pending' and st.payment_method = 'to_follow' and st.pos_paid_at is null)
        )
      ) as can_return
    from operations.sales_transactions st
    left join operations.customers c on c.id = st.customer_id
    where st.id = p_sale_id
  ),
  returned_by_line as (
    select sri.sale_item_id, sum(sri.quantity) as returned_quantity,
      sum(sri.refund_amount) as returned_amount
    from operations.sales_return_items sri
    join operations.sales_returns sr on sr.id = sri.return_id
    where sr.sale_id = p_sale_id
    group by sri.sale_item_id
  ),
  sale_lines as (
    select si.id, si.line_type, si.product_id, si.quantity, si.unit_price, si.line_total,
      coalesce(si.item_name_snapshot, p.name, 'Unnamed Item') as item_name,
      coalesce(si.item_sku_snapshot, p.sku, '') as item_sku,
      coalesce(r.returned_quantity, 0) as returned_quantity,
      coalesce(r.returned_amount, 0) as returned_amount,
      case when sh.can_return and si.line_type = 'product' and si.product_id is not null
        then greatest(si.quantity - coalesce(r.returned_quantity, 0), 0)
        else 0 end as returnable_quantity,
      case when sh.can_return and si.line_type = 'product' and si.product_id is not null
        then greatest(round(si.line_total * sh.total_amount / nullif(sh.subtotal, 0), 2) - coalesce(r.returned_amount, 0), 0)
        else 0 end as returnable_amount
    from operations.sales_transaction_items si
    join sale_header sh on sh.id = si.transaction_id
    left join catalog.products p on p.id = si.product_id
    left join returned_by_line r on r.sale_item_id = si.id
  ),
  return_line_lists as (
    select sri.return_id,
      jsonb_agg(jsonb_build_object(
        'id', sri.id, 'saleItemId', sri.sale_item_id, 'productId', sri.product_id,
        'itemName', sri.item_name_snapshot, 'itemSku', sri.item_sku_snapshot,
        'quantity', sri.quantity, 'condition', sri.item_condition,
        'refundAmount', sri.refund_amount
      ) order by sri.id) as items
    from operations.sales_return_items sri
    join operations.sales_returns sr on sr.id = sri.return_id
    where sr.sale_id = p_sale_id
    group by sri.return_id
  ),
  return_history as (
    select sr.id, sr.return_number, sr.reason, sr.reason_note,
      sr.settlement_type, sr.refund_method, sr.refund_reference, sr.refund_total,
      sr.business_date, sr.created_at, sr.processed_by,
      up.full_name as processed_by_name,
      coalesce(rll.items, '[]'::jsonb) as items
    from operations.sales_returns sr
    left join core.user_profiles up on up.user_id = sr.processed_by
    left join return_line_lists rll on rll.return_id = sr.id
    where sr.sale_id = p_sale_id
  )
  select case when not exists (select 1 from sale_header) then null else
    (select jsonb_build_object(
      'sale', jsonb_build_object(
        'id', sh.id, 'transactionNumber', sh.transaction_number,
        'customerName', sh.customer_name, 'status', sh.status,
        'paymentMethod', sh.payment_method, 'sourceType', sh.source_type,
        'totalAmount', sh.total_amount,
        'balanceDue', case when sh.status = 'pending' and sh.payment_method = 'to_follow'
          then greatest(sh.total_amount - coalesce((select sum(r.refund_total) from operations.sales_returns r where r.sale_id = sh.id and r.settlement_type = 'balance_credit'), 0), 0)
          else 0 end,
        'canReturn', sh.can_return
      ),
      'canReturn', sh.can_return,
      'balanceDue', case when sh.status = 'pending' and sh.payment_method = 'to_follow'
        then greatest(sh.total_amount - coalesce((select sum(r.refund_total) from operations.sales_returns r where r.sale_id = sh.id and r.settlement_type = 'balance_credit'), 0), 0)
        else 0 end,
      'totalRefunded', coalesce((select sum(r.refund_total) from operations.sales_returns r where r.sale_id = sh.id and r.settlement_type = 'refund'), 0),
      'totalCredited', coalesce((select sum(r.refund_total) from operations.sales_returns r where r.sale_id = sh.id and r.settlement_type = 'balance_credit'), 0),
      'netAmount', greatest(sh.total_amount - coalesce((select sum(r.refund_total) from operations.sales_returns r where r.sale_id = sh.id), 0), 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', sl.id, 'lineType', sl.line_type, 'productId', sl.product_id,
          'itemName', sl.item_name, 'itemSku', sl.item_sku,
          'quantity', sl.quantity, 'unitPrice', sl.unit_price, 'lineTotal', sl.line_total,
          'returnedQuantity', sl.returned_quantity, 'returnedAmount', sl.returned_amount,
          'returnableQuantity', sl.returnable_quantity, 'returnableAmount', sl.returnable_amount
        ) order by sl.id)
        from sale_lines sl
      ), '[]'::jsonb),
      'returns', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', rh.id, 'returnNumber', rh.return_number, 'reason', rh.reason,
          'reasonNote', rh.reason_note, 'settlementType', rh.settlement_type,
          'refundMethod', rh.refund_method,
          'refundReference', rh.refund_reference, 'refundTotal', rh.refund_total,
          'businessDate', rh.business_date, 'createdAt', rh.created_at,
          'processedBy', rh.processed_by, 'processedByName', rh.processed_by_name,
          'items', rh.items
        ) order by rh.created_at desc, rh.id)
        from return_history rh
      ), '[]'::jsonb)
    ) from sale_header sh)
  end;
$function$;

create or replace function public.create_pos_sale_return(
  p_sale_id uuid, p_payload jsonb, p_actor uuid, p_request uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_sale operations.sales_transactions%rowtype;
  v_sale_item operations.sales_transaction_items%rowtype;
  v_prior operations.sales_return_requests%rowtype;
  v_canonical jsonb;
  v_request_line jsonb;
  v_saved_line jsonb;
  v_saved_lines jsonb := '[]'::jsonb;
  v_sale_item_id uuid;
  v_quantity numeric(12,2);
  v_previous_quantity numeric(12,2);
  v_previous_refund numeric(12,2);
  v_line_refund numeric(12,2);
  v_target_refund numeric(12,2);
  v_refund numeric(12,2);
  v_refund_total numeric(12,2) := 0;
  v_balance_due numeric(12,2);
  v_reason text;
  v_reason_note text;
  v_refund_method text;
  v_refund_reference text;
  v_condition text;
  v_actor_name text;
  v_business_date date := (now() at time zone 'Asia/Manila')::date;
  v_return_id uuid;
  v_return_number text;
begin
  if p_sale_id is null or p_actor is null or p_request is null
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'items') is distinct from 'array'
    or jsonb_array_length(p_payload->'items') not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Choose a receipt and at least one item to return.';
  end if;

  if not exists (
    select 1 from core.user_profiles up
    where up.user_id = p_actor and up.role in ('admin', 'cashier')
  ) then
    raise exception using errcode = '42501', message = 'An administrator or cashier is required to record a return.';
  end if;

  v_reason := p_payload->>'reason';
  v_reason_note := btrim(coalesce(p_payload->>'reasonNote', ''));
  v_refund_method := p_payload->>'refundMethod';
  v_refund_reference := btrim(coalesce(p_payload->>'refundReference', ''));
  if v_reason is null or v_reason not in ('wrong_part', 'wrong_fitment', 'ordered_by_mistake', 'defective', 'excess', 'changed_mind', 'other')
    or length(v_reason_note) > 500
    or (v_reason = 'other' and v_reason_note = '')
    or v_refund_method is null or v_refund_method not in ('cash', 'check', 'store_credit', 'account_credit')
    or length(v_refund_reference) > 120
    or (v_refund_method = 'check' and v_refund_reference = '')
    or p_payload->>'refundConfirmed' is distinct from 'true' then
    raise exception using errcode = '22023', message = 'Review the return reason, settlement method and confirmation.';
  end if;

  if (select count(*) from jsonb_array_elements(p_payload->'items'))
    <> (select count(distinct value->>'saleItemId') from jsonb_array_elements(p_payload->'items')) then
    raise exception using errcode = '22023', message = 'A receipt item can only appear once in a return.';
  end if;

  v_canonical := jsonb_build_object('saleId', p_sale_id, 'payload', p_payload);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sale-return:' || p_actor::text || ':' || p_request::text, 0)
  );
  select * into v_prior from operations.sales_return_requests
  where actor_id = p_actor and request_id = p_request;
  if found then
    if v_prior.payload is distinct from v_canonical then
      raise exception using errcode = 'PT409', message = 'This return reference already belongs to another saved request. Reload the receipt before trying again.';
    end if;
    return public.get_pos_sale_return_context(p_sale_id)
      || jsonb_build_object('savedReturnId', v_prior.return_id);
  end if;

  select * into v_sale from operations.sales_transactions where id = p_sale_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'The original receipt could not be found.';
  end if;
  if v_sale.source_type not in ('pos', 'estimate_conversion')
    or not v_sale.inventory_applied or v_sale.pos_issued_at is null or v_sale.subtotal <= 0
    or not (
      (v_sale.status = 'completed' and v_sale.payment_method <> 'to_follow' and v_sale.pos_paid_at is not null)
      or (v_sale.status = 'pending' and v_sale.payment_method = 'to_follow' and v_sale.pos_paid_at is null)
    ) then
    raise exception using errcode = 'PT409', message = 'Only itemized POS sales that were released to the customer can be returned.';
  end if;
  if (v_sale.status = 'pending' and v_refund_method <> 'account_credit')
    or (v_sale.status = 'completed' and v_refund_method = 'account_credit') then
    raise exception using errcode = '22023', message = 'Unpaid released orders must be credited to the balance; paid orders require a refund or store credit.';
  end if;

  select up.full_name into v_actor_name from core.user_profiles up where up.user_id = p_actor;
  for v_request_line in
    select value from jsonb_array_elements(p_payload->'items') as line(value)
  loop
    v_sale_item_id := (v_request_line->>'saleItemId')::uuid;
    v_quantity := (v_request_line->>'quantity')::numeric;
    v_condition := v_request_line->>'condition';
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999
      or v_quantity::text in ('NaN', 'Infinity', '-Infinity')
      or v_condition is null or v_condition not in ('resalable', 'opened_resalable', 'inspection', 'installed', 'damaged') then
      raise exception using errcode = '22023', message = 'Enter a valid quantity and item condition.';
    end if;
    if v_reason = 'defective' and v_condition in ('resalable', 'opened_resalable') then
      raise exception using errcode = '22023', message = 'A defective part must be held for inspection or marked damaged; do not return it directly to saleable stock.';
    end if;

    select * into v_sale_item from operations.sales_transaction_items si
    where si.id = v_sale_item_id and si.transaction_id = p_sale_id
      and si.line_type = 'product' for update;
    if not found or v_sale_item.product_id is null then
      raise exception using errcode = '22023', message = 'One selected part is not returnable from this receipt.';
    end if;

    select coalesce(sum(sri.quantity), 0), coalesce(sum(sri.refund_amount), 0)
      into v_previous_quantity, v_previous_refund
    from operations.sales_return_items sri
    join operations.sales_returns sr on sr.id = sri.return_id
    where sr.sale_id = p_sale_id and sri.sale_item_id = v_sale_item_id;
    if v_previous_quantity + v_quantity > v_sale_item.quantity then
      raise exception using errcode = 'PT409', message = 'The requested quantity exceeds the amount still available to return. Reload the receipt.';
    end if;

    v_line_refund := round(v_sale_item.line_total * v_sale.total_amount / v_sale.subtotal, 2);
    v_target_refund := case
      when v_previous_quantity + v_quantity >= v_sale_item.quantity then v_line_refund
      else round(v_line_refund * (v_previous_quantity + v_quantity) / v_sale_item.quantity, 2)
    end;
    v_refund := v_target_refund - v_previous_refund;
    if v_refund < 0 then
      raise exception using errcode = 'PT409', message = 'The return amount changed on this receipt. Reload it and review the return.';
    end if;

    v_refund_total := v_refund_total + v_refund;
    v_saved_line := jsonb_build_object(
      'saleItemId', v_sale_item.id, 'productId', v_sale_item.product_id,
      'itemName', coalesce(v_sale_item.item_name_snapshot, 'Returned part'),
      'itemSku', coalesce(v_sale_item.item_sku_snapshot, ''),
      'quantity', v_quantity, 'condition', v_condition, 'refundAmount', v_refund
    );
    v_saved_lines := v_saved_lines || jsonb_build_array(v_saved_line);
  end loop;
  v_refund_total := round(v_refund_total, 2);
  if v_refund_total <= 0 then
    raise exception using errcode = '22023', message = 'The selected items do not have a refundable balance.';
  end if;

  insert into catalog.inventory_balances (
    product_id, on_hand, reserved, reorder_point, reorder_quantity,
    location, as_of_date, business_date, updated_at
  )
  select requested.product_id, 0, 0, 0, 0, '{}'::jsonb,
    v_business_date, v_business_date, timezone('utc', now())
  from (
    select distinct (line.value->>'productId')::uuid as product_id
    from jsonb_array_elements(v_saved_lines) as line(value)
    where line.value->>'condition' in ('resalable', 'opened_resalable')
  ) requested
  on conflict (product_id) do nothing;

  perform b.product_id from catalog.inventory_balances b
  where b.product_id in (
    select distinct (line.value->>'productId')::uuid
    from jsonb_array_elements(v_saved_lines) as line(value)
    where line.value->>'condition' in ('resalable', 'opened_resalable')
  )
  order by b.product_id for update;

  v_return_id := gen_random_uuid();
  v_return_number := 'RET-' || pg_catalog.to_char(v_business_date, 'YYYYMMDD') || '-'
    || upper(pg_catalog.substr(pg_catalog.replace(v_return_id::text, '-', ''), 1, 8));
  insert into operations.sales_returns (
    id, return_number, sale_id, reason, reason_note, settlement_type, refund_method,
    refund_reference, refund_total, refund_confirmed, processed_by, business_date
  ) values (
    v_return_id, v_return_number, p_sale_id, v_reason, v_reason_note,
    case when v_sale.status = 'pending' then 'balance_credit' else 'refund' end,
    v_refund_method, v_refund_reference, v_refund_total, true, p_actor, v_business_date
  );

  insert into operations.sales_return_items (
    return_id, sale_item_id, product_id, item_name_snapshot, item_sku_snapshot,
    quantity, item_condition, refund_amount
  )
  select v_return_id, (line.value->>'saleItemId')::uuid,
    (line.value->>'productId')::uuid, line.value->>'itemName', line.value->>'itemSku',
    (line.value->>'quantity')::numeric, line.value->>'condition',
    (line.value->>'refundAmount')::numeric
  from jsonb_array_elements(v_saved_lines) as line(value);

  insert into catalog.inventory_movements (
    product_id, movement_type, quantity, reference_type, reference_id,
    notes, performed_by, business_date
  )
  select (line.value->>'productId')::uuid, 'stock_in',
    sum((line.value->>'quantity')::numeric), 'sales_return', v_return_id,
    'Resalable customer return ' || v_return_number, p_actor, v_business_date
  from jsonb_array_elements(v_saved_lines) as line(value)
  where line.value->>'condition' in ('resalable', 'opened_resalable')
  group by (line.value->>'productId')::uuid;

  update catalog.inventory_balances b
  set on_hand = b.on_hand + returned.quantity,
    as_of_date = v_business_date, business_date = v_business_date,
    updated_at = timezone('utc', now())
  from (
    select (line.value->>'productId')::uuid as product_id,
      sum((line.value->>'quantity')::numeric) as quantity
    from jsonb_array_elements(v_saved_lines) as line(value)
    where line.value->>'condition' in ('resalable', 'opened_resalable')
    group by (line.value->>'productId')::uuid
  ) returned
  where b.product_id = returned.product_id;

  insert into operations.sales_return_requests (actor_id, request_id, payload, return_id)
  values (p_actor, p_request, v_canonical, v_return_id);

  select greatest(v_sale.total_amount - coalesce(sum(sr.refund_total) filter (where sr.settlement_type = 'balance_credit'), 0), 0)
    into v_balance_due
  from operations.sales_returns sr where sr.sale_id = p_sale_id;
  if v_sale.status = 'pending' and v_balance_due = 0 and not exists (
    select 1
    from operations.sales_transaction_items si
    left join (
      select sri.sale_item_id, sum(sri.quantity) as returned_quantity
      from operations.sales_return_items sri
      join operations.sales_returns sr on sr.id = sri.return_id
      where sr.sale_id = p_sale_id
      group by sri.sale_item_id
    ) returned on returned.sale_item_id = si.id
    where si.transaction_id = p_sale_id and si.line_type = 'product' and si.product_id is not null
      and si.quantity > coalesce(returned.returned_quantity, 0)
  ) then
    update operations.sales_transactions set status = 'voided', updated_at = timezone('utc', now()), updated_by = p_actor
    where id = p_sale_id and status = 'pending';
  end if;

  return public.get_pos_sale_return_context(p_sale_id)
    || jsonb_build_object('savedReturnId', v_return_id, 'savedReturnNumber', v_return_number,
      'savedRefundTotal', v_refund_total, 'savedRefundMethod', v_refund_method,
      'savedSettlementType', case when v_sale.status = 'pending' then 'balance_credit' else 'refund' end,
      'savedProcessedByName', coalesce(v_actor_name, 'Staff'));
end;
$function$;

create or replace function public.settle_pos_order(p_sale_id uuid, payload jsonb, p_actor uuid, p_request uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  prior operations.pos_checkout_requests%rowtype;
  sale operations.sales_transactions%rowtype;
  cash numeric;
  due numeric(12,2);
  method text := coalesce(payload->>'paymentMethod', 'cash');
  posted timestamptz := now();
  day date := (now() at time zone 'Asia/Manila')::date;
begin
  perform operations.assert_workshop_staff(p_actor);
  if p_request is null or p_sale_id is null or jsonb_typeof(payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Choose a saved unpaid order and payment reference.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pos-request:' || p_actor || ':' || p_request, 0));
  select * into prior from operations.pos_checkout_requests where actor_id = p_actor and request_id = p_request;
  if found then
    if prior.operation <> 'settlement' or prior.sale_id <> p_sale_id or prior.payload is distinct from payload then
      raise exception using errcode = 'PT409', message = 'This payment reference already belongs to a saved operation. Check its saved result before continuing.';
    end if;
    return public.pos_order_result(prior.sale_id);
  end if;
  select * into sale from operations.sales_transactions where id = p_sale_id for update;
  if not found or sale.source_type not in ('pos', 'estimate_conversion') or sale.pos_issued_at is null then
    raise exception using errcode = '22023', message = 'Choose a POS payment-to-follow order.';
  end if;
  if sale.status <> 'pending' or sale.payment_method <> 'to_follow' or not sale.inventory_applied then
    raise exception using errcode = 'PT409', message = 'This order is no longer unpaid. Refresh it before collecting money.';
  end if;
  select greatest(sale.total_amount - coalesce(sum(sr.refund_total), 0), 0)
    into due
  from operations.sales_returns sr
  where sr.sale_id = p_sale_id and sr.settlement_type = 'balance_credit';
  if due <= 0 then
    raise exception using errcode = 'PT409', message = 'This order has no balance to collect after return credits.';
  end if;
  if method not in ('cash', 'check') then
    raise exception using errcode = '22023', message = 'Choose a received payment method.';
  end if;
  perform public.assert_recorded_pos_payment(payload, due);
  cash := round(coalesce((payload->>'cashReceived')::numeric, 0), 2);
  if method = 'cash' and (coalesce(payload->>'paymentVerified', 'false') <> 'true' or cash is null or cash < due
      or cash::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception using errcode = '22023', message = 'Confirm the cash was received and enter enough for the remaining balance.';
  end if;
  update operations.sales_transactions
  set status = 'completed', payment_method = method,
    cash_received = case when method = 'cash' then cash else null end,
    change_due = case when method = 'cash' then round(cash - due, 2) else 0 end,
    pos_payment_reference = case when method = 'check' then btrim(payload->>'paymentReference') end,
    pos_paid_at = posted, sale_at = posted, business_date = day, updated_by = p_actor
  where id = p_sale_id;
  update operations.sales_transaction_items set business_date = day where transaction_id = p_sale_id;
  insert into operations.pos_checkout_requests(actor_id, request_id, operation, payload, sale_id)
  values (p_actor, p_request, 'settlement', payload, p_sale_id);
  -- The original release already deducted stock; settling only records receipt of funds.
  return public.pos_order_result(p_sale_id);
end;
$function$;

create or replace function public.list_unpaid_pos_orders(p_page integer default 1)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with rows as materialized (
    select st.id, st.transaction_number, st.customer_name_snapshot, st.total_amount,
      greatest(st.total_amount - coalesce(credits.amount, 0), 0)::numeric(12,2) as balance_due,
      st.pos_note, st.pos_issued_at
    from operations.sales_transactions st
    left join lateral (
      select sum(sr.refund_total) as amount
      from operations.sales_returns sr
      where sr.sale_id = st.id and sr.settlement_type = 'balance_credit'
    ) credits on true
    where st.source_type in ('pos', 'estimate_conversion')
      and st.status = 'pending' and st.payment_method = 'to_follow'
      and st.pos_issued_at is not null
      and greatest(st.total_amount - coalesce(credits.amount, 0), 0) > 0
  ),
  bounds as (
    select count(*)::integer as total,
      greatest(1, least(greatest(p_page, 1), greatest(1, (count(*)::integer + 7) / 8))) as page
    from rows
  ),
  selected as (
    select * from rows order by pos_issued_at, id
    limit 8 offset (select (page - 1) * 8 from bounds)
  )
  select jsonb_build_object(
    'orders', coalesce((select jsonb_agg(to_jsonb(s) order by s.pos_issued_at, s.id) from selected s), '[]'::jsonb),
    'pagination', jsonb_build_object('page', page, 'pageSize', 8, 'totalCount', total, 'totalPages', greatest(1, (total + 7) / 8))
  ) from bounds;
$function$;

-- Unpaid releases are not sales revenue yet; only subtract their return lines
-- after the receivable is settled and the original sale is recognized.
create or replace view private.recorded_product_sales as
select st.id as transaction_id,
       coalesce(st.business_date, (st.sale_at at time zone 'Asia/Manila')::date) as sale_date,
       si.product_id,
       coalesce(si.item_sku_snapshot, p.sku, '') as sku,
       coalesce(si.item_name_snapshot, p.name, 'Recorded product') as product_name,
       coalesce(p.category, 'Uncategorized') as category,
       coalesce(p.brand, '') as brand,
       si.quantity, si.line_total as revenue
from operations.sales_transactions st
join operations.sales_transaction_items si on si.transaction_id = st.id
left join catalog.products p on p.id = si.product_id
where st.status = 'completed' and si.line_type = 'product'
  and st.transaction_number not ilike 'SALE-DEMO-%'
  and coalesce(st.customer_name_snapshot, '') not ilike 'demo customer%'
  and coalesce(st.original_reference, '') not ilike 'DEMO-%'
union all
select sr.id as transaction_id, sr.business_date as sale_date, sri.product_id,
       coalesce(sri.item_sku_snapshot, p.sku, '') as sku,
       coalesce(sri.item_name_snapshot, p.name, 'Returned product') as product_name,
       coalesce(p.category, 'Uncategorized') as category,
       coalesce(p.brand, '') as brand,
       (-sri.quantity)::numeric(12,2) as quantity,
       (-round(si.line_total * sri.quantity / nullif(si.quantity, 0), 2))::numeric(12,2) as revenue
from operations.sales_returns sr
join operations.sales_transactions st on st.id = sr.sale_id
join operations.sales_return_items sri on sri.return_id = sr.id
join operations.sales_transaction_items si on si.id = sri.sale_item_id
left join catalog.products p on p.id = sri.product_id
where st.status = 'completed' and sri.product_id is not null;

revoke all on private.recorded_product_sales from public, anon, authenticated;
revoke all on function public.get_pos_sale_return_context(uuid),
  public.create_pos_sale_return(uuid, jsonb, uuid, uuid),
  public.settle_pos_order(uuid, jsonb, uuid, uuid),
  public.list_unpaid_pos_orders(integer) from public, anon, authenticated;
grant execute on function public.get_pos_sale_return_context(uuid),
  public.create_pos_sale_return(uuid, jsonb, uuid, uuid),
  public.settle_pos_order(uuid, jsonb, uuid, uuid),
  public.list_unpaid_pos_orders(integer) to service_role;
