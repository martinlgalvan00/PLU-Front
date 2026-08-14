-- Rechazo de comprobante de transferencia — afiliación/inscripción y entradas
--
-- La aprobación manual (20260816140000) exige comprobante antes de acreditar,
-- pero no existía la salida simétrica: si el comprobante adjunto no sirve
-- (ilegible, monto distinto, titular que no coincide), Finanzas no tenía
-- forma de rechazarlo desde el panel. La única acción disponible era
-- aprobar o dejar la orden colgada en revisión para siempre.
--
-- `rechazado` ya es un estado terminal contemplado en el check constraint de
-- `athlete_payment_orders` (mismo vocabulario que usa Mercado Pago al
-- rechazar un pago), así que no hace falta tocar el esquema: alcanza con la
-- RPC. Una vez rechazada, el socio puede iniciar una orden nueva —
-- `create_membership_order_v2`/combo reutilizan la fila de membership
-- 'pendiente_pago' por año, así que no queda ningún bloqueo residual.
--
-- Las órdenes de entradas sí necesitan un paso extra: los tickets asociados
-- quedan en 'pendiente_pago' ocupando cupo del evento (igual que
-- `expire_ticket_reservations`), así que rechazar la orden también cancela
-- esos tickets para liberar el cupo.

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
begin
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se rechazan por webhook.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'rechazado' then
    return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', true);
  end if;
  if v_order.status = 'aprobado' then
    raise exception 'La orden ya fue aprobada.' using errcode = 'PLU10';
  end if;
  if v_order.payment_proof_path is null then
    raise exception 'No hay comprobante para rechazar.' using errcode = 'PLU10';
  end if;

  update public.athlete_payment_orders
  set status = 'rechazado', updated_at = now()
  where id = p_order_id returning * into v_order;

  perform plu_private.record_domain_audit(
    'payment.rejected_manually', 'athlete_payment_order', p_order_id::text,
    'staff', p_actor,
    jsonb_build_object(
      'concept', v_order.concept, 'amount', v_order.amount, 'currency', v_order.currency,
      'reference', v_order.reference, 'reason', p_reason
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

create or replace function public.reject_ticket_payment_order(
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
  v_order public.ticket_orders;
  v_tickets jsonb;
begin
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.provider <> 'manual' then
    raise exception 'Mercado Pago solo se rechaza por webhook.' using errcode = 'PLU01';
  end if;
  if v_order.status = 'rechazado' then
    select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status <> 'pendiente' or v_order.payment_proof_path is null then
    raise exception 'La orden necesita un comprobante pendiente de revision.' using errcode = 'PLU03';
  end if;

  update public.ticket_orders set status = 'rechazado', reservation_expires_at = null, updated_at = now()
  where id = p_order_id returning * into v_order;
  -- Libera el cupo que estaban reteniendo: mismo efecto que el vencimiento
  -- de reserva, pero por decisión del staff en vez de timeout.
  update public.tickets set status = 'cancelada', updated_at = now()
  where order_id = p_order_id and status = 'pendiente_pago';

  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values(
    'ticket_order.rejected', 'ticket_order', p_order_id::text, 'staff', p_actor,
    jsonb_build_object('reason', p_reason)
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end;
$$;

revoke all on function public.reject_ticket_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_ticket_payment_order(uuid, text, text)
  to service_role;
