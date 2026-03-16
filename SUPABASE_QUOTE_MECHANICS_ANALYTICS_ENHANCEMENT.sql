create table if not exists app.quote_recommendation_rules (
  id uuid primary key default gen_random_uuid(),
  anchor_type text not null default 'category' check (anchor_type in ('product', 'category')),
  anchor_product_id uuid references app.products(id) on delete cascade,
  anchor_category text,
  related_product_id uuid references app.products(id) on delete cascade,
  related_service_id uuid references app.services(id) on delete cascade,
  vehicle_model_name text,
  reason_label text not null,
  package_key text not null,
  package_name text not null,
  package_description text,
  priority integer not null default 100,
  is_active boolean not null default true,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (anchor_type = 'product' and anchor_product_id is not null) or
    (anchor_type = 'category' and coalesce(anchor_category, '') <> '')
  ),
  check (
    (related_product_id is not null and related_service_id is null) or
    (related_product_id is null and related_service_id is not null)
  )
);

create table if not exists app.estimate_revisions (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references app.estimates(id) on delete cascade,
  revision_number integer not null,
  change_note text,
  estimate_snapshot jsonb not null,
  revised_by uuid references auth.users(id) on delete set null,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (estimate_id, revision_number)
);

create table if not exists app.mechanics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  specialization text not null,
  availability_status text not null default 'available' check (availability_status in ('available', 'off_duty', 'booked')),
  shift_label text,
  location_name text not null default 'Main Shop',
  bio text,
  photo_url text,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  business_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists dw.fact_daily_item_sales (
  id bigserial primary key,
  date_key integer not null,
  sale_date date not null,
  product_key integer references dw.dim_product(product_key) on delete cascade,
  category text,
  product_name text,
  sku text,
  brand text,
  location_name text not null default 'Main Shop',
  quantity numeric(12,2) not null default 0,
  revenue numeric(14,2) not null default 0,
  source_line_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists dw.fact_monthly_item_sales (
  id bigserial primary key,
  month_key integer not null,
  month_start date not null,
  product_key integer references dw.dim_product(product_key) on delete cascade,
  category text,
  product_name text,
  sku text,
  brand text,
  location_name text not null default 'Main Shop',
  quantity numeric(12,2) not null default 0,
  revenue numeric(14,2) not null default 0,
  source_line_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_quote_recommendation_rules_anchor_product
  on app.quote_recommendation_rules (anchor_product_id)
  where anchor_product_id is not null;

create index if not exists idx_quote_recommendation_rules_anchor_category
  on app.quote_recommendation_rules (anchor_category)
  where anchor_category is not null;

create index if not exists idx_estimate_revisions_estimate_id
  on app.estimate_revisions (estimate_id, revision_number desc);

create index if not exists idx_mechanics_public_sort
  on app.mechanics (is_public, sort_order, full_name);

create index if not exists idx_fact_daily_item_sales_lookup
  on dw.fact_daily_item_sales (sale_date, product_key, category);

create index if not exists idx_fact_monthly_item_sales_lookup
  on dw.fact_monthly_item_sales (month_start, product_key, category);

drop trigger if exists trg_quote_recommendation_rules_updated_at on app.quote_recommendation_rules;
create trigger trg_quote_recommendation_rules_updated_at
before update on app.quote_recommendation_rules
for each row execute function app.touch_updated_at();

drop trigger if exists trg_estimate_revisions_updated_at on app.estimate_revisions;
create trigger trg_estimate_revisions_updated_at
before update on app.estimate_revisions
for each row execute function app.touch_updated_at();

drop trigger if exists trg_mechanics_updated_at on app.mechanics;
create trigger trg_mechanics_updated_at
before update on app.mechanics
for each row execute function app.touch_updated_at();

create or replace function app.build_estimate_snapshot(p_estimate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = app, public
as $$
  select jsonb_build_object(
    'estimate', jsonb_build_object(
      'id', e.id,
      'estimate_number', e.estimate_number,
      'status', e.status,
      'source', e.source,
      'note', e.note,
      'subtotal', e.subtotal,
      'discount_total', e.discount_total,
      'tax_total', e.tax_total,
      'grand_total', e.grand_total,
      'issued_at', e.issued_at,
      'valid_until', e.valid_until,
      'business_date', e.business_date,
      'created_by', e.created_by,
      'created_at', e.created_at,
      'updated_at', e.updated_at
    ),
    'customer', (
      select to_jsonb(c)
      from app.customers c
      where c.id = e.customer_id
    ),
    'vehicle', (
      select to_jsonb(v)
      from app.vehicles v
      where v.id = e.vehicle_id
    ),
    'items', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', ei.id,
            'line_type', ei.line_type,
            'product_id', ei.product_id,
            'service_id', ei.service_id,
            'quantity', ei.quantity,
            'unit_price', ei.unit_price,
            'line_total', ei.line_total,
            'recommendation_rule_id', ei.recommendation_rule_id,
            'is_upsell', ei.is_upsell,
            'product_name', p.name,
            'service_name', s.name
          )
          order by ei.created_at, ei.id
        ),
        '[]'::jsonb
      )
      from app.estimate_items ei
      left join app.products p on p.id = ei.product_id
      left join app.services s on s.id = ei.service_id
      where ei.estimate_id = e.id
    )
  )
  from app.estimates e
  where e.id = p_estimate_id;
