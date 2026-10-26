begin;

alter table operations.estimates
  add column package_snapshot_revision integer not null default 0 check (package_snapshot_revision>=0),
  add column customer_snapshot jsonb,
  add column vehicle_snapshot jsonb;
alter table operations.estimate_items
  add column line_position integer,
  add column product_name_snapshot text,
  add column product_sku_snapshot text,
  add column service_name_snapshot text,
  add column service_code_snapshot text,
  add column catalog_unit_price numeric(14,2),
  add column bundle_key text,
  add column bundle_name text,
  add column bundle_tier_label text,
  add column managed_package_revision_id uuid references cms.package_revisions(id) on delete restrict,
  add column managed_package_variant_id uuid,
  add column managed_package_item_id uuid,
  add column managed_package_allocation integer;
create index estimate_items_managed_revision_idx on operations.estimate_items(managed_package_revision_id)
  where managed_package_revision_id is not null;
alter table operations.estimate_items add constraint estimate_items_managed_metadata_check check (
  (managed_package_revision_id is null and managed_package_variant_id is null and managed_package_item_id is null and managed_package_allocation is null)
  or (managed_package_revision_id is not null and managed_package_variant_id is not null and managed_package_item_id is not null
    and managed_package_allocation in (0,1) and bundle_key is not null)
);

-- A quote edit must not rewrite a vehicle shared by another quote or repair.
-- Reuse an identical vehicle or a matching recorded plate; otherwise create a
-- separate unplated specification. Explicit JSON null detaches only this quote.
create index vehicles_quote_plate_lookup_idx on operations.vehicles((upper(btrim(plate_no)))) where plate_no is not null;
create function app.resolve_quote_vehicle(p_customer_id uuid,p_vehicle jsonb,p_current_id uuid,p_business_date date)
returns uuid language plpgsql security invoker set search_path=''
as $fn$
declare selected operations.vehicles%rowtype; plate text; vehicle_id uuid;
begin
  if p_vehicle is null or p_vehicle='null'::jsonb then return null; end if;
  if jsonb_typeof(p_vehicle)<>'object' or nullif(btrim(p_vehicle->>'model_name'),'') is null then
    raise exception using errcode='22023',message='Choose a valid vehicle or explicitly clear it.';
  end if;
  plate:=nullif(upper(btrim(p_vehicle->>'plate_no')),'');
  if plate is not null then
    perform pg_advisory_xact_lock(hashtextextended('quote-vehicle:'||plate,0));
    select * into selected from operations.vehicles v where v.plate_no is not null and upper(btrim(v.plate_no))=plate order by id limit 1;
    if found and exists(select 1 from operations.vehicles v where v.plate_no is not null and upper(btrim(v.plate_no))=plate and v.id<>selected.id) then
      raise exception using errcode='22023',message='This plate matches more than one vehicle. Ask an administrator to review the vehicle records.';
    end if;
  elsif p_current_id is not null then
    select * into selected from operations.vehicles where id=p_current_id;
  end if;
  if selected.id is not null and lower(coalesce(selected.make,''))=lower(coalesce(p_vehicle->>'make','Mitsubishi'))
    and lower(selected.model_name)=lower(p_vehicle->>'model_name')
    and selected.year is not distinct from nullif(p_vehicle->>'year','')::integer
    and lower(coalesce(selected.engine,''))=lower(coalesce(p_vehicle->>'engine','')) then
    return selected.id;
  end if;
  if selected.id is not null and plate is not null then
    raise exception using errcode='22023',message='This plate is already recorded with different vehicle details. Verify those details before changing the quotation.';
  end if;
  begin
    insert into operations.vehicles(customer_id,plate_no,make,model_name,year,engine,metadata,business_date)
    values(p_customer_id,plate,coalesce(p_vehicle->>'make','Mitsubishi'),p_vehicle->>'model_name',
      nullif(p_vehicle->>'year','')::integer,nullif(p_vehicle->>'engine',''),coalesce(p_vehicle->'metadata','{}'::jsonb),
      coalesce(p_business_date,current_date)) returning id into vehicle_id;
  exception when unique_violation then
    -- Another established vehicle workflow may use the plate's unique index
    -- rather than this advisory lock. Re-read, but never overwrite that row.
    if plate is null then raise; end if;
    select * into selected from operations.vehicles v where v.plate_no is not null and upper(btrim(v.plate_no))=plate order by id limit 1;
    if not found or lower(coalesce(selected.make,''))<>lower(coalesce(p_vehicle->>'make','Mitsubishi'))
      or lower(coalesce(selected.model_name,''))<>lower(p_vehicle->>'model_name')
      or selected.year is distinct from nullif(p_vehicle->>'year','')::integer
      or lower(coalesce(selected.engine,''))<>lower(coalesce(p_vehicle->>'engine','')) then
      raise exception using errcode='40001',message='The vehicle record changed. Review its details before saving again.';
    end if;
    vehicle_id:=selected.id;
  end;
  return vehicle_id;
