-- Inventory-only adjustments and receipts should not keep an unused product
-- forever. Sales and operational records remain protected by the blockers
-- below; supplier invoice lines retain their original text and amounts.
create or replace function private.catalog_product_delete_blockers(p_product_id uuid)
returns text[] language sql stable security definer set search_path = ''
as $function$
select pg_catalog.array_remove(array[
  case when exists (select 1 from catalog.inventory_balances where product_id=p_product_id and (on_hand<>0 or reserved<>0)) then 'stock or reserved quantities' end,
  case when exists (select 1 from operations.part_reservations where product_id=p_product_id) then 'reservation history' end,
  case when exists (select 1 from operations.sales_transaction_items where product_id=p_product_id)
    or exists (select 1 from catalog.inventory_movements where product_id=p_product_id and (movement_type='sale' or reference_type='sales_transaction')) then 'sales history' end,
  case when exists (select 1 from operations.estimate_items where product_id=p_product_id) then 'quotations' end,
  case when exists (select 1 from operations.service_order_items where product_id=p_product_id) then 'service orders' end,
  case when exists (select 1 from stockroom.item_locations where item_id=p_product_id and is_active)
    or exists (select 1 from public.product_locations where product_id=p_product_id) then 'assigned stockroom locations' end,
  case when exists (select 1 from cms.featured_catalog_items where product_id=p_product_id)
    or exists (select 1 from cms.recommendation_package_items where product_id=p_product_id)
    or exists (select 1 from cms.recommendation_packages where anchor_product_id=p_product_id)
    or exists (select 1 from reco.product_recommendation_package_items where product_id=p_product_id)
    or exists (select 1 from reco.product_recommendation_packages where anchor_product_id=p_product_id)
    or exists (select 1 from reco.quote_recommendation_rules where anchor_product_id=p_product_id or related_product_id=p_product_id) then 'configured product recommendations' end,
  case when exists (select 1 from catalog.ocr_scan_items where product_id=p_product_id)
    or exists (select 1 from catalog.ocr_pending_products where approved_product_id=p_product_id)
    or exists (select 1 from reco.upsell_interactions where product_id=p_product_id or recommended_product_id=p_product_id) then 'linked processing history' end
]::text[], null);
$function$;
revoke all on function private.catalog_product_delete_blockers(uuid) from public, anon, authenticated;

-- Preserve the supplier invoice's immutable item snapshot if the catalog
-- product is removed. Inventory movements and per-product receiving logs
-- keep their existing ON DELETE CASCADE behavior.
alter table catalog.stock_receipt_items alter column product_id drop not null;
do $migration$
declare v_product_att smallint; v_constraint record;
begin
  select attnum into v_product_att
  from pg_catalog.pg_attribute
  where attrelid='catalog.stock_receipt_items'::regclass
    and attname='product_id' and not attisdropped;

  for v_constraint in
    select conname
    from pg_catalog.pg_constraint
    where conrelid='catalog.stock_receipt_items'::regclass
      and confrelid='catalog.products'::regclass
      and contype='f'
      and conkey=array[v_product_att]::smallint[]
  loop
    execute pg_catalog.format('alter table catalog.stock_receipt_items drop constraint %I', v_constraint.conname);
  end loop;

  alter table catalog.stock_receipt_items
    add constraint stock_receipt_items_product_id_fkey
    foreign key (product_id) references catalog.products(id) on delete set null;
end;
$migration$;
