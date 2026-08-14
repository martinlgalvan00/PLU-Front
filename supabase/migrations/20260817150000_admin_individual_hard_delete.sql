-- Borrado administrativo individual de inscripciones y afiliaciones.
-- Los pagos y auditorías se conservan como historial aunque el objeto
-- operativo desaparezca; los vínculos payment_order_id quedan en NULL.

create or replace function public.delete_event_registration(p_registration_id uuid, p_actor text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_registration public.event_registrations;
  v_event public.events;
  v_check_ins int;
begin
  select * into v_registration from public.event_registrations where id = p_registration_id for update;
  if not found then raise exception 'Inscripción no encontrada.' using errcode = 'PLU02'; end if;
  select * into v_event from public.events where id = v_registration.event_id;

  delete from public.check_ins where registration_id = p_registration_id;
  get diagnostics v_check_ins = row_count;
  delete from public.event_registrations where id = p_registration_id;

  perform plu_private.record_domain_audit(
    'registration.deleted', 'registration', p_registration_id::text, 'staff', p_actor,
    jsonb_build_object('athleteId', v_registration.athlete_id, 'eventId', v_registration.event_id,
      'eventSlug', v_event.slug, 'status', v_registration.status, 'paymentOrderId', v_registration.payment_order_id,
      'removed', jsonb_build_object('checkIns', v_check_ins)),
    v_registration.organization_id
  );
  return jsonb_build_object('id', p_registration_id, 'athleteId', v_registration.athlete_id,
    'eventId', v_registration.event_id, 'removed', jsonb_build_object('checkIns', v_check_ins));
end;
$$;

create or replace function public.delete_membership(p_membership_id uuid, p_actor text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_membership public.memberships;
  v_cycles int;
  v_targets int;
  v_subscriptions int;
begin
  select * into v_membership from public.memberships where id = p_membership_id for update;
  if not found then raise exception 'Afiliación no encontrada.' using errcode = 'PLU02'; end if;

  delete from public.billing_subscriptions where membership_id = p_membership_id;
  get diagnostics v_subscriptions = row_count;
  delete from public.membership_cycles where membership_id = p_membership_id;
  get diagnostics v_cycles = row_count;
  delete from public.membership_order_targets where membership_id = p_membership_id;
  get diagnostics v_targets = row_count;
  delete from public.memberships where id = p_membership_id;

  if not exists (
    select 1 from public.memberships m where m.athlete_id = v_membership.athlete_id
      and m.status = 'activa' and coalesce(m.expiration_date, current_date - 1) >= current_date
  ) then
    update public.athletes set status = 'registrado', updated_at = now()
    where id = v_membership.athlete_id and status = 'afiliado_activo';
  end if;

  perform plu_private.record_domain_audit(
    'membership.deleted', 'membership', p_membership_id::text, 'staff', p_actor,
    jsonb_build_object('athleteId', v_membership.athlete_id, 'year', v_membership.year,
      'status', v_membership.status, 'memberCode', v_membership.member_code,
      'paymentOrderId', v_membership.payment_order_id,
      'removed', jsonb_build_object('membershipCycles', v_cycles, 'membershipOrderTargets', v_targets,
        'billingSubscriptions', v_subscriptions)),
    v_membership.organization_id
  );
  return jsonb_build_object('id', p_membership_id, 'athleteId', v_membership.athlete_id,
    'removed', jsonb_build_object('membershipCycles', v_cycles, 'membershipOrderTargets', v_targets,
      'billingSubscriptions', v_subscriptions));
end;
$$;

revoke all on function public.delete_event_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_event_registration(uuid, text) to service_role;
revoke all on function public.delete_membership(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_membership(uuid, text) to service_role;