end;
$fn$;
revoke all on function app.resolve_quote_vehicle(uuid,jsonb,uuid,date) from public,anon,authenticated;
grant execute on function app.resolve_quote_vehicle(uuid,jsonb,uuid,date) to service_role;

-- Reuses existing document-number/customer logic. This helper runs
-- before the immutable quote revision is created, within the same transaction.
create function app.attach_managed_estimate_snapshot(p_estimate_id uuid,p_payload jsonb)
returns void language plpgsql security invoker set search_path=''
as $fn$
declare
  target_revision integer; current_revision integer; current_snapshot_revision integer; snap jsonb; old_snap jsonb; definition jsonb;
  variant jsonb; root cms.recommendation_packages%rowtype; rules jsonb; pricing_vehicle jsonb; expected_qualification jsonb;
  gross numeric; net numeric; matched integer; item_count integer; source_price numeric; priced_line jsonb;
begin
  select package_snapshot_revision into current_snapshot_revision from operations.estimates where id=p_estimate_id for update;
  if not found then raise exception using errcode='22023',message='Quotation not found.'; end if;
  select coalesce(max(revision_number),0) into current_revision from operations.estimate_revisions where estimate_id=p_estimate_id;
  target_revision:=current_revision+1;
  pricing_vehicle:=coalesce(p_payload->'_pricing_vehicle_context',p_payload->'vehicle','{}'::jsonb);
  if jsonb_typeof(p_payload->'items') is distinct from 'array'
    or jsonb_array_length(p_payload->'items') not between 1 and 100
    or jsonb_typeof(p_payload->'_managed_package_snapshots') is distinct from 'array'
    or jsonb_array_length(p_payload->'_managed_package_snapshots')>12 then
    raise exception using errcode='22023',message='Invalid quotation items or package snapshot collection.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') i where
    (i->>'quantity')::numeric not between 1 and 1000 or (i->>'quantity')::numeric<>trunc((i->>'quantity')::numeric)
    or (i->>'unit_price')::numeric<0 or (i->>'unit_price')::numeric<>round((i->>'unit_price')::numeric,2)
    or (i->>'line_total')::numeric<>round((i->>'quantity')::numeric*(i->>'unit_price')::numeric,2)
    or coalesce((i->>'catalog_unit_price')::numeric,(i->>'unit_price')::numeric)<(i->>'unit_price')::numeric) then
    raise exception using errcode='22023',message='Quotation quantities or amounts are invalid.';
  end if;
  select sum(coalesce((i->>'catalog_unit_price')::numeric,(i->>'unit_price')::numeric)*(i->>'quantity')::numeric),
    sum((i->>'line_total')::numeric) into gross,net from jsonb_array_elements(p_payload->'items') i;
  if gross>100000000 or net<0 or net>gross
    or (p_payload#>>'{estimate,subtotal}')::numeric is distinct from gross
    or (p_payload#>>'{estimate,discount_total}')::numeric is distinct from gross-net
    or (p_payload#>>'{estimate,tax_total}')::numeric is distinct from round(net*0.12,2)
    or (p_payload#>>'{estimate,grand_total}')::numeric is distinct from net+round(net*0.12,2) then
    raise exception using errcode='22023',message='Quotation totals do not match the approved items.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'_managed_package_snapshots') s
    group by s->>'packageId' having count(*)>1) then
    raise exception using errcode='22023',message='A package can only appear once in a quotation.';
  end if;
  -- Deterministic lock order keeps concurrent publication and quotation saves
  -- from interleaving a changed publication with its approved financial snapshot.
  perform 1 from cms.recommendation_packages p where p.id in (
    select (s->>'packageId')::uuid from jsonb_array_elements(p_payload->'_managed_package_snapshots') s
  ) order by p.id for share;
  for snap in select value from jsonb_array_elements(p_payload->'_managed_package_snapshots') loop
    if (snap->>'quantity')::integer not between 1 and 1000
      or snap->>'bundleKey' is distinct from 'pkg:'||(snap->>'packageId')
      or jsonb_typeof(snap->'items') is distinct from 'array' then
      raise exception using errcode='22023',message='Invalid approved package snapshot.';
    end if;
    select * into root from cms.recommendation_packages where id=(snap->>'packageId')::uuid;
    if not found then raise exception using errcode='22023',message='Package not found.'; end if;
    if snap ? 'reusedFromRevision' then
      -- Only an exact copy from THIS quote's current authorized snapshot can
      -- retain historical pricing. An arbitrary old publication is not enough.
      select snapshot into old_snap from operations.estimate_package_snapshots
      where estimate_id=p_estimate_id and estimate_revision=current_snapshot_revision
        and bundle_key=snap->>'bundleKey' and estimate_revision=(snap->>'reusedFromRevision')::integer;
      if old_snap is null or snap-'reusedFromRevision' is distinct from old_snap then
        raise exception using errcode='40001',message='The saved package snapshot changed. Reload this quotation.';
      end if;
    else
      if root.publication_status<>'published' or root.published_revision_id is distinct from (snap->>'revisionId')::uuid then
        raise exception using errcode='40001',message='The package changed or is no longer published. Review it before saving.';
      end if;
      select r.definition into definition from cms.package_revisions r
        where r.id=(snap->>'revisionId')::uuid and r.package_id=root.id;
      select value into variant from jsonb_array_elements(definition->'variants') v where v.value->>'id'=snap->>'variantId' and v.value->>'active'='true';
      if variant is null or (snap->'definition')-'variants' is distinct from definition-'variants'
        or snap#>'{definition,variants}' is distinct from jsonb_build_array(variant)
        or snap#>'{unitPricing,pricing}' is distinct from variant->'pricing' then
        raise exception using errcode='22023',message='The approved package definition is inconsistent.';
      end if;
      -- Recheck live source prices after the backend calculation, so a changed
      -- catalog cannot be silently accepted at the earlier displayed amount.
      if variant#>>'{pricing,strategy}'='live' then
        for priced_line in select value from jsonb_array_elements(snap#>'{unitPricing,lines}') loop
          source_price:=null;
          if priced_line->>'kind'='product' then
            select pp.amount into source_price from catalog.product_prices pp
              join catalog.products cp on cp.id=pp.product_id
              where pp.product_id=(priced_line->>'productId')::uuid and pp.price_type='retail'
                and pp.is_current and pp.currency='PHP' and cp.is_active and cp.status is distinct from 'discontinued'
              order by pp.effective_from desc,pp.created_at desc limit 1;
          else
            select standard_price into source_price from operations.services
              where id=(priced_line->>'serviceId')::uuid and is_active;
          end if;
          if source_price is null or source_price is distinct from (priced_line->>'catalogUnitPrice')::numeric then
            raise exception using errcode='40001',message='A catalog price changed. Review the updated package before saving.';
          end if;
        end loop;
      end if;
    end if;
    definition:=snap->'definition';
    if jsonb_typeof(snap->'qualifyingProductIds') is distinct from 'array' or jsonb_array_length(snap->'qualifyingProductIds')>100 then
      raise exception using errcode='22023',message='The package qualification record is incomplete.';
    end if;
    if not (snap ? 'reusedFromRevision') then
      if nullif(definition->>'anchorCategory','') is not null then
        select coalesce(jsonb_agg(q.product_id order by q.product_id),'[]'::jsonb) into expected_qualification from (
          select distinct i.value->>'product_id' product_id from jsonb_array_elements(p_payload->'items') i
          join catalog.products cp on cp.id=(i.value->>'product_id')::uuid
          where cp.is_active and cp.status is distinct from 'discontinued'
            and lower(regexp_replace(btrim(cp.category),'[[:space:]]+',' ','g'))=lower(regexp_replace(btrim(definition->>'anchorCategory'),'[[:space:]]+',' ','g'))
        ) q;
      elsif nullif(definition->>'anchorProductId','') is not null then
        if not exists(select 1 from catalog.products cp where cp.id=(definition->>'anchorProductId')::uuid and cp.is_active and cp.status is distinct from 'discontinued') then
          raise exception using errcode='40001',message='The qualifying part changed. Review the package again.';
        end if;
        expected_qualification:=jsonb_build_array(definition->>'anchorProductId');
      else expected_qualification:='[]'::jsonb; end if;
      if expected_qualification is distinct from snap->'qualifyingProductIds' then
        raise exception using errcode='40001',message='The qualifying parts changed. Review the package again.';
      end if;
    end if;
    if (nullif(definition->>'anchorProductId','') is not null and coalesce((
      select sum((i->>'quantity')::integer) from jsonb_array_elements(p_payload->'items') i where i->>'product_id'=definition->>'anchorProductId'
    ),0)<(definition->>'minAnchorQuantity')::integer*(snap->>'quantity')::integer)
      or (nullif(definition->>'anchorCategory','') is not null and coalesce((
        select sum((i->>'quantity')::integer) from jsonb_array_elements(p_payload->'items') i
        where (snap->'qualifyingProductIds') ? (i->>'product_id')
      ),0)<case when nullif(definition->>'anchorProductId','') is not null then 1 else (definition->>'minAnchorQuantity')::integer*(snap->>'quantity')::integer end)
      or (nullif(definition->>'triggerServiceId','') is not null and not exists(
        select 1 from jsonb_array_elements(p_payload->'items') i where i->>'service_id'=definition->>'triggerServiceId')) then
      raise exception using errcode='22023',message='Keep the qualifying parts and services, or review/remove this package.';
    end if;
    variant:=snap#>'{definition,variants,0}';
    rules:=case when jsonb_array_length(variant->'eligibility')>0 then variant->'eligibility' else snap#>'{definition,eligibility}' end;
    if not exists(select 1 from jsonb_array_elements(rules) r where cms.managed_package_rule_matches(r.value,snap->'vehicleContext'))
      or lower(coalesce(snap#>>'{vehicleContext,model}','')) is distinct from lower(coalesce(pricing_vehicle->>'model_name',''))
      or nullif(snap#>>'{vehicleContext,year}','')::integer is distinct from nullif(pricing_vehicle->>'year','')::integer
      or lower(coalesce(snap#>>'{vehicleContext,make}','')) is distinct from lower(coalesce(pricing_vehicle->>'make',''))
      or lower(coalesce(snap#>>'{vehicleContext,variant}','')) is distinct from lower(coalesce(pricing_vehicle->>'variant',pricing_vehicle#>>'{metadata,variant}',''))
      or (nullif(coalesce(pricing_vehicle->>'fitmentId',pricing_vehicle#>>'{metadata,fitmentId}'),'') is not null
        and coalesce(pricing_vehicle->>'fitmentId',pricing_vehicle#>>'{metadata,fitmentId}') is distinct from snap#>>'{vehicleContext,fitmentId}')
      or (lower(coalesce(snap#>>'{vehicleContext,engine}','')) is distinct from lower(coalesce(pricing_vehicle->>'engine',''))
        and not (nullif(pricing_vehicle->>'engine','') is null
          and nullif(coalesce(pricing_vehicle->>'fitmentId',pricing_vehicle#>>'{metadata,fitmentId}'),'') is not null
          and coalesce(pricing_vehicle->>'fitmentId',pricing_vehicle#>>'{metadata,fitmentId}')=snap#>>'{vehicleContext,fitmentId}')) then
      raise exception using errcode='22023',message='Review package eligibility for the selected vehicle before saving.';
    end if;
    if not (snap ? 'reusedFromRevision') and nullif(snap#>>'{vehicleContext,fitmentId}','') is not null and not exists(
      select 1 from catalog.public_vehicle_fitments f where f.id=(snap#>>'{vehicleContext,fitmentId}')::uuid
        and f.is_active and lower(f.model_name)=lower(snap#>>'{vehicleContext,model}')
        and f.year=(snap#>>'{vehicleContext,year}')::integer
        and coalesce(f.engine,'')=coalesce(snap#>>'{vehicleContext,engine}','')
    ) then raise exception using errcode='22023',message='The recorded vehicle configuration is no longer available.'; end if;
    if exists(
      (select value from jsonb_array_elements(snap->'items') except all
       select value from jsonb_array_elements(p_payload->'items') i where i.value->>'bundle_key'=snap->>'bundleKey')
      union all
      (select value from jsonb_array_elements(p_payload->'items') i where i.value->>'bundle_key'=snap->>'bundleKey' except all
       select value from jsonb_array_elements(snap->'items'))
    ) then raise exception using errcode='22023',message='Quotation lines do not match their complete approved package.'; end if;
    if (select sum((i->>'line_total')::numeric) from jsonb_array_elements(snap->'items') i) is distinct from (snap->>'effectiveTotal')::numeric
      or (select sum((i->>'catalog_unit_price')::numeric*(i->>'quantity')::numeric) from jsonb_array_elements(snap->'items') i) is distinct from (snap->>'catalogTotal')::numeric then
      raise exception using errcode='22023',message='Package snapshot totals do not match its items.';
    end if;
    insert into operations.estimate_package_snapshots(estimate_id,estimate_revision,bundle_key,package_revision_id,variant_id,quantity,snapshot)
      values(p_estimate_id,target_revision,snap->>'bundleKey',(snap->>'revisionId')::uuid,
        (snap->>'variantId')::uuid,(snap->>'quantity')::integer,snap-'reusedFromRevision');
  end loop;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') i where
    coalesce(i->>'bundle_key','') like 'pkg:%' and not exists(
      select 1 from jsonb_array_elements(p_payload->'_managed_package_snapshots') s where s->>'bundleKey'=i->>'bundle_key'
    )) then raise exception using errcode='22023',message='A quotation line is missing its approved package snapshot.'; end if;

  -- Base inserts intentionally preserve existing customer/vehicle behavior.
  -- Pair indistinguishable financial rows deterministically, then attach their
  -- exact server-approved metadata before recording the immutable revision.
  with incoming as (
    select value item,ordinality pos,jsonb_build_array(value->>'line_type',nullif(value->>'product_id','')::uuid,
      nullif(value->>'service_id','')::uuid,(value->>'quantity')::numeric,(value->>'unit_price')::numeric,
      (value->>'line_total')::numeric,nullif(value->>'recommendation_rule_id','')::uuid,coalesce((value->>'is_upsell')::boolean,false)) fingerprint
    from jsonb_array_elements(p_payload->'items') with ordinality
  ), ranked_input as (
    select *,row_number() over(partition by fingerprint order by pos) occurrence from incoming
  ), actual as (
    select ei.id,jsonb_build_array(line_type,product_id,service_id,quantity,unit_price,line_total,recommendation_rule_id,is_upsell) fingerprint
    from operations.estimate_items ei where estimate_id=p_estimate_id
  ), ranked_actual as (
    select *,row_number() over(partition by fingerprint order by id) occurrence from actual
  ), mapping as (
    select a.id,i.item,i.pos from ranked_actual a join ranked_input i using(fingerprint,occurrence)
  )
  update operations.estimate_items ei set line_position=m.pos::integer,
    product_name_snapshot=case when ei.line_type='product' then coalesce(m.item->>'product_name',(select p.name from catalog.products p where p.id=ei.product_id)) end,
    product_sku_snapshot=case when ei.line_type='product' then coalesce(m.item->>'product_sku',(select p.sku from catalog.products p where p.id=ei.product_id)) end,
    service_name_snapshot=case when ei.line_type='service' then coalesce(m.item->>'service_name',(select s.name from operations.services s where s.id=ei.service_id)) end,
    service_code_snapshot=case when ei.line_type='service' then (select s.code from operations.services s where s.id=ei.service_id) end,
    catalog_unit_price=coalesce((m.item->>'catalog_unit_price')::numeric,ei.unit_price),
    bundle_key=nullif(m.item->>'bundle_key',''),bundle_name=nullif(m.item->>'bundle_name',''),bundle_tier_label=nullif(m.item->>'bundle_tier_label',''),
    managed_package_revision_id=nullif(m.item->>'managed_package_revision_id','')::uuid,
    managed_package_variant_id=nullif(m.item->>'managed_package_variant_id','')::uuid,
    managed_package_item_id=nullif(m.item->>'managed_package_item_id','')::uuid,
    managed_package_allocation=nullif(m.item->>'managed_package_allocation','')::integer
  from mapping m where ei.id=m.id;
  get diagnostics matched=row_count;
  select count(*) into item_count from operations.estimate_items where estimate_id=p_estimate_id;
  if matched<>jsonb_array_length(p_payload->'items') or matched<>item_count then
    raise exception using errcode='22023',message='Quotation item persistence is inconsistent.';
  end if;
  if p_payload ? 'vehicle' then
    update operations.estimates e set vehicle_id=app.resolve_quote_vehicle(e.customer_id,p_payload->'vehicle',e.vehicle_id,e.business_date)
      where e.id=p_estimate_id;
  end if;
  update operations.estimates e set package_snapshot_revision=target_revision,
    customer_snapshot=(select to_jsonb(c) from operations.customers c where c.id=e.customer_id),
    vehicle_snapshot=case when p_payload ? 'vehicle' then case when p_payload->'vehicle'='null'::jsonb then 'null'::jsonb
      else (p_payload->'vehicle')||jsonb_build_object('id',e.vehicle_id,'customer_id',e.customer_id,
        'engine',p_payload#>>'{vehicle,engine}','plate_no',p_payload#>>'{vehicle,plate_no}') end
      else coalesce(e.vehicle_snapshot,(select er.estimate_snapshot->'vehicle' from operations.estimate_revisions er
        where er.estimate_id=e.id order by er.revision_number desc limit 1),
        (select to_jsonb(v) from operations.vehicles v where v.id=e.vehicle_id)) end
    where e.id=p_estimate_id;
end;
$fn$;
revoke all on function app.attach_managed_estimate_snapshot(uuid,jsonb) from public,anon,authenticated;
grant execute on function app.attach_managed_estimate_snapshot(uuid,jsonb) to service_role;

-- Capture the currently deployed, audited revision workflow, with a single
-- explicit pre-revision hook. Abort if its expected insertion point changed;
-- never guess at a different production function body.
do $copy_revision$
declare source text; occurrences integer; vehicle_start integer; vehicle_end integer;
begin
  source:=pg_get_functiondef('app.revise_estimate_internal(uuid,jsonb,uuid,text)'::regprocedure);
  if md5(source)<>'d8994593cb741eb1b0c4b085b96a7ad1' then
    raise exception 'The deployed quote revision function differs from the audited version; review it before applying this migration.';
  end if;
  select count(*) into occurrences from regexp_matches(source,'return[[:space:]]+app\.ensure_estimate_revision\(','g');
  if occurrences<>1 or position('FUNCTION app.revise_estimate_internal(' in source)=0 then
    raise exception 'The existing quote revision workflow changed; review it before applying this migration.';
  end if;
  source:=replace(source,'FUNCTION app.revise_estimate_internal(','FUNCTION app.revise_estimate_packages_internal(');
  source:=replace(source,'SECURITY DEFINER','SECURITY INVOKER');
  source:=replace(source,'SET search_path TO ''app'', ''public''','SET search_path TO ''''');
  vehicle_start:=position('  if p_payload ? ''vehicle'' then' in source);
  vehicle_end:=position('  update operations.estimates' in source);
  if vehicle_start=0 or vehicle_end<=vehicle_start then
    raise exception 'The audited vehicle update block changed; review it before applying this migration.';
  end if;
  source:=substring(source from 1 for vehicle_start-1)||E'  -- Vehicle association is resolved without rewriting shared records by the snapshot hook.\n'||substring(source from vehicle_end);
  source:=regexp_replace(source,'return[[:space:]]+app\.ensure_estimate_revision\(',
    'perform app.attach_managed_estimate_snapshot(p_estimate_id,p_payload); return app.ensure_estimate_revision(');
  execute source;
end;
$copy_revision$;
revoke all on function app.revise_estimate_packages_internal(uuid,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function app.revise_estimate_packages_internal(uuid,jsonb,uuid,text) to service_role;

create function public.create_estimate_packages(p_payload jsonb,p_snapshots jsonb,p_editor_id uuid default null)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare eid uuid; rid uuid; payload jsonb; snapshot jsonb;
begin
  if p_editor_id is not null then perform cms.assert_package_admin(p_editor_id);
  elsif p_payload#>>'{estimate,source}' is distinct from 'public'
    or coalesce(p_payload#>>'{estimate,status}','') not in ('draft','sent') then
    raise exception using errcode='42501',message='An administrator is required for internal quotations.';
  end if;
  payload:=p_payload||jsonb_build_object('_managed_package_snapshots',p_snapshots);
  -- Strip the vehicle from the legacy writer; its plate upsert mutates shared
  -- records. The quote-only resolver above owns that association instead.
  eid:=app.create_estimate_internal(payload-'vehicle');
  if p_editor_id is not null then update operations.estimates set created_by=p_editor_id where id=eid; end if;
  perform app.attach_managed_estimate_snapshot(eid,payload);
  rid:=app.ensure_estimate_revision(eid,p_editor_id,coalesce(payload#>>'{estimate,revision_note}','Initial quote created'));
  select estimate_snapshot into strict snapshot from operations.estimate_revisions where id=rid and estimate_id=eid;
  return jsonb_build_object('estimateId',eid,'revisionId',rid,'estimate',snapshot);
end;
$fn$;
revoke all on function public.create_estimate_packages(jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.create_estimate_packages(jsonb,jsonb,uuid) to service_role;

create function public.revise_estimate_packages(p_estimate_id uuid,p_payload jsonb,p_snapshots jsonb,
  p_expected_revision integer,p_editor_id uuid default null,p_change_note text default null)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare existing operations.estimates%rowtype; revision integer; rid uuid; snapshot jsonb;
begin
  if p_editor_id is not null then perform cms.assert_package_admin(p_editor_id); end if;
  if p_editor_id is null and (p_payload#>>'{estimate,source}' is distinct from 'public'
    or coalesce(p_payload#>>'{estimate,status}','') not in ('draft','sent')) then
    raise exception using errcode='42501',message='Public quotations cannot change approval or conversion status.';
  end if;
  select * into existing from operations.estimates where id=p_estimate_id for update;
  if not found or existing.archived_at is not null or existing.status not in ('draft','sent','approved')
    or (p_editor_id is null and (existing.source<>'public' or existing.status not in ('draft','sent'))) then
    raise exception using errcode='22023',message='This quotation can no longer be edited.';
  end if;
  select coalesce(max(revision_number),0) into revision from operations.estimate_revisions where estimate_id=p_estimate_id;
  if p_expected_revision is null or revision<>p_expected_revision then
    raise exception using errcode='40001',message='This quotation changed in another session. Reload before saving.';
  end if;
  rid:=app.revise_estimate_packages_internal(p_estimate_id,
    p_payload||jsonb_build_object('_managed_package_snapshots',p_snapshots),p_editor_id,p_change_note);
  select estimate_snapshot into strict snapshot from operations.estimate_revisions where id=rid and estimate_id=p_estimate_id;
  return jsonb_build_object('estimateId',p_estimate_id,'revisionId',rid,'estimate',snapshot);
end;
$fn$;
revoke all on function public.revise_estimate_packages(uuid,jsonb,jsonb,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.revise_estimate_packages(uuid,jsonb,jsonb,integer,uuid,text) to service_role;

-- Existing quote revisions stay untouched. For legacy rows, prefer labels from
-- their recorded revision rather than pretending today's catalog is historical.
create or replace function app.build_estimate_snapshot(p_estimate_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $fn$
select jsonb_build_object(
  'estimate',jsonb_build_object('id',e.id,'estimate_number',e.estimate_number,'status',e.status,'source',e.source,
    'note',e.note,'subtotal',e.subtotal,'discount_total',e.discount_total,'tax_total',e.tax_total,'grand_total',e.grand_total,
    'issued_at',e.issued_at,'valid_until',e.valid_until,'business_date',e.business_date,'created_by',e.created_by,
    'created_at',e.created_at,'updated_at',e.updated_at,'revision_number',greatest(e.package_snapshot_revision,coalesce(last_revision.revision_number,0))),
  '_managed_package_snapshot_revision',e.package_snapshot_revision,
  'customer',coalesce(e.customer_snapshot,last_revision.estimate_snapshot->'customer',(select to_jsonb(c) from operations.customers c where c.id=e.customer_id)),
  'vehicle',coalesce(e.vehicle_snapshot,last_revision.estimate_snapshot->'vehicle',(select to_jsonb(v) from operations.vehicles v where v.id=e.vehicle_id)),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',ei.id,'line_type',ei.line_type,'product_id',ei.product_id,'service_id',ei.service_id,
    'quantity',ei.quantity,'unit_price',ei.unit_price,'line_total',ei.line_total,
    'recommendation_rule_id',ei.recommendation_rule_id,'is_upsell',ei.is_upsell,
    'product_name',coalesce(ei.product_name_snapshot,old_item.value->>'product_name',p.name),
    'product_sku',coalesce(ei.product_sku_snapshot,old_item.value->>'product_sku',p.sku),
    'service_name',coalesce(ei.service_name_snapshot,old_item.value->>'service_name',s.name),
    'service_code',coalesce(ei.service_code_snapshot,old_item.value->>'service_code',s.code),
    'catalog_unit_price',coalesce(ei.catalog_unit_price,ei.unit_price),'bundle_key',ei.bundle_key,
    'bundle_name',ei.bundle_name,'bundle_tier_label',ei.bundle_tier_label,
    'managed_package_revision_id',ei.managed_package_revision_id,'managed_package_variant_id',ei.managed_package_variant_id,
    'managed_package_item_id',ei.managed_package_item_id,'managed_package_allocation',ei.managed_package_allocation
  ) order by ei.line_position nulls last,ei.created_at,ei.id)
  from operations.estimate_items ei left join catalog.products p on p.id=ei.product_id
  left join operations.services s on s.id=ei.service_id
  left join lateral(select value from jsonb_array_elements(coalesce(last_revision.estimate_snapshot->'items','[]'::jsonb))
    where value->>'id'=ei.id::text limit 1) old_item on true
  where ei.estimate_id=e.id),'[]'::jsonb),
  '_managed_package_snapshots',coalesce((select jsonb_agg(ps.snapshot order by ps.bundle_key)
    from operations.estimate_package_snapshots ps where ps.estimate_id=e.id and ps.estimate_revision=e.package_snapshot_revision),'[]'::jsonb)
)
from operations.estimates e left join lateral(select revision_number,estimate_snapshot from operations.estimate_revisions
  where estimate_id=e.id order by revision_number desc limit 1) last_revision on true where e.id=p_estimate_id;
$fn$;
revoke all on function app.build_estimate_snapshot(uuid) from public,anon,authenticated;
grant execute on function app.build_estimate_snapshot(uuid) to service_role;
revoke update,delete,truncate on operations.estimate_revisions from authenticated,service_role;

-- Existing table-wide authenticated grants must not become an alternate way to
-- alter newly protected quote prices, snapshot pointers, or frozen metadata.
create function app.guard_managed_estimate_mutation() returns trigger
language plpgsql security invoker set search_path=''
as $fn$
declare protected boolean:=false; eid uuid;
begin
  if current_user in ('postgres','service_role','supabase_admin') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_table_name='estimates' then
    if tg_op<>'INSERT' then protected:=old.package_snapshot_revision>0; end if;
    if tg_op<>'DELETE' then protected:=protected or new.package_snapshot_revision>0
      or new.customer_snapshot is not null or new.vehicle_snapshot is not null; end if;
  else
    if tg_op='DELETE' then eid:=old.estimate_id;
    else
      eid:=new.estimate_id;
      protected:=new.managed_package_revision_id is not null or coalesce(new.bundle_key,'') like 'pkg:%';
    end if;
    protected:=protected or exists(select 1 from operations.estimates where id=eid and package_snapshot_revision>0);
    if tg_op='UPDATE' then
      protected:=protected or exists(select 1 from operations.estimates where id=old.estimate_id and package_snapshot_revision>0);
    end if;
  end if;
  if protected then raise exception using errcode='42501',message='Save this quotation through the approved quotation workflow.'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$fn$;
revoke all on function app.guard_managed_estimate_mutation() from public,anon,authenticated;
grant execute on function app.guard_managed_estimate_mutation() to service_role;
create trigger guard_managed_estimate_mutation before insert or update or delete on operations.estimates
  for each row execute function app.guard_managed_estimate_mutation();
create trigger guard_managed_estimate_item_mutation before insert or update or delete on operations.estimate_items
  for each row execute function app.guard_managed_estimate_mutation();

commit;
