do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('app.list_estimates_internal(text,integer)'::regprocedure);
  if position('e.valid_until >= current_date' in lower(v_definition)) = 0 then
    raise exception 'Saved quotation list must exclude expired validity dates.';
  end if;
end;
$$;
