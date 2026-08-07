-- El ingreso lo habilita la inscripción, no la afiliación — PLU ARG
--
-- `staff_check_in_registration` exigía afiliación activa y vigente para
-- registrar el ingreso de cualquier atleta, sin mirar si el evento la pedía.
-- Es la misma regla que la migración de credencial por persona
-- (20260806140000) ya había sacado de la proyección del QR, pero la RPC que
-- efectivamente marca el ingreso quedó con el modelo viejo.
--
-- El resultado era el peor de los dos mundos: un atleta inscripto y pagado a
-- un evento con `requires_membership = false` escaneaba bien -- la credencial
-- lo mostraba habilitado, con su día y su tanda -- y recién al apretar
-- "marcar ingreso" recibía "La afiliación está vencida o inactiva". El
-- rechazo llegaba en la puerta, con la fila atrás.
--
-- Ahora la afiliación se exige solo cuando el evento la exige, que es la misma
-- condición que se evaluó al inscribirse
-- (`create_competition_registration_v2`). Lo que habilita el ingreso es tener
-- la inscripción confirmada.

create or replace function public.staff_check_in_registration(
  p_registration_id uuid,
  p_gate text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration public.event_registrations;
  v_event public.events;
  v_checkin public.check_ins;
begin
  select * into v_registration
  from public.event_registrations
  where id = p_registration_id
  for update;
  if not found then
    raise exception 'Inscripcion no encontrada.' using errcode = 'PLU02';
  end if;

  if v_registration.status <> 'confirmada' then
    raise exception 'La inscripcion no esta confirmada.' using errcode = 'PLU05';
  end if;

  select * into v_event from public.events where id = v_registration.event_id;

  -- Mismo gate que al inscribirse: si el evento no pide afiliación, no tenerla
  -- no es motivo para frenar a alguien que ya pagó su inscripción.
  if coalesce(v_event.requires_membership, true) and not exists (
    select 1
    from public.memberships m
    where m.athlete_id = v_registration.athlete_id
      and m.status = 'activa'
      and coalesce(m.start_date, current_date) <= current_date
      and coalesce(m.expiration_date, current_date - 1) >= current_date
  ) then
    raise exception 'La afiliacion esta vencida o inactiva.' using errcode = 'PLU05';
  end if;

  begin
    insert into public.check_ins(
      event_id, attendee_kind, registration_id, gate, scanned_by_label
    ) values (
      v_registration.event_id, 'athlete', v_registration.id,
      nullif(trim(p_gate), ''), left(p_actor, 200)
    ) returning * into v_checkin;
  exception when unique_violation then
    -- El unique sobre check_ins.registration_id es el mecanismo real de
    -- "no se puede escanear dos veces".
    raise exception 'Esta inscripcion ya tiene un ingreso registrado.'
      using errcode = 'PLU06';
  end;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    'registration.checked_in', 'event_registration', v_registration.id::text,
    'staff', p_actor,
    -- Queda registrado en qué día y tanda entró: en un evento de varios días
    -- el ingreso sin esa referencia no se puede auditar después.
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'gate', nullif(trim(p_gate), ''),
      'schedule', plu_private.registration_schedule(v_registration)
    )
  );

  return jsonb_build_object(
    'registration', to_jsonb(v_registration),
    'checkIn', to_jsonb(v_checkin),
    'schedule', plu_private.registration_schedule(v_registration)
  );
end $$;

revoke all on function public.staff_check_in_registration(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_check_in_registration(uuid, text, text)
  to service_role;
