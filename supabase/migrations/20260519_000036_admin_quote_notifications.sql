create table if not exists catalog.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'system' check (category in ('quotation', 'inventory', 'sales', 'service', 'system')),
  type text not null default 'info' check (type in ('info', 'success', 'warning', 'error')),
  title text not null,
  message text not null,
  target_path text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_notifications_active_created_idx
  on catalog.admin_notifications (created_at desc)
  where dismissed_at is null;

create index if not exists admin_notifications_category_created_idx
  on catalog.admin_notifications (category, created_at desc)
  where dismissed_at is null;

alter table catalog.admin_notifications enable row level security;

drop policy if exists service_role_admin_notifications_all on catalog.admin_notifications;
create policy service_role_admin_notifications_all
  on catalog.admin_notifications
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
