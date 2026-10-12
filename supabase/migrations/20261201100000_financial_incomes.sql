-- Ingresos manuales del libro de caja — PLU ARG
--
-- Hasta ahora el libro de caja leía los ingresos del ledger de pagos
-- (athlete_payments / ticket_payments aprobados) y solo los egresos eran
-- asientos manuales. Eso dejaba afuera lo que entra sin pasar por un checkout:
-- sponsors, donaciones, alquileres, ventas en mostrador.
--
-- `financial_incomes` es el espejo de `financial_expenses`: mismo contrato,
-- mismo camino auditado (alta / edición / baja por RPC security definer, cada
-- operación en `domain_audit_logs`). Es una tabla aparte y no una columna
-- `kind` en egresos para no tocar el camino de egresos ya en producción.
--
-- Nunca confirma un pago: un cobro de atleta o de entrada sigue entrando
-- solo por su ledger. Estos asientos son para dinero que no tiene orden.

create table if not exists public.financial_incomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default '00000000-0000-4000-8000-000000000001'::uuid
    references public.organizations(id),
  occurred_on date not null default current_date,
  category text not null check (length(trim(category)) between 2 and 80),
  description text not null check (length(trim(description)) between 3 and 500),
  amount integer not null check (amount > 0),
  currency text not null default 'ARS' check (currency = 'ARS'),
  event_id uuid null references public.events(id) on delete set null,
  receipt_path text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists financial_incomes_org_date_idx
  on public.financial_incomes(organization_id, occurred_on desc);

alter table public.financial_incomes enable row level security;
revoke all on table public.financial_incomes from public, anon, authenticated;
grant select, insert, update, delete on table public.financial_incomes to service_role;

create or replace function public.create_financial_income(
  p_occurred_on date, p_category text, p_description text, p_amount integer,
  p_event_id uuid default null, p_receipt_path text default null, p_actor_id text default null,
  p_organization_id uuid default '00000000-0000-4000-8000-000000000001'::uuid
) returns public.financial_incomes language plpgsql security definer set search_path = public as $$
declare v_row public.financial_incomes;
begin
  if p_amount <= 0 then raise exception 'El importe debe ser mayor a cero.' using errcode = 'PLU01'; end if;
  insert into public.financial_incomes(organization_id, occurred_on, category, description, amount, event_id, receipt_path, created_by)
  values (p_organization_id, coalesce(p_occurred_on, current_date), trim(p_category), trim(p_description), p_amount, p_event_id, nullif(trim(coalesce(p_receipt_path, '')), ''), p_actor_id)
  returning * into v_row;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('finance.income_created', 'financial_income', v_row.id::text, 'staff', p_actor_id,
    jsonb_build_object('amount', v_row.amount, 'category', v_row.category, 'occurredOn', v_row.occurred_on, 'eventId', v_row.event_id));
  return v_row;
end; $$;

create or replace function public.update_financial_income(
  p_id uuid, p_occurred_on date, p_category text, p_description text, p_amount integer,
  p_event_id uuid default null, p_receipt_path text default null, p_actor_id text default null
) returns public.financial_incomes language plpgsql security definer set search_path = public as $$
declare v_old public.financial_incomes; v_row public.financial_incomes;
begin
  if p_amount <= 0 then raise exception 'El importe debe ser mayor a cero.' using errcode = 'PLU01'; end if;
  select * into v_old from public.financial_incomes where id = p_id;
  if not found then raise exception 'El ingreso no existe.' using errcode = 'PLU02'; end if;
  update public.financial_incomes
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
  values ('finance.income_updated', 'financial_income', p_id::text, 'staff', p_actor_id,
    jsonb_build_object(
      'before', jsonb_build_object('occurredOn', v_old.occurred_on, 'category', v_old.category, 'description', v_old.description, 'amount', v_old.amount, 'eventId', v_old.event_id, 'receiptPath', v_old.receipt_path),
      'after', jsonb_build_object('occurredOn', v_row.occurred_on, 'category', v_row.category, 'description', v_row.description, 'amount', v_row.amount, 'eventId', v_row.event_id, 'receiptPath', v_row.receipt_path)));
  return v_row;
end; $$;

create or replace function public.delete_financial_income(
  p_id uuid, p_actor_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_old public.financial_incomes;
begin
  select * into v_old from public.financial_incomes where id = p_id;
  if not found then raise exception 'El ingreso no existe.' using errcode = 'PLU02'; end if;
  delete from public.financial_incomes where id = p_id;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('finance.income_deleted', 'financial_income', p_id::text, 'staff', p_actor_id,
    jsonb_build_object('snapshot', jsonb_build_object('occurredOn', v_old.occurred_on, 'category', v_old.category, 'description', v_old.description, 'amount', v_old.amount, 'currency', v_old.currency, 'eventId', v_old.event_id, 'receiptPath', v_old.receipt_path)));
end; $$;

revoke all on function public.create_financial_income(date, text, text, integer, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.update_financial_income(uuid, date, text, text, integer, uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_financial_income(uuid, text) from public, anon, authenticated;
grant execute on function public.create_financial_income(date, text, text, integer, uuid, text, text, uuid) to service_role;
grant execute on function public.update_financial_income(uuid, date, text, text, integer, uuid, text, text) to service_role;
grant execute on function public.delete_financial_income(uuid, text) to service_role;
