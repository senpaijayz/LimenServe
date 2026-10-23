-- Actual workshop work is separate from intake estimates and historic order items.
create table if not exists operations.service_work_state (
  service_order_id uuid primary key references operations.service_orders(id) on delete cascade,
  stage text not null default 'intake'
    check (stage in ('intake','scheduled','in_progress','paused','work_completed','released','cancelled')),
  work_completed_at timestamptz,
  customer_approval_note text,
  customer_approval_recorded_by uuid references auth.users(id) on delete set null,
  customer_approval_recorded_at timestamptz,
  payment_reference text,
  payment_verified_by uuid references auth.users(id) on delete set null,
  payment_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists operations.service_work_events (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references operations.service_orders(id) on delete cascade,
  event_type text not null check (event_type in
    ('start','note','diagnosis','pause','resume','work_completed','customer_approval','lines_updated','payment_posted')),
  note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index if not exists service_work_events_order_time_idx
  on operations.service_work_events(service_order_id, occurred_at desc);

create table if not exists operations.service_work_lines (
  id uuid primary key default gen_random_uuid(),
  service_order_id uuid not null references operations.service_orders(id) on delete cascade,
  kind text not null check (kind in ('part','labor')),
  product_id uuid references catalog.products(id) on delete restrict,
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'part' and product_id is not null and quantity = trunc(quantity))
    or (kind = 'labor' and product_id is null))
);
create index if not exists service_work_lines_order_idx on operations.service_work_lines(service_order_id);
create index if not exists service_work_lines_product_idx on operations.service_work_lines(product_id) where product_id is not null;

alter table operations.service_work_state enable row level security;
alter table operations.service_work_events enable row level security;
alter table operations.service_work_lines enable row level security;
grant select, insert, update, delete on operations.service_work_state,
  operations.service_work_events, operations.service_work_lines to service_role;

create or replace function operations.assert_workshop_staff(p_actor uuid)
returns void language plpgsql stable security definer
set search_path = pg_catalog, core
as $$
begin
  if p_actor is null or not exists (
    select 1 from core.user_profiles where user_id = p_actor and role in ('admin','cashier')
  ) then
    raise exception using errcode='42501', message='Workshop staff permission is required.';
  end if;
end;
$$;

