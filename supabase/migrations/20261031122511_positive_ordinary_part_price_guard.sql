-- Zero/missing ordinary prices are review states, not implicit free parts.
-- Preserve saved package allocations when their verified base price is positive.
do $patch$
declare d text; old text;
begin
 d:=pg_get_functiondef('public.create_pos_sale(jsonb,uuid)'::regprocedure);
 if md5(d)<>'1c7d6f73128ee1c7eebef6e82983d425' then
   raise exception 'Retail price gate changed; review before applying the positive-price guard.';
 end if;
 old:='or cp.id is null';
 if strpos(d,old)=0 then raise exception 'Retail price check marker changed'; end if;
 execute replace(d,old,old||' or cp.amount is null or cp.amount<=0 or cp.amount::text in (''NaN'',''Infinity'',''-Infinity'')');

 d:=pg_get_functiondef('public.quote_pos_context(uuid)'::regprocedure);
 old:='   when exists(select 1 from (select product_id,sum(quantity)';
 if strpos(d,old)=0 then raise exception 'Saved quote stock guard changed; review before applying.'; end if;
 execute replace(d,old,$new$   when exists(select 1 from operations.estimate_items i where i.estimate_id=p_id and i.line_type='product' and i.unit_price=0
     and (i.catalog_unit_price is null or i.catalog_unit_price<=0 or i.catalog_unit_price::text in ('NaN','Infinity','-Infinity')))
     then 'A saved part has no verified positive catalog price. Review and save an approved revision before checkout.'
   when exists(select 1 from (select product_id,sum(quantity)$new$);
end; $patch$;
