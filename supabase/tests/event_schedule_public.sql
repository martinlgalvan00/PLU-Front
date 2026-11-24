-- Grilla pública (20261211100000). No deja datos: termina en rollback.
--
-- Lo que se afirma es la frontera de privacidad, que es lo que no puede romperse
-- sin que nadie lo note:
--   * arranca apagada y apagada no devuelve nada (ni tandas ni conteos);
--   * un evento sin publicar no expone su grilla aunque el flag esté prendido;
--   * prendida devuelve composición pero ni nombres, ni clubes, ni nacimiento;
--   * guardar el evento no apaga el flag;
--   * las canceladas no cuentan.

begin;

do $public_schedule$
declare
  v_slug text := 'sched-public-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_event public.events;
  v_a1 uuid := gen_random_uuid();
  v_a2 uuid := gen_random_uuid();
  v_a3 uuid := gen_random_uuid();
  v_day uuid;
  v_session uuid;
  v_platform uuid;
  v_schedule jsonb;
  v_public jsonb;
  v_session_json jsonb;
begin
  perform public.staff_upsert_event(
    jsonb_build_object(
      'slug', v_slug, 'title', 'Public schedule smoke', 'venue', 'Sede', 'location', 'BA',
      'startsAt', '2026-11-13T12:00:00Z', 'endsAt', '2026-11-14T22:00:00Z',
      'published', true,
      'eventDays', jsonb_build_array(
        jsonb_build_object('dayIndex', 0, 'label', 'Día 1', 'date', '2026-11-13')
      )
    ),
    'sched-public-smoke'
  );
  select * into v_event from public.events where slug = v_slug;
  assert v_event.schedule_public = false, 'la grilla pública arranca apagada';

  perform public.staff_save_event_platforms(
    v_slug, jsonb_build_array(jsonb_build_object('name', 'Tablado Rojo')), 'sched-public-smoke');
  select id into v_platform from public.event_platforms where event_id = v_event.id;
  perform public.staff_save_event_sessions(
    v_slug,
    jsonb_build_array(jsonb_build_object(
      'dayIndex', 0, 'name', 'Tanda A', 'platformId', v_platform, 'sortOrder', 0)),
    'sched-public-smoke');
  select id into v_session from public.event_sessions where event_id = v_event.id;
  select id into v_day from public.event_days where event_id = v_event.id;

  insert into public.athletes(id, organization_id, full_name, document_id, email, status, sex, birth_date, gym)
  values
    (v_a1, v_org, 'Secreta Uno', 'SP-' || v_a1, 'sp1-' || v_a1 || '@example.invalid', 'registrado',
     'Femenino', '2006-11-20', 'Club Secreto'),
    (v_a2, v_org, 'Secreta Dos', 'SP-' || v_a2, 'sp2-' || v_a2 || '@example.invalid', 'registrado',
     'Femenino', '1996-01-02', 'Club Secreto'),
    (v_a3, v_org, 'Secreta Tres', 'SP-' || v_a3, 'sp3-' || v_a3 || '@example.invalid', 'registrado',
     'Femenino', '1990-01-02', 'Club Secreto');
  insert into public.event_registrations(event_id, athlete_id, division, category, bodyweight_kg, status,
                                         event_day_id, event_session_id)
  values
    (v_event.id, v_a1, 'Junior', 'Raw', 57, 'confirmada', v_day, v_session),
    (v_event.id, v_a2, 'Open', 'Raw', 63, 'confirmada', v_day, v_session),
    (v_event.id, v_a3, 'Open', 'Raw', 90, 'cancelada', v_day, v_session);

  -- Apagada: nada.
  v_public := public.public_event_schedule(v_slug);
  assert v_public = jsonb_build_object('enabled', false), 'apagada no devuelve nada';

  -- Prendida pero evento sin publicar: tampoco.
  perform public.staff_set_event_schedule_public(v_slug, true, 'sched-public-smoke');
  update public.events set published = false where id = v_event.id;
  assert public.public_event_schedule(v_slug) = jsonb_build_object('enabled', false),
    'un evento sin publicar no expone su grilla';
  update public.events set published = true where id = v_event.id;

  -- Prendida y publicada: composición, sin datos personales.
  v_public := public.public_event_schedule(v_slug);
  assert (v_public ->> 'enabled')::boolean, 'prendida devuelve la grilla';
  assert v_public -> 'platforms' -> 0 ->> 'name' = 'Tablado Rojo', 'trae el nombre del tablado';
  v_session_json := v_public -> 'days' -> 0 -> 'sessions' -> 0;
  assert v_session_json ->> 'name' = 'Tanda A', 'trae la tanda';
  assert (v_session_json ->> 'athleteCount')::int = 2, 'las canceladas no cuentan';
  assert v_session_json -> 'sexes' = '["Femenino"]'::jsonb, 'trae los sexos';
  assert (v_session_json ->> 'weightMin')::numeric = 57 and (v_session_json ->> 'weightMax')::numeric = 63,
    'trae el rango de peso sin la cancelada';
  assert (v_session_json ->> 'ageMin')::int = 19 and (v_session_json ->> 'ageMax')::int = 30,
    'trae el rango de edad al día del evento';
  assert v_session_json -> 'divisions' = '["Junior", "Open"]'::jsonb, 'trae las divisiones';

  assert v_public::text not like '%Secreta%', 'no filtra nombres';
  assert v_public::text not like '%Club Secreto%', 'no filtra clubes';
  assert v_public::text not like '%2006-11-20%' and v_public::text not like '%1996-01-02%',
    'no filtra fechas de nacimiento';
  assert v_public::text not like '%SP-%', 'no filtra documentos';

  -- Editar el evento no apaga el flag.
  perform public.staff_upsert_event(
    jsonb_build_object(
      'slug', v_slug, 'title', 'Public schedule smoke 2', 'venue', 'Sede', 'location', 'BA',
      'startsAt', '2026-11-13T12:00:00Z', 'endsAt', '2026-11-14T22:00:00Z', 'published', true,
      'eventDays', jsonb_build_array(
        jsonb_build_object('dayIndex', 0, 'label', 'Día 1', 'date', '2026-11-13'))
    ),
    'sched-public-smoke'
  );
  assert (select schedule_public from public.events where id = v_event.id),
    'guardar el evento no apaga la grilla pública';

  -- El panel ve el estado del flag.
  v_schedule := public.staff_get_event_board(v_slug);
  assert (v_schedule ->> 'schedulePublic')::boolean, 'el tablero informa schedulePublic';

  -- Apagar la vuelve a ocultar.
  perform public.staff_set_event_schedule_public(v_slug, false, 'sched-public-smoke');
  assert public.public_event_schedule(v_slug) = jsonb_build_object('enabled', false),
    'apagar la oculta de inmediato';

  -- Un evento inexistente falla con mensaje legible.
  begin
    perform public.staff_set_event_schedule_public('no-existe-' || v_slug, true, 'x');
    assert false, 'tendría que haber fallado';
  exception when sqlstate 'PLU02' then
    null;
  end;
end
$public_schedule$;

rollback;
