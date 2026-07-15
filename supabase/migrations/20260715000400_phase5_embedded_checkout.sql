-- Fase 5: intentos idempotentes para Checkout Bricks embebido. El browser
-- entrega solamente el token efimero generado por MercadoPago.js; monto,
-- moneda, concepto y referencia se reconstruyen desde la orden server-side.

-- Variante anual con renovacion automatica. El precio mensual no se inventa
-- en codigo: se publica como otra fila del catalogo cuando negocio lo defina.
insert into public.membership_plans (
  code, name, description, price, currency, billing_frequency,
  collection_mode, interval_count, grace_days, active
)
values (
  'plu-annual-auto', 'Afiliacion PLU anual automatica',
  'Afiliacion anual con renovacion automatica mediante Mercado Pago',
  38000, 'ARS', 'annual', 'recurring', 1, 10, true
)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  billing_frequency = excluded.billing_frequency,
  collection_mode = excluded.collection_mode,
  interval_count = excluded.interval_count,
  grace_days = excluded.grace_days,
  updated_at = now();

create table if not exists public.embedded_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_kind text not null check (order_kind in ('athlete', 'ticket')),
  order_id uuid not null,
  token_fingerprint text not null,
  idempotency_key text not null unique,
  status text not null default 'processing'
    check (status in ('processing', 'submitted', 'failed')),
  external_payment_id text,
  provider_payload jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_kind, order_id, token_fingerprint)
);

create index if not exists embedded_payment_attempts_order_idx
  on public.embedded_payment_attempts (order_kind, order_id, created_at desc);
create unique index if not exists embedded_payment_attempts_processing_uidx
  on public.embedded_payment_attempts (order_kind, order_id)
  where status = 'processing';

alter table public.embedded_payment_attempts enable row level security;
create policy "embedded_payment_attempts_staff_read"
  on public.embedded_payment_attempts for select to authenticated
  using (public.can_view_admin_data());
grant select on public.embedded_payment_attempts to authenticated;

create or replace function public.claim_embedded_payment_attempt(
  p_order_kind text,
  p_order_id uuid,
  p_token_fingerprint text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.embedded_payment_attempts;
  v_status text;
begin
  if p_order_kind = 'athlete' then
    select status into v_status from public.athlete_payment_orders
    where id = p_order_id for update;
  elsif p_order_kind = 'ticket' then
    select status into v_status from public.ticket_orders
    where id = p_order_id for update;
  else
    raise exception 'Tipo de orden invalido.' using errcode = 'PLU10';
  end if;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_status = 'aprobado' then
    raise exception 'La orden ya esta pagada.' using errcode = 'PLU09';
  end if;

  update public.embedded_payment_attempts
  set status = 'failed', error = 'Intento vencido.', updated_at = now()
  where order_kind = p_order_kind and order_id = p_order_id
    and status = 'processing' and updated_at < now() - interval '5 minutes';

  select * into v_attempt from public.embedded_payment_attempts
  where order_kind = p_order_kind and order_id = p_order_id
    and token_fingerprint = p_token_fingerprint;
  if found then
    if v_attempt.status = 'failed' and v_attempt.external_payment_id is null then
      update public.embedded_payment_attempts
      set status = 'processing', error = null, updated_at = now()
      where id = v_attempt.id
      returning * into v_attempt;
      return jsonb_build_object('attempt', to_jsonb(v_attempt), 'created', true);
    end if;
    return jsonb_build_object('attempt', to_jsonb(v_attempt), 'created', false);
  end if;

  if exists (
    select 1 from public.embedded_payment_attempts
    where order_kind = p_order_kind and order_id = p_order_id and status = 'processing'
  ) then
    raise exception 'Ya existe un pago en procesamiento.' using errcode = 'PLU12';
  end if;

  insert into public.embedded_payment_attempts (
    order_kind, order_id, token_fingerprint, idempotency_key
  ) values (
    p_order_kind, p_order_id, p_token_fingerprint, p_idempotency_key
  ) returning * into v_attempt;

  return jsonb_build_object('attempt', to_jsonb(v_attempt), 'created', true);
end;
$$;

revoke all on function public.claim_embedded_payment_attempt(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_embedded_payment_attempt(text, uuid, text, text)
  to service_role;

create or replace function public.complete_embedded_payment_attempt(
  p_attempt_id uuid,
  p_status text,
  p_external_payment_id text default null,
  p_payload jsonb default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('submitted', 'failed') then
    raise exception 'Estado de intento invalido.' using errcode = 'PLU10';
  end if;
  update public.embedded_payment_attempts
  set status = p_status,
      external_payment_id = coalesce(p_external_payment_id, external_payment_id),
      provider_payload = coalesce(p_payload, provider_payload),
      error = case when p_status = 'failed' then left(coalesce(p_error, 'Error desconocido'), 2000) else null end,
      updated_at = now()
  where id = p_attempt_id;
end;
$$;

revoke all on function public.complete_embedded_payment_attempt(uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.complete_embedded_payment_attempt(uuid, text, text, jsonb, text)
  to service_role;
