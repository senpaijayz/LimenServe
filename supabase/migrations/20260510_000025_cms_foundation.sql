-- LimenServe CMS foundation
-- Creates a database-driven public content layer managed through the admin panel.

create schema if not exists cms;

create table if not exists cms.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug)),
  title text not null,
  page_type text not null default 'landing',
  template_key text not null default 'default',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  seo jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references cms.pages(id) on delete cascade,
  section_key text not null,
  section_type text not null,
  title text,
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden', 'archived')),
  sort_order integer not null default 100,
  content jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  visibility jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (page_id, section_key)
);

create table if not exists cms.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'public-assets',
  storage_path text not null,
  public_url text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  folder text not null default 'general',
  alt_text text,
  caption text,
  status text not null default 'active' check (status in ('active', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (bucket, storage_path)
);

create table if not exists cms.navigation_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  href text not null,
  group_key text not null default 'primary',
  parent_id uuid references cms.navigation_links(id) on delete set null,
  sort_order integer not null default 100,
  is_visible boolean not null default true,
  opens_new_tab boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.site_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default 'null'::jsonb,
  value_type text not null default 'json' check (value_type in ('text', 'number', 'boolean', 'json', 'image', 'url')),
  label text,
  group_key text not null default 'general',
  is_public boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  cta_label text,
  cta_href text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.testimonials (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_label text,
  quote text not null,
  rating integer check (rating between 1 and 5),
  media_asset_id uuid references cms.media_assets(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'general',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 100,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists cms.content_versions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  version_number integer not null,
  snapshot jsonb not null,
  change_note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  unique (entity_type, entity_id, version_number)
);

create table if not exists cms.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  change_set jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pages_status_idx on cms.pages(status);
create index if not exists page_sections_page_order_idx on cms.page_sections(page_id, status, sort_order);
create index if not exists media_assets_status_folder_idx on cms.media_assets(status, folder);
create index if not exists navigation_links_group_order_idx on cms.navigation_links(group_key, status, is_visible, sort_order);
create index if not exists announcements_status_window_idx on cms.announcements(status, starts_at, ends_at, sort_order);
create index if not exists testimonials_status_order_idx on cms.testimonials(status, sort_order);
create index if not exists faqs_status_order_idx on cms.faqs(status, category, sort_order);
create index if not exists audit_logs_entity_idx on cms.audit_logs(entity_type, entity_id, created_at desc);

alter table cms.pages enable row level security;
alter table cms.page_sections enable row level security;
alter table cms.media_assets enable row level security;
alter table cms.navigation_links enable row level security;
alter table cms.site_settings enable row level security;
alter table cms.announcements enable row level security;
alter table cms.testimonials enable row level security;
alter table cms.faqs enable row level security;
alter table cms.content_versions enable row level security;
alter table cms.audit_logs enable row level security;

create or replace function cms.touch_updated_at()
returns trigger
language plpgsql
set search_path = cms, pg_temp
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'cms'
      and column_name = 'updated_at'
  loop
    execute format('drop trigger if exists touch_updated_at on %I.%I', rec.table_schema, rec.table_name);
    execute format(
      'create trigger touch_updated_at before update on %I.%I for each row execute function cms.touch_updated_at()',
      rec.table_schema,
      rec.table_name
    );
  end loop;
end;
$$;

create or replace function cms.log_audit(
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_change_set jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = cms, public, pg_temp
as $$
  insert into cms.audit_logs(actor_id, action, entity_type, entity_id, change_set)
  values (p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_change_set, '{}'::jsonb));
$$;

create or replace function cms.save_version(
  p_entity_type text,
  p_entity_id uuid,
  p_snapshot jsonb,
  p_actor_id uuid,
  p_change_note text default null
)
returns void
language plpgsql
security definer
set search_path = cms, public, pg_temp
as $$
declare
  next_version integer;
begin
  select coalesce(max(version_number), 0) + 1
  into next_version
  from cms.content_versions
  where entity_type = p_entity_type
    and entity_id = p_entity_id;

  insert into cms.content_versions(entity_type, entity_id, version_number, snapshot, change_note, created_by)
  values (p_entity_type, p_entity_id, next_version, coalesce(p_snapshot, '{}'::jsonb), p_change_note, p_actor_id);
end;
$$;

create or replace function public.get_published_cms_site()
returns jsonb
language sql
security definer
set search_path = cms, public, pg_temp
as $$
  select jsonb_build_object(
    'settings', coalesce((
      select jsonb_object_agg(setting_key, setting_value order by setting_key)
      from cms.site_settings
      where is_public = true
    ), '{}'::jsonb),
    'navigation', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'label', label,
        'href', href,
        'groupKey', group_key,
        'sortOrder', sort_order,
        'opensNewTab', opens_new_tab,
        'metadata', metadata
      ) order by group_key, sort_order, label)
      from cms.navigation_links
      where status = 'published'
        and is_visible = true
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'title', title,
        'body', body,
        'ctaLabel', cta_label,
        'ctaHref', cta_href,
        'metadata', metadata
      ) order by sort_order, created_at desc)
      from cms.announcements
      where status = 'published'
        and (starts_at is null or starts_at <= timezone('utc', now()))
        and (ends_at is null or ends_at >= timezone('utc', now()))
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_published_cms_page(p_slug text)
returns jsonb
language sql
security definer
set search_path = cms, public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'title', p.title,
      'pageType', p.page_type,
      'templateKey', p.template_key,
      'status', p.status,
      'seo', p.seo,
      'metadata', p.metadata,
      'publishedAt', p.published_at,
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'sectionKey', s.section_key,
          'sectionType', s.section_type,
          'title', s.title,
          'status', s.status,
          'sortOrder', s.sort_order,
          'content', s.content,
          'settings', s.settings,
          'visibility', s.visibility
        ) order by s.sort_order, s.created_at)
        from cms.page_sections s
        where s.page_id = p.id
          and s.status = 'published'
      ), '[]'::jsonb)
    )
    from cms.pages p
    where p.slug = lower(trim(p_slug))
      and p.status = 'published'
      and p.archived_at is null
    limit 1
  ), null::jsonb);
