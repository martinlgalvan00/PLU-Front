-- Borrado definitivo de un atleta desde el panel (solo Super Admin llega aca:
-- el endpoint lo protege con requireRole(['admin_maximal'])).
--
-- Las FK del dominio de atletas son on delete restrict a proposito (ninguna
-- fila operativa deberia desaparecer por accidente), asi que el borrado se
-- hace aca, en una sola funcion: Postgres la ejecuta como una transaccion
-- atomica y cualquier paso que falte aborta todo sin dejar estado a medias.
--
-- Orden obligado por las FK restrict:
--   check_ins -> billing_subscriptions -> membership_cycles ->
--   membership_order_targets -> athlete_payments -> event_registrations ->
--   memberships -> athlete_payment_orders -> athletes
-- Caen solas por cascade: athlete_credentials, athlete_sessions,
-- athlete_password_reset_tokens (de athletes) y
-- membership_renewal_notifications (de memberships).
-- NO se borran domain_audit_logs ni transactional_email_logs: son el
-- historial y referencian por id textual, sin FK.
-- Los archivos de storage (athlete-photos / athlete-payment-proofs) los borra
-- el backend despues de esta RPC: SQL no alcanza a storage.

create or replace function public.delete_athlete(
  p_athlete_id uuid,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_check_ins int;
  v_memberships int;
  v_registrations int;
  v_orders int;
begin
  select * into v_athlete from public.athletes
  where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  delete from public.check_ins
  where registration_id in (
    select id from public.event_registrations where athlete_id = p_athlete_id
  );
  get diagnostics v_check_ins = row_count;

  -- billing_subscriptions referencia con restrict a athletes, memberships y
  -- athlete_payment_orders: tiene que caer antes que las tres.
  delete from public.billing_subscriptions where athlete_id = p_athlete_id;

  delete from public.membership_cycles
  where membership_id in (
    select id from public.memberships where athlete_id = p_athlete_id
  );

  delete from public.membership_order_targets
  where membership_id in (
    select id from public.memberships where athlete_id = p_athlete_id
  );

  delete from public.athlete_payments
  where order_id in (
    select id from public.athlete_payment_orders where athlete_id = p_athlete_id
  );

  delete from public.event_registrations where athlete_id = p_athlete_id;
  get diagnostics v_registrations = row_count;

  delete from public.memberships where athlete_id = p_athlete_id;
  get diagnostics v_memberships = row_count;

  delete from public.athlete_payment_orders where athlete_id = p_athlete_id;
  get diagnostics v_orders = row_count;

  delete from public.athletes where id = p_athlete_id;

  perform plu_private.record_domain_audit(
    'athlete.deleted',
    'athlete',
    p_athlete_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'fullName', v_athlete.full_name,
      'documentId', v_athlete.document_id,
      'email', v_athlete.email,
      'status', v_athlete.status,
      'removed', jsonb_build_object(
        'checkIns', v_check_ins,
        'memberships', v_memberships,
        'registrations', v_registrations,
        'paymentOrders', v_orders
      )
    ),
    v_athlete.organization_id
  );

  return jsonb_build_object(
    'id', p_athlete_id,
    'removed', jsonb_build_object(
      'checkIns', v_check_ins,
      'memberships', v_memberships,
      'registrations', v_registrations,
      'paymentOrders', v_orders
    )
  );
end;
$$;

-- Solo el backend (service role) puede ejecutarla: nunca desde el browser.
revoke all on function public.delete_athlete(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_athlete(uuid, text)
  to service_role;
