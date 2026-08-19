-- Edición administrativa del atleta (estado y gimnasio) desde el panel.
--
-- Hasta ahora no existía ninguna forma de que un admin corrigiera el estado
-- o el gimnasio de un atleta: el único cambio de `athletes.status` pasaba
-- como efecto colateral de `staff_set_membership_status` al activar/dar de
-- baja una afiliación. Esto abre un camino directo y auditado, pensado para
-- edición individual y en bloque (selección múltiple) desde `AthletesSection`.
--
-- Deliberadamente no toca `division`/`category`: esos campos viven en
-- `event_registrations` y quedan bloqueados por trigger una vez que existe
-- la inscripción (`plu_private.lock_registration_competition_selection`).

create or replace function public.staff_update_athlete(
  p_athlete_id uuid,
  p_status text,
  p_gym text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_previous_status text;
  v_previous_gym text;
begin
  if p_status is not null
    and p_status not in ('pre_registrado', 'registrado', 'afiliado_activo', 'afiliado_vencido', 'bloqueado')
  then
    raise exception 'Estado de atleta no permitido desde el panel.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  v_previous_status := v_athlete.status;
  v_previous_gym := v_athlete.gym;

  update public.athletes
  set status = coalesce(p_status, status),
      gym = case when p_gym is not null then nullif(trim(p_gym), '') else gym end,
      updated_at = now()
  where id = p_athlete_id
  returning * into v_athlete;

  perform plu_private.record_domain_audit(
    'athlete.updated_by_staff',
    'athlete',
    p_athlete_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'previousStatus', v_previous_status,
      'newStatus', v_athlete.status,
      'previousGym', v_previous_gym,
      'newGym', v_athlete.gym
    ),
    v_athlete.organization_id
  );

  return to_jsonb(v_athlete);
end;
$$;

revoke all on function public.staff_update_athlete(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.staff_update_athlete(uuid, text, text, text)
  to service_role;
