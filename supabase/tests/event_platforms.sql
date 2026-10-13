-- Tablados del evento (20261210100000). No deja datos: todo corre en una
-- transacción que termina en rollback.
--
-- Lo que se afirma es lo que rompería la operación el día del torneo:
--   * renombrar un tablado se propaga al texto que lee la credencial;
--   * intercambiar nombres entre tablados no choca con el unique;
--   * quitar un tablado deja sus tandas sin tablado, nunca las borra;
--   * el editor de tandas legado (solo texto) se enlaza al tablado por nombre;
--   * el tablero devuelve los tablados y la edad al día del evento.

begin;

do $platforms$
declare
  v_slug text := 'platforms-smoke-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_event public.events;
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_athlete uuid := gen_random_uuid();
  v_registration uuid := gen_random_uuid();
  v_schedule jsonb;
  v_board jsonb;
  v_p1 uuid;
  v_p2 uuid;
  v_s1 uuid;
  v_s2 uuid;
  v_text text;
begin
  perform public.staff_upsert_event(
    jsonb_build_object(
      'slug', v_slug,
      'title', 'Platforms smoke',
      'venue', 'Sede smoke',
      'location', 'Buenos Aires',
      'startsAt', '2026-11-13T12:00:00Z',
      'endsAt', '2026-11-14T22:00:00Z',
      'eventDays', jsonb_build_array(
        jsonb_build_object('dayIndex', 0, 'label', 'Día 1', 'date', '2026-11-13')
      )
    ),
    'platforms-smoke'
  );
  select * into v_event from public.events where slug = v_slug;

  -- Sin tablados cargados el evento arranca vacío (la UI pregunta cuántos son).
  v_schedule := public.staff_get_event_schedule(v_slug);
  assert jsonb_array_length(v_schedule -> 'platforms') = 0, 'un evento nuevo no tiene tablados';

  -- Alta de dos tablados.
  v_schedule := public.staff_save_event_platforms(
    v_slug,
    jsonb_build_array(
      jsonb_build_object('name', 'Tablado 1'),
      jsonb_build_object('name', 'Tablado 2')
    ),
    'platforms-smoke'
  );
  assert jsonb_array_length(v_schedule -> 'platforms') = 2, 'quedan dos tablados';
  v_p1 := (v_schedule -> 'platforms' -> 0 ->> 'id')::uuid;
  v_p2 := (v_schedule -> 'platforms' -> 1 ->> 'id')::uuid;
  assert v_schedule -> 'platforms' -> 0 ->> 'name' = 'Tablado 1', 'respeta el orden de carga';

  -- Tandas con platformId: el texto toma el nombre del tablado.
  v_schedule := public.staff_save_event_sessions(
    v_slug,
    jsonb_build_array(
      jsonb_build_object('dayIndex', 0, 'name', 'Tanda A', 'platformId', v_p1, 'sortOrder', 0),
      jsonb_build_object('dayIndex', 0, 'name', 'Tanda B', 'platformId', v_p2, 'sortOrder', 1)
    ),
    'platforms-smoke'
  );
  v_s1 := (select (s ->> 'id')::uuid from jsonb_array_elements(v_schedule -> 'sessions') s where s ->> 'name' = 'Tanda A');
  v_s2 := (select (s ->> 'id')::uuid from jsonb_array_elements(v_schedule -> 'sessions') s where s ->> 'name' = 'Tanda B');
  assert (select platform from public.event_sessions where id = v_s1) = 'Tablado 1',
    'el texto de la tanda sigue al tablado';

  -- Renombrar propaga a las tandas (es lo que lee el QR de puerta).
  perform public.staff_save_event_platforms(
    v_slug,
    jsonb_build_array(
      jsonb_build_object('id', v_p1, 'name', 'Tablado Rojo'),
      jsonb_build_object('id', v_p2, 'name', 'Tablado 2')
    ),
    'platforms-smoke'
  );
  assert (select platform from public.event_sessions where id = v_s1) = 'Tablado Rojo',
    'renombrar propaga al texto de la tanda';

  -- Intercambiar nombres no choca con el unique (event_id, name).
  perform public.staff_save_event_platforms(
    v_slug,
    jsonb_build_array(
      jsonb_build_object('id', v_p1, 'name', 'Tablado 2'),
      jsonb_build_object('id', v_p2, 'name', 'Tablado Rojo')
    ),
    'platforms-smoke'
  );
  assert (select platform from public.event_sessions where id = v_s1) = 'Tablado 2',
    'intercambiar nombres funciona';

  -- Dos tablados con el mismo nombre se rechazan con mensaje legible.
  begin
    perform public.staff_save_event_platforms(
      v_slug,
      jsonb_build_array(jsonb_build_object('name', 'Igual'), jsonb_build_object('name', ' igual ')),
      'platforms-smoke'
    );
    assert false, 'tendría que haber rechazado nombres duplicados';
  exception when sqlstate 'PLU01' then
    null;
  end;

  -- Editor legado: manda solo texto. Coincide con un tablado → se enlaza.
  v_schedule := public.staff_save_event_sessions(
    v_slug,
    jsonb_build_array(
      jsonb_build_object('id', v_s1, 'dayIndex', 0, 'name', 'Tanda A', 'platform', 'tablado rojo', 'sortOrder', 0),
      jsonb_build_object('id', v_s2, 'dayIndex', 0, 'name', 'Tanda B', 'platform', 'Mesa suelta', 'sortOrder', 1)
    ),
    'platforms-smoke'
  );
  assert (select platform_id from public.event_sessions where id = v_s1) = v_p2,
    'el texto legado se enlaza al tablado por nombre';
  assert (select platform_id from public.event_sessions where id = v_s2) is null
    and (select platform from public.event_sessions where id = v_s2) = 'Mesa suelta',
    'un texto sin tablado queda como texto legado';

  -- Una tanda con atleta, para probar que quitar el tablado no la toca.
  insert into public.athletes(id, organization_id, full_name, document_id, email, status, sex, birth_date)
  values (v_athlete, v_org, 'Board smoke', 'PL-' || v_athlete,
          'platforms-' || v_athlete || '@example.invalid', 'registrado', 'Femenino', '2006-11-20');
  insert into public.event_registrations(id, event_id, athlete_id, division, category, bodyweight_kg, status,
                                         event_day_id, event_session_id)
  select v_registration, v_event.id, v_athlete, 'Junior', 'Raw', 63, 'confirmada', d.id, v_s1
  from public.event_days d where d.event_id = v_event.id and d.day_index = 0;

  -- La tanda B pasa al tablado que se va a conservar (p1); la A sigue en p2,
  -- el que se va a quitar.
  perform public.staff_save_event_sessions(
    v_slug,
    jsonb_build_array(
      jsonb_build_object('id', v_s1, 'dayIndex', 0, 'name', 'Tanda A', 'platformId', v_p2, 'sortOrder', 0),
      jsonb_build_object('id', v_s2, 'dayIndex', 0, 'name', 'Tanda B', 'platformId', v_p1, 'sortOrder', 1)
    ),
    'platforms-smoke'
  );

  -- Quitar p2: sus tandas y atletas quedan, sin tablado. Las de p1 no se tocan.
  perform public.staff_save_event_platforms(
    v_slug,
    jsonb_build_array(jsonb_build_object('id', v_p1, 'name', 'Tablado 2')),
    'platforms-smoke'
  );
  assert exists (select 1 from public.event_sessions where id = v_s1), 'la tanda sobrevive';
  assert (select platform_id from public.event_sessions where id = v_s1) is null
    and (select platform from public.event_sessions where id = v_s1) is null,
    'la tanda del tablado quitado queda sin tablado y sin texto';
  assert (select platform_id from public.event_sessions where id = v_s2) = v_p1,
    'la tanda del tablado que queda conserva el enlace';
  assert (select event_session_id from public.event_registrations where id = v_registration) = v_s1,
    'el atleta sigue en su tanda';

  perform public.staff_save_event_platforms(v_slug, '[]'::jsonb, 'platforms-smoke');
  assert (select platform_id from public.event_sessions where id = v_s2) is null
    and (select platform from public.event_sessions where id = v_s2) is null,
    'sin tablados, ninguna tanda queda enlazada ni con texto';

  -- Tablero: tablados, platformId y edad al día del evento (13/11/2026 con
  -- nacimiento 20/11/2006 → todavía 19, cumple 20 una semana después).
  v_board := public.staff_get_event_board(v_slug);
  assert jsonb_typeof(v_board -> 'platforms') = 'array', 'el tablero trae los tablados';
  assert (v_board -> 'days' -> 0 -> 'sessions' -> 0) ? 'platformId', 'cada tanda trae platformId';
  v_text := v_board -> 'days' -> 0 -> 'sessions' -> 0 -> 'athletes' -> 0 ->> 'age';
  assert v_text = '19', format('la edad se calcula al día del evento (vino %s)', v_text);
  assert not (v_board::text like '%2006-11-20%'), 'el tablero no filtra la fecha de nacimiento';
end
$platforms$;

rollback;