$$;

create or replace function public.cms_admin_list_pages()
returns jsonb
language sql
security definer
set search_path = cms, public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'title', p.title,
    'pageType', p.page_type,
    'templateKey', p.template_key,
    'status', p.status,
    'seo', p.seo,
    'sectionCount', coalesce(section_counts.section_count, 0),
    'publishedAt', p.published_at,
    'updatedAt', p.updated_at
  ) order by p.updated_at desc), '[]'::jsonb)
  from cms.pages p
  left join (
    select page_id, count(*)::integer as section_count
    from cms.page_sections
    where status <> 'archived'
    group by page_id
  ) section_counts on section_counts.page_id = p.id
  where p.status <> 'archived';
$$;

create or replace function public.cms_admin_get_page(p_slug text)
returns jsonb
language sql
security definer
set search_path = cms, public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'title', p.title,
      'pageType', p.page_type,
      'templateKey', p.template_key,
      'status', p.status,
      'seo', p.seo,
      'metadata', p.metadata,
      'publishedAt', p.published_at,
      'updatedAt', p.updated_at,
      'sections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'sectionKey', s.section_key,
          'sectionType', s.section_type,
          'title', s.title,
          'status', s.status,
          'sortOrder', s.sort_order,
          'content', s.content,
          'settings', s.settings,
          'visibility', s.visibility,
          'updatedAt', s.updated_at
        ) order by s.sort_order, s.created_at)
        from cms.page_sections s
        where s.page_id = p.id
          and s.status <> 'archived'
      ), '[]'::jsonb)
    )
    from cms.pages p
    where p.slug = lower(trim(p_slug))
      and p.status <> 'archived'
    limit 1
  ), null::jsonb);
$$;

