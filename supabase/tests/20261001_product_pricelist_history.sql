begin;
do $test$
declare
  test_sku text := upper('HISTORY-TEST-' || gen_random_uuid());
  first_upload jsonb; second_upload jsonb; test_product_id uuid; history jsonb;
  current_price numeric; before_stock numeric; after_stock numeric;
begin
  -- Draft uploads do not alter the live pricelist. All fixtures roll back.
  first_upload := public.import_retail_pricelist_version(jsonb_build_array(jsonb_build_object('sku',test_sku,'name','History test','price',100)),2001,'2001-01-01','test-first.xlsx',false);
  select p.id into test_product_id from catalog.products p where p.sku=test_sku;
  select b.on_hand into before_stock from catalog.inventory_balances b where b.product_id=test_product_id;
  drop table pg_temp._retail_pricelist_version_raw,pg_temp._retail_pricelist_version_items,
    pg_temp._retail_pricelist_previous_prices,pg_temp._retail_pricelist_changes;
  second_upload := public.import_retail_pricelist_version(jsonb_build_array(jsonb_build_object('sku',test_sku,'name','History test','price',80)),2001,'2001-01-01','test-second.xlsx',false);
  if first_upload->>'versionId' = second_upload->>'versionId' then raise exception 'Replacement overwrote its original snapshot'; end if;
  history := public.limen_product_price_history(test_product_id);
  if not exists (select 1 from jsonb_array_elements(history->'versions') e where e->>'revision'='2' and (e->>'price')::numeric=80 and (e->>'previousPrice')::numeric=100 and e->>'change'='decrease') then
    raise exception 'Same-date revision or previous price missing: %',history;
  end if;
  if (select price from catalog.pricelist_version_items where pricelist_version_id=(first_upload->>'versionId')::uuid) <> 100 then raise exception 'Original price changed'; end if;
  select b.on_hand into after_stock from catalog.inventory_balances b where b.product_id=test_product_id;
  if before_stock is distinct from after_stock then raise exception 'Pricelist changed stock quantities'; end if;
  if exists(select 1 from catalog.product_prices where product_id=test_product_id and is_current) then raise exception 'Draft changed live selling price'; end if;
  insert into catalog.product_prices(product_id,price_type,amount,currency,effective_from,is_current,business_date)
    values(test_product_id,'retail',80,'PHP','2001-01-01',true,'2001-01-01');
  begin
    perform public.create_pos_sale(jsonb_build_object('items',jsonb_build_array(jsonb_build_object('lineType','product','productId',test_product_id,'quantity',1,'unitPrice',100))));
    raise exception 'Stale price was accepted';
  exception when sqlstate 'PT409' then null; end;
  history := public.limen_current_retail_prices(array[test_product_id]);
  if (history->0->>'price')::numeric<>80 or not (history->0->>'available')::boolean then raise exception 'POS quote disagrees with current price'; end if;
  perform public.limen_set_retail_price(test_product_id,95,'2001-01-01');
  perform public.limen_set_retail_price(test_product_id,70,'2001-01-01');
  perform public.limen_set_retail_price(test_product_id,70,'2001-01-01');
  if (select count(*) from catalog.product_prices where product_id=test_product_id) <> 3 then raise exception 'Same-day prices overwritten or unchanged price duplicated'; end if;
  if (select amount from catalog.product_prices where product_id=test_product_id and is_current) <> 70 then raise exception 'Manual price not activated'; end if;
  if has_function_privilege('authenticated','public.limen_product_price_history(uuid)','execute')
    or has_function_privilege('anon','public.limen_current_retail_prices(uuid[])','execute')
    or has_function_privilege('authenticated','public.create_pos_sale(jsonb,uuid)','execute') then raise exception 'RPC permissions widened'; end if;
end $test$;
rollback;
