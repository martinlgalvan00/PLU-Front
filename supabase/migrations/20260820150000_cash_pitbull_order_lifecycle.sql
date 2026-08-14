-- Ciclo de vida de las órdenes en efectivo en la sede — PLU ARG
--
-- Toda orden manual nace con `expires_at = now() + 1 day`, y lo único que
-- estiraba esa ventana era adjuntar un comprobante
-- (`register_athlete_payment_proof`). El canal `cash_pitbull` no adjunta nada
-- nunca: la plata se cobra en mano el día del torneo. Con `expire_domain_orders`
-- corriendo por pg_cron cada minuto, la orden se cancelaba al día siguiente de
-- creada y arrastraba la inscripción a `cancelada`; cuando el atleta llegaba a
-- pagar, Finanzas se encontraba con `PLU10 - La orden ya no admite aprobacion`.
-- La pantalla, mientras tanto, prometía "Orden guardada. Pagá en efectivo en la
-- sede".
--
-- Dos correcciones que van juntas:
--
--   1. La orden en efectivo vive hasta que termina el torneo donde se cobra.
--   2. Esa orden se puede rechazar sin comprobante. Sin esto, la primera
--      corrección deja el cupo tomado por alguien que nunca apareció, sin
--      ninguna forma de liberarlo desde el panel.
--
-- La ventana de transferencia no cambia: ahí el plazo corto es deliberado
-- porque el comprobante se sube el mismo día, y volver de efectivo a
-- transferencia la reinstala.

