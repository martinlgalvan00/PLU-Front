-- El atleta puede cerrar su propia orden abierta — PLU ARG
--
-- El incidente: una inscripción por transferencia que quedó `pendiente` deja al
-- atleta sin salida propia. La orden vive hasta que vence (24 h) o hasta que
-- alguien de Finanzas la toca, y mientras tanto el checkout la reusa. Si además
-- la orden se quedó con un cupón consumido, la redención —única por (código,
-- atleta)— bloquea volver a usar ese código: el checkout anuncia el precio y el
-- alta rebota con PLU22. No había ninguna acción del atleta que destrabara eso.
--
-- Esta RPC le da la salida: cancelar la orden, devolver el cupón y liberar la
-- inscripción, para poder abrir una orden nueva por el medio que quiera.
--
-- Las guardas son el punto. Cancelar NO puede ser una forma de borrar plata que
-- ya entró, así que cada motivo de rechazo tiene su propio errcode para que la
-- pantalla explique cuál es —el reclamo que originó todo esto fue un botón que
-- no respondía y no decía por qué:
--
--   PLU31  la orden ya está pagada o cerrada
--   PLU32  hay un comprobante adjunto esperando revisión de Finanzas
--   PLU33  el atleta ya declaró el pago
--   PLU34  hay un intento de pasarela en vuelo
--
-- Cancelar dos veces no es un error: devuelve `alreadyCancelled` para que un
-- doble clic o un reintento de red no se muestren como una falla.

-- `cancelled_by_athlete` es un motivo nuevo y legítimo: hasta ahora el catálogo
-- sólo contemplaba cierres del sistema o del staff.
--
-- CUIDADO al tocar esta lista: se reconstruye entera, así que copiarla de una
-- migración vieja PIERDE los motivos agregados después. Ya pasó una vez —
-- 20260922100000 sumó `financing_term_expired` copiando la lista de
-- 20260910100000 y se llevó `closed_before_expiry` con él, y hubo que restaurarlo
-- en 20260930110000—. El bloque de verificación del final afirma los nueve
-- valores uno por uno para que la tercera vez falle acá y no en producción.
do $$
begin
  alter table public.athlete_payment_orders
    drop constraint if exists athlete_payment_orders_cancellation_code_check;
  alter table public.athlete_payment_orders
    add constraint athlete_payment_orders_cancellation_code_check
    check (cancellation_code is null or cancellation_code in (
      'expired_without_payment',
      'expired_after_failed_attempt',
      'provider_cancelled',
      'cancelled_by_staff',
      'superseded_by_new_order',
      'resolved_off_platform',
      -- Conservados de 20260930110000: no se pueden perder al sumar un motivo.
      'closed_before_expiry',
      'financing_term_expired',
      -- La cerró el propio atleta desde el checkout para elegir otro medio.
      'cancelled_by_athlete'
    ));
end
$$;

