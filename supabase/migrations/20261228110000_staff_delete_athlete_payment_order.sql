-- Borrar una fila de Cobros que no se cobró — PLU ARG
--
-- Finanzas junta órdenes que no van a ninguna parte: pruebas, duplicadas por un
-- doble clic, abiertas que nadie pagó y que ya vencieron, rechazadas. Hasta hoy
-- el panel solo permitía cancelarlas o dejarlas como historial, y la cola
-- terminaba llena de ruido.
--
-- Esta RPC las da de baja. Las guardas son el punto: borrar NO puede ser una
-- forma de hacer desaparecer plata que entró, así que cada motivo tiene su
-- propio errcode (la pantalla los muestra por separado):
--
--   PLU31  la orden está cobrada (aprobada/reembolsada) o tiene derechos
--          otorgados por un combo financiado
--   PLU32  tiene un comprobante adjunto: se manda a la papelera antes
--   PLU33  el pago ya fue declarado y espera revisión
--   PLU34  hay un intento de pasarela en vuelo
--   PLU35  tiene historial en el libro de pagos o una suscripción: se conserva
--
-- Una orden abierta se CANCELA primero, con la misma contrapartida que el
-- vencimiento y que la cancelación del atleta (devuelve el cupón y cancela la
-- inscripción que la esperaba) y recién después se borra. El rastro queda en
-- `domain_audit_logs` con quién, por qué y la foto de la orden.

create or replace function public.staff_delete_athlete_payment_order(
  p_order_id uuid,
  p_actor text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'plu_private'
as $function$
declare
  v_order public.athlete_payment_orders;
  v_was_open boolean;
  v_registrations int := 0;
  v_snapshot jsonb;
begin
  if p_actor is null or length(btrim(p_actor)) = 0 then
    raise exception 'Falta el actor de la baja.' using errcode = 'PLU01';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Indicá el motivo de la baja.' using errcode = 'PLU01';
  end if;

  select * into v_order from public.athlete_payment_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.status in ('aprobado', 'reembolsado') then
    raise exception 'Esta orden ya se cobró: no se puede borrar.' using errcode = 'PLU31';
  end if;
  if v_order.financed_entitlements_at is not null
     and v_order.financed_entitlements_revoked_at is null then
    raise exception 'Esta orden financiada ya otorgó derechos: no se puede borrar.'
      using errcode = 'PLU31';
  end if;

  if v_order.payment_proof_path is not null then
    raise exception 'Tiene un comprobante adjunto: mandalo a la papelera antes de borrar la orden.'
      using errcode = 'PLU32';
  end if;

  v_was_open := v_order.status in ('creado', 'pendiente', 'validacion_manual');

  if v_was_open and v_order.manual_payment_declared_at is not null then
    raise exception 'El pago ya fue declarado: revisalo antes de borrar la orden.'
      using errcode = 'PLU33';
  end if;

  if exists (
    select 1
    from public.embedded_payment_attempts a
    where a.order_kind = 'athlete'
      and a.order_id = v_order.id
      and a.status in ('processing', 'submitted')
  ) then
    raise exception 'Hay un intento de pago en curso: esperá a que termine.'
      using errcode = 'PLU34';
  end if;

  if exists (select 1 from public.athlete_payments where order_id = v_order.id)
     or exists (select 1 from public.billing_subscriptions where initial_order_id = v_order.id) then
    raise exception 'La orden tiene movimientos en el libro de pagos: se conserva como historial.'
      using errcode = 'PLU35';
  end if;

  v_snapshot := jsonb_build_object(
    'concept', v_order.concept,
    'status', v_order.status,
    'amount', v_order.amount,
    'currency', v_order.currency,
    'method', v_order.method,
    'manualPaymentChannel', v_order.manual_payment_channel,
    'reference', v_order.reference,
    'athleteId', v_order.athlete_id,
    'discountCode', v_order.discount_code,
    'createdAt', v_order.created_at
  );

  if v_was_open then
    -- El cupón vuelve al atleta ANTES de cerrar la orden.
    v_order := plu_private.release_order_discount(v_order.id);

    update public.athlete_payment_orders
    set status = 'cancelado',
        cancelled_at = now(),
        cancellation_code = 'cancelled_by_staff',
        cancellation_reason = 'Baja de la orden desde Cobros: ' || btrim(p_reason),
        cancelled_by = p_actor,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;

    -- Una orden cerrada no puede dejar viva la inscripción que la esperaba.
    with cancelled as (
      update public.event_registrations r
      set status = 'cancelada', updated_at = now()
      where r.payment_order_id = v_order.id
        and r.status = 'pendiente_pago'
      returning r.id
    )
    select count(*) into v_registrations from cancelled;
  end if;

  -- `membership_order_targets` apunta a la orden con on delete restrict: se
  -- suelta acá. La afiliación en sí no se borra (se gestiona desde Afiliaciones).
  delete from public.membership_order_targets where order_id = v_order.id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'payment_order.deleted',
    'payment_order',
    v_order.id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'wasOpen', v_was_open,
      'registrationsCancelled', v_registrations,
      'snapshot', v_snapshot
    ),
    v_order.organization_id
  );

  delete from public.athlete_payment_orders where id = v_order.id;

  return jsonb_build_object(
    'deleted', true,
    'orderId', p_order_id,
    'wasOpen', v_was_open,
    'registrationsCancelled', v_registrations
  );
end;
$function$;

revoke all on function public.staff_delete_athlete_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_athlete_payment_order(uuid, text, text)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.staff_delete_athlete_payment_order(uuid,text,text)') is null then
    raise exception 'Falta public.staff_delete_athlete_payment_order.';
  end if;
end
$verification$;
