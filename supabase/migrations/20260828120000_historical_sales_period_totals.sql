begin;

-- Production uses the operations schema; clean historical replays may not have
-- created it yet, so create the namespace without touching existing data.
create schema if not exists operations;

-- Historical paper records are not always itemised. Keep those period totals in
-- their own ledger so item-level analytics never attributes an unknown total to
-- an arbitrary product or service.
create table if not exists operations.historical_sales_aggregates (
  id uuid primary key default gen_random_uuid(),
  period_granularity text not null check (period_granularity in ('day', 'month', 'year')),
  period_start date not null,
  period_end date not null,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  transaction_count integer not null default 1 check (transaction_count > 0),
  payment_method text not null default 'unknown' check (payment_method in ('cash', 'gcash', 'bank_transfer', 'mixed', 'unknown')),
  original_reference text not null,
  customer_name_snapshot text,
  cashier_name_snapshot text not null,
  note text,
  idempotency_key text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (period_end >= period_start),
  check (
    (period_granularity = 'day' and period_start = period_end)
    or (period_granularity = 'month' and period_start = date_trunc('month', period_start)::date and period_end = (date_trunc('month', period_start) + interval '1 month - 1 day')::date)
    or (period_granularity = 'year' and period_start = make_date(extract(year from period_start)::integer, 1, 1) and period_end = make_date(extract(year from period_start)::integer, 12, 31))
  )
);

create unique index if not exists historical_sales_aggregates_idempotency_key_uidx
  on operations.historical_sales_aggregates (idempotency_key)
  where idempotency_key is not null;

create index if not exists historical_sales_aggregates_period_idx
  on operations.historical_sales_aggregates (period_start desc, period_end desc);

create index if not exists historical_sales_aggregates_reference_idx
  on operations.historical_sales_aggregates (original_reference);

