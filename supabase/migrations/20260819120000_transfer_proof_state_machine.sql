-- Estado terminal de comprobantes de transferencia -- PLU ARG
--
-- Un comprobante sólo puede circular por pendiente/validación_manual. Antes
-- una orden rechazada podía volver a recibir un archivo y hasta acreditarse
-- por API, mezclando decisiones de Finanzas y la trazabilidad de la orden.

create or replace function public.register_athlete_payment_proof(
  p_order_id uuid,
  p_athlete_id uuid,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.athlete_id <> p_athlete_id then
    raise exception 'La orden no pertenece a este atleta.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'La orden no admite comprobante.' using errcode = 'PLU10';
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite comprobantes.' using errcode = 'PLU10';
  end if;
  if v_order.expires_at is not null and v_order.expires_at < now() then
    raise exception 'La ventana para adjuntar el comprobante vencio.' using errcode = 'PLU10';
  end if;
  if p_proof_path is null or p_proof_path not like (p_order_id::text || '/%') then
    raise exception 'Ruta de comprobante invalida.' using errcode = 'PLU01';
  end if;

  update public.athlete_payment_orders
  set payment_proof_path = p_proof_path,
      payment_proof_uploaded_at = now(),
      status = 'validacion_manual',
      expires_at = now() + interval '48 hours',
      updated_at = now()
  where id = p_order_id
  returning * into v_order;

  perform plu_private.record_domain_audit(
    'payment.proof_uploaded', 'athlete_payment_order', p_order_id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object(
      'concept', v_order.concept,
      'reference', v_order.reference,
      'manual_validation_deadline', v_order.expires_at
    ),
    v_order.organization_id
  );
  return jsonb_build_object('order', to_jsonb(v_order));
end;
$$;

create or replace function public.approve_athlete_payment_order(
  p_order_id uuid,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_previous_status text;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se aprueban por webhook.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'aprobado' then
    select * into v_membership from public.memberships where payment_order_id = p_order_id;
    select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
    return jsonb_build_object(
      'order', to_jsonb(v_order), 'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration), 'duplicate', true
    );
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite aprobacion.' using errcode = 'PLU10';
  end if;
  if v_order.payment_proof_path is null then
    raise exception 'Adjunta y revisa el comprobante antes de aprobar la transferencia.' using errcode = 'PLU10';
  end if;

  v_previous_status := v_order.status;
  update public.athlete_payment_orders
  set status = 'aprobado', approved_at = coalesce(approved_at, now()), updated_at = now()
  where id = p_order_id returning * into v_order;

  if v_order.concept in ('membership', 'combo') then
    update public.memberships set status = 'activa', updated_at = now()
    where payment_order_id = p_order_id returning * into v_membership;
    if v_membership.id is not null then
      update public.athletes set status = 'afiliado_activo', updated_at = now()
      where id = v_order.athlete_id;
    end if;
  end if;
  if v_order.concept in ('registration', 'combo') then
    update public.event_registrations set status = 'confirmada', updated_at = now()
    where payment_order_id = p_order_id returning * into v_registration;
  end if;

  perform plu_private.record_domain_audit(
    'payment.approved_manually', 'athlete_payment_order', p_order_id::text,
    'staff', p_actor,
    jsonb_build_object(
      'concept', v_order.concept, 'amount', v_order.amount, 'currency', v_order.currency,
      'reference', v_order.reference, 'previousStatus', v_previous_status,
      'hasPaymentProof', true
    ),
    v_order.organization_id
  );
  if v_membership.id is not null then
    perform plu_private.record_domain_audit(
      'membership.activated', 'membership', v_membership.id::text, 'staff', p_actor,
      jsonb_build_object('orderId', p_order_id, 'memberCode', v_membership.member_code,
        'expirationDate', v_membership.expiration_date, 'channel', 'manual'),
      v_order.organization_id
    );
  end if;
  if v_registration.id is not null then
    perform plu_private.record_domain_audit(
      'registration.confirmed', 'event_registration', v_registration.id::text, 'staff', p_actor,
      jsonb_build_object('orderId', p_order_id, 'eventId', v_registration.event_id, 'channel', 'manual'),
      v_order.organization_id
    );
  end if;

  select * into v_membership from public.memberships where payment_order_id = p_order_id;
  select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
  return jsonb_build_object(
    'order', to_jsonb(v_order), 'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration), 'duplicate', false
  );
end;
$$;

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

revoke all on function public.register_athlete_payment_proof(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_athlete_payment_proof(uuid, uuid, text)
  to service_role;
revoke all on function public.approve_athlete_payment_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_athlete_payment_order(uuid, text)
  to service_role;
revoke all on function public.reject_athlete_payment_order(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_athlete_payment_order(uuid, text, text)
  to service_role;
