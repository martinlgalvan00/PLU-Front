-- Libro financiero operativo: los ingresos se leen del ledger de pagos; los
-- egresos son asientos manuales append-only y nunca alteran un pago existente.
create table if not exists public.financial_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  occurred_on date not null default current_date,
  category text not null check (length(trim(category)) between 2 and 80),
  description text not null check (length(trim(description)) between 3 and 500),
  amount integer not null check (amount > 0),
  currency text not null default 'ARS' check (currency = 'ARS'),
  event_id uuid null references public.events(id) on delete set null,
  receipt_path text null,
  created_by text null,
  created_at timestamptz not null default now()
);
create index if not exists financial_expenses_org_date_idx
  on public.financial_expenses(organization_id, occurred_on desc);

create or replace function public.create_financial_expense(
  p_occurred_on date, p_category text, p_description text, p_amount integer,
  p_event_id uuid default null, p_receipt_path text default null, p_actor_id text default null
) returns public.financial_expenses language plpgsql security definer set search_path = public as $$
declare v_row public.financial_expenses;
begin
  if p_amount <= 0 then raise exception 'El importe debe ser mayor a cero.' using errcode = 'PLU01'; end if;
  insert into public.financial_expenses(organization_id, occurred_on, category, description, amount, event_id, receipt_path, created_by)
  values (public.current_organization_id(), coalesce(p_occurred_on,current_date), trim(p_category), trim(p_description), p_amount, p_event_id, nullif(trim(coalesce(p_receipt_path,'')),''), p_actor_id)
  returning * into v_row;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('finance.expense_created','financial_expense',v_row.id::text,'staff',p_actor_id,
    jsonb_build_object('amount',v_row.amount,'category',v_row.category,'occurredOn',v_row.occurred_on,'eventId',v_row.event_id));
  return v_row;
end; $$;
revoke all on function public.create_financial_expense(date,text,text,integer,uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_financial_expense(date,text,text,integer,uuid,text,text) to service_role;
