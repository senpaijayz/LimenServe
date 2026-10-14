-- A catalog reset recreates product UUIDs. Preserve shelf positions by resolving
-- only missing references through the unique, exact part number; never by name.
create or replace function private.resolve_locator_product_references(p_locations jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare loc jsonb; product uuid; resolved jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_locations) is distinct from 'array' then
    raise exception using errcode='22023', message='Invalid product mapping snapshot.';
  end if;
  for loc in select value from jsonb_array_elements(p_locations) loop
    select p.id into product from catalog.products p where p.id::text=loc->>'productId';
    if product is null then
      select p.id into product from catalog.products p where p.sku=nullif(loc->>'sku','');
    end if;
    if product is null then
      raise exception using errcode='PT410', message='A saved shelf mapping refers to a removed product.';
    end if;
    if exists(select 1 from jsonb_array_elements(resolved) x where x->>'productId'=product::text) then
      raise exception using errcode='22023', message='A product has more than one saved shelf mapping.';
    end if;
    resolved := resolved || jsonb_build_array(loc || jsonb_build_object('productId',product));
  end loop;
  return resolved;
end;
$function$;
revoke all on function private.resolve_locator_product_references(jsonb) from public,anon,authenticated;
grant execute on function private.resolve_locator_product_references(jsonb) to service_role;

-- Reconcile before assignment replaces the old product line, avoiding two
-- mappings for the same SKU. Preserve authorization and revision locking.
do $patch$
declare original text; revised text;
begin
  original := pg_get_functiondef('public.limen_locator_command(text,jsonb,uuid)'::regprocedure);
  revised := replace(original, 'if p_action=''assign'' then', $replacement$
  locations := private.resolve_locator_product_references(locations);
  if p_action='assign' then
    if not exists(select 1 from catalog.products p where p.id::text=p_payload#>>'{location,productId}' and p.is_active) then
      raise exception using errcode='PT410', message='The selected product is no longer available.';
    end if;
  $replacement$);
  if revised=original then raise exception 'Locator assignment patch target not found'; end if;
  execute revised;
end;
$patch$;

-- Repair current layouts, retaining all geometry, mapping positions, and audit
-- snapshots. Archived layouts and historical revisions remain untouched.
do $repair$
declare layout record; resolved jsonb;
begin
  for layout in select id,metadata from stockroom.layouts
    where metadata->>'locator'='true' and status<>'archived' for update loop
    resolved := private.resolve_locator_product_references(coalesce(layout.metadata->'locations','[]'));
    if resolved is distinct from coalesce(layout.metadata->'locations','[]') then
      resolved := private.sync_locator_hierarchy(layout.id,layout.metadata#>'{scene,objects}',resolved);
      update stockroom.layouts set metadata=jsonb_set(metadata,'{locations}',resolved),updated_at=now() where id=layout.id;
    end if;
  end loop;
end;
$repair$;
notify pgrst,'reload schema';
