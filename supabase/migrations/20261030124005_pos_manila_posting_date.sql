-- Future POS postings use the same Philippine business date as payment settlement.
do $patch$
declare d text; old text:='v_business_date date := current_date;';
begin
 d:=replace(pg_get_functiondef('operations.create_pos_sale_internal(jsonb,uuid)'::regprocedure),chr(13),'');
 if (length(d)-length(replace(d,old,'')))/length(old)<>1 then raise exception 'POS business-date declaration changed; review before applying.'; end if;
 execute replace(d,old,$new$v_business_date date := (now() at time zone 'Asia/Manila')::date;$new$);
end;
$patch$;
