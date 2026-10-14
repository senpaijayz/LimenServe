-- Archive/restore audit entries alone do not mean a product has been used.
-- Keep transactional history and configured references protected.
create or replace function private.catalog_product_delete_blockers(p_product_id uuid)
returns text[] language sql stable security definer set search_path = ''
as $function$
select pg_catalog.array_remove(array[
  case when exists (select 1 from catalog.inventory_balances where product_id=p_product_id and (on_hand<>0 or reserved<>0)) then 'stock or reserved quantities' end,
  case when exists (select 1 from operations.part_reservations where product_id=p_product_id) then 'reservation history' end,
  case when exists (select 1 from operations.sales_transaction_items where product_id=p_product_id) then 'sales history' end,
  case when exists (select 1 from operations.estimate_items where product_id=p_product_id) then 'quotations' end,
  case when exists (select 1 from operations.service_order_items where product_id=p_product_id) then 'service orders' end,
  case when exists (select 1 from catalog.inventory_movements where product_id=p_product_id
    and not (quantity=0 and movement_type='adjustment' and coalesce(reference_type,'') in ('product_archive','product_restore'))) then 'stock movement history' end,
  case when exists (select 1 from catalog.stock_receipt_items where product_id=p_product_id)
    or exists (select 1 from catalog.stock_receiving_logs where product_id=p_product_id) then 'receiving records' end,
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

-- Keep all other linked-record guard branches unchanged.
do $migration$
declare original text; revised text;
begin
  original := pg_catalog.pg_get_functiondef('private.prevent_linked_record_removal()'::regprocedure);
  revised := pg_catalog.regexp_replace(original,
    'in_use := exists \(select 1 from operations\.part_reservations where product_id = old\.id\).*?reason :=',
    'if old.is_active then
       raise exception using errcode = ''23503'', message = ''IN_USE: Archive this product before deleting it.'';
     end if;
     in_use := pg_catalog.cardinality(private.catalog_product_delete_blockers(old.id)) > 0;
     reason :=', 's');
  if revised=original then raise exception 'Unexpected product deletion guard; migration stopped safely.'; end if;
  execute revised;
end;
$migration$;

create or replace function public.delete_archived_catalog_product(
  p_product_id uuid, p_actor_user_id uuid, p_confirm_sku text
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_product catalog.products%rowtype; v_blockers text[];
begin
  perform operations.assert_reservation_admin(p_actor_user_id);
  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);
  -- Match reservation/POS stock-first row locking.
  perform product_id from catalog.inventory_balances where product_id=p_product_id for update;
  select * into v_product from catalog.products where id=p_product_id for update;
  if not found then return pg_catalog.jsonb_build_object('deleted',false,'reason','not_found'); end if;
  if v_product.is_active then
    raise exception using errcode='PT409', message='Archive this product before deleting it.';
  end if;
  if p_confirm_sku is null or pg_catalog.btrim(p_confirm_sku) is distinct from v_product.sku then
    raise exception using errcode='PT409', message='The selected product changed. Refresh Archived Products and confirm its part number again.';
  end if;
  perform product_id from stockroom.items where product_id=p_product_id for update;
  v_blockers := private.catalog_product_delete_blockers(p_product_id);
  if pg_catalog.cardinality(v_blockers)>0 then
    raise exception using errcode='PT409', message='This product cannot be deleted because it has ' || pg_catalog.array_to_string(v_blockers, ', ') || '. Keep it archived to preserve these records.';
  end if;
  -- Cascading FKs remove disposable prices/images/supplier links and empty
  -- inventory metadata. Historical pricelist rows retain their SKU and prices.
  delete from catalog.pricelist_import_staging where sku=v_product.sku;
  delete from catalog.products where id=p_product_id;
  return pg_catalog.jsonb_build_object('deleted',true,'productId',p_product_id,'sku',v_product.sku);
end;
$function$;
revoke all on function public.delete_archived_catalog_product(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.delete_archived_catalog_product(uuid,uuid,text) to service_role;
