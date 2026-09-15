-- Run in an isolated database. Every fixture/change is rolled back.
begin;
do $test$
declare
  a jsonb; b jsonb; published jsonb; snapshot jsonb; objects jsonb; locations jsonb;
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); bad uuid := gen_random_uuid();
  revision bigint; assignments integer;
begin
  if has_function_privilege('anon','public.limen_locator_command(text,jsonb,uuid)','execute')
    or has_function_privilege('authenticated','public.limen_locator_command(text,jsonb,uuid)','execute')
    or not has_function_privilege('service_role','public.limen_locator_command(text,jsonb,uuid)','execute') then
    raise exception 'Locator RPC grants are unsafe';
  end if;
  if has_table_privilege('authenticated','public.store_layouts','update')
    or has_table_privilege('authenticated','stockroom.item_locations','insert') then
    raise exception 'A browser can bypass revisioned writes';
  end if;
  if not exists(select 1 from stockroom.stores where is_active) then
    insert into stockroom.stores(code,name) values('LOCATOR_TEST','Locator test');
  end if;
  insert into catalog.products(id,sku,name) values(p1,'TEST-'||p1,'Locator test 1'),(p2,'TEST-'||p2,'Locator test 2');
  objects := '[
    {"id":"floor","type":"floor","position":[0,0,0],"dimensions":{"width":24,"depth":16,"height":4.5}},
    {"id":"shelf","type":"shelf","floor":1,"aisle":"A","shelfNumber":1,"layerCount":8,"binCount":4,"position":[0,0,0],"dimensions":{"width":3,"depth":1,"height":3}},
    {"id":"stairs","type":"stairs","floor":1,"position":[6,0,0],"rotation":[0,1.57,0],"dimensions":{"width":5.6,"depth":5.6,"height":4.5}}
  ]';
  a := public.limen_locator_command('save',jsonb_build_object('name','Test A '||p1,'objects',objects));
  b := public.limen_locator_command('save',jsonb_build_object('name','Test B '||p1,'objects',objects));
  a := public.limen_locator_command('assign',jsonb_build_object('layoutId',a->>'id','expectedRevision',a->>'revision','location',
    jsonb_build_object('productId',p1,'shelfObjectId','shelf','layerNumber',8,'binNumber',4)));
  a := public.limen_locator_command('assign',jsonb_build_object('layoutId',a->>'id','expectedRevision',a->>'revision','location',
    jsonb_build_object('productId',p2,'shelfObjectId','shelf','layerNumber',8,'binNumber',4)));
  if jsonb_array_length(a#>'{metadata,locations}')<>2
    or (select count(distinct shelf_slot_id) from stockroom.item_locations where layout_id=(a->>'id')::uuid and is_active)<>1 then
    raise exception 'Shared bins were not preserved';
  end if;
  if exists(select 1 from stockroom.item_locations where layout_id=(b->>'id')::uuid and is_active) then
    raise exception 'Assignments leaked into another layout';
  end if;
  revision := (a->>'revision')::bigint;
  begin
    perform public.limen_locator_command('save',jsonb_build_object('layoutId',a->>'id','expectedRevision',revision-1,'objects',objects));
    raise exception 'Stale revision accepted';
  exception when serialization_failure then null;
  end;
  -- This fails after hierarchy upserts; all intermediate writes must roll back.
  begin
    perform public.limen_locator_command('assign',jsonb_build_object('layoutId',a->>'id','expectedRevision',revision,'location',
      jsonb_build_object('productId',bad,'shelfObjectId','shelf','layerNumber',1,'binNumber',1)));
    raise exception 'Unknown product accepted';
  exception when foreign_key_violation then null;
  end;
  if (select l.revision from stockroom.layouts l where id=(a->>'id')::uuid)<>revision
    or (select count(*) from stockroom.item_locations where layout_id=(a->>'id')::uuid and is_active)<>2 then
    raise exception 'Partial failure changed the saved layout';
  end if;
  begin
    perform public.limen_locator_command('save',jsonb_build_object('layoutId',a->>'id','expectedRevision',revision,
      'objects',jsonb_set(objects,'{1,layerCount}','2')));
    raise exception 'Removed an assigned shelf layer';
  exception when invalid_parameter_value then null;
  end;
  a := public.limen_locator_command('save',jsonb_build_object('layoutId',a->>'id','expectedRevision',revision,
    'objects',jsonb_set(objects,'{1,floor}','2')));
  if a#>>'{metadata,locations,0,floor}'<>'2' then raise exception 'Moving a shelf lost its floor mapping'; end if;
  snapshot := a;
  published := public.limen_locator_command('publish',jsonb_build_object('layoutId',a->>'id','expectedRevision',a->>'revision'));
  if published->>'status'<>'published' then raise exception 'Publish failed'; end if;
  if public.limen_locator_command('load',jsonb_build_object('layoutId',b->>'id','allowDraft',false)) is not null then
    raise exception 'Staff can load a draft';
  end if;
  a := public.limen_locator_command('save',jsonb_build_object('layoutId',published->>'id','expectedRevision',published->>'revision',
    'objects',jsonb_set(objects,'{1,floor}','2')));
  if a->>'id'=published->>'id' or a->>'status'<>'draft' then raise exception 'Save overwrote the published layout'; end if;
  a := public.limen_locator_command('restore',jsonb_build_object('layoutId',a->>'id','expectedRevision',a->>'revision','restoreRevision',a->>'revision'));
  if jsonb_array_length(a#>'{metadata,locations}')<>2 then raise exception 'Restore lost assignments'; end if;
  published := public.limen_locator_command('assign',jsonb_build_object('layoutId',published->>'id','expectedRevision',published->>'revision','location',
    jsonb_build_object('productId',p1,'shelfObjectId','shelf','layerNumber',7,'binNumber',4)));
  begin
    perform public.limen_locator_command('publish',jsonb_build_object('layoutId',a->>'id','expectedRevision',a->>'revision'));
    raise exception 'Draft published over newer product assignments';
  exception when serialization_failure then null;
  end;
  if (select count(*) from stockroom.layouts where status='published')<>1 then raise exception 'Multiple published layouts'; end if;
  if not exists(select 1 from stockroom.layout_audit_history h where h.layout_id=(a->>'id')::uuid and h.revision=(a->>'revision')::bigint) then
    raise exception 'Revision history missing';
  end if;
end $test$;
rollback;
