-- Acreditación manual sin comprobante: override de staff con motivo obligatorio.
-- Transferencia / Wise siguen exigiendo archivo por defecto; la excepción
-- documentada es cash_pitbull (cobro presencial) o un p_override_reason auditado.
-- No se relaja force-settle: esa vía sigue pidiendo evidencia adjunta.

drop function if exists public.approve_athlete_payment_order(uuid, text);

create or replace function public.approve_athlete_payment_order(
  p_order_id uuid,
  p_actor text default null,
  p_override_reason text default null
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
  v_override text;
  v_without_proof boolean := false;
begin
  select * into v_order from public.athlete_payment_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se aprueban por webhook.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'aprobado' then
    select * into v_membership from public.memberships where payment_order_id = p_order_id;
    select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'duplicate', true
    );
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite aprobacion.' using errcode = 'PLU10';
  end if;

  v_override := nullif(btrim(coalesce(p_override_reason, '')), '');

  if v_order.payment_proof_path is null
     and coalesce(v_order.manual_payment_channel, 'bank_transfer') <> 'cash_pitbull' then
    if v_override is null or char_length(v_override) < 8 then
      raise exception
        'Adjunta el comprobante o indica un motivo de override (minimo 8 caracteres) antes de aprobar.'
        using errcode = 'PLU10';
    end if;
    v_without_proof := true;
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
    'payment.approved_manually',
    'athlete_payment_order',
    p_order_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'concept', v_order.concept,
      'amount', v_order.amount,
      'currency', v_order.currency,
      'reference', v_order.reference,
      'previousStatus', v_previous_status,
      'manualPaymentChannel', v_order.manual_payment_channel,
      'hasPaymentProof', v_order.payment_proof_path is not null,
      'overrideWithoutProof', v_without_proof,
      'overrideReason', case when v_without_proof then v_override else null end
    ),
    v_order.organization_id
  );

  select * into v_membership from public.memberships where payment_order_id = p_order_id;
  select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'duplicate', false
  );
end;
$$;

revoke all on function public.approve_athlete_payment_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.approve_athlete_payment_order(uuid, text, text) to service_role;
