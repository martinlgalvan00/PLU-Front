-- Tarifas Pitbull hasta el viernes 28/08/2026 y canal de cobro presencial.
-- Mercado Pago toma el precio pleno; transferencia/efectivo conservan el
-- beneficio sólo hasta el corte. El canal no reemplaza la validación staff.

alter table public.athlete_payment_orders
  add column if not exists manual_payment_channel text;

alter table public.athlete_payment_orders
  drop constraint if exists athlete_payment_orders_manual_payment_channel_check;
alter table public.athlete_payment_orders
  add constraint athlete_payment_orders_manual_payment_channel_check
  check (manual_payment_channel is null or manual_payment_channel in ('bank_transfer', 'cash_pitbull'));

-- Catálogo pleno al que vuelve el sistema una vez vencida la preventa.
update public.membership_plans
set price = 85000, updated_at = now()
where family_code = 'plu-annual' and active = true and retired_at is null;

update public.events
set price = 85000, updated_at = now()
where slug = 'pitbull-classic-2026';

update public.event_combo_offers
set price = 170000, updated_at = now()
where event_id = (select id from public.events where slug = 'pitbull-classic-2026');

-- Efectivo en Pitbull se acredita presencialmente; por eso no exige un archivo
-- pero sí queda separado de una transferencia en la decisión de Finanzas.
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
  if not found then raise exception 'Orden no encontrada.' using errcode = 'PLU02'; end if;
  if v_order.method <> 'manual_link' then
    raise exception 'Los pagos de Mercado Pago solo se aprueban por webhook.' using errcode = 'PLU10';
  end if;
  if v_order.status = 'aprobado' then
    select * into v_membership from public.memberships where payment_order_id = p_order_id;
    select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
    return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'registration', to_jsonb(v_registration), 'duplicate', true);
  end if;
  if v_order.status not in ('pendiente', 'validacion_manual') then
    raise exception 'La orden ya no admite aprobacion.' using errcode = 'PLU10';
  end if;
  if v_order.payment_proof_path is null and coalesce(v_order.manual_payment_channel, 'bank_transfer') <> 'cash_pitbull' then
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
      update public.athletes set status = 'afiliado_activo', updated_at = now() where id = v_order.athlete_id;
    end if;
  end if;
  if v_order.concept in ('registration', 'combo') then
    update public.event_registrations set status = 'confirmada', updated_at = now()
    where payment_order_id = p_order_id returning * into v_registration;
  end if;
  perform plu_private.record_domain_audit(
    'payment.approved_manually', 'athlete_payment_order', p_order_id::text, 'staff', p_actor,
    jsonb_build_object('concept', v_order.concept, 'amount', v_order.amount,
      'currency', v_order.currency, 'reference', v_order.reference,
      'previousStatus', v_previous_status, 'manualPaymentChannel', v_order.manual_payment_channel,
      'hasPaymentProof', v_order.payment_proof_path is not null), v_order.organization_id
  );
  select * into v_membership from public.memberships where payment_order_id = p_order_id;
  select * into v_registration from public.event_registrations where payment_order_id = p_order_id;
  return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

revoke all on function public.approve_athlete_payment_order(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_athlete_payment_order(uuid, text) to service_role;
