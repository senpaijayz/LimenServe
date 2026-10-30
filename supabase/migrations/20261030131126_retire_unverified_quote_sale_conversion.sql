-- The legacy endpoint had no payment evidence, stock check or retry protection.
create or replace function public.convert_estimate_to_sale(p_estimate_id uuid,p_payment_method text default 'cash')
returns uuid language plpgsql security invoker set search_path='' as $$
begin raise exception using errcode='22023',message='Open the saved quotation in POS and confirm its payment before creating a sale.'; end;
$$;
create or replace function app.convert_estimate_to_sale_internal(p_estimate_id uuid,p_payment_method text default 'cash')
returns uuid language plpgsql security invoker set search_path='' as $$
begin raise exception using errcode='22023',message='Use the verified saved-quotation POS checkout.'; end;
$$;
revoke all on function public.convert_estimate_to_sale(uuid,text),app.convert_estimate_to_sale_internal(uuid,text) from public,anon,authenticated;