create or replace function public.athlete_cancel_payment_order(
  p_athlete_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'plu_private'
as $function$
declare
  v_order public.athlete_payment_orders;
  v_registrations int := 0;
  v_released_code text;
  v_released_amount int;
begin
  -- El filtro por atleta va en el WHERE y no en un chequeo posterior: una orden
  -- de otra cuenta tiene que ser indistinguible de una que no existe.
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id and athlete_id = p_athlete_id
  for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.status = 'cancelado' then
    return jsonb_build_object(
      'cancelled', false,
      'alreadyCancelled', true,
      'order', to_jsonb(v_order)
    );
  end if;

  if v_order.status = 'aprobado' then
    raise exception 'Esta orden ya está pagada: no se puede cancelar.'
      using errcode = 'PLU31';
  end if;

  if v_order.status not in ('creado', 'pendiente', 'validacion_manual') then
    raise exception 'Esta orden ya está cerrada: no se puede cancelar.'
      using errcode = 'PLU31';
  end if;

  if v_order.payment_proof_path is not null
     or v_order.payment_proof_uploaded_at is not null then
    raise exception 'Ya subiste un comprobante: Finanzas tiene que revisarlo antes de poder cancelarla.'
      using errcode = 'PLU32';
  end if;

  if v_order.manual_payment_declared_at is not null then
    raise exception 'Ya declaraste el pago de esta orden: esperá la revisión de Finanzas.'
      using errcode = 'PLU33';
  end if;

  if exists (
    select 1
    from public.embedded_payment_attempts a
    where a.order_kind = 'athlete'
      and a.order_id = v_order.id
      and a.status in ('processing', 'submitted')
  ) then
    raise exception 'Hay un intento de pago en curso: esperá a que termine antes de cancelar.'
      using errcode = 'PLU34';
  end if;

  -- El cupón vuelve al atleta ANTES de cerrar la orden. Sin esto la redención
  -- queda consumida contra una orden muerta y el mismo código rebota con PLU22
  -- en el intento siguiente — que es justo el callejón que esta cancelación
  -- viene a abrir. `release_order_discount` ya repone el importe y deja su
  -- propio asiento de auditoría.
  v_released_code := v_order.discount_code;
  v_released_amount := coalesce(v_order.discount_amount, 0);
  v_order := plu_private.release_order_discount(v_order.id);

  update public.athlete_payment_orders
  set status = 'cancelado',
      cancelled_at = now(),
      cancellation_code = 'cancelled_by_athlete',
      cancellation_reason = 'El atleta canceló la orden para elegir otro medio de pago.',
      cancelled_by = 'athlete:' || p_athlete_id::text,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  -- Misma contrapartida que hace `expire_domain_orders`: una orden cerrada no
  -- puede dejar viva la inscripción que la esperaba, o el atleta figura anotado
  -- sin haber pagado.
  with cancelled as (
    update public.event_registrations r
    set status = 'cancelada', updated_at = now()
    where r.payment_order_id = v_order.id
      and r.status = 'pendiente_pago'
    returning r.id
  )
  select count(*) into v_registrations from cancelled;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'payment_order.cancelled_by_athlete',
    'payment_order',
    v_order.id::text,
    'athlete',
    p_athlete_id::text,
    jsonb_build_object(
      'concept', v_order.concept,
      'method', v_order.method,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'releasedCode', v_released_code,
      'releasedDiscount', v_released_amount,
      'registrationsCancelled', v_registrations
    ),
    v_order.organization_id
  );

  return jsonb_build_object(
    'cancelled', true,
    'alreadyCancelled', false,
    'registrationsCancelled', v_registrations,
    'releasedCode', v_released_code,
    'order', to_jsonb(v_order)
  );
end;
$function$;

revoke all on function public.athlete_cancel_payment_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.athlete_cancel_payment_order(uuid, uuid)
  to service_role;

do $verification$
begin
  if to_regprocedure('public.athlete_cancel_payment_order(uuid, uuid)') is null then
    raise exception 'Falta athlete_cancel_payment_order.';
  end if;

  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'athlete_cancel_payment_order'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'athlete_cancel_payment_order quedó expuesta al navegador.';
  end if;

  -- El CHECK se reconstruyó entero: se afirma valor por valor que no se perdió
  -- ninguno de los motivos que ya existían, además del nuevo. Sin esto, una
  -- lista copiada de una migración vieja vuelve a borrar un motivo en silencio
  -- y el fallo aparece recién cuando un job intenta escribirlo.
  declare
    v_def text;
    v_value text;
  begin
    select pg_get_constraintdef(oid) into v_def
    from pg_constraint
    where conname = 'athlete_payment_orders_cancellation_code_check';
    if v_def is null then
      raise exception 'Falta el CHECK de cancellation_code.';
    end if;
    for v_value in
      select unnest(array[
        'expired_without_payment',
        'expired_after_failed_attempt',
        'provider_cancelled',
        'cancelled_by_staff',
        'superseded_by_new_order',
        'resolved_off_platform',
        'closed_before_expiry',
        'financing_term_expired',
        'cancelled_by_athlete'
      ])
    loop
      if position('''' || v_value || '''' in v_def) = 0 then
        raise exception 'El CHECK de cancellation_code perdió el motivo %.', v_value;
      end if;
    end loop;
  end;
end;
$verification$;