create or replace function public.cms_admin_save_page(p_payload jsonb, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = cms, public, pg_temp
as $$
declare
  target_page_id uuid;
  normalized_slug text;
  section_item jsonb;
  section_id uuid;
begin
  normalized_slug := lower(regexp_replace(trim(coalesce(p_payload->>'slug', '')), '[^a-z0-9\-]+', '-', 'g'));

  if normalized_slug = '' then
    raise exception 'Page slug is required.';
  end if;

  insert into cms.pages(
    id,
    slug,
    title,
    page_type,
    template_key,
    status,
    seo,
    metadata,
    created_by,
    updated_by,
    published_at
  )
  values (
    coalesce(nullif(p_payload->>'id', '')::uuid, gen_random_uuid()),
    normalized_slug,
    coalesce(nullif(p_payload->>'title', ''), initcap(replace(normalized_slug, '-', ' '))),
    coalesce(nullif(p_payload->>'pageType', ''), 'landing'),
    coalesce(nullif(p_payload->>'templateKey', ''), 'default'),
    coalesce(nullif(p_payload->>'status', ''), 'draft'),
    coalesce(p_payload->'seo', '{}'::jsonb),
    coalesce(p_payload->'metadata', '{}'::jsonb),
    p_actor_id,
    p_actor_id,
    case when coalesce(p_payload->>'status', 'draft') = 'published' then timezone('utc', now()) else null end
  )
  on conflict (slug) do update
  set title = excluded.title,
      page_type = excluded.page_type,
      template_key = excluded.template_key,
      status = excluded.status,
      seo = excluded.seo,
      metadata = excluded.metadata,
      updated_by = p_actor_id,
      published_at = case
        when excluded.status = 'published' and cms.pages.published_at is null then timezone('utc', now())
        when excluded.status = 'published' then cms.pages.published_at
        else null
      end,
      archived_at = case when excluded.status = 'archived' then timezone('utc', now()) else null end
  returning id into target_page_id;

  perform cms.save_version('page', target_page_id, p_payload, p_actor_id, 'CMS page saved');

  if jsonb_typeof(p_payload->'sections') = 'array' then
    update cms.page_sections
    set status = 'archived',
        archived_at = timezone('utc', now()),
        updated_by = p_actor_id
    where page_id = target_page_id;

    for section_item in select value from jsonb_array_elements(p_payload->'sections')
    loop
      section_id := coalesce(nullif(section_item->>'id', '')::uuid, gen_random_uuid());

      insert into cms.page_sections(
        id,
        page_id,
        section_key,
        section_type,
        title,
        status,
        sort_order,
        content,
        settings,
        visibility,
        created_by,
        updated_by,
        published_at,
        archived_at
      )
      values (
        section_id,
        target_page_id,
        coalesce(nullif(section_item->>'sectionKey', ''), 'section-' || section_id::text),
        coalesce(nullif(section_item->>'sectionType', ''), 'rich_text'),
        nullif(section_item->>'title', ''),
        coalesce(nullif(section_item->>'status', ''), 'draft'),
        coalesce((section_item->>'sortOrder')::integer, 100),
        coalesce(section_item->'content', '{}'::jsonb),
        coalesce(section_item->'settings', '{}'::jsonb),
        coalesce(section_item->'visibility', '{}'::jsonb),
        p_actor_id,
        p_actor_id,
        case when coalesce(section_item->>'status', 'draft') = 'published' then timezone('utc', now()) else null end,
        null
      )
      on conflict (page_id, section_key) do update
      set section_type = excluded.section_type,
          title = excluded.title,
          status = excluded.status,
          sort_order = excluded.sort_order,
          content = excluded.content,
          settings = excluded.settings,
          visibility = excluded.visibility,
          updated_by = p_actor_id,
          published_at = case
            when excluded.status = 'published' and cms.page_sections.published_at is null then timezone('utc', now())
            when excluded.status = 'published' then cms.page_sections.published_at
            else null
          end,
          archived_at = null;
    end loop;
  end if;

  perform cms.log_audit(p_actor_id, 'save_page', 'page', target_page_id, p_payload);

  return public.cms_admin_get_page(normalized_slug);
end;
$$;

create or replace function public.cms_admin_save_site_settings(p_payload jsonb, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = cms, public, pg_temp
as $$
declare
  setting record;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Site settings payload must be an object.';
  end if;

  for setting in select key, value from jsonb_each(p_payload)
  loop
    insert into cms.site_settings(setting_key, setting_value, value_type, label, group_key, is_public, created_by, updated_by)
    values (
      setting.key,
      setting.value,
      case when jsonb_typeof(setting.value) = 'string' then 'text' else 'json' end,
      initcap(replace(setting.key, '_', ' ')),
      'general',
      true,
      p_actor_id,
      p_actor_id
    )
    on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        value_type = excluded.value_type,
        updated_by = p_actor_id;
  end loop;

  perform cms.log_audit(p_actor_id, 'save_site_settings', 'site_settings', null, p_payload);

  return public.get_published_cms_site();
end;
$$;

create or replace function public.cms_admin_save_navigation(p_payload jsonb, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = cms, public, pg_temp
as $$
declare
  item jsonb;
  link_id uuid;
begin
  if jsonb_typeof(p_payload) <> 'array' then
    raise exception 'Navigation payload must be an array.';
  end if;

  update cms.navigation_links set status = 'archived', updated_by = p_actor_id;

  for item in select value from jsonb_array_elements(p_payload)
  loop
    link_id := coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid());

    insert into cms.navigation_links(
      id,
      label,
      href,
      group_key,
      sort_order,
      is_visible,
      opens_new_tab,
      status,
      metadata,
      created_by,
      updated_by
    )
    values (
      link_id,
      coalesce(nullif(item->>'label', ''), 'Untitled link'),
      coalesce(nullif(item->>'href', ''), '/'),
      coalesce(nullif(item->>'groupKey', ''), 'primary'),
      coalesce((item->>'sortOrder')::integer, 100),
      coalesce((item->>'isVisible')::boolean, true),
      coalesce((item->>'opensNewTab')::boolean, false),
      coalesce(nullif(item->>'status', ''), 'published'),
      coalesce(item->'metadata', '{}'::jsonb),
      p_actor_id,
      p_actor_id
    )
    on conflict (id) do update
    set label = excluded.label,
        href = excluded.href,
        group_key = excluded.group_key,
        sort_order = excluded.sort_order,
        is_visible = excluded.is_visible,
        opens_new_tab = excluded.opens_new_tab,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_by = p_actor_id;
  end loop;

  perform cms.log_audit(p_actor_id, 'save_navigation', 'navigation', null, p_payload);

  return public.get_published_cms_site();
end;
$$;

grant usage on schema cms to service_role;
grant all on all tables in schema cms to service_role;
grant all on all sequences in schema cms to service_role;
grant execute on function public.get_published_cms_site() to anon, authenticated, service_role;
grant execute on function public.get_published_cms_page(text) to anon, authenticated, service_role;
grant execute on function public.cms_admin_list_pages() to authenticated, service_role;
grant execute on function public.cms_admin_get_page(text) to authenticated, service_role;
grant execute on function public.cms_admin_save_page(jsonb, uuid) to authenticated, service_role;
grant execute on function public.cms_admin_save_site_settings(jsonb, uuid) to authenticated, service_role;
grant execute on function public.cms_admin_save_navigation(jsonb, uuid) to authenticated, service_role;

insert into cms.site_settings(setting_key, setting_value, value_type, label, group_key, is_public)
values
  ('company_name', '"Limen Auto Parts Center"'::jsonb, 'text', 'Company Name', 'identity', true),
  ('brand_kicker', '"Limen"'::jsonb, 'text', 'Brand Kicker', 'identity', true),
  ('brand_title', '"Genuine Auto Parts"'::jsonb, 'text', 'Brand Title', 'identity', true),
  ('logo_url', '"/LogoLimen.jpg"'::jsonb, 'image', 'Logo URL', 'identity', true),
  ('primary_phone', '"(0915) 522 5629"'::jsonb, 'text', 'Primary Phone', 'contact', true),
  ('landline', '"02 8551 3518"'::jsonb, 'text', 'Landline', 'contact', true),
  ('business_hours', '"Mon-Sat 8:00 AM-5:00 PM | Sun 8:00 AM-12:00 PM"'::jsonb, 'text', 'Business Hours', 'contact', true),
  ('address', '"1308, 264 Epifanio de los Santos Ave, Pasay City, Metro Manila"'::jsonb, 'text', 'Address', 'contact', true),
  ('footer_note', '"Trusted local auto parts seller in Pasay City"'::jsonb, 'text', 'Footer Note', 'footer', true)
on conflict (setting_key) do nothing;

insert into cms.navigation_links(label, href, group_key, sort_order, status, is_visible)
values
  ('Home', '/', 'primary', 10, 'published', true),
  ('About', '/about', 'primary', 20, 'published', true),
  ('Genuine Parts', '/catalog', 'primary', 30, 'published', true),
  ('Get Estimate', '/estimate', 'primary', 40, 'published', true),
  ('Service Orders', '/service-orders', 'primary', 50, 'published', true),
  ('Shop by Category', '/catalog', 'footer_shop', 10, 'published', true),
  ('Vehicle Search', '/estimate', 'footer_shop', 20, 'published', true),
  ('About Limen', '/about', 'footer_company', 10, 'published', true),
  ('Staff Portal', '/login', 'footer_company', 20, 'published', true)
on conflict do nothing;

insert into cms.pages(slug, title, status, template_key, seo, published_at)
values
  ('home', 'Homepage', 'published', 'public_home', '{"title":"Limen Auto Parts Center","description":"Search genuine and aftermarket auto parts from Limen Auto Parts Center."}'::jsonb, timezone('utc', now())),
  ('about', 'About Limen', 'published', 'public_about', '{"title":"About Limen Auto Parts Center","description":"Learn about Limen Auto Parts Center and its digital service workflow."}'::jsonb, timezone('utc', now()))
on conflict (slug) do nothing;

insert into cms.page_sections(page_id, section_key, section_type, title, status, sort_order, content, published_at)
select p.id, 'home-hero', 'hero', 'Homepage Hero', 'published', 10,
  '{
    "eyebrow":"Limen Autoparts Center",
    "title":"Genuine and aftermarket auto parts customers can trust.",
    "subtitle":"Search by part name, part number, or vehicle model and move straight into a cleaner quotation flow backed by a real auto parts store in Pasay City.",
    "primaryCta":{"label":"Shop Parts","href":"/catalog"},
    "secondaryCta":{"label":"Request a Quote","href":"/estimate"},
    "imageUrl":"",
    "imageAlt":"Limen Auto Parts Center storefront",
    "imageEyebrow":"Pasay City flagship store",
    "imageTitle":"Real counter service, fitment checks, and faster quote turnaround for walk-in and online inquiries.",
    "storeLabel":"Store",
    "storeValue":"Real local support",
    "catalogLabel":"Catalog",
    "catalogValue":"Search by part or vehicle",
    "quotesLabel":"Quotes",
    "quotesValue":"Fast response flow"
  }'::jsonb,
  timezone('utc', now())
from cms.pages p where p.slug = 'home'
on conflict (page_id, section_key) do nothing;

insert into cms.page_sections(page_id, section_key, section_type, title, status, sort_order, content, published_at)
select p.id, 'home-features', 'feature_grid', 'Shop Categories', 'published', 20,
  '{
    "eyebrow":"Shop by Category",
    "title":"Browse fast-moving auto parts categories",
    "subtitle":"Start with the part family customers usually ask for, then narrow by Mitsubishi model or exact part number inside the catalog.",
    "items":[
      {"title":"Engine Parts","description":"Filters, timing components, gaskets, and cooling parts."},
      {"title":"Brakes","description":"Pads, rotors, brake hardware, and wear items for daily safety."},
      {"title":"Electrical","description":"Sensors, charging parts, relays, and wiring support."}
    ]
  }'::jsonb,
  timezone('utc', now())
