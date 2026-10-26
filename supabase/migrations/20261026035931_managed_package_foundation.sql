-- Additive package model. This migration does not publish content, mutate
-- catalog prices, create sales, or rewrite historical estimates.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table cms.recommendation_packages
  alter column anchor_product_id drop not null,
  add column package_type text not null default 'custom'
    check (package_type in ('parts','service','vehicle','combination','promotion','maintenance','custom')),
  add column publication_status text not null default 'draft'
    check (publication_status in ('draft','published','unpublished','archived')),
  add column draft_revision integer not null default 0 check (draft_revision >= 0),
  add column published_revision_id uuid,
  add column category text not null default '',
  add column anchor_category text,
  add column trigger_service_id uuid references operations.services(id) on delete restrict,
  add column image_url text,
  add column internal_notes text,
  add column relationship_verified boolean not null default false,
  add column relationship_evidence text,
  add column source_kind text not null default 'manual'
    check (source_kind in ('manual','starter','legacy','suggestion')),
  add column seed_key text unique,
  add column seed_customized boolean not null default false,
  add column published_at timestamptz;

alter table cms.recommendation_packages drop constraint recommendation_packages_anchor_product_id_fkey;
alter table cms.recommendation_packages add constraint recommendation_packages_anchor_product_id_fkey
  foreign key (anchor_product_id) references catalog.products(id) on delete restrict;
alter table cms.recommendation_package_items drop constraint recommendation_package_items_product_id_fkey;
alter table cms.recommendation_package_items add constraint recommendation_package_items_product_id_fkey
  foreign key (product_id) references catalog.products(id) on delete restrict;
alter table cms.recommendation_package_items drop constraint recommendation_package_items_service_id_fkey;
alter table cms.recommendation_package_items add constraint recommendation_package_items_service_id_fkey
  foreign key (service_id) references operations.services(id) on delete restrict;

create table cms.package_variants (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references cms.recommendation_packages(id) on delete cascade,
  variant_key text not null,
  label text not null,
  description text not null default '',
  display_order integer not null default 0 check (display_order >= 0),
  is_active boolean not null default true,
  pricing_mode text not null default 'catalog' check (pricing_mode in ('catalog','percentage','fixed_discount','fixed_price')),
  pricing_strategy text not null default 'live' check (pricing_strategy in ('live','snapshot','manual')),
  pricing_value numeric(14,2) not null default 0 check (pricing_value >= 0 and pricing_value <= 100000000),
  unique (package_id, variant_key),
  check (pricing_mode <> 'percentage' or pricing_value <= 100),
  check (pricing_mode <> 'catalog' or pricing_value = 0)
);

alter table cms.recommendation_package_items
  add column variant_id uuid references cms.package_variants(id) on delete cascade,
  add column quantity integer not null default 1 check (quantity between 1 and 1000),
  add column is_required boolean not null default true;

-- Existing valid product-anchored rows retain their identities and contents.
-- Existing is_active behavior is left untouched until the application switches
-- to publication_status. No existing row is implicitly approved/published here.
insert into cms.package_variants (package_id,variant_key,label)
select id,'complete','Complete package' from cms.recommendation_packages;
update cms.recommendation_package_items i set variant_id=v.id
from cms.package_variants v where i.package_id=v.package_id and v.variant_key='complete';
alter table cms.recommendation_package_items alter column variant_id set not null;

create unique index package_variant_product_once on cms.recommendation_package_items(variant_id,product_id) where item_kind='product' and is_active;
create unique index package_variant_service_once on cms.recommendation_package_items(variant_id,service_id) where item_kind='service' and is_active;
create index package_items_variant_idx on cms.recommendation_package_items(variant_id,display_priority);
create index managed_packages_browse_idx on cms.recommendation_packages(publication_status,package_type,priority,id);
create index managed_packages_category_trigger_idx on cms.recommendation_packages(anchor_category) where publication_status='published';
create index managed_packages_service_trigger_idx on cms.recommendation_packages(trigger_service_id) where trigger_service_id is not null;

create table cms.package_eligibility (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references cms.recommendation_packages(id) on delete cascade,
  variant_id uuid references cms.package_variants(id) on delete cascade,
  mode text not null check (mode in ('unverified','universal','exact','model_year','family')),
  fitment_id uuid references catalog.public_vehicle_fitments(id) on delete restrict,
  make text not null default '',
  model text not null default '',
  family text not null default '',
  engine text not null default '',
  vehicle_variant text not null default '',
  year_from integer check (year_from between 1900 and 2200),
  year_to integer check (year_to between 1900 and 2200),
  is_verified boolean not null default false,
  evidence text not null default '',
  check (year_from is null or year_to is null or year_from <= year_to),
  check (not is_verified or (mode <> 'unverified' and length(btrim(evidence)) > 0))
);
create index package_eligibility_package_idx on cms.package_eligibility(package_id,variant_id);
create index package_eligibility_variant_idx on cms.package_eligibility(variant_id) where variant_id is not null;
create index package_eligibility_vehicle_idx on cms.package_eligibility(model,year_from,year_to) where is_verified;
create index package_eligibility_fitment_idx on cms.package_eligibility(fitment_id) where fitment_id is not null;

create table cms.package_revisions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references cms.recommendation_packages(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  definition jsonb not null check (jsonb_typeof(definition)='object'),
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot)='array'),
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (package_id,revision_number)
);
create index package_revisions_actor_idx on cms.package_revisions(published_by) where published_by is not null;
alter table cms.recommendation_packages add constraint managed_package_publication_fk
  foreign key (published_revision_id) references cms.package_revisions(id) on delete restrict;
