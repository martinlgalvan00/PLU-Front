-- Egresos: de append-only a CRUD auditado. La tabla permite update/delete a
-- service_role desde la migración RLS (20260823130000); lo que faltaba era el
-- camino auditado: cada edición y cada borrado queda en domain_audit_logs con
-- el before/after o el snapshot completo del asiento eliminado, igual que el
-- alta. El borrado es físico pero la auditoría conserva el registro.

alter table public.financial_expenses
  add column if not exists updated_at timestamptz;

create or replace function public.update_financial_expense(
  p_id uuid, p_occurred_on date, p_category text, p_description text, p_amount integer,
  p_event_id uuid default null, p_receipt_path text default null, p_actor_id text default null
) returns public.financial_expenses language plpgsql security definer set search_path = public as $$
declare v_old public.financial_expenses; v_row public.financial_expenses;
begin
  if p_amount <= 0 then raise exception 'El importe debe ser mayor a cero.' using errcode = 'PLU01'; end if;
  select * into v_old from public.financial_expenses where id = p_id;
  if not found then raise exception 'El egreso no existe.' using errcode = 'PLU02'; end if;
  update public.financial_expenses
    set occurred_on = coalesce(p_occurred_on, v_old.occurred_on),
        category = trim(p_category),
        description = trim(p_description),
        amount = p_amount,
        event_id = p_event_id,
        receipt_path = nullif(trim(coalesce(p_receipt_path, '')), ''),
        updated_at = now()
    where id = p_id
    returning * into v_row;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('finance.expense_updated','financial_expense',p_id::text,'staff',p_actor_id,
    jsonb_build_object(
      'before', jsonb_build_object('occurredOn',v_old.occurred_on,'category',v_old.category,'description',v_old.description,'amount',v_old.amount,'eventId',v_old.event_id,'receiptPath',v_old.receipt_path),
      'after', jsonb_build_object('occurredOn',v_row.occurred_on,'category',v_row.category,'description',v_row.description,'amount',v_row.amount,'eventId',v_row.event_id,'receiptPath',v_row.receipt_path)));
  return v_row;
end; $$;

create or replace function public.delete_financial_expense(
  p_id uuid, p_actor_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_old public.financial_expenses;
begin
  select * into v_old from public.financial_expenses where id = p_id;
  if not found then raise exception 'El egreso no existe.' using errcode = 'PLU02'; end if;
  delete from public.financial_expenses where id = p_id;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('finance.expense_deleted','financial_expense',p_id::text,'staff',p_actor_id,
    jsonb_build_object('snapshot', jsonb_build_object('occurredOn',v_old.occurred_on,'category',v_old.category,'description',v_old.description,'amount',v_old.amount,'currency',v_old.currency,'eventId',v_old.event_id,'receiptPath',v_old.receipt_path)));
end; $$;

revoke all on function public.update_financial_expense(uuid,date,text,text,integer,uuid,text,text) from public, anon, authenticated;
revoke all on function public.delete_financial_expense(uuid,text) from public, anon, authenticated;
grant execute on function public.update_financial_expense(uuid,date,text,text,integer,uuid,text,text) to service_role;
grant execute on function public.delete_financial_expense(uuid,text) to service_role;
