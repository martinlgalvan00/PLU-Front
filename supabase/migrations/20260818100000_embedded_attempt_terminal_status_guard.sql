-- claim_embedded_payment_attempt: bloquear reintentos sobre órdenes en un
-- estado terminal distinto de 'aprobado'.
--
-- La función sólo abortaba si la orden ya estaba 'aprobado'
-- (20260715000400_phase5_embedded_checkout.sql:80-82). Nada a nivel SQL
-- impedía reclamar un intento nuevo sobre una orden 'cancelado' o
-- 'reembolsado' — la única guarda para esos dos estados vivía en JS
-- (embeddedPaymentWorkflow.js), usando la orden que la ruta ya había leído
-- *antes* de este claim. Si entre esa lectura y el claim un staff cancelaba
-- la orden o llegaba un reembolso por webhook, el guard de JS ya había
-- pasado y el `select ... for update` de acá no volvía a mirar el estado
-- contra nada: se podía reclamar (y cobrar) un intento sobre una orden que
-- ya no debía admitir pagos nuevos.
--
-- 'rechazado' se deja afuera a propósito: un pago rechazado (tarjeta
-- declinada) es el camino normal para reintentar con otro medio, no un
-- estado terminal.

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
  if v_status in ('cancelado', 'reembolsado') then
    raise exception 'La orden ya no admite un nuevo intento de pago.' using errcode = 'PLU09';
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
  )
  returning * into v_attempt;

  return jsonb_build_object('attempt', to_jsonb(v_attempt), 'created', true);
end;
$$;

revoke all on function public.claim_embedded_payment_attempt(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_embedded_payment_attempt(text, uuid, text, text)
  to service_role;
