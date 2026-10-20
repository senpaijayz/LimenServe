-- Keep the existing receivers and their lock/audit semantics, but allow a null
-- supplier. No supplier rows or business records are created by this migration.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.receive_catalog_stock(jsonb,uuid,text)'::regprocedure);
  if position('Supplier name is required.' in definition) = 0 then
    raise exception 'Receiving function changed; review optional-supplier patch';
  end if;
  definition := replace(definition, E'else\n    if v_supplier_name is null then\n      raise exception using errcode = ''22023'', message = ''Supplier name is required.'';\n    end if;', 'elsif v_supplier_name is not null then');
  definition := replace(definition, 'values (v_product_id, v_supplier_id)', 'select v_product_id, v_supplier_id where v_supplier_id is not null');
  if position('Supplier name is required.' in definition)>0 or position('select v_product_id, v_supplier_id where v_supplier_id is not null' in definition)=0 then
    raise exception 'Manual receiver patch did not match; no changes applied';
  end if;
  execute definition;

  definition := pg_get_functiondef('public.receive_supplier_invoice_stock_idempotent(jsonb,uuid,text,boolean)'::regprocedure);
  definition := replace(definition, E'  if v_supplier_name is null then\n    raise exception using errcode = ''22023'', message = ''Supplier name is required.'';\n  end if;', '');
  definition := replace(definition, 'if v_supplier_id is null then', 'if v_supplier_id is null and v_supplier_name is not null then');
  definition := replace(definition, E'  else\n    perform supplier.id', E'  elsif v_supplier_id is not null then\n    perform supplier.id');
  if position('Supplier name is required.' in definition)>0 or position('if v_supplier_id is null and v_supplier_name is not null then' in definition)=0 then
    raise exception 'Invoice wrapper patch did not match; no changes applied';
  end if;
  execute definition;

  definition := pg_get_functiondef('catalog.receive_supplier_invoice_stock(jsonb,uuid)'::regprocedure);
  definition := replace(definition, $old$v_supplier_id := nullif(p_invoice ->> 'supplierId', '')::uuid;$old$,
    $new$v_supplier_id := nullif(p_invoice ->> 'supplierId', '')::uuid;
  if v_supplier_id is not null then
    select coalesce(v_supplier_name,s.name) into v_supplier_name from catalog.suppliers s where s.id=v_supplier_id;
    if not found then raise exception using errcode='P0002',message='Supplier was not found.'; end if;
  end if;$new$);
  definition := replace(definition, E'  if v_supplier_name is null then\n    raise exception ''Supplier name is required.'';\n  end if;', '');
  definition := replace(definition, 'if v_supplier_id is null then', 'if v_supplier_id is null and v_supplier_name is not null then');
  definition := replace(definition, E'    v_supplier_id,\n    v_supplier_name,\n    v_invoice_number,', E'    v_supplier_id,\n    coalesce(v_supplier_name, ''Not provided''),\n    v_invoice_number,');
  definition := replace(definition, 'values (v_product_id, v_supplier_id)', 'select v_product_id, v_supplier_id where v_supplier_id is not null');
  definition := replace(definition, $old$'lastSupplierId', v_supplier_id,$old$, $new$'lastSupplierId', coalesce(to_jsonb(v_supplier_id),catalog.products.metadata->'lastSupplierId'),$new$);
  definition := replace(definition, $old$'lastSupplierName', v_supplier_name,$old$, $new$'lastSupplierName', coalesce(to_jsonb(v_supplier_name),catalog.products.metadata->'lastSupplierName'),$new$);
  if position('Supplier name is required.' in definition)>0 or position('coalesce(v_supplier_name, ''Not provided'')' in definition)=0 or position('select v_product_id, v_supplier_id where v_supplier_id is not null' in definition)=0 then
    raise exception 'Invoice receiver patch did not match; no changes applied';
  end if;
  execute definition;
end;
$migration$;

