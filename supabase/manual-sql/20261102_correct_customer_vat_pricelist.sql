-- Owner-approved correction for the supplied October customer workbook only.
-- All 35,622 source rows were reconciled to 35,613 existing canonical SKUs.
-- Source Price List!I = Sheet1!J * 1.12 was checked on every row, not inferred.
-- No multiplication is permitted unless the complete current net-price hash matches.
begin;
set local lock_timeout='5s';
do $correction$
declare
 v catalog.pricelist_versions%rowtype;
 fingerprint text; proposed text; payload jsonb; result jsonb; new_id uuid;
 stock_before text; stock_after text; sales_before bigint; movements_before bigint;
begin
 perform pg_advisory_xact_lock(73841590214631::bigint);
 select * into strict v from catalog.pricelist_versions where price_type='retail' and is_active;
 if v.source_filename is distinct from 'Price List_October 1, 2026_For Customer.xlsx' or v.row_count<>35613 then
   raise exception 'The active source list changed. Reconcile the workbook again before proceeding.';
 end if;
 select md5(string_agg(sku||':'||price::numeric(14,2)::text,'|' order by sku collate "C"))
 into fingerprint from catalog.pricelist_version_items where pricelist_version_id=v.id;
 if fingerprint='74b373dd26dda83ab2bcd192cca55ade' then
   raise notice 'The verified VAT-inclusive list is already active.'; return;
 end if;
 if fingerprint<>'1628d76ddc566a9538440a897c3d21eb' then raise exception 'Pre-VAT source fingerprint mismatch. No prices changed.'; end if;
 select md5(string_agg(sku||':'||round(price*1.12,2)::numeric(14,2)::text,'|' order by sku collate "C"))
 into proposed from catalog.pricelist_version_items where pricelist_version_id=v.id;
 if proposed<>'74b373dd26dda83ab2bcd192cca55ade' then raise exception 'VAT-inclusive workbook fingerprint mismatch.'; end if;
 create temporary table _vat_product_state on commit drop as select p.id,p.is_active,p.status from catalog.products p join catalog.pricelist_version_items i on i.product_id=p.id where i.pricelist_version_id=v.id;
 select md5(string_agg(product_id::text||':'||on_hand::text||':'||reserved::text,'|' order by product_id))
 into stock_before from catalog.inventory_balances;
 select count(*) into sales_before from operations.sales_transactions;
 select count(*) into movements_before from catalog.inventory_movements;
 select jsonb_agg(jsonb_build_object('sku',sku,'name',name,'model',model_name,'uom',uom,'pcc',pcc,
   'price',round(price*1.12,2),'status',status,'category',category,'sourceCategory',source_category,
   'classificationVersion',classification_version,'classificationConfidence',classification_confidence,
   'classificationStrategy',classification_strategy,'classificationRuleKey',classification_rule_key,
   'classificationTokens',classification_tokens) order by source_line_number,sku)
 into payload from catalog.pricelist_version_items where pricelist_version_id=v.id;
 -- System maintenance actor is null; do not impersonate the previous uploader.
 result:=public.import_retail_pricelist_version(payload,v.version_year,v.effective_from,v.source_filename,true,null);
 new_id:=(result->>'versionId')::uuid;
 if new_id is null or new_id=v.id then raise exception 'The correction must create a separate audit revision.'; end if;
 update catalog.products p set is_active=s.is_active,status=s.status from _vat_product_state s where p.id=s.id and (p.is_active,p.status) is distinct from (s.is_active,s.status);
 update catalog.pricelist_versions set notes=concat_ws(E'\n',notes,'Owner-approved VAT-inclusive correction. Source: Price List worksheet, SRP with VAT. Full canonical price fingerprint 74b373dd26dda83ab2bcd192cca55ade. No stock or sales adjustments.')
 where id=new_id;
 select md5(string_agg(sku||':'||price::numeric(14,2)::text,'|' order by sku collate "C"))
 into fingerprint from catalog.pricelist_version_items where pricelist_version_id=new_id;
 if fingerprint<>'74b373dd26dda83ab2bcd192cca55ade' then raise exception 'Saved customer price verification failed.'; end if;
 select md5(string_agg(product_id::text||':'||on_hand::text||':'||reserved::text,'|' order by product_id))
 into stock_after from catalog.inventory_balances;
 if stock_before is distinct from stock_after or (select count(*) from operations.sales_transactions)<>sales_before
    or (select count(*) from catalog.inventory_movements)<>movements_before then
   raise exception 'The price-only correction attempted to alter stock or sales. Rolled back.';
 end if;
end;
$correction$;
commit;

