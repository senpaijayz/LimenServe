-- Overdue jobs can still need a mechanic: assignment filtering must not hide them.
do $patch$
declare d text; old text;
begin
 d:=pg_get_functiondef('public.service_attention_page(integer,text)'::regprocedure);
 old:='end kind from base b';
 if strpos(d,old)=0 then raise exception 'Attention classification changed'; end if;
 d:=replace(d,old,$new$end kind,
   (b.status in ('pending','in_progress') and coalesce(b.stage,'') not in ('work_completed','released','cancelled')
     and coalesce(b.payment_status,'unpaid')<>'paid' and b.assigned_mechanic_id is null) needs_assignment from base b$new$);
 old:='(p_kind=''all'' or kind=p_kind)';
 if strpos(d,old)=0 then raise exception 'Attention filtering changed'; end if;
 d:=replace(d,old,'(p_kind=''all'' or kind=p_kind or (p_kind=''awaiting_assignment'' and needs_assignment))');
 old:='''kind'',s.kind';
 if strpos(d,old)=0 then raise exception 'Attention response changed'; end if;
 d:=replace(d,old,'''kind'',case when p_kind=''awaiting_assignment'' then p_kind else s.kind end');
 old:='count(*) filter(where kind=''awaiting_assignment'')';
 if strpos(d,old)=0 then raise exception 'Attention count changed'; end if;
 execute replace(d,old,'count(*) filter(where needs_assignment)');
end; $patch$;