create table if not exists operations.historical_sales_aggregate_audit (
  id uuid primary key default gen_random_uuid(),
  aggregate_id uuid not null references operations.historical_sales_aggregates(id) on delete cascade,
  action text not null check (action in ('created', 'updated')),
  changed_by uuid references auth.users(id) on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists historical_sales_aggregate_audit_aggregate_idx
  on operations.historical_sales_aggregate_audit (aggregate_id, created_at desc);

alter table operations.historical_sales_aggregates enable row level security;
alter table operations.historical_sales_aggregate_audit enable row level security;

drop policy if exists historical_sales_aggregates_service_role on operations.historical_sales_aggregates;
create policy historical_sales_aggregates_service_role
  on operations.historical_sales_aggregates
  for all to service_role
  using (true)
  with check (true);

drop policy if exists historical_sales_aggregate_audit_service_role on operations.historical_sales_aggregate_audit;
create policy historical_sales_aggregate_audit_service_role
  on operations.historical_sales_aggregate_audit
  for all to service_role
  using (true)
  with check (true);

revoke all on table operations.historical_sales_aggregates from public, anon, authenticated;
revoke all on table operations.historical_sales_aggregate_audit from public, anon, authenticated;

create or replace function operations.historical_sales_aggregate_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = operations, public
as $$
  select to_jsonb(r)
  from (
    select
      id,
      period_granularity,
      period_start,
      period_end,
      total_amount,
      transaction_count,
      payment_method,
      original_reference,
      customer_name_snapshot,
      cashier_name_snapshot,
      note,
      idempotency_key,
      created_by,
      updated_by,
      created_at,
      updated_at
    from operations.historical_sales_aggregates
    where id = p_id
  ) r;
$$;

create or replace function operations.create_historical_sales_aggregate_internal(
  payload jsonb,
  p_operator_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = operations, public
as $$
declare
  v_id uuid;
  v_granularity text := lower(btrim(coalesce(payload ->> 'periodGranularity', '')));
  v_requested_start date := (payload ->> 'periodStart')::date;
  v_period_start date;
  v_period_end date;
  v_total numeric(14,2) := round(coalesce((payload ->> 'totalAmount')::numeric, 0), 2);
  v_transaction_count integer := coalesce((payload ->> 'transactionCount')::integer, 1);
  v_payment_method text := lower(coalesce(nullif(btrim(payload ->> 'paymentMethod'), ''), 'unknown'));
  v_reference text := nullif(btrim(coalesce(payload ->> 'originalReference', '')), '');
  v_cashier text := nullif(btrim(coalesce(payload ->> 'cashierName', '')), '');
  v_idempotency_key text := nullif(btrim(coalesce(payload ->> 'idempotencyKey', '')), '');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Historical period totals are server-managed.' using errcode = '42501';
  end if;

  if v_granularity not in ('day', 'month', 'year') then
    raise exception 'Historical totals must use day, month, or year granularity.' using errcode = '22023';
  end if;

  if v_granularity = 'day' then
    v_period_start := v_requested_start;
    v_period_end := v_requested_start;
  elsif v_granularity = 'month' then
    v_period_start := date_trunc('month', v_requested_start)::date;
    v_period_end := (date_trunc('month', v_requested_start) + interval '1 month - 1 day')::date;
  else
    v_period_start := make_date(extract(year from v_requested_start)::integer, 1, 1);
    v_period_end := make_date(extract(year from v_requested_start)::integer, 12, 31);
  end if;

  if v_total < 0 then
    raise exception 'Historical totals require a non-negative total amount.' using errcode = '22023';
  end if;

  if v_transaction_count < 1 then
    raise exception 'Historical totals require a whole transaction count of at least 1.' using errcode = '22023';
  end if;

  if v_payment_method not in ('cash', 'gcash', 'bank_transfer', 'mixed', 'unknown') then
    raise exception 'Historical totals require a supported payment method.' using errcode = '22023';
  end if;

  if v_reference is null then
    raise exception 'Historical totals require an original paper reference.' using errcode = '22023';
  end if;

  if v_cashier is null then
    raise exception 'Historical totals require the original cashier name.' using errcode = '22023';
  end if;

  if v_idempotency_key is not null then
    select id into v_id
    from operations.historical_sales_aggregates
    where idempotency_key = v_idempotency_key
    for update;

    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into operations.historical_sales_aggregates (
    period_granularity,
    period_start,
    period_end,
    total_amount,
    transaction_count,
    payment_method,
    original_reference,
    customer_name_snapshot,
    cashier_name_snapshot,
    note,
    idempotency_key,
    created_by,
    updated_by
  )
  values (
    v_granularity,
    v_period_start,
    v_period_end,
    v_total,
    v_transaction_count,
    v_payment_method,
    v_reference,
    nullif(btrim(coalesce(payload ->> 'customerName', '')), ''),
    v_cashier,
    nullif(btrim(coalesce(payload ->> 'note', '')), ''),
    v_idempotency_key,
    p_operator_id,
    p_operator_id
  )
  returning id into v_id;

  insert into operations.historical_sales_aggregate_audit (aggregate_id, action, changed_by, snapshot)
  values (v_id, 'created', p_operator_id, operations.historical_sales_aggregate_snapshot(v_id));

  return v_id;
end;
$$;

create or replace function operations.update_historical_sales_aggregate_internal(
  p_id uuid,
  payload jsonb,
  p_operator_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = operations, public
as $$
declare
  v_granularity text := lower(btrim(coalesce(payload ->> 'periodGranularity', '')));
  v_requested_start date := (payload ->> 'periodStart')::date;
  v_period_start date;
  v_period_end date;
  v_total numeric(14,2) := round(coalesce((payload ->> 'totalAmount')::numeric, 0), 2);
  v_transaction_count integer := coalesce((payload ->> 'transactionCount')::integer, 1);
  v_payment_method text := lower(coalesce(nullif(btrim(payload ->> 'paymentMethod'), ''), 'unknown'));
  v_reference text := nullif(btrim(coalesce(payload ->> 'originalReference', '')), '');
  v_cashier text := nullif(btrim(coalesce(payload ->> 'cashierName', '')), '');
  v_exists boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Historical period totals are server-managed.' using errcode = '42501';
  end if;

  select exists (select 1 from operations.historical_sales_aggregates where id = p_id) into v_exists;
  if not v_exists then
    raise exception 'Historical period total was not found.' using errcode = 'P0002';
  end if;

  if v_granularity not in ('day', 'month', 'year') then
    raise exception 'Historical totals must use day, month, or year granularity.' using errcode = '22023';
  end if;

  if v_granularity = 'day' then
    v_period_start := v_requested_start;
    v_period_end := v_requested_start;
  elsif v_granularity = 'month' then
    v_period_start := date_trunc('month', v_requested_start)::date;
    v_period_end := (date_trunc('month', v_requested_start) + interval '1 month - 1 day')::date;
  else
    v_period_start := make_date(extract(year from v_requested_start)::integer, 1, 1);
    v_period_end := make_date(extract(year from v_requested_start)::integer, 12, 31);
  end if;

  if v_total < 0 or v_transaction_count < 1 then
    raise exception 'Historical totals require a non-negative total and a transaction count of at least 1.' using errcode = '22023';
  end if;

  if v_payment_method not in ('cash', 'gcash', 'bank_transfer', 'mixed', 'unknown') then
    raise exception 'Historical totals require a supported payment method.' using errcode = '22023';
  end if;

  if v_reference is null or v_cashier is null then
    raise exception 'Historical totals require an original paper reference and cashier name.' using errcode = '22023';
  end if;

  update operations.historical_sales_aggregates
  set
    period_granularity = v_granularity,
    period_start = v_period_start,
    period_end = v_period_end,
    total_amount = v_total,
    transaction_count = v_transaction_count,
    payment_method = v_payment_method,
    original_reference = v_reference,
    customer_name_snapshot = nullif(btrim(coalesce(payload ->> 'customerName', '')), ''),
    cashier_name_snapshot = v_cashier,
    note = nullif(btrim(coalesce(payload ->> 'note', '')), ''),
    updated_by = p_operator_id,
    updated_at = timezone('utc', now())
  where id = p_id;

  insert into operations.historical_sales_aggregate_audit (aggregate_id, action, changed_by, snapshot)
  values (p_id, 'updated', p_operator_id, operations.historical_sales_aggregate_snapshot(p_id));

  return p_id;
end;
$$;

create or replace function operations.list_historical_sales_aggregates_internal(
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null,
  p_limit_count integer default 100,
  p_offset_count integer default 0
)
returns table (
  aggregate_id uuid,
  period_granularity text,
  period_start date,
  period_end date,
  total_amount numeric,
  transaction_count integer,
  payment_method text,
  original_reference text,
  customer_name text,
  cashier_name text,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = operations, public
as $$
  with filtered as (
    select
      h.id as aggregate_id,
      h.period_granularity,
      h.period_start,
      h.period_end,
      h.total_amount,
      h.transaction_count,
      h.payment_method,
      h.original_reference,
      h.customer_name_snapshot as customer_name,
      h.cashier_name_snapshot as cashier_name,
      h.note,
      h.created_at,
      h.updated_at,
      count(*) over () as total_count
    from operations.historical_sales_aggregates h
    where (p_start_date is null or h.period_end >= p_start_date)
      and (p_end_date is null or h.period_start <= p_end_date)
      and (
        p_search is null
        or p_search = ''
        or h.original_reference ilike '%' || p_search || '%'
        or coalesce(h.customer_name_snapshot, '') ilike '%' || p_search || '%'
        or h.cashier_name_snapshot ilike '%' || p_search || '%'
        or coalesce(h.note, '') ilike '%' || p_search || '%'
      )
  )
  select *
  from filtered
  order by period_start desc, created_at desc
  limit greatest(coalesce(p_limit_count, 100), 1)
  offset greatest(coalesce(p_offset_count, 0), 0);
$$;

create or replace function public.create_historical_sales_aggregate(payload jsonb, p_operator_id uuid default null)
returns uuid
language sql
security definer
set search_path = public, operations
as $$ select operations.create_historical_sales_aggregate_internal(payload, p_operator_id); $$;

create or replace function public.update_historical_sales_aggregate(p_aggregate_id uuid, payload jsonb, p_operator_id uuid default null)
returns uuid
language sql
security definer
set search_path = public, operations
as $$ select operations.update_historical_sales_aggregate_internal(p_aggregate_id, payload, p_operator_id); $$;

create or replace function public.list_historical_sales_aggregates(
  p_start_date date default null,
  p_end_date date default null,
  p_search text default null,
  p_limit_count integer default 100,
  p_offset_count integer default 0
)
returns table (
  aggregate_id uuid,
  period_granularity text,
  period_start date,
  period_end date,
  total_amount numeric,
  transaction_count integer,
  payment_method text,
  original_reference text,
  customer_name text,
  cashier_name text,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = public, operations
as $$
  select * from operations.list_historical_sales_aggregates_internal(p_start_date, p_end_date, p_search, p_limit_count, p_offset_count);
$$;

revoke all on function public.create_historical_sales_aggregate(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.update_historical_sales_aggregate(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.list_historical_sales_aggregates(date, date, text, integer, integer) from public, anon, authenticated;
grant execute on function public.create_historical_sales_aggregate(jsonb, uuid) to service_role;
grant execute on function public.update_historical_sales_aggregate(uuid, jsonb, uuid) to service_role;
grant execute on function public.list_historical_sales_aggregates(date, date, text, integer, integer) to service_role;

-- The operations schema is exposed to PostgREST for compatibility, so lock
-- down the implementation helpers as well as the public wrappers.
revoke all on function operations.historical_sales_aggregate_snapshot(uuid) from public, anon, authenticated;
revoke all on function operations.create_historical_sales_aggregate_internal(jsonb, uuid) from public, anon, authenticated;
revoke all on function operations.update_historical_sales_aggregate_internal(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function operations.list_historical_sales_aggregates_internal(date, date, text, integer, integer) from public, anon, authenticated;
grant execute on function operations.historical_sales_aggregate_snapshot(uuid) to service_role;
grant execute on function operations.create_historical_sales_aggregate_internal(jsonb, uuid) to service_role;
grant execute on function operations.update_historical_sales_aggregate_internal(uuid, jsonb, uuid) to service_role;
grant execute on function operations.list_historical_sales_aggregates_internal(date, date, text, integer, integer) to service_role;

commit;
