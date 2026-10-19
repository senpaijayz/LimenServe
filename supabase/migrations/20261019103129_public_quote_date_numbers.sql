-- Give customer-created public quotes a readable date-based reference.
-- Staff-created estimates keep their existing EST- number format.
create sequence if not exists app.public_quote_number_seq as bigint;

create or replace function app.assign_random_estimate_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_relation text;
  v_number text;
  v_exists boolean;
begin
  v_relation := case
    when to_regclass('operations.estimates') is not null then 'operations.estimates'
    when to_regclass('app.estimates') is not null then 'app.estimates'
    else null
  end;

  if v_relation is null then
    return new;
  end if;

  if lower(coalesce(new.source, '')) = 'public' then
    new.estimate_number := 'Q-'
      || to_char(clock_timestamp() at time zone 'Asia/Manila', 'YYYYMMDD')
      || nextval('app.public_quote_number_seq'::regclass)::text;
    return new;
  end if;

  -- Preserve explicitly supplied non-EST identifiers for trusted internal flows.
  if new.estimate_number is not null
     and btrim(new.estimate_number) <> ''
     and upper(new.estimate_number) not like 'EST-%' then
    return new;
  end if;

  loop
    v_number := 'EST-' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    execute format('select exists (select 1 from %s where estimate_number = $1)', v_relation)
      into v_exists
      using v_number;
    exit when not v_exists;
  end loop;

  new.estimate_number := v_number;
  return new;
end;
$$;

alter function app.assign_random_estimate_number()
  set search_path = pg_catalog;
revoke all on function app.assign_random_estimate_number()
  from public, anon, authenticated;
grant execute on function app.assign_random_estimate_number() to service_role;
