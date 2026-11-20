-- El vencimiento de una entrada no puede comerse un comprobante ya cargado.
--
-- Caso real (Pitbull Classic, nov 2026): una transferencia manual subió el
-- comprobante a los dos minutos de crearse la orden. Al día siguiente
-- `expire_ticket_reservations` la pasó a `cancelado` y la entrada a
-- `cancelada`, tres minutos después de `reservation_expires_at`. No hubo
-- rechazo de staff ni fila en la bitácora: el cron no audita y no miraba
-- `payment_proof_uploaded_at`.
--
-- `expire_domain_orders` ya tenía esa guarda desde 20260907100000. Acá se
-- copia al cron de entradas. Un pago de Mercado Pago en `pendiente` y un
-- intento embebido en vuelo siguen frenando el vencimiento, igual que en
-- 20261129110000. La firma sigue siendo `returns int`: el cron solo hace
-- `select` y un replace no puede cambiar el tipo de retorno.
--
-- La reapertura es la salida para las órdenes que el cron ya se comió. No
-- acredita: vuelve la orden a `pendiente` y las entradas a `pendiente_pago`
-- para que Finanzas use `staff_approve_ticket_order`. Un rechazo explícito
-- (`rejected_at`) no entra por esta puerta: ese mail ya salió.

create or replace function public.expire_ticket_reservations(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with expired as (
    update public.ticket_orders o
    set status = 'cancelado', updated_at = now()
    where o.status in ('creado', 'pendiente')
      and o.reservation_expires_at is not null
      and o.reservation_expires_at <= p_now
      and not exists (
        select 1 from public.embedded_payment_attempts a
        where a.order_kind = 'ticket' and a.order_id = o.id
          and a.status in ('processing', 'submitted')
      )
      -- Ya hay un pago de Mercado Pago en curso para esta orden: lo resuelve el
      -- webhook o una persona, no el vencimiento de la reserva.
      and not exists (
        select 1 from public.ticket_payments p
        where p.order_id = o.id and p.status = 'pendiente'
      )
      -- Hay comprobante adjunto: esa orden la cierra una persona, no el cron.
      -- Misma regla que `expire_domain_orders` para afiliaciones.
      and o.payment_proof_uploaded_at is null
    returning o.id
  ), cancelled as (
    update public.tickets t set status = 'cancelada', updated_at = now()
    where t.order_id in (select id from expired) and t.status = 'pendiente_pago'
    returning t.order_id
  )
  select count(distinct order_id) into v_count from cancelled;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.expire_ticket_reservations(timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_ticket_reservations(timestamptz) to service_role;

create or replace function public.staff_reopen_cancelled_ticket_order(
  p_order_id uuid,
  p_actor text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ticket_orders;
  v_tickets jsonb;
  v_reason text;
  v_limit int;
  v_reserved int;
  v_restoring int;
  v_type record;
begin
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or char_length(v_reason) < 8 then
    raise exception 'El motivo tiene que tener al menos 8 caracteres.' using errcode = 'PLU01';
  end if;
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'La reapertura exige un responsable.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.provider <> 'manual' then
    raise exception 'Mercado Pago se revalida contra el proveedor, no se reabre a mano.'
      using errcode = 'PLU01';
  end if;
  if v_order.rejected_at is not null or v_order.status = 'rechazado' then
    raise exception 'Esta orden la rechazó Finanzas: no se reabre por este camino.'
      using errcode = 'PLU03';
  end if;

  if v_order.status = 'pendiente' then
    select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status <> 'cancelado' then
    raise exception 'La orden no está cancelada.' using errcode = 'PLU03';
  end if;
  if v_order.payment_proof_uploaded_at is null and v_order.payment_proof_path is null then
    raise exception 'No hay comprobante para revisar.' using errcode = 'PLU03';
  end if;

  perform 1 from public.tickets where order_id = p_order_id for update;
  if not exists (select 1 from public.tickets where order_id = p_order_id) then
    raise exception 'La orden no tiene entradas.' using errcode = 'PLU03';
  end if;
  if exists (
    select 1 from public.tickets where order_id = p_order_id and status <> 'cancelada'
  ) then
    raise exception 'La orden tiene entradas que no están canceladas.' using errcode = 'PLU03';
  end if;

  -- El cupo se mide como en el alta: una credencial secundaria de entrenador
  -- no ocupa lugar. Las entradas de esta orden siguen `cancelada`, así que
  -- todavía no cuentan: hay que sumarlas a mano.
  select count(*) into v_restoring from public.tickets
  where order_id = p_order_id and is_primary_credential;

  select limit_count into v_limit from public.event_capacity_rules
  where event_id = v_order.event_id and scope = 'event' and key = '';
  if v_limit is not null then
    select count(*) into v_reserved from public.tickets
    where event_id = v_order.event_id and status <> 'cancelada' and is_primary_credential;
    if v_reserved + v_restoring > v_limit then
      raise exception 'Evento agotado.' using errcode = 'PLU04';
    end if;
  end if;

  for v_type in
    select tt.id, tt.name, tt.quota, count(*)::int as requested
    from public.tickets t
    join public.ticket_types tt on tt.id = t.ticket_type_id
    where t.order_id = p_order_id
      and t.is_primary_credential
      and tt.quota is not null
    group by tt.id, tt.name, tt.quota
  loop
    select count(*) into v_reserved from public.tickets
    where ticket_type_id = v_type.id and status <> 'cancelada' and is_primary_credential;
    if v_reserved + v_type.requested > v_type.quota then
      raise exception 'Entradas agotadas para %.', v_type.name using errcode = 'PLU04';
    end if;
  end loop;

  -- Sin plazo: queda en manos de Finanzas. Si el cron volviera a mirar una
  -- reserva vencida, el comprobante igual la frena; anular el plazo deja
  -- explícito que ya no es una reserva.
  update public.ticket_orders
  set status = 'pendiente',
      reservation_expires_at = null,
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  update public.tickets
  set status = 'pendiente_pago', updated_at = now()
  where order_id = p_order_id and status = 'cancelada';

  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.created_at), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'ticket_order.reopened', 'ticket_order', p_order_id::text, 'staff', btrim(p_actor),
    jsonb_build_object(
      'reason', v_reason,
      'previousStatus', 'cancelado',
      'proofUploadedAt', v_order.payment_proof_uploaded_at,
      'ticketsReopened', jsonb_array_length(v_tickets)
    ),
    coalesce(v_order.organization_id, '00000000-0000-4000-8000-000000000001'::uuid)
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

revoke all on function public.staff_reopen_cancelled_ticket_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_reopen_cancelled_ticket_order(uuid, text, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.expire_ticket_reservations(timestamptz)') is null then
    raise exception 'Falta expire_ticket_reservations(timestamptz).' using errcode = 'PLU01';
  end if;
  if to_regprocedure('public.staff_reopen_cancelled_ticket_order(uuid, text, text)') is null then
    raise exception 'Falta staff_reopen_cancelled_ticket_order(uuid, text, text).'
      using errcode = 'PLU01';
  end if;
end
$verification$;
