-- Fixture writes and repairs are rolled back; no real layout is modified.
begin;
do $test$
declare
  layout jsonb; objects jsonb; locations jsonb; before_rows jsonb; after_rows jsonb;
  product uuid := gen_random_uuid(); v_layout_id uuid; v_shelf_id uuid;
begin
  insert into catalog.products(id,sku,name) values(product,'PERF-'||product,'Locator performance fixture');
  objects := '[
    {"id":"floor","type":"floor","position":[0,0,0],"dimensions":{"width":24,"depth":16,"height":4.5}},
    {"id":"shelf","type":"shelf","floor":1,"aisle":"A","shelfNumber":1,"layerCount":4,"binCount":8,"position":[0,0,0],"dimensions":{"width":3,"depth":1,"height":3}}
  ]';
  layout := public.limen_locator_command('save',jsonb_build_object('name','Performance fixture '||product,'objects',objects));
  v_layout_id := (layout->>'id')::uuid;
  layout := public.limen_locator_command('assign',jsonb_build_object('layoutId',v_layout_id,'expectedRevision',layout->>'revision',
    'location',jsonb_build_object('productId',product,'shelfObjectId','shelf','layerNumber',4,'binNumber',8)));
  -- Warm canonical assignment metadata once, then verify a repeat performs no
  -- hierarchy updates (ctid changes for UPDATE even in the same transaction).
  locations := private.sync_locator_hierarchy(v_layout_id,objects,layout#>'{metadata,locations}');
  select id into v_shelf_id from stockroom.shelves s where s.layout_id=v_layout_id and code='shelf';
  select jsonb_build_object(
    'floors',(select jsonb_agg(ctid::text order by id) from stockroom.floors f where f.layout_id=v_layout_id),
    'shelves',(select jsonb_agg(ctid::text order by id) from stockroom.shelves s where s.layout_id=v_layout_id),
    'levels',(select jsonb_agg(ctid::text order by id) from stockroom.shelf_levels l where l.shelf_id=v_shelf_id),
    'locations',(select jsonb_agg(ctid::text order by id) from stockroom.item_locations i where i.layout_id=v_layout_id)
  ) into before_rows;
  perform private.sync_locator_hierarchy(v_layout_id,objects,locations);
  select jsonb_build_object(
    'floors',(select jsonb_agg(ctid::text order by id) from stockroom.floors f where f.layout_id=v_layout_id),
    'shelves',(select jsonb_agg(ctid::text order by id) from stockroom.shelves s where s.layout_id=v_layout_id),
    'levels',(select jsonb_agg(ctid::text order by id) from stockroom.shelf_levels l where l.shelf_id=v_shelf_id),
    'locations',(select jsonb_agg(ctid::text order by id) from stockroom.item_locations i where i.layout_id=v_layout_id)
  ) into after_rows;
  if before_rows is distinct from after_rows then raise exception 'Unchanged hierarchy was rewritten'; end if;
  objects := jsonb_set(jsonb_set(objects,'{1,layerCount}','6'),'{1,binCount}','10');
  perform private.sync_locator_hierarchy(v_layout_id,objects,locations);
  if (select count(*) from stockroom.shelf_slots b join stockroom.shelf_levels l on l.id=b.shelf_level_id where l.shelf_id=v_shelf_id)<>60 then
    raise exception 'Batched expansion did not create all bins';
  end if;
  -- Verify the reuse path repairs missing, unassigned hierarchy.
  delete from stockroom.shelf_slots b using stockroom.shelf_levels l
    where b.shelf_level_id=l.id and l.shelf_id=v_shelf_id and l.level_number=6 and b.slot_number=10;
  perform private.sync_locator_hierarchy(v_layout_id,objects,locations);
  if (select count(*) from stockroom.shelf_slots b join stockroom.shelf_levels l on l.id=b.shelf_level_id where l.shelf_id=v_shelf_id)<>60 then
    raise exception 'Missing bin was not repaired';
  end if;
  if exists(select 1 from jsonb_array_elements(public.limen_locator_command('list','{"allowDraft":true}')) x where x ? 'metadata') then
    raise exception 'Layout menu still includes full snapshots';
  end if;
  if public.limen_locator_command('load',jsonb_build_object('layoutId',v_layout_id,'allowDraft',true))#>'{metadata,scene,objects}' is distinct from layout#>'{metadata,scene,objects}' then
    raise exception 'Summary optimization affected full layout loading';
  end if;
end $test$;
rollback;
