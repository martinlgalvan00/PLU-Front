-- `create_financial_expense` (20260816150000_financial_ledger.sql) llamaba a
-- `public.current_organization_id()`, una funcion que nunca existio en el
-- esquema -- rompe `supabase db lint` y cualquier alta de egreso. El resto de
-- las RPC de ese mismo dia (ver `operational_alerts`) resuelven la
-- organizacion con un parametro default, no con una funcion; esta migracion
-- alinea `create_financial_expense` al mismo patron en vez de inventar una
-- funcion nueva.
create or replace function public.create_financial_expense(
  p_occurred_on date, p_category text, p_description text, p_amount integer,
  p_event_id uuid default null, p_receipt_path text default null, p_actor_id text default null,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
) returns public.financial_expenses language plpgsql security definer set search_path = public as $$
declare v_row public.financial_expenses;
begin
  if p_amount <= 0 then raise exception 'El importe debe ser mayor a cero.' using errcode = 'PLU01'; end if;
  insert into public.financial_expenses(organization_id, occurred_on, category, description, amount, event_id, receipt_path, created_by)
  values (p_organization_id, coalesce(p_occurred_on,current_date), trim(p_category), trim(p_description), p_amount, p_event_id, nullif(trim(coalesce(p_receipt_path,'')),''), p_actor_id)
  returning * into v_row;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('finance.expense_created','financial_expense',v_row.id::text,'staff',p_actor_id,
    jsonb_build_object('amount',v_row.amount,'category',v_row.category,'occurredOn',v_row.occurred_on,'eventId',v_row.event_id));
  return v_row;
end; $$;
revoke all on function public.create_financial_expense(date,text,text,integer,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.create_financial_expense(date,text,text,integer,uuid,text,text,uuid) to service_role;