-- ---------------------------------------------------------------------------
-- Vencimiento del cobro presencial
-- ---------------------------------------------------------------------------
-- El torneo sale de la propia inscripción que la orden está pagando. Una
-- afiliación suelta no tiene evento asociado, así que se toma el próximo torneo
-- publicado con fecha vigente — que es la sede donde ese efectivo se cobra.
create or replace function plu_private.cash_checkout_deadline(p_order_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select greatest(
    now() + interval '1 day',
    coalesce(
      (
        select e.ends_at + interval '1 day'
        from public.event_registrations r
        join public.events e on e.id = r.event_id
        where r.payment_order_id = p_order_id
        order by e.starts_at
        limit 1
      ),
      (
        select e.ends_at + interval '1 day'
        from public.events e
        where e.published and e.ends_at >= now()
        order by e.starts_at
        limit 1
      ),
      now() + interval '30 days'
    )
  );
$$;

revoke all on function plu_private.cash_checkout_deadline(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- El canal decide la vigencia
-- ---------------------------------------------------------------------------
-- `settle_manual_checkout_pricing` es el único punto por el que pasan tanto el
-- alta como el cambio de canal sobre una orden reusada, así que la vigencia se
-- resuelve acá y no en el trigger de INSERT: una orden que pasa de
-- transferencia a efectivo (`duplicate = true`) también necesita la ventana
-- larga.
create or replace function plu_private.settle_manual_checkout_pricing(
  p_order_id uuid,
  p_payment_method text,
  p_manual_payment_channel text,
  p_order_amount numeric
)
returns public.athlete_payment_orders
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_order public.athlete_payment_orders;
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden de checkout no encontrada.' using errcode = 'PLU02';
  end if;

  -- La orden ya cobró, venció, o la RPC se negó a moverla de medio: en los tres
  -- casos la cotización que trae esta llamada no le corresponde.
  if v_order.status not in ('pendiente', 'creado', 'validacion_manual')
     or v_order.method is distinct from p_payment_method then
    return v_order;
  end if;

  -- Evidencia de cobro en curso: el socio ya transfirió contra este importe, o
  -- Mercado Pago ya tiene una preference con él. `createPaymentPreference`
  -- reusa la preference existente, así que bajar el monto acá haría que el pago
  -- llegue con otro importe y `applyCanonicalPayment` lo rechace.
  if v_order.payment_proof_path is not null or v_order.provider_preference_id is not null then
    return v_order;
  end if;

  update public.athlete_payment_orders
  set amount = coalesce(p_order_amount, amount),
      manual_payment_channel = p_manual_payment_channel,
      expires_at = case
        -- Cobro presencial: la orden no puede vencer antes del torneo.
        when p_manual_payment_channel = 'cash_pitbull' then
          greatest(coalesce(expires_at, now()), plu_private.cash_checkout_deadline(v_order.id))
        -- Vuelta a transferencia: se reinstala la ventana corta. Sin esto, una
        -- orden que pasó por efectivo se quedaría meses abierta esperando un
        -- comprobante que se sube el mismo día.
        when p_manual_payment_channel = 'bank_transfer' then
          least(coalesce(expires_at, now() + interval '1 day'), now() + interval '1 day')
        else expires_at
      end,
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rechazo del cobro presencial
-- ---------------------------------------------------------------------------
-- "El atleta no apareció a pagar" es una decisión de Finanzas tan válida como
-- descartar un comprobante ilegible, y es la única manera de devolver el cupo
-- que la orden viene reservando hasta el día del torneo. La exigencia de
-- comprobante se mantiene intacta para transferencia.
create or replace function public.reject_athlete_payment_order(
  p_order_id uuid,
  p_reason text default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_cash boolean;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se rechazan por webhook.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'rechazado' then
    return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true);
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite rechazo.' using errcode = 'PLU10';
  end if;

  v_cash := coalesce(v_order.manual_payment_channel, 'bank_transfer') = 'cash_pitbull';
  if v_order.payment_proof_path is null and not v_cash then
    raise exception 'No hay comprobante para rechazar.' using errcode = 'PLU10';
  end if;

  update public.athlete_payment_orders
  set status = 'rechazado', updated_at = now()
  where id = p_order_id returning * into v_order;

  -- El cupo vuelve a estar disponible: la inscripción deja de contar para
  -- `get_event_registration_capacity`, que suma pendiente_pago/pagada/confirmada.
  update public.event_registrations
  set status = 'cancelada', updated_at = now()
  where payment_order_id = p_order_id and status = 'pendiente_pago';

  perform plu_private.record_domain_audit(
    'payment.rejected_manually', 'athlete_payment_order', p_order_id::text,
    'staff', p_actor,
    jsonb_build_object(
      'concept', v_order.concept, 'amount', v_order.amount, 'currency', v_order.currency,
      'reference', v_order.reference, 'reason', p_reason,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'hasPaymentProof', v_order.payment_proof_path is not null
    ),
    v_order.organization_id
  );
  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false);
end;
$$;

revoke all on function public.reject_athlete_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_athlete_payment_order(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Órdenes de efectivo que siguen abiertas
-- ---------------------------------------------------------------------------
-- Sólo las vivas. Las que el cron ya canceló no se reviven en automático: el
-- atleta pudo haber rehecho la inscripción por otro canal
-- (20260814120000_registration_cancelled_reregistration_fix reusa la fila
-- cancelada) y devolverlas a `pendiente` duplicaría el derecho. Se revisan a
-- mano con la consulta documentada en el reporte.
do $$
declare
  v_touched int;
begin
  with extended as (
    update public.athlete_payment_orders o
    set expires_at = plu_private.cash_checkout_deadline(o.id),
        updated_at = now()
    where o.method = 'manual_link'
      and o.manual_payment_channel = 'cash_pitbull'
      and o.status in ('pendiente', 'validacion_manual')
      and o.expires_at < plu_private.cash_checkout_deadline(o.id)
    returning o.id
  )
  select count(*) into v_touched from extended;

  raise notice 'Órdenes en efectivo con vigencia extendida: %', v_touched;
end;
$$;

do $verification$
begin
  if to_regprocedure('plu_private.cash_checkout_deadline(uuid)') is null then
    raise exception 'El vencimiento del cobro presencial no fue creado.' using errcode = 'PLU01';
  end if;
end
$verification$;
