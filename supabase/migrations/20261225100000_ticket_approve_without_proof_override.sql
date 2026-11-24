-- Acreditación de entradas sin comprobante: mismo override que afiliaciones.
-- Transferencia y Wise siguen exigiendo archivo por defecto. La excepción es
-- efectivo en sede, o un motivo de al menos 8 caracteres que queda en la
-- bitácora. Mercado Pago no se toca: sigue solo por webhook.

drop function if exists public.staff_approve_ticket_order(uuid, text);

create or replace function public.staff_approve_ticket_order(
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
  v_order public.ticket_orders;
  v_tickets jsonb;
  v_override text;
  v_without_proof boolean := false;
  v_override_without_proof boolean := false;
begin
  select * into v_order from public.ticket_orders where id = p_order_id for update;
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.provider <> 'manual' then
    raise exception 'Mercado Pago solo se acredita por webhook.' using errcode = 'PLU01';
  end if;
  if v_order.status = 'aprobado' then
    select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
    from public.tickets t where t.order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', true);
  end if;
  if v_order.status <> 'pendiente' then
    raise exception 'La orden ya no admite aprobacion.' using errcode = 'PLU03';
  end if;

  v_override := nullif(btrim(coalesce(p_override_reason, '')), '');
  v_without_proof := v_order.payment_proof_path is null;
  -- Efectivo en sede no genera archivo. Transferencia y Wise sin archivo
  -- solo pasan con un motivo auditado; el diálogo y esta función piden lo mismo.
  if v_without_proof and v_order.manual_payment_channel is distinct from 'cash_pitbull' then
    if v_override is null or char_length(v_override) < 8 then
      raise exception
        'Adjunta el comprobante o indica un motivo de override (minimo 8 caracteres) antes de aprobar.'
        using errcode = 'PLU03';
    end if;
    v_override_without_proof := true;
  end if;

  update public.ticket_orders set status = 'aprobado', reservation_expires_at = null, updated_at = now()
  where id = p_order_id returning * into v_order;
  update public.tickets set status = 'pagada', updated_at = now()
  where order_id = p_order_id and status = 'pendiente_pago';
  select coalesce(jsonb_agg(to_jsonb(t.*)), '[]'::jsonb) into v_tickets
  from public.tickets t where t.order_id = p_order_id;
  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values(
    'ticket_order.approved', 'ticket_order', p_order_id::text, 'staff', p_actor,
    jsonb_build_object(
      'manualPaymentChannel', v_order.manual_payment_channel,
      'withoutProof', v_without_proof,
      'overrideWithoutProof', v_override_without_proof,
      'overrideReason', case when v_override_without_proof then v_override else null end
    )
  );
  return jsonb_build_object('order', to_jsonb(v_order), 'tickets', v_tickets, 'duplicate', false);
end $$;

revoke all on function public.staff_approve_ticket_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.staff_approve_ticket_order(uuid, text, text) to service_role;
