-- Transferencias de atletas: ventana operativa de validación — PLU ARG
--
-- Una vez que el atleta adjunta el comprobante, la orden pasa a
-- `validacion_manual`. El equipo administrativo dispone de hasta 48 horas
-- para revisarla; por eso la reserva no puede vencer a las 24 horas como una
-- transferencia aún sin comprobante.

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
  select * into v_order from public.athlete_payment_orders
  where id = p_order_id for update;

  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;
  if v_order.athlete_id <> p_athlete_id then
    raise exception 'La orden no pertenece a este atleta.' using errcode = 'PLU02';
  end if;
  if v_order.method <> 'manual_link' then
    raise exception 'La orden no admite comprobante.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'aprobado' then
    raise exception 'La orden ya fue aprobada.' using errcode = 'PLU10';
  end if;
  if p_proof_path is null or p_proof_path not like (p_order_id::text || '/%') then
    raise exception 'Ruta de comprobante invalida.' using errcode = 'PLU01';
  end if;

  update public.athlete_payment_orders
  set payment_proof_path = p_proof_path,
      payment_proof_uploaded_at = now(),
      status = case when status = 'pendiente' then 'validacion_manual' else status end,
      expires_at = greatest(coalesce(expires_at, now()), now() + interval '48 hours'),
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

revoke all on function public.register_athlete_payment_proof(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.register_athlete_payment_proof(uuid, uuid, text)
  to service_role;