create or replace function public.limen_record_service_work_event(
  p_order_id uuid, p_actor uuid, p_event_type text, p_note text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, operations
as $$
declare
  v_order operations.service_orders%rowtype;
  v_state operations.service_work_state%rowtype;
  v_note text := nullif(btrim(coalesce(p_note,'')), '');
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501', message='Workshop updates are server-managed.';
  end if;
  perform operations.assert_workshop_staff(p_actor);
  select * into v_order from operations.service_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002', message='Service order not found.'; end if;
  if v_order.status in ('completed','cancelled') then
    raise exception using errcode='22023', message='Completed or cancelled jobs cannot be changed.';
  end if;
  insert into operations.service_work_state(service_order_id,stage)
  values(p_order_id,case when v_order.status='in_progress' then 'in_progress' else 'intake' end)
  on conflict(service_order_id) do nothing;
  select * into v_state from operations.service_work_state where service_order_id=p_order_id for update;
  if p_event_type not in ('start','note','diagnosis','pause','resume','work_completed','customer_approval') then
    raise exception using errcode='22023', message='Choose a valid work update.';
  end if;
  if p_event_type in ('note','diagnosis','pause','customer_approval') and v_note is null then
    raise exception using errcode='22023', message='Add a note explaining this work update.';
  end if;
  if p_event_type='start' then
    if v_state.stage not in ('intake','scheduled') then
      raise exception using errcode='22023', message='This job cannot be started from its current stage.';
    end if;
    update operations.service_work_state set stage='in_progress',updated_at=now() where service_order_id=p_order_id;
    update operations.service_orders set status='in_progress',started_at=coalesce(started_at,now()),updated_at=now() where id=p_order_id;
  elsif p_event_type='pause' then
    if v_state.stage <> 'in_progress' then raise exception using errcode='22023',message='Start work before pausing it.'; end if;
    update operations.service_work_state set stage='paused',updated_at=now() where service_order_id=p_order_id;
  elsif p_event_type='resume' then
    if v_state.stage <> 'paused' then raise exception using errcode='22023',message='Only paused work can be resumed.'; end if;
    update operations.service_work_state set stage='in_progress',updated_at=now() where service_order_id=p_order_id;
  elsif p_event_type='work_completed' then
    if v_state.stage <> 'in_progress' then raise exception using errcode='22023',message='Start or resume work before marking it finished.'; end if;
    update operations.service_work_state set stage='work_completed',work_completed_at=now(),updated_at=now() where service_order_id=p_order_id;
  elsif p_event_type='customer_approval' then
    update operations.service_work_state set customer_approval_note=v_note,
      customer_approval_recorded_by=p_actor,customer_approval_recorded_at=now(),updated_at=now()
    where service_order_id=p_order_id;
  end if;
  insert into operations.service_work_events(service_order_id,event_type,note,actor_user_id)
  values(p_order_id,p_event_type,v_note,p_actor);
  return jsonb_build_object('stage',(select stage from operations.service_work_state where service_order_id=p_order_id));
end;
$$;

create or replace function public.limen_replace_service_work_lines(
  p_order_id uuid, p_actor uuid, p_lines jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, operations, catalog
as $$
declare
  v_order operations.service_orders%rowtype;
  v_line jsonb;
  v_kind text;
  v_product_id uuid;
  v_description text;
  v_quantity numeric;
  v_price numeric;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='Workshop charges are server-managed.';
  end if;
  perform operations.assert_workshop_staff(p_actor);
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50 then
    raise exception using errcode='22023',message='Provide up to 50 actual parts and labor lines.';
  end if;
  select * into v_order from operations.service_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='Service order not found.'; end if;
  if v_order.status in ('completed','cancelled') then
    raise exception using errcode='22023',message='Posted or cancelled charges cannot be edited.';
  end if;
  delete from operations.service_work_lines where service_order_id=p_order_id;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_kind := v_line->>'kind';
    v_product_id := nullif(v_line->>'productId','')::uuid;
    v_description := nullif(btrim(coalesce(v_line->>'description','')), '');
    v_quantity := round((v_line->>'quantity')::numeric,2);
    v_price := round((v_line->>'unitPrice')::numeric,2);
    if v_kind not in ('part','labor') or v_description is null or length(v_description)>200
       or v_quantity <= 0 or v_price < 0 or v_quantity > 99999 or v_price > 9999999
       or (v_kind='part' and (v_product_id is null or v_quantity <> trunc(v_quantity)))
       or (v_kind='labor' and v_product_id is not null) then
      raise exception using errcode='22023',message='Check each part or labor description, quantity, and price.';
    end if;
    if v_kind='part' and not exists (select 1 from catalog.products where id=v_product_id and is_active) then
      raise exception using errcode='22023',message='An actual part is no longer available in the catalog.';
    end if;
    insert into operations.service_work_lines(service_order_id,kind,product_id,description,quantity,unit_price,recorded_by)
    values(p_order_id,v_kind,v_product_id,v_description,v_quantity,v_price,p_actor);
  end loop;
  insert into operations.service_work_state(service_order_id,stage)
  values(p_order_id,case when v_order.status='in_progress' then 'in_progress' else 'intake' end)
  on conflict(service_order_id) do nothing;
  update operations.service_work_state set customer_approval_note=null,
    customer_approval_recorded_by=null,customer_approval_recorded_at=null,updated_at=now()
  where service_order_id=p_order_id;
  insert into operations.service_work_events(service_order_id,event_type,note,actor_user_id)
  values(p_order_id,'lines_updated','Actual parts and labor updated.',p_actor);
  return jsonb_build_object('lineCount',jsonb_array_length(p_lines));
end;
$$;

create or replace function public.limen_finalize_service_order(
  p_order_id uuid, p_actor uuid, p_payment_method text,
  p_cash_received numeric, p_payment_reference text,
  p_payment_verified boolean
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, operations, public
as $$
declare
  v_order operations.service_orders%rowtype;
  v_state operations.service_work_state%rowtype;
  v_sale_id uuid;
  v_sale_total numeric(12,2);
  v_reference text;
  v_items jsonb;
  v_total numeric(12,2);
  v_payload jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501',message='Service billing is server-managed.';
  end if;
  perform operations.assert_workshop_staff(p_actor);
  perform pg_advisory_xact_lock(hashtextextended(p_order_id::text, 9482));
  select * into v_order from operations.service_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='Service order not found.'; end if;
  v_reference := 'SERVICE-' || coalesce(v_order.order_number,p_order_id::text);
  select id,total_amount into v_sale_id,v_sale_total from operations.sales_transactions
  where original_reference=v_reference order by created_at limit 1 for update;
  if v_sale_id is not null then
    update operations.service_orders set status='completed',payment_status='paid',
      total_amount=v_sale_total,completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=p_order_id;
    insert into operations.service_work_state(service_order_id,stage) values(p_order_id,'released')
      on conflict(service_order_id) do update set stage='released',updated_at=now();
    perform public.finish_mechanic_assignment(p_order_id,p_actor,'completed');
    return jsonb_build_object('saleId',v_sale_id,'total',v_sale_total,'saleCreated',false);
  end if;
  if v_order.status in ('completed','cancelled') then
    raise exception using errcode='22023',message='This service order cannot be posted to Sales.';
  end if;
  select * into v_state from operations.service_work_state where service_order_id=p_order_id for update;
  if not found or v_state.stage <> 'work_completed' or v_state.work_completed_at is null then
    raise exception using errcode='22023',message='Mark the repair work complete before collecting payment.';
  end if;
  if p_payment_verified is distinct from true then
    raise exception using errcode='22023',message='Confirm that payment was actually received before posting.';
  end if;
  if p_payment_method not in ('cash','gcash','bank_transfer') then
    raise exception using errcode='22023',message='Choose Cash, GCash, or Bank Transfer.';
  end if;
  if p_payment_method <> 'cash' and nullif(btrim(coalesce(p_payment_reference,'')),'') is null then
    raise exception using errcode='22023',message='Enter the verified payment reference.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineType',case when kind='part' then 'product' else 'service' end,
    'productId',product_id,'displayName',description,'quantity',quantity,
    'unitPrice',unit_price,'lineTotal',line_total) order by created_at,id),'[]'::jsonb),
    round(coalesce(sum(line_total),0),2)
  into v_items,v_total from operations.service_work_lines where service_order_id=p_order_id;
  if jsonb_array_length(v_items)=0 then
    raise exception using errcode='22023',message='Add the actual parts or labor before billing. Intake estimates are not final charges.';
  end if;
  if v_total > coalesce(v_order.total_amount,0) + 0.01
     and v_state.customer_approval_note is null then
    raise exception using errcode='22023',message='Actual charges exceed the estimate. Record the customer approval before posting.';
  end if;
  if p_payment_method='cash' and coalesce(p_cash_received,0) < v_total then
    raise exception using errcode='22023',message='Cash received is less than the final amount.';
  end if;
  v_payload := jsonb_build_object(
    'customerName',coalesce((select name from operations.customers where id=v_order.customer_id),'Walk-in Customer'),
    'paymentMethod',p_payment_method,
    'cashReceived',case when p_payment_method='cash' then round(p_cash_received,2) else 0 end,
    'changeDue',case when p_payment_method='cash' then round(p_cash_received-v_total,2) else 0 end,
    'discountPercent',0,
    'totals',jsonb_build_object('rawSubtotal',v_total,'discountAmount',0,'tax',0,'total',v_total),
    'items',v_items);
  v_sale_id := public.create_service_order_sale(v_payload,p_actor,v_reference);
  update operations.service_orders set status='completed',payment_status='paid',payment_method=p_payment_method,
    subtotal=v_total,tax_total=0,total_amount=v_total,completed_at=now(),updated_at=now()
  where id=p_order_id;
  update operations.service_work_state set stage='released',
    payment_reference=nullif(btrim(coalesce(p_payment_reference,'')),''),
    payment_verified_by=p_actor,payment_verified_at=now(),updated_at=now()
  where service_order_id=p_order_id;
  perform public.finish_mechanic_assignment(p_order_id,p_actor,'completed');
  insert into operations.service_work_events(service_order_id,event_type,note,actor_user_id)
  values(p_order_id,'payment_posted','Payment verified and posted to Sales.',p_actor);
  return jsonb_build_object('saleId',v_sale_id,'total',v_total,'saleCreated',true);
end;
$$;

revoke all on function public.limen_record_service_work_event(uuid,uuid,text,text),
  public.limen_replace_service_work_lines(uuid,uuid,jsonb),
  public.limen_finalize_service_order(uuid,uuid,text,numeric,text,boolean) from public, anon, authenticated;
grant execute on function public.limen_record_service_work_event(uuid,uuid,text,text),
  public.limen_replace_service_work_lines(uuid,uuid,jsonb),
  public.limen_finalize_service_order(uuid,uuid,text,numeric,text,boolean) to service_role;
