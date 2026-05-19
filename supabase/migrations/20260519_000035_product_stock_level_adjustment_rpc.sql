create or replace function catalog.set_product_stock_level(
  p_product_id uuid,
  p_stock numeric,
  p_reason text default null,
  p_performed_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = catalog, public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_business_date date := v_now::date;
  v_previous_stock numeric(12, 2);
  v_updated_stock numeric(12, 2);
  v_delta numeric(12, 2);
  v_status text;
  v_movement_id uuid;
begin
  if p_product_id is null then
    raise exception 'Product is required.';
  end if;

  if p_stock is null or p_stock < 0 then
    raise exception 'Stock quantity must be zero or greater.';
  end if;

  perform 1 from catalog.products where id = p_product_id;
  if not found then
    raise exception 'Product was not found in the catalog.';
  end if;

  insert into catalog.inventory_balances (
    product_id,
    on_hand,
    reserved,
    reorder_point,
    reorder_quantity,
    location,
    as_of_date,
    business_date,
    updated_at
  )
  values (
    p_product_id,
    0,
    0,
    0,
    0,
    '{}'::jsonb,
    v_business_date,
    v_business_date,
    v_now
  )
  on conflict (product_id) do nothing;

  select on_hand
    into v_previous_stock
  from catalog.inventory_balances
  where product_id = p_product_id
  for update;

  v_updated_stock := round(p_stock::numeric, 2);
  v_delta := v_updated_stock - coalesce(v_previous_stock, 0);
  v_status := case
    when v_updated_stock <= 0 then 'out_of_stock'
    when v_updated_stock <= 5 then 'low_stock'
    else 'in_stock'
  end;

  update catalog.inventory_balances
  set
    on_hand = v_updated_stock,
    as_of_date = v_business_date,
    business_date = v_business_date,
    updated_at = v_now
  where product_id = p_product_id;

  update catalog.products
  set
    status = v_status,
    updated_at = v_now
  where id = p_product_id;

  if v_delta <> 0 then
    insert into catalog.inventory_movements (
      product_id,
      movement_type,
      quantity,
      reference_type,
      reference_id,
      notes,
      performed_by,
      business_date
    )
    values (
      p_product_id,
      'adjustment',
      v_delta,
      'manual_stock_edit',
      null,
      coalesce(nullif(trim(p_reason), ''), 'Manual stock level edit'),
      p_performed_by,
      v_business_date
    )
    returning id into v_movement_id;
  end if;

  return jsonb_build_object(
    'productId', p_product_id,
    'previousStock', coalesce(v_previous_stock, 0),
    'updatedStock', v_updated_stock,
    'delta', v_delta,
    'status', v_status,
    'movementId', v_movement_id
  );
end;
$$;

create or replace function public.set_product_stock_level(
  p_product_id uuid,
  p_stock numeric,
  p_reason text default null,
  p_performed_by uuid default null
)
returns jsonb
language sql
security definer
set search_path = catalog, public
as $$
  select catalog.set_product_stock_level(p_product_id, p_stock, p_reason, p_performed_by);
$$;

revoke execute on function catalog.set_product_stock_level(uuid, numeric, text, uuid) from public;
revoke execute on function public.set_product_stock_level(uuid, numeric, text, uuid) from public;

grant execute on function catalog.set_product_stock_level(uuid, numeric, text, uuid) to service_role;
grant execute on function public.set_product_stock_level(uuid, numeric, text, uuid) to service_role;
