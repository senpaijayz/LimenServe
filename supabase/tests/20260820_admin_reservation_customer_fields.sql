do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'operations' and table_name = 'part_reservations' and column_name = 'payment_status'
  ) then
    raise exception 'part_reservations.payment_status is missing';
  end if;

  if to_regprocedure('public.create_admin_part_reservation(uuid,uuid,numeric,uuid,text,text,text,text,text)') is null then
    raise exception 'Direct-contact admin reservation RPC is missing';
  end if;
end;
$$;