create or replace function public.receive_catalog_stock_batch(p_payload jsonb, p_performed_by uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  request_id uuid;
  stored jsonb;
  response jsonb;
  normalized jsonb;
  lines jsonb;
  line jsonb;
  result jsonb;
  results jsonb := '[]'::jsonb;
  lock_key bigint;
  receipt_key text := 'batch:' || btrim(coalesce(p_idempotency_key, ''));
  reference text;
  units numeric := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or jsonb_typeof(p_payload->'items') is distinct from 'array' then
    raise exception using errcode='22023', message='STOCK_RECEIPT_INVALID: Add products to receive.';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    or jsonb_array_length(p_payload->'items') not between 1 and 100 then
    raise exception using errcode='22023', message='STOCK_RECEIPT_INVALID: Receive 1–100 products with a valid request identity.';
  end if;
  for line in select value from jsonb_array_elements(p_payload->'items') loop
    if nullif(line->>'productId','') is null or nullif(line->>'quantity','') is null
      or (line->>'quantity')::numeric <= 0 or (line->>'quantity')::numeric > 1000000
      or (line->>'quantity')::numeric <> trunc((line->>'quantity')::numeric) then
      raise exception using errcode='22023', message='STOCK_RECEIPT_INVALID: Use whole-number quantities from 1 to 1,000,000.';
    end if;
  end loop;
  select jsonb_agg(jsonb_build_object('productId', id, 'quantity', quantity) order by id) into lines
  from (select (value->>'productId')::uuid id, sum((value->>'quantity')::numeric) quantity
    from jsonb_array_elements(p_payload->'items') group by (value->>'productId')::uuid) grouped;
  normalized := (p_payload - 'items') || jsonb_build_object('items',lines,'performedBy',p_performed_by);
  if exists(select 1 from jsonb_array_elements(lines) x where (x->>'quantity')::numeric > 1000000) then
    raise exception using errcode='22023',message='STOCK_RECEIPT_INVALID: Combined quantity exceeds 1,000,000.';
  end if;
  insert into catalog.stock_receipt_idempotency(operation,idempotency_key,request_payload,performed_by)
    values('catalog_stock_receive',receipt_key,normalized,p_performed_by)
    on conflict(operation,idempotency_key) do nothing returning id into request_id;
  if request_id is null then
    select request_payload,completed_response into stored,response from catalog.stock_receipt_idempotency
      where operation='catalog_stock_receive' and idempotency_key=receipt_key for update;
    if stored is distinct from normalized then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REUSED'; end if;
    if response is null then raise exception using errcode='55000',message='Receipt is not confirmed.'; end if;
    return response || jsonb_build_object('idempotentReplay',true);
  end if;
  -- Take all logical locks, then all product row locks, in the same order as
  -- invoice receiving. Every nested receipt runs in this one SQL transaction.
  for lock_key in select distinct private.catalog_stock_receipt_product_lock_key(p.sku) k
    from catalog.products p join jsonb_array_elements(lines) x on p.id=(x->>'productId')::uuid order by k
  loop perform pg_advisory_xact_lock(lock_key); end loop;
  perform p.id from catalog.products p join jsonb_array_elements(lines) x on p.id=(x->>'productId')::uuid order by p.id for update of p;
  reference := coalesce(nullif(btrim(p_payload->>'referenceNumber'),''),'RCV-' || request_id::text);
  for line in select value from jsonb_array_elements(lines) loop
    result := public.receive_catalog_stock((p_payload - 'items') || line || jsonb_build_object('referenceNumber',reference),p_performed_by,'line:' || p_idempotency_key || ':' || (line->>'productId'));
    results := results || jsonb_build_array(jsonb_build_object('productId',line->>'productId','partNumber',result#>>'{product,sku}','description',result#>>'{product,name}','quantity',line->'quantity','previousStock',result->'previousStock','updatedStock',result->'updatedStock','movementId',result#>>'{movement,id}'));
    units := units + (line->>'quantity')::numeric;
  end loop;
  response := jsonb_build_object('receiptId',request_id,'referenceNumber',reference,'items',results,'totalLines',jsonb_array_length(lines),'totalQuantity',units,'idempotentReplay',false);
  update catalog.stock_receipt_idempotency set completed_response=response,completed_at=now(),updated_at=now() where id=request_id;
  return response;
end;
$$;
revoke all on function public.receive_catalog_stock_batch(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.receive_catalog_stock_batch(jsonb,uuid,text) to service_role;

create or replace function public.get_inventory_movement_page(p_limit integer default 50,p_page integer default 1,p_search text default '',p_type text default 'all',p_start_date date default null,p_end_date date default null)
returns jsonb language sql stable security definer set search_path='' as $$
  with filtered as materialized (
    select m.id,m.product_id,p.sku,p.name,p.category,m.movement_type,
      case when m.movement_type in ('sale','stock_out','service_usage') then -abs(m.quantity) else m.quantity end as delta,
      m.reference_type,m.reference_id,m.notes,m.business_date,m.created_at,
      coalesce(u.full_name,u.email,'System') as employee,
      coalesce(l.previous_stock,(i.metadata->>'previousStock')::numeric) as previous_stock,
      coalesce(l.updated_stock,(i.metadata->>'updatedStock')::numeric) as new_stock,
      coalesce(s.name,r.supplier_name_snapshot) as supplier,
      coalesce(l.reference_number,r.invoice_number,m.reference_id::text) as reference
    from catalog.inventory_movements m
    left join catalog.products p on p.id=m.product_id
    left join core.user_profiles u on u.user_id=m.performed_by
    left join catalog.stock_receiving_logs l on l.movement_id=m.id
    left join catalog.stock_receipt_items i on i.movement_id=m.id
    left join catalog.stock_receipts r on r.id=i.receipt_id
    left join catalog.suppliers s on s.id=l.supplier_id
    where m.movement_type <> 'reservation'
      and (coalesce(p_type,'all')='all' or m.movement_type=p_type)
      and (p_start_date is null or m.business_date>=p_start_date)
      and (p_end_date is null or m.business_date<=p_end_date)
      and (coalesce(btrim(p_search),'')='' or concat_ws(' ',p.sku,p.name,u.full_name,u.email,l.reference_number,r.invoice_number,m.notes,s.name,r.supplier_name_snapshot) ilike '%' || left(p_search,180) || '%')
  ), page as (
    select * from filtered order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,50),500)) offset (greatest(1,coalesce(p_page,1))-1)*greatest(1,least(coalesce(p_limit,50),500))
  ) select jsonb_build_object('movements',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'productId',product_id,'sku',sku,'productName',coalesce(name,'Unknown product'),'category',category,'movementType',movement_type,'quantity',delta,'previousStock',previous_stock,'newStock',new_stock,'supplierName',supplier,'referenceNumber',reference,'referenceType',reference_type,'referenceId',reference_id,'notes',notes,'performedBy',employee,'businessDate',business_date,'createdAt',created_at
  ) order by created_at desc,id desc) from page),'[]'::jsonb),'totalCount',(select count(*) from filtered),'page',greatest(1,coalesce(p_page,1)),'pageSize',greatest(1,least(coalesce(p_limit,50),500)));
$$;
revoke all on function public.get_inventory_movement_page(integer,integer,text,text,date,date) from public,anon,authenticated;
grant execute on function public.get_inventory_movement_page(integer,integer,text,text,date,date) to service_role;

-- Restore geometry while retaining current product mappings. The existing
-- hierarchy validator rejects a historical design that cannot hold them.
do $migration$
declare original text; revised text;
begin
  original := pg_get_functiondef('public.limen_locator_command(text,jsonb,uuid)'::regprocedure);
  revised := replace(original,
    $old$objects := history_snapshot#>'{metadata,scene,objects}'; locations := coalesce(history_snapshot#>'{metadata,locations}','[]');$old$,
    $new$objects := history_snapshot#>'{metadata,scene,objects}'; -- Preserve current locations when restoring geometry.$new$);
  if revised=original then raise exception 'Locator restore body changed; review assignment preservation before applying'; end if;
  execute revised;
end;
$migration$;
notify pgrst,'reload schema';