create index managed_package_publication_idx on cms.recommendation_packages(published_revision_id) where published_revision_id is not null;

create table cms.package_activity (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references cms.recommendation_packages(id) on delete restrict,
  action text not null,
  draft_revision integer not null,
  actor_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index package_activity_package_idx on cms.package_activity(package_id,created_at desc);
create index package_activity_actor_idx on cms.package_activity(actor_id) where actor_id is not null;

create table cms.package_seed_sources (
  source_key text primary key,
  source_kind text not null check (source_kind in ('starter','legacy','suggestion')),
  package_id uuid not null references cms.recommendation_packages(id) on delete restrict,
  source_records jsonb not null default '[]'::jsonb,
  review_notes text not null default '',
  created_at timestamptz not null default now()
);
create index package_seed_sources_package_idx on cms.package_seed_sources(package_id);
create index package_seed_sources_records_idx on cms.package_seed_sources using gin(source_records jsonb_path_ops);

create table operations.estimate_package_snapshots (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references operations.estimates(id) on delete restrict,
  estimate_revision integer not null check (estimate_revision > 0),
  bundle_key text not null,
  package_revision_id uuid not null references cms.package_revisions(id) on delete restrict,
  variant_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  created_at timestamptz not null default now(),
  unique (estimate_id,estimate_revision,bundle_key)
);
create index estimate_package_snapshot_revision_idx on operations.estimate_package_snapshots(package_revision_id);
-- variant_id belongs to the immutable revision definition, NOT the mutable
-- draft variant table: deleting a draft variant must never erase issued offers.

-- All reads/writes are mediated by authenticated Express routes. No direct
-- browser grants to CMS or snapshot tables, and invoker functions by default.
do $roles$
declare t text;
begin
  foreach t in array array['package_variants','package_eligibility','package_revisions','package_activity','package_seed_sources'] loop
    execute format('alter table cms.%I enable row level security',t);
    execute format('revoke all on cms.%I from public,anon,authenticated',t);
    execute format('grant all on cms.%I to service_role',t);
    execute format('create policy service_role_all on cms.%I for all to service_role using (true) with check (true)',t);
  end loop;
end;
$roles$;
alter table operations.estimate_package_snapshots enable row level security;
revoke all on operations.estimate_package_snapshots from public,anon,authenticated;
grant all on operations.estimate_package_snapshots to service_role;
create policy service_role_all on operations.estimate_package_snapshots for all to service_role using (true) with check (true);

create function cms.assert_package_admin(p_actor_id uuid) returns void
language plpgsql security definer set search_path=''
as $fn$
begin
  if not exists (
    select 1 from core.user_profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_actor_id and p.role='admin'
      and coalesce(u.raw_app_meta_data->>'account_status','active') <> 'deactivated'
      and (u.banned_until is null or u.banned_until<=now())
  ) then raise exception using errcode='42501',message='An active administrator is required.'; end if;
end;
$fn$;
revoke all on function cms.assert_package_admin(uuid) from public,anon,authenticated;
grant execute on function cms.assert_package_admin(uuid) to service_role;

create function cms.managed_package_definition(p_package_id uuid) returns jsonb
language sql stable security invoker set search_path=''
as $fn$
select jsonb_build_object(
  'id',p.id,'packageKey',p.package_key,'name',p.package_name,'description',coalesce(p.package_description,''),
  'type',p.package_type,'category',p.category,'serviceGroup',p.service_group,
  'anchorProductId',p.anchor_product_id,'anchorCategory',coalesce(p.anchor_category,''),'triggerServiceId',p.trigger_service_id,
  'imageUrl',coalesce(p.image_url,''),'internalNotes',coalesce(p.internal_notes,''),'priority',p.priority,
  'minAnchorQuantity',p.min_anchor_quantity,'relationshipVerified',p.relationship_verified,
  'relationshipEvidence',coalesce(p.relationship_evidence,''),'expectedRevision',p.draft_revision,
  'eligibility',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'mode',e.mode,'fitmentId',e.fitment_id,'make',e.make,'model',e.model,'family',e.family,
    'engine',e.engine,'variant',e.vehicle_variant,'yearFrom',e.year_from,'yearTo',e.year_to,'verified',e.is_verified,'evidence',e.evidence
  ) order by e.id) from cms.package_eligibility e where e.package_id=p.id and e.variant_id is null),'[]'::jsonb),
  'variants',coalesce((select jsonb_agg(jsonb_build_object(
    'id',v.id,'key',v.variant_key,'label',v.label,'description',v.description,'displayOrder',v.display_order,'active',v.is_active,
    'pricing',jsonb_build_object('mode',v.pricing_mode,'strategy',v.pricing_strategy,'value',v.pricing_value),
    'eligibility',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'mode',e.mode,'fitmentId',e.fitment_id,'make',e.make,'model',e.model,'family',e.family,
      'engine',e.engine,'variant',e.vehicle_variant,'yearFrom',e.year_from,'yearTo',e.year_to,'verified',e.is_verified,'evidence',e.evidence
    ) order by e.id) from cms.package_eligibility e where e.variant_id=v.id),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'kind',i.item_kind,'productId',i.product_id,'serviceId',i.service_id,'quantity',i.quantity,
      'displayOrder',i.display_priority,'required',i.is_required,'active',i.is_active,
      'priceMode',i.price_mode,'priceOverride',i.price_override,'reason',coalesce(i.reason_label,'')
    ) order by i.display_priority,i.id) from cms.recommendation_package_items i where i.variant_id=v.id),'[]'::jsonb)
  ) order by v.display_order,v.id) from cms.package_variants v where v.package_id=p.id),'[]'::jsonb)
) from cms.recommendation_packages p where p.id=p_package_id;
$fn$;
revoke all on function cms.managed_package_definition(uuid) from public,anon,authenticated;
grant execute on function cms.managed_package_definition(uuid) to service_role;

