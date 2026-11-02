-- Correct only the outer checkout guard; retain request replay, staff/payment checks and stock posting.
do $patch$
declare d text;
begin
 d:=replace(pg_get_functiondef('public.checkout_pos_order(jsonb,uuid,uuid)'::regprocedure),chr(13),'');
 if md5(d)<>'3ab149892a9728f081484f72c00a7360' then raise exception 'Checkout definition changed; inspect before patching.'; end if;
 if strpos(d,$old$   or abs(round(((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric)*0.12,2)-(payload->'totals'->>'tax')::numeric)>0.01 then$old$)=0 then raise exception 'Expected old VAT check is missing.'; end if;
 d:=replace(d,$old$   or abs(round(((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric)*0.12,2)-(payload->'totals'->>'tax')::numeric)>0.01 then$old$,$new$   or payload->>'priceIncludesVat' is distinct from 'true'
   or abs(round(((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric)*12/112,2)-(payload->'totals'->>'tax')::numeric)>0.005
   or abs(round((payload->'totals'->>'rawSubtotal')::numeric-(payload->'totals'->>'discountAmount')::numeric,2)-(payload->'totals'->>'total')::numeric)>0.005 then$new$);
 execute d;
end;
$patch$;

-- The same old additive check remained in managed quotation persistence.
do $patch_quote$
declare d text;
begin
 d:=replace(pg_get_functiondef('app.attach_managed_estimate_snapshot(uuid,jsonb)'::regprocedure),chr(13),'');
 if md5(d)<>'ace0c3e19f5aedb7cde1737943b89d2e' then raise exception 'Managed quote definition changed; inspect before patching.'; end if;
 if strpos(d,$old$    or (p_payload#>>'{estimate,tax_total}')::numeric is distinct from round(net*0.12,2)
    or (p_payload#>>'{estimate,grand_total}')::numeric is distinct from net+round(net*0.12,2) then$old$)=0 then raise exception 'Expected old managed VAT check is missing.'; end if;
 d:=replace(d,$old$    or (p_payload#>>'{estimate,tax_total}')::numeric is distinct from round(net*0.12,2)
    or (p_payload#>>'{estimate,grand_total}')::numeric is distinct from net+round(net*0.12,2) then$old$,$new$    or (p_payload#>>'{estimate,tax_total}')::numeric is distinct from round(net*12/112,2)
    or (p_payload#>>'{estimate,grand_total}')::numeric is distinct from net then$new$);
 execute d;
end;
$patch_quote$;
