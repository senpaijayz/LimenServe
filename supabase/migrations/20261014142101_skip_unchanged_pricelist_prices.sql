-- Yearly list snapshots retain membership. Selling-price history records only
-- new/changed prices, never a duplicate amount just because a list is activated.
create or replace function catalog.sync_retail_pricelist_prices(p_version_id uuid, p_effective_from date)
returns jsonb language plpgsql security invoker
set search_path = ''
as $function$
declare
  written integer := 0;
  unchanged integer := 0;
  retired integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(73841590214631::bigint);
  select count(*) into unchanged
  from catalog.pricelist_version_items i
  join catalog.product_prices p on p.product_id = i.product_id
    and p.price_type = 'retail' and p.is_current
    and p.amount = i.price and p.currency = 'PHP'
  where i.pricelist_version_id = p_version_id;

  -- Retire changed or omitted prices, preserving the existing missing-part
  -- behavior. An omitted product itself is never deleted or archived here.
  update catalog.product_prices p
  set is_current = false, effective_to = p_effective_from, updated_at = now()
  where p.price_type = 'retail' and p.is_current
    and not exists (
      select 1 from catalog.pricelist_version_items i
      where i.pricelist_version_id = p_version_id and i.product_id = p.product_id
        and i.price = p.amount and p.currency = 'PHP'
    );
  get diagnostics retired = row_count;

  insert into catalog.product_prices (
    product_id, price_type, amount, currency, effective_from,
    effective_to, is_current, business_date, updated_at
  )
  select i.product_id, 'retail', i.price, 'PHP', p_effective_from,
    null, true, p_effective_from, now()
  from catalog.pricelist_version_items i
  where i.pricelist_version_id = p_version_id and i.product_id is not null
    and not exists (
      select 1 from catalog.product_prices p
      where p.product_id = i.product_id and p.price_type = 'retail'
        and p.is_current and p.amount = i.price and p.currency = 'PHP'
    );
  get diagnostics written = row_count;
  return jsonb_build_object('priceRowsWritten', written, 'unchangedCount', unchanged,
    'retiredPriceCount', retired, 'noPriceChanges', written = 0);
end;
$function$;
revoke all on function catalog.sync_retail_pricelist_prices(uuid,date) from public, anon, authenticated;
grant execute on function catalog.sync_retail_pricelist_prices(uuid,date) to service_role;

-- Patch the installed RPCs rather than replacing their validation, revision,
-- classification, advisory lock, stock initialization, or authorization rules.
do $migration$
declare
  original text;
  revised text;
  old_block text;
