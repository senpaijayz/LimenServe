-- Manual selling-price edits also append history, including same-day changes.
create or replace function public.limen_set_retail_price(p_product_id uuid,p_amount numeric,p_business_date date)
returns void language plpgsql security invoker
set search_path = pg_catalog, catalog
as $function$
declare previous numeric; recorded timestamptz := clock_timestamp();
begin
  if p_amount is null or p_amount < 0 or p_business_date is null then
    raise exception using errcode='22023', message='A valid retail price and date are required.';
  end if;
  perform pg_advisory_xact_lock(73841590214631::bigint);
  select amount into previous from catalog.product_prices where product_id=p_product_id and price_type='retail' and is_current;
  if previous = round(p_amount,2) then return; end if;
  update catalog.product_prices set is_current=false,effective_to=p_business_date,updated_at=recorded
    where product_id=p_product_id and price_type='retail' and is_current;
  insert into catalog.product_prices(product_id,price_type,amount,currency,effective_from,is_current,business_date,created_at,updated_at)
    values(p_product_id,'retail',round(p_amount,2),'PHP',p_business_date,true,p_business_date,recorded,recorded);
end;
$function$;
revoke all on function public.limen_set_retail_price(uuid,numeric,date) from public,anon,authenticated;
grant execute on function public.limen_set_retail_price(uuid,numeric,date) to service_role;