$$;
create or replace function app.ensure_estimate_revision(
  p_estimate_id uuid,
  p_editor_id uuid default null,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_revision_id uuid;
  v_next_revision integer;
  v_business_date date;
begin
  select business_date
  into v_business_date
  from app.estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate % not found.', p_estimate_id;
  end if;

  select coalesce(max(revision_number), 0) + 1
  into v_next_revision
  from app.estimate_revisions
  where estimate_id = p_estimate_id;

  insert into app.estimate_revisions (
    estimate_id,
    revision_number,
    change_note,
    estimate_snapshot,
    revised_by,
    business_date
  )
  values (
    p_estimate_id,
    v_next_revision,
    p_change_note,
    app.build_estimate_snapshot(p_estimate_id),
    p_editor_id,
    coalesce(v_business_date, current_date)
  )
  returning id into v_revision_id;

  return v_revision_id;
end;
$$;

create or replace function app.create_estimate_with_revision_internal(
  payload jsonb,
  p_editor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_estimate_id uuid;
begin
  v_estimate_id := app.create_estimate_internal(payload);
  perform app.ensure_estimate_revision(
    v_estimate_id,
    p_editor_id,
    coalesce(payload -> 'estimate' ->> 'revision_note', 'Initial quote created')
  );
  return v_estimate_id;
end;
$$;

create or replace function app.list_estimates_internal(
  p_search text default null,
  p_limit_count integer default 20
)
returns table (
  id uuid,
  estimate_number text,
  customer_name text,
  customer_phone text,
  vehicle_model_name text,
  status text,
  grand_total numeric,
  valid_until date,
  revision_count bigint,
  updated_at timestamptz
)
language sql
security definer
set search_path = app, public
as $$
  select
    e.id,
    e.estimate_number,
    c.name as customer_name,
    c.phone as customer_phone,
    v.model_name as vehicle_model_name,
    e.status,
    e.grand_total,
    e.valid_until,
    coalesce(rev.revision_count, 0) as revision_count,
    e.updated_at
  from app.estimates e
  left join app.customers c on c.id = e.customer_id
  left join app.vehicles v on v.id = e.vehicle_id
  left join (
    select estimate_id, count(*) as revision_count
    from app.estimate_revisions
    group by estimate_id
  ) rev on rev.estimate_id = e.id
  where
    p_search is null
    or p_search = ''
    or e.estimate_number ilike '%' || p_search || '%'
    or coalesce(c.name, '') ilike '%' || p_search || '%'
    or coalesce(c.phone, '') ilike '%' || p_search || '%'
    or coalesce(v.model_name, '') ilike '%' || p_search || '%'
  order by e.updated_at desc
  limit greatest(coalesce(p_limit_count, 20), 1);
$$;

create or replace function app.get_estimate_revisions_internal(p_estimate_id uuid)
returns table (
  id uuid,
  revision_number integer,
  change_note text,
  revised_by uuid,
  revised_by_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = app, public
as $$
  select
    er.id,
    er.revision_number,
    er.change_note,
    er.revised_by,
    up.full_name as revised_by_name,
    er.created_at
  from app.estimate_revisions er
  left join app.user_profiles up on up.user_id = er.revised_by
  where er.estimate_id = p_estimate_id
  order by er.revision_number desc;
$$;

create or replace function app.revise_estimate_internal(
  p_estimate_id uuid,
  p_payload jsonb,
  p_editor_id uuid default null,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_business_date date;
  v_item jsonb;
begin
  select customer_id, vehicle_id, business_date
  into v_customer_id, v_vehicle_id, v_business_date
  from app.estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate % not found.', p_estimate_id;
  end if;

  if p_payload ? 'customer' then
    if v_customer_id is null then
      insert into app.customers (
        customer_type,
        name,
        phone,
        email,
        metadata,
        business_date
      )
      values (
        coalesce(p_payload -> 'customer' ->> 'customer_type', 'walk_in'),
        coalesce(p_payload -> 'customer' ->> 'name', 'Walk-in Customer'),
        p_payload -> 'customer' ->> 'phone',
        p_payload -> 'customer' ->> 'email',
        coalesce(p_payload -> 'customer' -> 'metadata', '{}'::jsonb),
        coalesce((p_payload -> 'estimate' ->> 'business_date')::date, v_business_date, current_date)
      )
      returning id into v_customer_id;
    else
      update app.customers
      set
        customer_type = coalesce(p_payload -> 'customer' ->> 'customer_type', customer_type),
        name = coalesce(nullif(p_payload -> 'customer' ->> 'name', ''), name),
        phone = coalesce(p_payload -> 'customer' ->> 'phone', phone),
        email = coalesce(p_payload -> 'customer' ->> 'email', email),
        metadata = coalesce(p_payload -> 'customer' -> 'metadata', metadata)
      where id = v_customer_id;
    end if;
  end if;

  if p_payload ? 'vehicle' then
    if v_vehicle_id is null then
      insert into app.vehicles (
        customer_id,
        plate_no,
        make,
        model_name,
        year,
        engine,
        mileage,
        metadata,
        business_date
      )
      values (
        v_customer_id,
        p_payload -> 'vehicle' ->> 'plate_no',
        coalesce(p_payload -> 'vehicle' ->> 'make', 'Mitsubishi'),
        coalesce(p_payload -> 'vehicle' ->> 'model_name', 'Unspecified Model'),
        nullif(p_payload -> 'vehicle' ->> 'year', '')::integer,
        p_payload -> 'vehicle' ->> 'engine',
        nullif(p_payload -> 'vehicle' ->> 'mileage', '')::integer,
        coalesce(p_payload -> 'vehicle' -> 'metadata', '{}'::jsonb),
        coalesce((p_payload -> 'estimate' ->> 'business_date')::date, v_business_date, current_date)
      )
      returning id into v_vehicle_id;
    else
      update app.vehicles
      set
        customer_id = v_customer_id,
        plate_no = coalesce(p_payload -> 'vehicle' ->> 'plate_no', plate_no),
        make = coalesce(p_payload -> 'vehicle' ->> 'make', make),
        model_name = coalesce(nullif(p_payload -> 'vehicle' ->> 'model_name', ''), model_name),
        year = coalesce(nullif(p_payload -> 'vehicle' ->> 'year', '')::integer, year),
        engine = coalesce(p_payload -> 'vehicle' ->> 'engine', engine),
        mileage = coalesce(nullif(p_payload -> 'vehicle' ->> 'mileage', '')::integer, mileage),
        metadata = coalesce(p_payload -> 'vehicle' -> 'metadata', metadata)
      where id = v_vehicle_id;
    end if;
  end if;

  update app.estimates
  set
    customer_id = coalesce(v_customer_id, customer_id),
    vehicle_id = coalesce(v_vehicle_id, vehicle_id),
    status = coalesce(p_payload -> 'estimate' ->> 'status', status),
    source = coalesce(p_payload -> 'estimate' ->> 'source', source),
    note = coalesce(p_payload -> 'estimate' ->> 'note', note),
    subtotal = coalesce((p_payload -> 'estimate' ->> 'subtotal')::numeric, subtotal),
    discount_total = coalesce((p_payload -> 'estimate' ->> 'discount_total')::numeric, discount_total),
    tax_total = coalesce((p_payload -> 'estimate' ->> 'tax_total')::numeric, tax_total),
    grand_total = coalesce((p_payload -> 'estimate' ->> 'grand_total')::numeric, grand_total),
    issued_at = coalesce((p_payload -> 'estimate' ->> 'issued_at')::timestamptz, issued_at),
    valid_until = coalesce((p_payload -> 'estimate' ->> 'valid_until')::date, valid_until, current_date + 30),
    business_date = coalesce((p_payload -> 'estimate' ->> 'business_date')::date, business_date),
    updated_at = timezone('utc', now())
  where id = p_estimate_id;

  delete from app.estimate_items where estimate_id = p_estimate_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb))
  loop
    insert into app.estimate_items (
      estimate_id,
      line_type,
      product_id,
      service_id,
      quantity,
      unit_price,
      line_total,
      recommendation_rule_id,
      is_upsell,
      business_date
    )
    values (
      p_estimate_id,
      coalesce(v_item ->> 'line_type', case when v_item ? 'service_id' then 'service' else 'product' end),
      nullif(v_item ->> 'product_id', '')::uuid,
      nullif(v_item ->> 'service_id', '')::uuid,
      coalesce((v_item ->> 'quantity')::numeric, 1),
      coalesce((v_item ->> 'unit_price')::numeric, 0),
      coalesce((v_item ->> 'line_total')::numeric, 0),
      nullif(v_item ->> 'recommendation_rule_id', '')::uuid,
      coalesce((v_item ->> 'is_upsell')::boolean, false),
      coalesce((p_payload -> 'estimate' ->> 'business_date')::date, v_business_date, current_date)
    );
  end loop;

  return app.ensure_estimate_revision(
    p_estimate_id,
    p_editor_id,
    coalesce(p_change_note, p_payload -> 'estimate' ->> 'revision_note', 'Quote revised')
  );
end;
$$;

create or replace function app.lookup_public_estimate_internal(
  p_estimate_number text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_estimate_id uuid;
begin
  select e.id
  into v_estimate_id
  from app.estimates e
  join app.customers c on c.id = e.customer_id
  where e.estimate_number = p_estimate_number
    and coalesce(c.phone, '') = coalesce(p_phone, '')
    and coalesce(e.valid_until, current_date + 30) >= current_date
  limit 1;

  if v_estimate_id is null then
    return null;
  end if;

  return app.build_estimate_snapshot(v_estimate_id);
end;
$$;
create or replace function app.get_curated_quote_recommendations_internal(
  p_product_id uuid,
  p_vehicle_model_name text default null,
  p_limit_count integer default 6
)
returns table (
  rule_id uuid,
  consequent_kind text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_price numeric,
  support numeric,
  confidence numeric,
  lift numeric,
  sample_count integer,
  reason_label text,
  package_key text,
  package_name text,
  package_description text
)
language sql
security definer
set search_path = app, public
as $$
  with anchor as (
    select id, category, model_name
    from app.products
    where id = p_product_id
  ),
  matching_rules as (
    select qrr.*
    from app.quote_recommendation_rules qrr
    cross join anchor a
    where qrr.is_active
      and (
        (qrr.anchor_type = 'product' and qrr.anchor_product_id = a.id) or
        (qrr.anchor_type = 'category' and qrr.anchor_category = a.category)
      )
      and (
        qrr.vehicle_model_name is null
        or qrr.vehicle_model_name = ''
        or p_vehicle_model_name is null
        or qrr.vehicle_model_name ilike p_vehicle_model_name
        or a.model_name ilike qrr.vehicle_model_name
      )
  )
  select
    mr.id as rule_id,
    case when mr.related_product_id is not null then 'product' else 'service' end as consequent_kind,
    mr.related_product_id as recommended_product_id,
    rp.name as recommended_product_name,
    mr.related_service_id as recommended_service_id,
    rs.name as recommended_service_name,
    coalesce(pp.amount, rs.standard_price, 0) as recommended_price,
    null::numeric as support,
    null::numeric as confidence,
    null::numeric as lift,
    null::integer as sample_count,
    mr.reason_label,
    mr.package_key,
    mr.package_name,
    mr.package_description
  from matching_rules mr
  left join app.products rp on rp.id = mr.related_product_id
  left join app.services rs on rs.id = mr.related_service_id
  left join lateral (
    select amount
    from app.product_prices pp
    where pp.product_id = mr.related_product_id
      and pp.price_type = 'retail'
      and pp.is_current = true
    order by pp.effective_from desc, pp.created_at desc
    limit 1
  ) pp on true
  order by mr.priority asc, mr.package_name asc
  limit greatest(coalesce(p_limit_count, 6), 1);
$$;

create or replace function app.get_mechanics_internal(p_public_only boolean default false)
returns table (
  id uuid,
  full_name text,
  specialization text,
  availability_status text,
  shift_label text,
  location_name text,
  bio text,
  photo_url text,
  is_public boolean,
  sort_order integer
)
language sql
security definer
set search_path = app, public
as $$
  select
    m.id,
    m.full_name,
    m.specialization,
    m.availability_status,
    m.shift_label,
    m.location_name,
    m.bio,
    m.photo_url,
    m.is_public,
    m.sort_order
  from app.mechanics m
  where not p_public_only or m.is_public
  order by m.sort_order asc, m.full_name asc;
$$;

create or replace function app.upsert_mechanic_internal(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
begin
  if v_id is null then
    insert into app.mechanics (
      user_id,
      full_name,
      specialization,
      availability_status,
      shift_label,
      location_name,
      bio,
      photo_url,
      is_public,
      sort_order,
      business_date
    )
    values (
      nullif(p_payload ->> 'user_id', '')::uuid,
      coalesce(p_payload ->> 'full_name', 'Unnamed Mechanic'),
      coalesce(p_payload ->> 'specialization', 'General Repair'),
      coalesce(p_payload ->> 'availability_status', 'available'),
      p_payload ->> 'shift_label',
      coalesce(p_payload ->> 'location_name', 'Main Shop'),
      p_payload ->> 'bio',
      p_payload ->> 'photo_url',
      coalesce((p_payload ->> 'is_public')::boolean, true),
      coalesce((p_payload ->> 'sort_order')::integer, 0),
      coalesce((p_payload ->> 'business_date')::date, current_date)
    )
    returning id into v_id;
  else
    update app.mechanics
    set
      user_id = coalesce(nullif(p_payload ->> 'user_id', '')::uuid, user_id),
      full_name = coalesce(nullif(p_payload ->> 'full_name', ''), full_name),
      specialization = coalesce(nullif(p_payload ->> 'specialization', ''), specialization),
      availability_status = coalesce(nullif(p_payload ->> 'availability_status', ''), availability_status),
      shift_label = coalesce(p_payload ->> 'shift_label', shift_label),
      location_name = coalesce(nullif(p_payload ->> 'location_name', ''), location_name),
      bio = coalesce(p_payload ->> 'bio', bio),
      photo_url = coalesce(p_payload ->> 'photo_url', photo_url),
      is_public = coalesce((p_payload ->> 'is_public')::boolean, is_public),
      sort_order = coalesce((p_payload ->> 'sort_order')::integer, sort_order),
      business_date = coalesce((p_payload ->> 'business_date')::date, business_date)
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function app.delete_mechanic_internal(p_mechanic_id uuid)
returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
begin
  delete from app.mechanics where id = p_mechanic_id;
  return found;
end;
$$;

create or replace function app.refresh_item_sales_aggregates(p_refresh_run_id uuid default null)
returns void
language plpgsql
security definer
set search_path = app, public, dw
as $$
declare
  v_rows integer := 0;
begin
  truncate table dw.fact_daily_item_sales, dw.fact_monthly_item_sales restart identity;

  insert into dw.fact_daily_item_sales (
    date_key,
    sale_date,
    product_key,
    category,
    product_name,
    sku,
    brand,
    location_name,
    quantity,
    revenue,
    source_line_count
  )
  select
    dd.date_key,
    dd.full_date,
    fsl.product_key,
    dp.category,
    dp.product_name,
    dp.sku,
    dp.brand,
    'Main Shop',
    sum(fsl.quantity),
    sum(fsl.line_total),
    count(*)
  from dw.fact_sales_lines fsl
  join dw.dim_date dd on dd.date_key = fsl.date_key
  join dw.dim_product dp on dp.product_key = fsl.product_key
  where fsl.product_key is not null
    and fsl.status = 'completed'
  group by dd.date_key, dd.full_date, fsl.product_key, dp.category, dp.product_name, dp.sku, dp.brand;

  get diagnostics v_rows = row_count;

  insert into dw.fact_monthly_item_sales (
    month_key,
    month_start,
    product_key,
    category,
    product_name,
    sku,
    brand,
    location_name,
    quantity,
    revenue,
    source_line_count
  )
  select
    to_char(date_trunc('month', sale_date), 'YYYYMM')::integer,
    date_trunc('month', sale_date)::date,
    product_key,
    category,
    product_name,
    sku,
    brand,
    location_name,
    sum(quantity),
    sum(revenue),
    sum(source_line_count)
  from dw.fact_daily_item_sales
  group by date_trunc('month', sale_date)::date, product_key, category, product_name, sku, brand, location_name;

  get diagnostics v_more_rows = row_count;
  v_rows := v_rows + v_more_rows;

  if p_refresh_run_id is not null then
    update app.analytics_refresh_runs
    set fact_rows = coalesce(fact_rows, 0) + v_rows
    where id = p_refresh_run_id;
  end if;
end;
$$;

create or replace function app.run_full_analytics_refresh(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_refresh_id uuid;
begin
  insert into app.analytics_refresh_runs (initiated_by, status, notes)
  values (auth.uid(), 'running', p_notes)
  returning id into v_refresh_id;

  begin
    perform app.refresh_dimensional_data(v_refresh_id);
    perform app.refresh_monthly_aggregates(v_refresh_id);
    perform app.refresh_item_sales_aggregates(v_refresh_id);
    perform app.refresh_association_rules(v_refresh_id);
    perform app.refresh_demand_forecasts(v_refresh_id);

    update app.analytics_refresh_runs
    set
      status = 'success',
      ended_at = timezone('utc', now())
    where id = v_refresh_id;
  exception when others then
    update app.analytics_refresh_runs
    set
      status = 'failed',
      ended_at = timezone('utc', now()),
      error_message = sqlerrm
    where id = v_refresh_id;
    raise;
  end;

  return v_refresh_id;
end;
$$;
create or replace function public.create_estimate(payload jsonb)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.create_estimate_with_revision_internal(payload, null);
$$;

create or replace function public.list_estimates(p_search text default null, p_limit_count integer default 20)
returns table (
  id uuid,
  estimate_number text,
  customer_name text,
  customer_phone text,
  vehicle_model_name text,
  status text,
  grand_total numeric,
  valid_until date,
  revision_count bigint,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.list_estimates_internal(p_search, p_limit_count);
$$;

create or replace function public.get_estimate_detail(p_estimate_id uuid)
returns jsonb
language sql
security definer
set search_path = public, app
as $$
  select app.build_estimate_snapshot(p_estimate_id);
$$;

create or replace function public.get_estimate_revisions(p_estimate_id uuid)
returns table (
  id uuid,
  revision_number integer,
  change_note text,
  revised_by uuid,
  revised_by_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.get_estimate_revisions_internal(p_estimate_id);
$$;

create or replace function public.revise_estimate(
  p_estimate_id uuid,
  p_payload jsonb,
  p_editor_id uuid default null,
  p_change_note text default null
)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.revise_estimate_internal(p_estimate_id, p_payload, p_editor_id, p_change_note);
$$;

create or replace function public.lookup_public_estimate(
  p_estimate_number text,
  p_phone text
)
returns jsonb
language sql
security definer
set search_path = public, app
as $$
  select app.lookup_public_estimate_internal(p_estimate_number, p_phone);
$$;

create or replace function public.get_curated_quote_recommendations(
  p_product_id uuid,
  p_vehicle_model_name text default null,
  p_limit_count integer default 6
)
returns table (
  rule_id uuid,
  consequent_kind text,
  recommended_product_id uuid,
  recommended_product_name text,
  recommended_service_id uuid,
  recommended_service_name text,
  recommended_price numeric,
  support numeric,
  confidence numeric,
  lift numeric,
  sample_count integer,
  reason_label text,
  package_key text,
  package_name text,
  package_description text
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.get_curated_quote_recommendations_internal(
    p_product_id,
    p_vehicle_model_name,
    p_limit_count
  );
$$;

create or replace function public.get_public_mechanics()
returns table (
  id uuid,
  full_name text,
  specialization text,
  availability_status text,
  shift_label text,
  location_name text,
  bio text,
  photo_url text,
  is_public boolean,
  sort_order integer
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.get_mechanics_internal(true);
$$;

create or replace function public.list_mechanics()
returns table (
  id uuid,
  full_name text,
  specialization text,
  availability_status text,
  shift_label text,
  location_name text,
  bio text,
  photo_url text,
  is_public boolean,
  sort_order integer
)
language sql
security definer
set search_path = public, app
as $$
  select *
  from app.get_mechanics_internal(false);
$$;

create or replace function public.upsert_mechanic(p_payload jsonb)
returns uuid
language sql
security definer
set search_path = public, app
as $$
  select app.upsert_mechanic_internal(p_payload);
$$;

create or replace function public.delete_mechanic(p_mechanic_id uuid)
returns boolean
language sql
security definer
set search_path = public, app
as $$
  select app.delete_mechanic_internal(p_mechanic_id);
$$;

create or replace function public.get_top_selling_items(
  start_date date default null,
  end_date date default null,
  category_filter text default null,
  product_id_filter uuid default null,
  location_filter text default null,
  limit_count integer default 10
)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  category text,
  brand text,
  quantity numeric,
  revenue numeric,
  source_line_count integer
)
language sql
security definer
set search_path = public, app, dw
as $$
  select
    dp.source_product_id as product_id,
    fmis.sku,
    fmis.product_name,
    fmis.category,
    fmis.brand,
    sum(fmis.quantity) as quantity,
    sum(fmis.revenue) as revenue,
    sum(fmis.source_line_count)::integer as source_line_count
  from dw.fact_monthly_item_sales fmis
  join dw.dim_product dp on dp.product_key = fmis.product_key
  where (start_date is null or fmis.month_start >= date_trunc('month', start_date)::date)
    and (end_date is null or fmis.month_start <= date_trunc('month', end_date)::date)
    and (category_filter is null or category_filter = '' or fmis.category = category_filter)
    and (product_id_filter is null or dp.source_product_id = product_id_filter)
    and (location_filter is null or location_filter = '' or fmis.location_name = location_filter)
  group by dp.source_product_id, fmis.sku, fmis.product_name, fmis.category, fmis.brand
  order by quantity desc, revenue desc, fmis.product_name asc
  limit greatest(coalesce(limit_count, 10), 1);
$$;

create or replace function public.get_item_sales_trend(
  start_date date default null,
  end_date date default null,
  product_id_filter uuid default null,
  category_filter text default null,
  location_filter text default null,
  granularity text default 'month'
)
returns table (
  period_start date,
  label text,
  product_id uuid,
  sku text,
  product_name text,
  category text,
  quantity numeric,
  revenue numeric
)
language sql
security definer
set search_path = public, app, dw
as $$
  with source_rows as (
    select
      fmis.month_start as period_start,
      to_char(fmis.month_start, 'Mon YYYY') as label,
      dp.source_product_id as product_id,
      fmis.sku,
      fmis.product_name,
      fmis.category,
      fmis.quantity,
      fmis.revenue,
      fmis.location_name
    from dw.fact_monthly_item_sales fmis
    join dw.dim_product dp on dp.product_key = fmis.product_key
    where lower(coalesce(granularity, 'month')) <> 'day'
    union all
    select
      fdis.sale_date,
      to_char(fdis.sale_date, 'Mon DD'),
      dp.source_product_id,
      fdis.sku,
      fdis.product_name,
      fdis.category,
      fdis.quantity,
      fdis.revenue,
      fdis.location_name
    from dw.fact_daily_item_sales fdis
    join dw.dim_product dp on dp.product_key = fdis.product_key
    where lower(coalesce(granularity, 'month')) = 'day'
  )
  select
    period_start,
    label,
    product_id,
    sku,
    product_name,
    category,
    sum(quantity) as quantity,
    sum(revenue) as revenue
  from source_rows
  where (start_date is null or period_start >= start_date)
    and (end_date is null or period_start <= end_date)
    and (product_id_filter is null or product_id = product_id_filter)
    and (category_filter is null or category_filter = '' or category = category_filter)
    and (location_filter is null or location_filter = '' or location_name = location_filter)
  group by period_start, label, product_id, sku, product_name, category
  order by period_start asc, product_name asc;
$$;

create or replace function public.get_item_peak_periods(
  start_date date default null,
  end_date date default null,
  product_id_filter uuid default null,
  category_filter text default null,
  location_filter text default null
)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  category text,
  peak_month date,
  peak_quantity numeric,
  peak_revenue numeric
)
language sql
security definer
set search_path = public, app, dw
as $$
  with ranked as (
    select
      dp.source_product_id as product_id,
      fmis.sku,
      fmis.product_name,
      fmis.category,
      fmis.month_start,
      fmis.quantity,
      fmis.revenue,
      row_number() over (
        partition by dp.source_product_id
        order by fmis.quantity desc, fmis.revenue desc, fmis.month_start desc
      ) as rn
    from dw.fact_monthly_item_sales fmis
    join dw.dim_product dp on dp.product_key = fmis.product_key
    where (start_date is null or fmis.month_start >= date_trunc('month', start_date)::date)
      and (end_date is null or fmis.month_start <= date_trunc('month', end_date)::date)
      and (product_id_filter is null or dp.source_product_id = product_id_filter)
      and (category_filter is null or category_filter = '' or fmis.category = category_filter)
      and (location_filter is null or location_filter = '' or fmis.location_name = location_filter)
  )
  select
    product_id,
    sku,
    product_name,
    category,
    month_start as peak_month,
    quantity as peak_quantity,
    revenue as peak_revenue
  from ranked
  where rn = 1
  order by peak_quantity desc, peak_revenue desc, product_name asc;
$$;

create or replace function public.get_dashboard_item_sales_snapshot(
  start_date date default null,
  end_date date default null,
  category_filter text default null,
  product_id_filter uuid default null
)
returns jsonb
language sql
security definer
set search_path = public, app, dw
as $$
  select jsonb_build_object(
    'topSellingItems', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.get_top_selling_items(start_date, end_date, category_filter, product_id_filter, null, 8) t
    ),
    'itemTrend', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.period_start), '[]'::jsonb)
      from public.get_item_sales_trend(start_date, end_date, product_id_filter, category_filter, null, 'month') t
    ),
    'peakPeriods', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from public.get_item_peak_periods(start_date, end_date, product_id_filter, category_filter, null) t
    )
  );
$$;
insert into app.quote_recommendation_rules (
  anchor_type,
  anchor_category,
  related_service_id,
  reason_label,
  package_key,
  package_name,
  package_description,
  priority
)
select 'category', 'Tires', s.id, 'Recommended tire service labor', 'tire-service', 'Tire Care Package',
  'Installation, balancing, and alignment services commonly paired with tire quotations.',
  10
from app.services s
where s.is_active
  and (
    s.name ilike '%tire%'
    or s.name ilike '%wheel balancing%'
    or s.name ilike '%wheel alignment%'
  )
  and not exists (
    select 1
    from app.quote_recommendation_rules qrr
    where qrr.package_key = 'tire-service'
      and qrr.related_service_id = s.id
  );

insert into app.quote_recommendation_rules (
  anchor_type,
  anchor_category,
  related_service_id,
  reason_label,
  package_key,
  package_name,
  package_description,
  priority
)
select 'category', 'Fluids & Oils', s.id, 'Recommended oil service labor', 'oil-service', 'Oil Service Package',
  'Routine oil-change labor matched to oils, filters, and other consumables.',
  10
from app.services s
where s.is_active
  and (
    s.name ilike '%oil%'
    or s.name ilike '%preventive maintenance%'
  )
  and not exists (
    select 1
    from app.quote_recommendation_rules qrr
    where qrr.package_key = 'oil-service'
      and qrr.related_service_id = s.id
  );

insert into app.mechanics (
  full_name,
  specialization,
  availability_status,
  shift_label,
  location_name,
  bio,
  is_public,
  sort_order
)
select *
from (
  values
    ('Ramon Dela Cruz', 'Engine Diagnostics', 'available', 'Mon-Sat 8AM-5PM', 'Main Shop', 'Specializes in engine diagnostics, tune-ups, and preventive maintenance for Mitsubishi vehicles.', true, 10),
    ('Josefina Reyes', 'Brake and Suspension', 'available', 'Mon-Sat 9AM-6PM', 'Main Shop', 'Handles brake repair, wheel alignment coordination, and suspension checks.', true, 20),
    ('Paolo Santos', 'Electrical and Installation', 'booked', 'Tue-Sun 10AM-7PM', 'Main Shop', 'Focused on battery, lighting, and accessory installation work.', true, 30)
) as seed(full_name, specialization, availability_status, shift_label, location_name, bio, is_public, sort_order)
where not exists (
  select 1
  from app.mechanics m
  where m.full_name = seed.full_name
);

grant execute on function public.list_estimates(text, integer) to anon, authenticated;
grant execute on function public.get_estimate_detail(uuid) to anon, authenticated;
grant execute on function public.get_estimate_revisions(uuid) to anon, authenticated;
grant execute on function public.revise_estimate(uuid, jsonb, uuid, text) to anon, authenticated;
grant execute on function public.lookup_public_estimate(text, text) to anon, authenticated;
grant execute on function public.get_curated_quote_recommendations(uuid, text, integer) to anon, authenticated;
grant execute on function public.get_public_mechanics() to anon, authenticated;
grant execute on function public.list_mechanics() to anon, authenticated;
grant execute on function public.upsert_mechanic(jsonb) to anon, authenticated;
grant execute on function public.delete_mechanic(uuid) to anon, authenticated;
grant execute on function public.get_top_selling_items(date, date, text, uuid, text, integer) to anon, authenticated;
grant execute on function public.get_item_sales_trend(date, date, uuid, text, text, text) to anon, authenticated;
grant execute on function public.get_item_peak_periods(date, date, uuid, text, text) to anon, authenticated;
grant execute on function public.get_dashboard_item_sales_snapshot(date, date, text, uuid) to anon, authenticated;