begin
  original := pg_get_functiondef('public.import_retail_pricelist_version(jsonb,integer,date,text,boolean,uuid)'::regprocedure);
  old_block := $old$      update catalog.product_prices
      set is_current = false, effective_to = p_effective_from, updated_at = v_now
      where price_type = 'retail' and is_current = true;

      insert into catalog.product_prices (
        product_id, price_type, amount, currency, effective_from,
        effective_to, is_current, business_date, updated_at
      )
      select product.id, 'retail', item.price, 'PHP', p_effective_from,
             null, true, p_effective_from, v_now
      from catalog.pricelist_version_items item
      join catalog.products product on product.id = item.product_id
      where item.pricelist_version_id = v_version_id;$old$;
  revised := replace(original, old_block,
    '      v_price_result := catalog.sync_retail_pricelist_prices(v_version_id, p_effective_from);');
  if revised = original then
    raise exception 'Unexpected import price-write block; migration stopped safely';
  end if;
  revised := replace(revised, '  v_version_id uuid;', '  v_version_id uuid;' || E'\n  v_price_result jsonb;');
  revised := replace(revised, '''changedCount'', v_changed_count + v_added_count,',
    '''changedCount'', coalesce((v_price_result->>''priceRowsWritten'')::integer, v_changed_count + v_added_count),');
  revised := replace(revised, '''unchangedCount'', v_unchanged_count,',
    '''unchangedCount'', coalesce((v_price_result->>''unchangedCount'')::integer, v_unchanged_count),');
  revised := replace(revised, '''newProductsCount'', v_added_count,', '''newProductsCount'', v_new_products_count,');
  revised := replace(revised, '''stockRowsCreated'', v_stock_rows_created,',
    $new$'stockRowsCreated', v_stock_rows_created,
    'priceRowsWritten', coalesce((v_price_result->>'priceRowsWritten')::integer, 0),
    'noPriceChanges', coalesce((v_price_result->>'noPriceChanges')::boolean, v_changed_count + v_added_count = 0),
    'versionSaved', true,$new$);

  -- Re-uploading the identical active list for the same year/date is a no-op,
  -- including the yearly snapshot. A new year/date still gets its own snapshot.
  revised := replace(revised, '  insert into catalog.pricelist_versions (', $noop$
  if p_activate and v_previous_version_id is not null
    and exists (select 1 from catalog.pricelist_versions v
      where v.id = v_previous_version_id and v.version_year = p_version_year
        and v.effective_from = p_effective_from)
    and not exists (
      select 1 from _retail_pricelist_version_items i
      full join (select * from catalog.pricelist_version_items
        where pricelist_version_id = v_previous_version_id) previous using (sku)
      where i.sku is null or previous.sku is null
        or row(i.name,i.model_name,i.uom,i.pcc,i.price,i.status,i.category,i.source_category,
          i.classification_version,i.classification_confidence,i.classification_strategy,
          i.classification_rule_key,i.classification_tokens)
          is distinct from row(previous.name,previous.model_name,previous.uom,previous.pcc,
            previous.price,previous.status,previous.category,previous.source_category,
            previous.classification_version,previous.classification_confidence,
            previous.classification_strategy,previous.classification_rule_key,previous.classification_tokens)
    ) and not exists (
      select 1 from _retail_pricelist_version_items i
      left join catalog.products product on product.sku = i.sku
      left join catalog.product_prices price on price.product_id = product.id
        and price.price_type = 'retail' and price.is_current
      where product.id is null or product.is_active is not true
        or price.amount is distinct from i.price or price.currency is distinct from 'PHP'
    ) then
    return jsonb_build_object('versionId',v_previous_version_id,'versionYear',p_version_year,
      'effectiveFrom',p_effective_from,'status','published','isActive',true,
      'receivedCount',v_received_count,'uniqueCount',v_unique_count,'updatedCount',0,
      'changedCount',0,'unchangedCount',v_unique_count,'newProductsCount',0,
      'archivedProductsCount',0,'removedFromListCount',0,'priceIncreaseCount',0,
      'priceDecreaseCount',0,'stockRowsCreated',0,'skippedCount',0,'skippedItems','[]'::jsonb,
      'priceChangesTotalCount',0,'priceChanges','[]'::jsonb,'priceRowsWritten',0,
      'noPriceChanges',true,'versionSaved',false,'noOp',true);
  end if;

  insert into catalog.pricelist_versions ($noop$);
  execute revised;

  original := pg_get_functiondef('public.activate_retail_pricelist_version(uuid,uuid)'::regprocedure);
  old_block := $old$  update catalog.product_prices
  set is_current = false, effective_to = v_version.effective_from, updated_at = v_now
  where price_type = 'retail' and is_current = true;

  insert into catalog.product_prices (
    product_id, price_type, amount, currency, effective_from, effective_to,
    is_current, business_date, updated_at
  )
  select item.product_id, 'retail', item.price, 'PHP', v_version.effective_from,
    null, true, v_version.effective_from, v_now
  from catalog.pricelist_version_items item
  where item.pricelist_version_id = p_version_id and item.product_id is not null;$old$;
  revised := replace(original, old_block,
    '  v_price_result := catalog.sync_retail_pricelist_prices(p_version_id, v_version.effective_from);');
  if revised = original then
    raise exception 'Unexpected activation price-write block; migration stopped safely';
  end if;
  revised := replace(revised, '  v_version catalog.pricelist_versions%rowtype;',
    '  v_version catalog.pricelist_versions%rowtype;' || E'\n  v_price_result jsonb;');
  revised := replace(revised, '''itemCount'', v_version.row_count',
    '''itemCount'', v_version.row_count, ''priceRowsWritten'', (v_price_result->>''priceRowsWritten'')::integer, ''unchangedCount'', (v_price_result->>''unchangedCount'')::integer, ''noPriceChanges'', (v_price_result->>''noPriceChanges'')::boolean');
  execute revised;
end;
$migration$;
