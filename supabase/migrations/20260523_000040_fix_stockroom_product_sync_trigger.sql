-- Keep catalog product inserts compatible with the current stockroom schema.
-- The old trigger target app.items was removed when stockroom tables moved schemas.

create or replace function app.sync_stockroom_item_from_product()
returns trigger
language plpgsql
set search_path to 'stockroom', 'catalog', 'public'
as $function$
begin
  insert into stockroom.items (product_id, part_code, keywords, is_active)
  values (
    new.id,
    nullif(new.sku, ''),
    array_remove(array[new.category, new.model_name, new.brand], null),
    coalesce(new.is_active, true)
  )
  on conflict (product_id) do update
    set part_code = coalesce(stockroom.items.part_code, excluded.part_code),
        keywords = case
          when coalesce(array_length(stockroom.items.keywords, 1), 0) = 0 then excluded.keywords
          else stockroom.items.keywords
        end,
        is_active = excluded.is_active,
        updated_at = timezone('utc', now());

  return new;
end;
$function$;