from cms.pages p where p.slug = 'home'
on conflict (page_id, section_key) do nothing;

insert into cms.page_sections(page_id, section_key, section_type, title, status, sort_order, content, published_at)
select p.id, 'about-story', 'rich_text', 'Our Story & Operations', 'published', 10,
  '{
    "eyebrow":"About",
    "title":"Limen Auto Parts Center",
    "body":"Limen Auto Parts Center is an established family-owned auto parts retail shop located along EDSA in Pasay City, Metro Manila. Through LimenServe, the business is transitioning from manual, paper-based processes to a more organized digital workflow that supports stock visibility, quotations, service orders, and customer service."
  }'::jsonb,
  timezone('utc', now())
from cms.pages p where p.slug = 'about'
on conflict (page_id, section_key) do nothing;

insert into cms.page_sections(page_id, section_key, section_type, title, status, sort_order, content, published_at)
select p.id, 'about-stats', 'stats', 'Business Snapshot', 'published', 20,
  '{
    "items":[
      {"value":"13 Years","label":"In Service"},
      {"value":"Pasay City","label":"Metro Manila"},
      {"value":"2 Floors","label":"Sales and Stockroom"},
      {"value":"Family-Owned","label":"Local Business"}
    ]
  }'::jsonb,
  timezone('utc', now())
from cms.pages p where p.slug = 'about'
on conflict (page_id, section_key) do nothing;