create function cms.save_managed_package(
  p_definition jsonb,p_actor_id uuid,p_expected_revision integer,
  p_source_kind text default 'manual',p_seed_key text default null,
  p_source_records jsonb default '[]'::jsonb,p_review_notes text default ''
) returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare
  pid uuid := (p_definition->>'id')::uuid;
  existing cms.recommendation_packages%rowtype;
  v jsonb; i jsonb; e jsonb; vid uuid; eid uuid;
  variant_ids uuid[] := '{}'; item_ids uuid[] := '{}'; eligibility_ids uuid[] := '{}';
begin
  perform cms.assert_package_admin(p_actor_id);
  if p_expected_revision is null or p_expected_revision<0 then
    raise exception using errcode='22023',message='Reload the package before saving.';
  end if;
  if p_source_kind not in ('manual','starter','legacy','suggestion')
    or (p_source_kind<>'manual' and nullif(btrim(p_seed_key),'') is null) then
    raise exception using errcode='22023',message='Generated packages require a stable provenance key.';
  end if;
  if p_source_kind<>'manual' then
    if jsonb_typeof(p_source_records)<>'array' or jsonb_array_length(p_source_records)>2000 then
      raise exception using errcode='22023',message='Generated source provenance must be a bounded array.';
    end if;
    -- Only the short database write is serialized. Discovery, price queries,
    -- network calls and administrator review all happen outside this lock.
    perform pg_catalog.pg_advisory_xact_lock(5261100,1);
    if exists(select 1 from cms.package_seed_sources where source_key=p_seed_key)
      or exists (
        select 1 from jsonb_array_elements(p_source_records) src
        join cms.package_seed_sources owned on owned.source_records @>
          jsonb_build_array(jsonb_build_object('table',src->>'table','key',src->>'key'))
        where src->>'table' in ('reco.quote_recommendation_rules','reco.service_recommendation_groups','catalog.products')
          and nullif(src->>'key','') is not null
      ) then
      raise exception using errcode='23505',message='This source already has a managed package. Initialization never overwrites it.';
    end if;
  end if;
  if jsonb_typeof(p_definition)<>'object' or jsonb_typeof(p_definition->'variants')<>'array'
     or jsonb_array_length(p_definition->'variants')>8 then
    raise exception using errcode='22023',message='Invalid package definition.';
  end if;
  -- A missing row cannot be locked FOR UPDATE. Serialize the stable identity
  -- before the initial insert as well, so two first saves cannot overwrite one
  -- another through ON CONFLICT after both observed an absent package.
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended('managed-package:'||pid::text,0));
  select * into existing from cms.recommendation_packages where id=pid for update;
  if found then
    if existing.draft_revision<>p_expected_revision then raise exception using errcode='40001',message='This package changed in another session. Reload before saving.'; end if;
    if existing.publication_status='archived' then raise exception using errcode='22023',message='Restore this package before editing.'; end if;
    if p_source_kind<>'manual' then raise exception using errcode='22023',message='Initialization never overwrites an existing package.'; end if;
  elsif p_expected_revision<>0 then
    raise exception using errcode='40001',message='This package no longer exists. Reload before saving.';
  end if;
  if exists (select 1 from cms.recommendation_packages where package_key=p_definition->>'packageKey' and id<>pid) then
    raise exception using errcode='23505',message='Choose a unique package key.';
  end if;
  insert into cms.recommendation_packages (
    id,anchor_product_id,package_key,package_name,package_description,package_type,category,service_group,
    anchor_category,trigger_service_id,image_url,internal_notes,priority,min_anchor_quantity,
    relationship_verified,relationship_evidence,is_active,source_kind,seed_key,created_by,updated_by,draft_revision
  ) values (
    pid,nullif(p_definition->>'anchorProductId','')::uuid,p_definition->>'packageKey',p_definition->>'name',p_definition->>'description',
    p_definition->>'type',coalesce(p_definition->>'category',''),coalesce(nullif(p_definition->>'serviceGroup',''),'maintenance'),
    nullif(p_definition->>'anchorCategory',''),nullif(p_definition->>'triggerServiceId','')::uuid,
    nullif(p_definition->>'imageUrl',''),nullif(p_definition->>'internalNotes',''),(p_definition->>'priority')::integer,
    (p_definition->>'minAnchorQuantity')::integer,(p_definition->>'relationshipVerified')::boolean,
    p_definition->>'relationshipEvidence',false,p_source_kind,p_seed_key,p_actor_id,p_actor_id,1
  ) on conflict (id) do update set
    anchor_product_id=excluded.anchor_product_id,package_key=excluded.package_key,package_name=excluded.package_name,
    package_description=excluded.package_description,package_type=excluded.package_type,category=excluded.category,
    service_group=excluded.service_group,anchor_category=excluded.anchor_category,trigger_service_id=excluded.trigger_service_id,
    image_url=excluded.image_url,internal_notes=excluded.internal_notes,priority=excluded.priority,
    min_anchor_quantity=excluded.min_anchor_quantity,relationship_verified=excluded.relationship_verified,
    relationship_evidence=excluded.relationship_evidence,is_active=false,updated_by=p_actor_id,updated_at=now(),
    draft_revision=cms.recommendation_packages.draft_revision+1,
    seed_customized=cms.recommendation_packages.seed_customized or cms.recommendation_packages.source_kind<>'manual';

  -- Validate ownership before touching children: a malicious/stale payload cannot
  -- move an item/variant/rule from a different package by reusing its UUID.
  for v in select value from jsonb_array_elements(p_definition->'variants') loop
    vid := (v->>'id')::uuid;
    if vid=any(variant_ids) or exists(select 1 from cms.package_variants where id=vid and package_id<>pid) then
      raise exception using errcode='22023',message='Invalid or duplicate variant identity.';
    end if;
    variant_ids:=array_append(variant_ids,vid);
    if jsonb_array_length(v->'items')>40 then raise exception using errcode='22023',message='Too many package items.'; end if;
    for i in select value from jsonb_array_elements(v->'items') loop
      if (i->>'id')::uuid=any(item_ids) or exists(select 1 from cms.recommendation_package_items where id=(i->>'id')::uuid and package_id<>pid) then
        raise exception using errcode='22023',message='Invalid or duplicate item identity.';
      end if;
      item_ids:=array_append(item_ids,(i->>'id')::uuid);
    end loop;
  end loop;
  if cardinality(item_ids)>120 then raise exception using errcode='22023',message='Too many item definitions across package variants.'; end if;
  -- Delete only removed draft items. Published revisions and quote snapshots
  -- are separate immutable records and are never modified by a draft save.
  delete from cms.recommendation_package_items where package_id=pid and not(id=any(item_ids));
  -- Swap-safe unique keys/orders: defer business key replacement within the
  -- transaction, while maintaining immutable row IDs.
  update cms.package_variants set variant_key='pending-'||id::text where package_id=pid;
  for v in select value from jsonb_array_elements(p_definition->'variants') loop
    vid:=(v->>'id')::uuid;
    insert into cms.package_variants(id,package_id,variant_key,label,description,display_order,is_active,pricing_mode,pricing_strategy,pricing_value)
    values(vid,pid,v->>'key',v->>'label',coalesce(v->>'description',''),(v->>'displayOrder')::integer,(v->>'active')::boolean,
      v#>>'{pricing,mode}',v#>>'{pricing,strategy}',(v#>>'{pricing,value}')::numeric)
    on conflict(id) do update set variant_key=excluded.variant_key,label=excluded.label,description=excluded.description,
      display_order=excluded.display_order,is_active=excluded.is_active,pricing_mode=excluded.pricing_mode,
      pricing_strategy=excluded.pricing_strategy,pricing_value=excluded.pricing_value;
    -- A product swap must not transiently violate the active-item unique index.
    update cms.recommendation_package_items set is_active=false where variant_id=vid;
    for i in select value from jsonb_array_elements(v->'items') loop
      insert into cms.recommendation_package_items(id,package_id,variant_id,item_kind,item_role,product_id,service_id,
        quantity,is_required,reason_label,display_priority,price_mode,price_override,is_active,created_by,updated_by)
      values((i->>'id')::uuid,pid,vid,i->>'kind',case when i->>'kind'='product' then 'part' else 'service' end,
        nullif(i->>'productId','')::uuid,nullif(i->>'serviceId','')::uuid,(i->>'quantity')::integer,(i->>'required')::boolean,
        nullif(i->>'reason',''),(i->>'displayOrder')::integer,i->>'priceMode',nullif(i->>'priceOverride','')::numeric,(i->>'active')::boolean,p_actor_id,p_actor_id)
      on conflict(id) do update set variant_id=excluded.variant_id,item_kind=excluded.item_kind,item_role=excluded.item_role,
        product_id=excluded.product_id,service_id=excluded.service_id,quantity=excluded.quantity,is_required=excluded.is_required,
        reason_label=excluded.reason_label,display_priority=excluded.display_priority,price_mode=excluded.price_mode,
        price_override=excluded.price_override,is_active=excluded.is_active,updated_by=p_actor_id,updated_at=now();
    end loop;
  end loop;
  for e in
    select value||jsonb_build_object('variantId',null) from jsonb_array_elements(p_definition->'eligibility')
    union all
    select er.value||jsonb_build_object('variantId',vr.value->>'id')
    from jsonb_array_elements(p_definition->'variants') vr cross join lateral jsonb_array_elements(vr.value->'eligibility') er
  loop
    eid:=(e->>'id')::uuid;
    if eid=any(eligibility_ids) or exists(select 1 from cms.package_eligibility where id=eid and package_id<>pid) then
      raise exception using errcode='22023',message='Invalid or duplicate compatibility identity.';
    end if;
    eligibility_ids:=array_append(eligibility_ids,eid);
    insert into cms.package_eligibility(id,package_id,variant_id,mode,fitment_id,make,model,family,engine,vehicle_variant,
      year_from,year_to,is_verified,evidence)
    values(eid,pid,nullif(e->>'variantId','')::uuid,e->>'mode',nullif(e->>'fitmentId','')::uuid,
      e->>'make',e->>'model',e->>'family',e->>'engine',e->>'variant',nullif(e->>'yearFrom','')::integer,
      nullif(e->>'yearTo','')::integer,(e->>'verified')::boolean,e->>'evidence')
    on conflict(id) do update set variant_id=excluded.variant_id,mode=excluded.mode,fitment_id=excluded.fitment_id,
      make=excluded.make,model=excluded.model,family=excluded.family,engine=excluded.engine,vehicle_variant=excluded.vehicle_variant,
      year_from=excluded.year_from,year_to=excluded.year_to,is_verified=excluded.is_verified,evidence=excluded.evidence;
  end loop;
  if cardinality(eligibility_ids)>270 then raise exception using errcode='22023',message='Too many compatibility rules.'; end if;
  delete from cms.package_eligibility where package_id=pid and not(id=any(eligibility_ids));
  delete from cms.package_variants where package_id=pid and not(id=any(variant_ids));
  insert into cms.package_activity(package_id,action,draft_revision,actor_id)
  select pid,case when existing.id is null then 'created' else 'draft_saved' end,draft_revision,p_actor_id
  from cms.recommendation_packages where id=pid;
  if p_source_kind<>'manual' then
    insert into cms.package_seed_sources(source_key,source_kind,package_id,source_records,review_notes)
    values(p_seed_key,p_source_kind,pid,p_source_records,p_review_notes);
  end if;
  return cms.managed_package_definition(pid);
end;
$fn$;
revoke all on function cms.save_managed_package(jsonb,uuid,integer,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function cms.save_managed_package(jsonb,uuid,integer,text,text,jsonb,text) to service_role;

create function cms.publish_managed_package(
  p_package_id uuid,p_expected_revision integer,p_actor_id uuid,p_pricing_snapshot jsonb
) returns uuid language plpgsql security invoker set search_path=''
as $fn$
declare
  pkg cms.recommendation_packages%rowtype;
  definition jsonb; revision_id uuid; variant_row cms.package_variants%rowtype;
  priced jsonb; line jsonb; allocation jsonb;
  line_row cms.recommendation_package_items%rowtype;
  catalog_price numeric; item_price numeric; catalog_sum numeric; effective_sum numeric;
  item_sum numeric; expected_total numeric; allocation_sum numeric; allocation_quantity integer;
  nproducts integer; nservices integer; variant_count integer:=0; seen_lines uuid[];
begin
  perform cms.assert_package_admin(p_actor_id);
  select * into pkg from cms.recommendation_packages where id=p_package_id for update;
  if not found then raise exception using errcode='22023',message='Package not found.'; end if;
  if p_expected_revision is null or pkg.draft_revision<>p_expected_revision then raise exception using errcode='40001',message='This package changed. Reload before publishing.'; end if;
  if pkg.publication_status='archived' then raise exception using errcode='22023',message='Restore this package before publishing.'; end if;
  select id into revision_id from cms.package_revisions where package_id=p_package_id and revision_number=p_expected_revision;
  if revision_id is not null and pkg.publication_status='published' and pkg.published_revision_id=revision_id then return revision_id; end if;
  if p_expected_revision<1 or jsonb_typeof(p_pricing_snapshot)<>'array' then
    raise exception using errcode='22023',message='Save and preview this package before publishing.';
  end if;
  for variant_row in select * from cms.package_variants where package_id=p_package_id and is_active order by display_order,id loop
    variant_count:=variant_count+1;
    if not exists(select 1 from cms.package_eligibility where package_id=p_package_id and (variant_id=variant_row.id or variant_id is null)) then
      raise exception using errcode='22023',message='Each package variant needs reviewed compatibility rules.';
    end if;
    if exists(select 1 from cms.package_eligibility e where e.package_id=p_package_id
      and (e.variant_id=variant_row.id or (e.variant_id is null and not exists(
        select 1 from cms.package_eligibility own where own.variant_id=variant_row.id)))
      and (not e.is_verified or e.mode='unverified' or nullif(btrim(e.evidence),'') is null
        or (e.mode='exact' and not exists(select 1 from catalog.public_vehicle_fitments f where f.id=e.fitment_id and f.is_active
          and (e.engine='' or lower(f.engine)=lower(e.engine))
          and (e.year_from is null or f.year>=e.year_from) and (e.year_to is null or f.year<=e.year_to)))
        or (e.mode='model_year' and (e.model='' or e.year_from is null or e.year_to is null or exists(
          select 1 from generate_series(e.year_from,e.year_to) yr where not exists(
            select 1 from catalog.public_vehicle_fitments f where f.is_active and lower(f.model_name)=lower(e.model)
              and f.year=yr and (e.engine='' or lower(f.engine)=lower(e.engine))))))
        or (e.mode='family' and (e.family='' or not exists(select 1 from catalog.public_vehicle_fitments f
          where f.is_active and lower(f.vehicle_family)=lower(e.family) and (e.engine='' or lower(f.engine)=lower(e.engine))))))) then
      raise exception using errcode='22023',message='Review compatibility evidence and supported vehicle configurations before publishing.';
    end if;
    if pkg.package_type='vehicle' and exists(select 1 from cms.package_eligibility where package_id=p_package_id
      and (variant_id=variant_row.id or (variant_id is null and not exists(
        select 1 from cms.package_eligibility own where own.variant_id=variant_row.id))) and mode='universal') then
      raise exception using errcode='22023',message='A car package needs explicit compatible vehicles.';
    end if;
    select count(*) filter(where item_kind='product'),count(*) filter(where item_kind='service')
      into nproducts,nservices from cms.recommendation_package_items where variant_id=variant_row.id and is_active;
    if nproducts+nservices=0 or (pkg.package_type='parts' and (nproducts<2 or nservices>0))
      or (pkg.package_type='service' and (nservices=0 or nproducts>0))
      or (pkg.package_type='combination' and (nproducts=0 or nservices=0)) then
      raise exception using errcode='22023',message='The selected items do not match the package type.';
    end if;
    if nproducts>0 and (not pkg.relationship_verified or nullif(btrim(pkg.relationship_evidence),'') is null) then
      raise exception using errcode='22023',message='Review the relationship and fitment of the package items.';
    end if;
    select value into priced from jsonb_array_elements(p_pricing_snapshot) where (value->>'variantId')::uuid=variant_row.id;
    if priced is null or jsonb_typeof(priced->'lines')<>'array' then
      raise exception using errcode='22023',message='Missing authoritative variant pricing.';
    end if;
    catalog_sum:=0; effective_sum:=0; item_sum:=0; seen_lines:='{}';
    for line in select value from jsonb_array_elements(priced->'lines') loop
      select * into line_row from cms.recommendation_package_items
        where id=(line->>'itemId')::uuid and variant_id=variant_row.id and is_active;
      if not found or line_row.id=any(seen_lines) or line_row.quantity<>(line->>'quantity')::integer then
        raise exception using errcode='22023',message='Package pricing does not match its complete item list.';
      end if;
      seen_lines:=array_append(seen_lines,line_row.id);
      catalog_price:=null;
      if line_row.item_kind='product' then
        select pr.amount into catalog_price from catalog.products p
        join catalog.product_prices pr on pr.product_id=p.id and pr.price_type='retail' and pr.is_current and pr.currency='PHP'
        where p.id=line_row.product_id and p.is_active and p.status<>'discontinued'
        order by pr.effective_from desc,pr.created_at desc limit 1;
        if catalog_price is null or catalog_price<=0 then raise exception using errcode='22023',message='A product has no valid active catalog price.'; end if;
      else
        select standard_price into catalog_price from operations.services where id=line_row.service_id and is_active;
        if catalog_price is null then raise exception using errcode='22023',message='A service is no longer active.'; end if;
      end if;
      if catalog_price<>(line->>'catalogUnitPrice')::numeric then raise exception using errcode='40001',message='A catalog price changed. Preview the package again.'; end if;
      item_price:=case line_row.price_mode when 'complimentary' then 0 when 'override' then line_row.price_override else catalog_price end;
      if item_price is null or item_price<0 or item_price>catalog_price or (line_row.price_mode='complimentary' and line_row.item_kind<>'service') then
        raise exception using errcode='22023',message='An item override is invalid or increases the catalog price.';
      end if;
      allocation_sum:=0; allocation_quantity:=0;
      for allocation in select value from jsonb_array_elements(line->'allocations') loop
        if (allocation->>'quantity')::integer<1 or (allocation->>'unitPrice')::numeric<0
          or (allocation->>'unitPrice')::numeric<>round((allocation->>'unitPrice')::numeric,2) then
          raise exception using errcode='22023',message='Invalid package price allocation.';
        end if;
        allocation_quantity:=allocation_quantity+(allocation->>'quantity')::integer;
        allocation_sum:=allocation_sum+(allocation->>'quantity')::integer*(allocation->>'unitPrice')::numeric;
      end loop;
      if allocation_quantity<>line_row.quantity or allocation_sum<>(line->>'effectiveTotal')::numeric
        or allocation_sum>item_price*line_row.quantity then
        raise exception using errcode='22023',message='Package allocations do not preserve the approved quantities and total.';
      end if;
      catalog_sum:=catalog_sum+catalog_price*line_row.quantity;
      item_sum:=item_sum+item_price*line_row.quantity;
      effective_sum:=effective_sum+allocation_sum;
    end loop;
    expected_total:=case variant_row.pricing_mode
      when 'percentage' then round(item_sum*(1-variant_row.pricing_value/100),2)
      when 'fixed_discount' then item_sum-variant_row.pricing_value
      when 'fixed_price' then variant_row.pricing_value else item_sum end;
    if cardinality(seen_lines)<>nproducts+nservices or expected_total<0 or expected_total>item_sum
      or effective_sum<>expected_total or catalog_sum<>(priced->>'catalogTotal')::numeric
      or expected_total<>(priced->>'packageTotal')::numeric or catalog_sum-expected_total<>(priced->>'savings')::numeric then
      raise exception using errcode='22023',message='The package totals do not match its approved pricing policy.';
    end if;
  end loop;
  if variant_count=0 or variant_count<>jsonb_array_length(p_pricing_snapshot) then
    raise exception using errcode='22023',message='The package preview must contain every active variant exactly once.';
  end if;
  definition:=cms.managed_package_definition(p_package_id);
  insert into cms.package_revisions(package_id,revision_number,definition,pricing_snapshot,published_by)
    values(p_package_id,p_expected_revision,definition,p_pricing_snapshot,p_actor_id) returning id into revision_id;
  update cms.recommendation_packages set publication_status='published',published_revision_id=revision_id,
    published_at=now(),updated_by=p_actor_id,updated_at=now(),is_active=false where id=p_package_id;
  insert into cms.package_activity(package_id,action,draft_revision,actor_id,details)
    values(p_package_id,'published',p_expected_revision,p_actor_id,jsonb_build_object('revisionId',revision_id));
  return revision_id;
end;
$fn$;
revoke all on function cms.publish_managed_package(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function cms.publish_managed_package(uuid,integer,uuid,jsonb) to service_role;

create function cms.transition_managed_package(p_package_id uuid,p_expected_revision integer,p_actor_id uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path=''
as $fn$
declare pkg cms.recommendation_packages%rowtype; next_status text;
begin
  perform cms.assert_package_admin(p_actor_id);
  select * into pkg from cms.recommendation_packages where id=p_package_id for update;
  if not found then raise exception using errcode='22023',message='Package not found.'; end if;
  if p_expected_revision is null or pkg.draft_revision<>p_expected_revision then raise exception using errcode='40001',message='This package changed. Reload before changing its status.'; end if;
  if p_action='archive' then next_status:='archived';
  elsif p_action='unpublish' and pkg.publication_status<>'archived' then next_status:='unpublished';
  elsif p_action='restore' and pkg.publication_status='archived' then next_status:=case when pkg.published_revision_id is null then 'draft' else 'unpublished' end;
  else raise exception using errcode='22023',message='This package status change is not allowed.'; end if;
  update cms.recommendation_packages set publication_status=next_status,is_active=false,draft_revision=draft_revision+1,
    updated_at=now(),updated_by=p_actor_id where id=p_package_id;
  insert into cms.package_activity(package_id,action,draft_revision,actor_id)
    values(p_package_id,p_action,p_expected_revision+1,p_actor_id);
  return jsonb_build_object('id',p_package_id,'status',next_status,'expectedRevision',p_expected_revision+1);
end;
$fn$;
revoke all on function cms.transition_managed_package(uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function cms.transition_managed_package(uuid,integer,uuid,text) to service_role;

-- Publications, seed ownership, activity and issued quote snapshots are append
-- only to application code. Actor FKs may still be nulled by account deletion.
revoke update,delete on cms.package_revisions,cms.package_seed_sources,cms.package_activity,
  operations.estimate_package_snapshots from service_role;

alter table operations.services add column category text not null default '';

create index products_package_search_idx on catalog.products using gin (
  to_tsvector('simple'::regconfig,coalesce(sku,'')||' '||coalesce(name,'')||' '||coalesce(category,'')||' '||coalesce(model_name,'')||' '||coalesce(brand,''))
) where is_active;

create function cms.search_package_products(p_search text default '',p_page integer default 1,p_page_size integer default 12)
returns jsonb language sql stable security invoker set search_path=''
as $fn$
with input as (
  select left(btrim(coalesce(p_search,'')),120) q,greatest(coalesce(p_page,1),1) page,least(greatest(coalesce(p_page_size,12),1),40) size
), terms as (
  select to_tsquery('simple'::regconfig,string_agg(quote_literal(token)||':*',' & ')) query
  from input cross join lateral regexp_split_to_table(lower(input.q),'[^[:alnum:]_]+') token where length(token)>0
), matches as materialized (
  select p.id,p.sku,p.name,p.category,p.brand,p.model_name,p.status,p.is_active
  from catalog.products p cross join input cross join terms
  where p.is_active and (input.q='' or to_tsvector('simple'::regconfig,
    coalesce(p.sku,'')||' '||coalesce(p.name,'')||' '||coalesce(p.category,'')||' '||coalesce(p.model_name,'')||' '||coalesce(p.brand,''))@@terms.query)
), paged as (
  select m.*,row_number() over(order by case when lower(m.sku)=lower(input.q) then 0 when lower(m.sku) like lower(input.q)||'%' then 1 else 2 end,m.sku,m.id) result_order
  from matches m cross join input
  order by case when lower(m.sku)=lower(input.q) then 0 when lower(m.sku) like lower(input.q)||'%' then 1 else 2 end,m.sku,m.id
  limit (select size from input) offset (select (page-1)*size from input)
), priced as (
  select p.*,pr.amount price,b.on_hand stock from paged p
  left join lateral (select amount from catalog.product_prices where product_id=p.id and price_type='retail'
    and is_current and currency='PHP' order by effective_from desc,created_at desc limit 1) pr on true
  left join catalog.inventory_balances b on b.product_id=p.id
)
select jsonb_build_object('products',coalesce((select jsonb_agg(to_jsonb(priced)-'result_order' order by result_order) from priced),'[]'::jsonb),
  'pagination',jsonb_build_object('page',(select page from input),'pageSize',(select size from input),'totalCount',(select count(*) from matches)));
$fn$;
revoke all on function cms.search_package_products(text,integer,integer) from public,anon,authenticated;
grant execute on function cms.search_package_products(text,integer,integer) to service_role;

create function cms.save_package_service(p_service jsonb,p_actor_id uuid) returns jsonb
language plpgsql security invoker set search_path=''
as $fn$
declare saved operations.services%rowtype;
begin
  perform cms.assert_package_admin(p_actor_id);
  if nullif(btrim(p_service->>'name'),'') is null or length(p_service->>'name')>180
    or coalesce(p_service->>'code','')!~'^[A-Z0-9][A-Z0-9_-]{1,49}$'
    or coalesce((p_service->>'price')::numeric,-1)<0
    or (p_service->>'price')::numeric>100000000
    or (p_service->>'price')::numeric<>round((p_service->>'price')::numeric,2)
    or coalesce((p_service->>'durationMinutes')::integer,0) not between 1 and 1440 then
    raise exception using errcode='22023',message='Enter a service code, name, valid price, and duration.';
  end if;
  insert into operations.services(code,name,description,category,standard_price,estimated_duration_minutes,is_active)
    values(p_service->>'code',p_service->>'name',left(coalesce(p_service->>'description',''),2000),
      left(coalesce(p_service->>'category',''),100),(p_service->>'price')::numeric,(p_service->>'durationMinutes')::integer,true)
    returning * into saved;
  return to_jsonb(saved);
end;
$fn$;
revoke all on function cms.save_package_service(jsonb,uuid) from public,anon,authenticated;
grant execute on function cms.save_package_service(jsonb,uuid) to service_role;

create function cms.managed_package_page(
  p_search text default '',p_type text default null,p_status text default null,p_page integer default 1,p_page_size integer default 12
) returns jsonb language sql stable security invoker set search_path=''
as $fn$
with input as (
  select left(btrim(coalesce(p_search,'')),120) q,greatest(coalesce(p_page,1),1) page,least(greatest(coalesce(p_page_size,12),1),20) size
), matches as materialized (
  select p.* from cms.recommendation_packages p cross join input
  where (nullif(p_type,'') is null or p.package_type=p_type)
    and (nullif(p_status,'') is null or p.publication_status=p_status)
    and (input.q='' or p.package_name ilike '%'||input.q||'%' or p.package_key ilike '%'||input.q||'%')
), paged as (
  select * from matches order by priority,updated_at desc,id
  limit (select size from input) offset (select (page-1)*size from input)
)
select jsonb_build_object('packages',coalesce((select jsonb_agg(
  cms.managed_package_definition(p.id)||jsonb_build_object('publication_status',p.publication_status,'published_revision_id',p.published_revision_id,
    'published_at',p.published_at,'updated_at',p.updated_at,'source_kind',p.source_kind,'seed_key',p.seed_key,'seed_customized',p.seed_customized)
  order by p.priority,p.updated_at desc,p.id) from paged p),'[]'::jsonb),
  'pagination',jsonb_build_object('page',(select page from input),'pageSize',(select size from input),'totalCount',(select count(*) from matches)));
$fn$;
revoke all on function cms.managed_package_page(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function cms.managed_package_page(text,text,text,integer,integer) to service_role;

-- Eligibility is evaluated against the immutable publication, never the working
-- draft tables. These helpers contain algorithms, not business package content.
create function cms.managed_package_rule_matches(p_rule jsonb,p_vehicle jsonb)
returns boolean language sql immutable security invoker set search_path=''
as $fn$
select coalesce(
  p_rule->>'verified'='true' and nullif(btrim(p_rule->>'evidence'),'') is not null
  and (p_rule->>'mode'='universal' or (
    (coalesce(p_rule->>'make','')='' or lower(btrim(p_rule->>'make'))=lower(btrim(p_vehicle->>'make')))
    and (coalesce(p_rule->>'engine','')='' or lower(btrim(p_rule->>'engine'))=lower(btrim(p_vehicle->>'engine')))
    and (coalesce(p_rule->>'variant','')='' or lower(btrim(p_rule->>'variant'))=lower(btrim(p_vehicle->>'variant')))
    and (p_rule->>'yearFrom' is null or (p_vehicle->>'year')::integer >= (p_rule->>'yearFrom')::integer)
    and (p_rule->>'yearTo' is null or (p_vehicle->>'year')::integer <= (p_rule->>'yearTo')::integer)
    and case p_rule->>'mode'
      when 'exact' then nullif(p_rule->>'fitmentId','')=p_vehicle->>'fitmentId'
      when 'model_year' then nullif(lower(btrim(p_rule->>'model')),'')=lower(btrim(p_vehicle->>'model'))
      when 'family' then nullif(lower(btrim(p_rule->>'family')),'')=lower(btrim(p_vehicle->>'family'))
      else false end
  )),false);
$fn$;
revoke all on function cms.managed_package_rule_matches(jsonb,jsonb) from public,anon,authenticated;
grant execute on function cms.managed_package_rule_matches(jsonb,jsonb) to service_role;

create function cms.published_managed_package_page(
  p_vehicle jsonb default '{}'::jsonb,p_product_ids uuid[] default '{}',p_categories text[] default '{}',
  p_service_ids uuid[] default '{}',p_type text default null,p_page integer default 1,p_page_size integer default 6
) returns jsonb language sql stable security invoker set search_path=''
as $fn$
with input as (
  select greatest(coalesce(p_page,1),1) page,least(greatest(coalesce(p_page_size,6),1),12) size
), matches as materialized (
  select r.id revision_id,r.package_id,r.revision_number,r.definition,r.pricing_snapshot,
    (r.definition->>'priority')::integer priority,eligible.variants
  from cms.recommendation_packages p
  join cms.package_revisions r on r.id=p.published_revision_id and r.package_id=p.id
  cross join lateral (
    select jsonb_agg(v.value order by (v.value->>'displayOrder')::integer,v.value->>'id') variants
    from jsonb_array_elements(r.definition->'variants') v
    where v.value->>'active'='true' and exists (
      select 1 from jsonb_array_elements(case when jsonb_array_length(v.value->'eligibility')>0
        then v.value->'eligibility' else r.definition->'eligibility' end) rule
      where cms.managed_package_rule_matches(rule.value,p_vehicle)
    )
  ) eligible
  where p.publication_status='published' and eligible.variants is not null
    and (nullif(p_type,'') is null or r.definition->>'type'=p_type)
    and (nullif(r.definition->>'anchorProductId','') is null
      or (r.definition->>'anchorProductId')::uuid=any(p_product_ids))
    and (coalesce(r.definition->>'anchorCategory','')=''
      or lower(btrim(r.definition->>'anchorCategory'))=any(p_categories))
    and (nullif(r.definition->>'triggerServiceId','') is null
      or (r.definition->>'triggerServiceId')::uuid=any(p_service_ids))
), paged as (
  select * from matches order by priority,package_id
  limit (select size from input) offset (select (page-1)*size from input)
)
select jsonb_build_object('packages',coalesce((select jsonb_agg(jsonb_build_object(
  'revisionId',revision_id,'revisionNumber',revision_number,
  'definition',definition||jsonb_build_object('variants',variants),'pricingSnapshot',pricing_snapshot
) order by priority,package_id) from paged),'[]'::jsonb),
  'pagination',jsonb_build_object('page',(select page from input),'pageSize',(select size from input),
    'totalCount',(select count(*) from matches)));
$fn$;
revoke all on function cms.published_managed_package_page(jsonb,uuid[],text[],uuid[],text,integer,integer) from public,anon,authenticated;
grant execute on function cms.published_managed_package_page(jsonb,uuid[],text[],uuid[],text,integer,integer) to service_role;

commit;
