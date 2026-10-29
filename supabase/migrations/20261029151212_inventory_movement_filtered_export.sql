-- One read snapshot, at most 10,001 candidates; never return a partial export.
create function public.limen_inventory_movement_export(p_search text default '',p_type text default 'all',p_start_date date default null,p_end_date date default null)
returns jsonb language sql stable security invoker set search_path=''
as $body$
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
    limit 10001
  ), page as (
    select * from filtered order by created_at desc,id desc limit 10000
  ) select jsonb_build_object(
    'generatedAt',now(),'exportLimit',10000,'tooLarge',(select count(*)>10000 from filtered),
    'totalCount',case when (select count(*)>10000 from filtered) then null else (select count(*) from filtered) end,
    'movements',case when (select count(*)>10000 from filtered) then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'productId',product_id,'sku',sku,'productName',coalesce(name,'Unknown product'),'category',category,'movementType',movement_type,'quantity',delta,'previousStock',previous_stock,'newStock',new_stock,'supplierName',supplier,'referenceNumber',reference,'referenceType',reference_type,'referenceId',reference_id,'notes',notes,'performedBy',employee,'businessDate',business_date,'createdAt',created_at
  ) order by created_at desc,id desc) from page),'[]'::jsonb) end);
$body$;
revoke all on function public.limen_inventory_movement_export(text,text,date,date) from public,anon,authenticated;
grant execute on function public.limen_inventory_movement_export(text,text,date,date) to service_role;
