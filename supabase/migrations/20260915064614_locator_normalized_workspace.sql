-- Current locator: normalized hierarchy plus revisioned visual snapshots.
-- Legacy rows remain intact as the rollback archive. No public write surface.
alter table stockroom.shelf_levels drop constraint if exists shelf_levels_level_number_check;
alter table stockroom.shelf_levels add constraint shelf_levels_level_number_check check (level_number between 1 and 12);
create or replace function app.validate_shelf_level_limit() returns trigger
language plpgsql set search_path = '' as $$
declare maximum integer;
begin
  select coalesce((metadata->>'layerCount')::integer, case shelf_type when '2_level' then 2 else 4 end)
    into maximum from stockroom.shelves where id=new.shelf_id;
  if maximum is null or new.level_number not between 1 and maximum then
    raise exception using errcode='22023', message='Invalid shelf layer.';
  end if;
  return new;
end $$;
-- A bin can contain several SKUs, as the physical store already does.
drop index if exists stockroom.item_locations_active_slot_idx;
create index if not exists item_locations_active_slot_lookup_idx on stockroom.item_locations(layout_id,shelf_slot_id) where is_active;
create unique index locator_scene_shelf_key on stockroom.shelves(layout_id,code) where metadata->>'locator'='true';

create or replace function private.sync_locator_hierarchy(p_id uuid, p_objects jsonb, p_locations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_store uuid; v_floor uuid; v_zone uuid; v_aisle uuid; v_shelf uuid; v_level uuid; v_slot uuid;
  o jsonb; base jsonb; loc jsonb; canonical jsonb := '[]'; n integer; j integer; k integer;
  layers integer; bins integer; floor_no integer; assigned_layer integer; assigned_bin integer;
begin
  select store_id into strict v_store from stockroom.layouts where id=p_id;
  if jsonb_typeof(p_objects) is distinct from 'array' or jsonb_array_length(p_objects) not between 1 and 1000
     or jsonb_typeof(p_locations) is distinct from 'array' then
    raise exception using errcode='22023',message='Invalid layout snapshot.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_objects) x group by x->>'id' having count(*)>1)
     or exists(select 1 from jsonb_array_elements(p_objects) x where nullif(x->>'id','') is null) then
    raise exception using errcode='22023',message='Every scene object needs a unique identifier.';
  end if;
  select x into base from jsonb_array_elements(p_objects) x where x->>'type'='floor' limit 1;
  if base is null then raise exception using errcode='22023',message='A floor is required.'; end if;
  for n in 1..2 loop
    insert into stockroom.floors(layout_id,floor_number,name,width,depth,elevation)
      values(p_id,n,'Floor '||n,(base#>>'{dimensions,width}')::numeric,(base#>>'{dimensions,depth}')::numeric,
      case n when 1 then 0 else (base#>>'{dimensions,height}')::numeric end)
      on conflict(layout_id,floor_number) do update set width=excluded.width,depth=excluded.depth,elevation=excluded.elevation;
  end loop;
  for o in select x from jsonb_array_elements(p_objects) x where x->>'type' in ('shelf','shelf-2-layer','shelf-4-layer','parts-cabinet') loop
    floor_no := coalesce((o->>'floor')::integer,1);
    layers := coalesce((o->>'layerCount')::integer,case o->>'type' when 'shelf-2-layer' then 2 else 4 end);
    bins := coalesce((o->>'binCount')::integer,8);
    if layers not between 1 and 12 or bins not between 1 and 12 or floor_no not between 1 and 2 then
      raise exception using errcode='22023',message='Invalid shelf floor, layers or bins.';
    end if;
    select id into strict v_floor from stockroom.floors where layout_id=p_id and floor_number=floor_no;
    insert into stockroom.zones(layout_id,floor_id,code,name) values(p_id,v_floor,'locator','Stockroom')
      on conflict(layout_id,floor_id,code) do update set name=excluded.name returning id into v_zone;
    insert into stockroom.aisles(layout_id,floor_id,zone_id,code,name)
      values(p_id,v_floor,v_zone,coalesce(nullif(o->>'aisle',''),'A'),coalesce(nullif(o->>'aisle',''),'A'))
      on conflict(layout_id,floor_id,code) do update set zone_id=excluded.zone_id returning id into v_aisle;
    -- Retain old hierarchy for history when a shelf changes floor or aisle.
    -- Geometry-only moves keep the normalized IDs stable.
    update stockroom.shelves set code=code||':retired:'||id::text,
      metadata=metadata||'{"locator":false,"retired":true}'::jsonb
      where layout_id=p_id and code=o->>'id' and metadata->>'locator'='true'
        and (floor_id<>v_floor or aisle_id<>v_aisle);
    insert into stockroom.shelves(layout_id,floor_id,zone_id,aisle_id,code,name,shelf_type,position_x,position_y,rotation,width,depth,height,metadata)
      values(p_id,v_floor,v_zone,v_aisle,o->>'id',coalesce(o->>'name',o->>'id'),'4_level',
      (o#>>'{position,0}')::numeric,(o#>>'{position,2}')::numeric,coalesce((o#>>'{rotation,1}')::numeric,0),
      (o#>>'{dimensions,width}')::numeric,(o#>>'{dimensions,depth}')::numeric,(o#>>'{dimensions,height}')::numeric,
      jsonb_build_object('locator',true,'layerCount',layers,'binCount',bins,'scene',o))
      on conflict(layout_id,code) where metadata->>'locator'='true'
      do update set name=excluded.name,position_x=excluded.position_x,position_y=excluded.position_y,rotation=excluded.rotation,
        width=excluded.width,depth=excluded.depth,height=excluded.height,metadata=excluded.metadata
      returning id into v_shelf;
    for j in 1..layers loop
      insert into stockroom.shelf_levels(shelf_id,level_number,elevation) values(v_shelf,j,j*(o#>>'{dimensions,height}')::numeric/layers)
        on conflict(shelf_id,level_number) do update set elevation=excluded.elevation returning id into v_level;
      for k in 1..bins loop
        insert into stockroom.shelf_slots(shelf_level_id,slot_number,slot_label) values(v_level,k,'Bin '||k)
          on conflict(shelf_level_id,slot_number) do nothing;
      end loop;
    end loop;
  end loop;
  update stockroom.item_locations set is_active=false where layout_id=p_id and is_active
    and not exists(select 1 from jsonb_array_elements(p_locations) x where x->>'productId'=item_id::text);
  for loc in select x from jsonb_array_elements(p_locations) x loop
    select x into o from jsonb_array_elements(p_objects) x where x->>'id'=loc->>'shelfObjectId'
      and x->>'type' in ('shelf','shelf-2-layer','shelf-4-layer','parts-cabinet');
    assigned_layer := coalesce((loc->>'layerNumber')::integer,1);
    assigned_bin := (loc->>'binNumber')::integer;
    if o is null or assigned_layer not between 1 and coalesce((o->>'layerCount')::integer,case o->>'type' when 'shelf-2-layer' then 2 else 4 end)
      or assigned_bin is null or assigned_bin not between 1 and coalesce((o->>'binCount')::integer,8) then
      raise exception using errcode='22023',message='An assigned shelf, layer or bin is missing. Reassign its products first.';
    end if;
    select s.id,s.floor_id,s.zone_id,s.aisle_id,l.id,b.id into strict v_shelf,v_floor,v_zone,v_aisle,v_level,v_slot
      from stockroom.shelves s join stockroom.shelf_levels l on l.shelf_id=s.id
      join stockroom.shelf_slots b on b.shelf_level_id=l.id
      where s.layout_id=p_id and s.code=o->>'id' and l.level_number=assigned_layer and b.slot_number=assigned_bin;
    insert into stockroom.items(product_id) values((loc->>'productId')::uuid) on conflict(product_id) do nothing;
    insert into stockroom.item_locations(store_id,layout_id,item_id,floor_id,zone_id,aisle_id,shelf_id,shelf_level_id,shelf_slot_id,route_hint)
      values(v_store,p_id,(loc->>'productId')::uuid,v_floor,v_zone,v_aisle,v_shelf,v_level,v_slot,loc)
      on conflict(layout_id,item_id) where is_active do update set
        floor_id=excluded.floor_id,zone_id=excluded.zone_id,aisle_id=excluded.aisle_id,
        shelf_id=excluded.shelf_id,shelf_level_id=excluded.shelf_level_id,shelf_slot_id=excluded.shelf_slot_id,
        route_hint=excluded.route_hint;
    canonical := canonical || jsonb_build_array(loc || jsonb_build_object('layoutId',p_id,'storeId',v_store,
      'floor',(o->>'floor')::integer,'aisle',o->>'aisle','shelfNumber',(o->>'shelfNumber')::integer,
      'layerNumber',assigned_layer,'shelfId',v_shelf,'shelfLevelId',v_level,'shelfSlotId',v_slot));
  end loop;
  return canonical;
end $$;
revoke all on function private.sync_locator_hierarchy(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.sync_locator_hierarchy(uuid,jsonb,jsonb) to service_role;

create or replace function public.limen_locator_command(p_action text,p_payload jsonb default '{}',p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_layout stockroom.layouts%rowtype; result_layout stockroom.layouts%rowtype;
  v_store uuid; objects jsonb; locations jsonb; history_snapshot jsonb; result jsonb;
  target_name text; target_id uuid; expected bigint; draft_id uuid; v_version integer;
  stairs jsonb; stair_width numeric; stair_depth numeric; flight numeric; yaw numeric;
  bottom_x numeric; bottom_z numeric; top_x numeric; top_z numeric;
begin
  if p_action in ('list','load','history') then
    if p_action='list' then
      select coalesce(jsonb_agg(to_jsonb(l) order by l.updated_at desc),'[]') into result from stockroom.layouts l
        where l.metadata->>'locator'='true' and (coalesce((p_payload->>'allowDraft')::boolean,false) or l.status='published');
      return result;
    end if;
    select * into current_layout from stockroom.layouts where metadata->>'locator'='true'
      and (case when p_payload ? 'layoutId' then id=(p_payload->>'layoutId')::uuid
        when nullif(p_payload->>'name','') is not null then name=p_payload->>'name' else status='published' end)
      and (coalesce((p_payload->>'allowDraft')::boolean,false) or status='published')
      order by (status='draft') desc,version_number desc limit 1;
    if current_layout.id is null then return null; end if;
    if p_action='history' then
      select coalesce(jsonb_agg(x order by x.revision desc),'[]') into result from
      (select revision,event_type,created_at,change_reason from stockroom.layout_audit_history where layout_id=current_layout.id
        and jsonb_typeof(new_snapshot#>'{metadata,scene,objects}')='array' order by revision desc limit 50) x;
      return result;
    end if;
    return to_jsonb(current_layout);
  end if;
  if p_action not in ('save','assign','publish','restore') then raise exception using errcode='22023',message='Unknown locator operation.'; end if;
  target_id := nullif(p_payload->>'layoutId','')::uuid;
  expected := nullif(p_payload->>'expectedRevision','')::bigint;
  select * into current_layout from stockroom.layouts where id=target_id and metadata->>'locator'='true';
  if target_id is not null and current_layout.id is null then raise exception using errcode='P0002',message='Layout not found.'; end if;
  select id into v_store from stockroom.stores where is_active limit 1;
  if v_store is null then raise exception using errcode='P0002',message='Active store not found.'; end if;
  if target_id is not null and current_layout.store_id<>v_store then raise exception using errcode='42501',message='Layout belongs to another store.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('limen:stockroom:store:'||v_store::text,0));
  if target_id is not null then
    select * into current_layout from stockroom.layouts where id=target_id for update;
    if expected is null or current_layout.revision<>expected then raise exception using errcode='40001',message='Layout changed. Reload before saving; your local edits have been kept.'; end if;
  elsif p_action<>'save' then raise exception using errcode='22023',message='Load a saved layout first.';
  end if;
  perform set_config('limen.stockroom_actor_id',coalesce(p_actor::text,''),true);
  perform set_config('limen.stockroom_change_source','locator:'||p_action,true);
  if p_action='publish' then
    if current_layout.metadata ? 'sourceRevision' and exists(
      select 1 from stockroom.layouts where id=current_layout.parent_layout_id
        and revision<>(current_layout.metadata->>'sourceRevision')::bigint
    ) then raise exception using errcode='40001',message='The source layout changed after this draft was created. Reload and reconcile its product assignments before publishing.'; end if;
    return public.limen_stockroom_publish_layout(target_id,expected,p_actor,'Published from 3D locator.');
  end if;
  objects := case when p_action='save' then p_payload->'objects' else current_layout.metadata#>'{scene,objects}' end;
  locations := coalesce(current_layout.metadata->'locations','[]');
  target_name := case when p_action='save' then coalesce(nullif(btrim(p_payload->>'name'),''),current_layout.name) else current_layout.name end;
  if target_name is null or length(target_name)>100 then raise exception using errcode='22023',message='Layout name must contain 1 to 100 characters.'; end if;
  if p_action='restore' then
    select new_snapshot into history_snapshot from stockroom.layout_audit_history where layout_id=target_id and revision=(p_payload->>'restoreRevision')::bigint;
    if history_snapshot is null then raise exception using errcode='P0002',message='Revision not found.'; end if;
    objects := history_snapshot#>'{metadata,scene,objects}'; locations := coalesce(history_snapshot#>'{metadata,locations}','[]');
  end if;
  if p_action='assign' then
    select coalesce(jsonb_agg(x),'[]') into locations from jsonb_array_elements(locations) x where x->>'productId'<>(p_payload#>>'{location,productId}');
    locations := locations || jsonb_build_array(p_payload->'location');
  end if;
  if target_id is null or target_name<>current_layout.name or (current_layout.status<>'draft' and p_action<>'assign') then
    if exists(select 1 from stockroom.layouts where store_id=v_store and name=target_name and status='draft' and metadata->>'locator'='true') then
      raise exception using errcode='40001',message='A draft with this name already exists. Load it before saving.';
    end if;
    select coalesce(max(version_number),0)+1 into v_version from stockroom.layouts where store_id=v_store;
    insert into stockroom.layouts(store_id,name,version_number,status,parent_layout_id,created_by,metadata,staircase_floor_1_anchor,staircase_floor_2_anchor)
      values(v_store,target_name,v_version,'draft',target_id,p_actor,
        jsonb_strip_nulls(jsonb_build_object('locator',true,'sourceRevision',current_layout.revision)),
        null,null) returning id into draft_id;
    target_id := draft_id;
  elsif current_layout.status='archived' then
    raise exception using errcode='22023',message='Archived layouts are read-only. Restore or save a new draft.';
  end if;
  locations := private.sync_locator_hierarchy(target_id,objects,locations);
  select x into stairs from jsonb_array_elements(objects) x where x->>'type'='stairs' limit 1;
  if stairs is not null then
    stair_width := greatest(5.6,(stairs#>>'{dimensions,width}')::numeric);
    stair_depth := greatest(5.6,(stairs#>>'{dimensions,depth}')::numeric);
    flight := least(2.4,greatest(1.8,least(stair_width,stair_depth)*0.38));
    yaw := coalesce((stairs#>>'{rotation,1}')::numeric,0);
    bottom_x := -stair_width/2-0.55; bottom_z := -stair_depth/2+flight/2;
    top_x := stair_width/2-flight/2; top_z := stair_depth/2+0.55;
  end if;
  update stockroom.layouts set metadata=metadata || jsonb_build_object('locator',true,'scene',jsonb_build_object('objects',objects,'version',2),'locations',locations),updated_by=p_actor
    ,staircase_floor_1_anchor=case when stairs is null then null else jsonb_build_object(
      'x',(stairs#>>'{position,0}')::numeric+cos(yaw)*bottom_x+sin(yaw)*bottom_z,
      'y',(stairs#>>'{position,2}')::numeric-sin(yaw)*bottom_x+cos(yaw)*bottom_z) end
    ,staircase_floor_2_anchor=case when stairs is null then null else jsonb_build_object(
      'x',(stairs#>>'{position,0}')::numeric+cos(yaw)*top_x+sin(yaw)*top_z,
      'y',(stairs#>>'{position,2}')::numeric-sin(yaw)*top_x+cos(yaw)*top_z) end
    where id=target_id returning * into result_layout;
  return to_jsonb(result_layout);
end $$;
revoke all on function public.limen_locator_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.limen_locator_command(text,jsonb,uuid) to service_role;
grant usage on schema private to service_role;
-- All mutations now go through the role-checked API and revisioned transaction.
revoke insert,update,delete on stockroom.layouts,stockroom.floors,stockroom.zones,stockroom.aisles,
  stockroom.shelves,stockroom.shelf_levels,stockroom.shelf_slots,stockroom.item_locations from authenticated,anon;
grant select,insert,update on stockroom.layouts,stockroom.floors,stockroom.zones,stockroom.aisles,
  stockroom.shelves,stockroom.shelf_levels,stockroom.shelf_slots,stockroom.item_locations,stockroom.items to service_role;
grant select on stockroom.stores,stockroom.layout_audit_history to service_role;

-- Freeze the legacy write path before copying to prevent old clients diverging.
lock table public.store_layouts,public.product_locations in share row exclusive mode;
revoke insert,update,delete on public.store_layouts,public.product_locations from authenticated,anon;
do $$
declare legacy record; layout jsonb; locations jsonb; normalized jsonb; v_priority text;
begin
  select layout_name into v_priority from public.store_layouts order by coalesce((layout_data->>'priority')::boolean,false) desc,updated_at desc limit 1;
  for legacy in select * from public.store_layouts order by layout_name loop
    layout := public.limen_locator_command('save',jsonb_build_object('name',legacy.layout_name,'objects',legacy.layout_data->'objects'));
    -- Preserve formal approval records; do not impersonate an administrator.
    update stockroom.legacy_layout_crosswalk set mapping_metadata=mapping_metadata||
      jsonb_build_object('source','locator_normalized_workspace','normalizedLayoutId',layout->>'id')
      where legacy_layout_id=legacy.id;
    if legacy.layout_name=v_priority then
      select coalesce(jsonb_agg(jsonb_build_object('productId',p.product_id,'productName',p.product_name,'sku',p.sku,'shelfObjectId',p.shelf_object_id,
        'floor',p.floor,'aisle',p.aisle,'shelfNumber',p.shelf_number,'binNumber',p.bin_number,'layerNumber',coalesce((p.assignment_data->>'layerNumber')::int,1))),'[]')
        into locations from public.product_locations p;
      normalized := private.sync_locator_hierarchy((layout->>'id')::uuid,legacy.layout_data->'objects',locations);
      update stockroom.layouts l set metadata=metadata||jsonb_build_object('locations',normalized,'legacyId',legacy.id) where id=(layout->>'id')::uuid returning to_jsonb(l) into layout;
      perform public.limen_stockroom_publish_layout((layout->>'id')::uuid,(layout->>'revision')::bigint,null,'Preserved active legacy layout and all product mappings.');
      update stockroom.legacy_location_crosswalk c set
        mapping_metadata=c.mapping_metadata||jsonb_build_object('source','priority_legacy_layout','normalizedLocationId',l.id,'normalizedLayoutId',l.layout_id)
        from stockroom.item_locations l where l.layout_id=(layout->>'id')::uuid and l.is_active and l.item_id=c.legacy_product_id;
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
