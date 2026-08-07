-- La credencial identifica a la persona y muestra lo que viene — PLU ARG
--
-- Dos cambios sobre la proyección que lee el QR al escanearse.
--
-- 1. Identidad completa en la puerta
--
-- Quien controla el acceso tiene que poder cotejar la credencial contra el
-- documento físico: nombre completo, fecha de nacimiento y DNI. Hasta ahora la
-- proyección pública devolvía solo el nombre.
--
-- No se agregan los campos y listo, porque el motivo por el que no estaban
-- sigue siendo válido: esta función acepta tres formas de código, y una de
-- ellas -- `member_code` -- es CORRELATIVA. Devolver documento y fecha de
-- nacimiento por member_code dejaría cosechar el padrón entero iterando
-- PLU-ARG-2026-001, -002, -003.
--
-- La distinción que resuelve el problema: los tokens (`credential_token` de la
-- persona y `qr_token` de una membresía) son uuid v4, no adivinables. Quien
-- los tiene es porque tiene el QR en la mano. El member_code es un número de
-- socio legible, pensado para decirlo en voz alta.
--
-- Entonces la PII viaja solo cuando la resolución fue por token. Por
-- member_code se sigue devolviendo lo mismo que antes.
--
-- 2. Los torneos que importan
--
-- La lista se filtraba por `events.status <> 'finalizado'`, un campo que se
-- actualiza a mano y que en la práctica queda viejo. Un atleta con años de
-- historia terminaba con decenas de eventos apilados en la credencial y el
-- dato del día tapado.
--
-- Ahora se listan los que todavía no terminaron, medido contra el reloj y no
-- contra el status, ordenados por proximidad y acotados a tres. Si no hay
-- ninguno vigente se devuelve el último, para que la puerta vea algo en vez de
-- una credencial vacía.

-- ---------------------------------------------------------------------------
-- 1. Inscripciones vigentes de un atleta
-- ---------------------------------------------------------------------------
-- Separado en su propia función porque lo consumen la proyección pública y la
-- de staff, y porque la regla de "qué torneo mostrar" es de producto: conviene
-- que esté en un solo lugar y no duplicada en cada proyección.
create or replace function plu_private.athlete_visible_registrations(
  p_athlete_id uuid,
  p_limit int default 3
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with ranked as (
    select
      r.id,
      r.athlete_id,
      r.division,
      r.category,
      r.status,
      e.slug as event_slug,
      e.title as event_title,
      e.starts_at as event_starts_at,
      e.ends_at as event_ends_at,
      plu_private.registration_schedule(r) as schedule,
      case when c.id is null then null else jsonb_build_object(
        'id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at
      ) end as check_in,
      -- Vigente = todavía no terminó, contra el reloj. `events.status` se
      -- edita a mano y queda desactualizado; la fecha no miente.
      (e.ends_at >= now()) as upcoming
    from public.event_registrations r
    join public.events e on e.id = r.event_id
    left join public.check_ins c on c.registration_id = r.id
    where r.athlete_id = p_athlete_id
      and r.status <> 'cancelada'
  ),
  chosen as (
    -- Los próximos, del más cercano al más lejano.
    (select * from ranked where upcoming order by event_starts_at limit p_limit)
    union all
    -- Sin ninguno vigente, el último que compitió: la credencial no queda muda.
    (select * from ranked
     where not exists (select 1 from ranked where upcoming)
     order by event_starts_at desc
     limit 1)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'athlete_id', athlete_id,
        'division', division,
        'category', category,
        'status', status,
        'event_slug', event_slug,
        'event_title', event_title,
        'event_starts_at', event_starts_at,
        'event_ends_at', event_ends_at,
        'upcoming', upcoming,
        'schedule', schedule,
        'check_in', check_in
      )
      order by upcoming desc, event_starts_at
    ),
    '[]'::jsonb
  )
  from chosen;
$$;

revoke all on function plu_private.athlete_visible_registrations(uuid, int)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Proyección de la credencial
-- ---------------------------------------------------------------------------
create or replace function plu_private.get_membership_by_code_or_token(
  p_code text,
  p_event_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_athlete public.athletes;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_event public.events;
  v_checkin public.check_ins;
  v_registrations jsonb;
  v_schedule jsonb;
  v_athlete_json jsonb;
  -- ¿La resolución fue por un token no adivinable? De eso depende si se
  -- devuelve documento y fecha de nacimiento.
  v_by_token boolean := false;
begin
  begin
    v_token := p_code::uuid;
  exception
    when invalid_text_representation then
      v_token := null;
  end;

  if v_token is not null then
    select * into v_athlete from public.athletes where credential_token = v_token;

    -- Compatibilidad: credenciales emitidas cuando el token colgaba de la
    -- membresía. Siguen resolviendo a su dueño.
    if not found then
      select a.* into v_athlete
      from public.memberships m
      join public.athletes a on a.id = m.athlete_id
      where m.qr_token = v_token;
    end if;

    v_by_token := v_athlete.id is not null;
  else
    -- member_code: correlativo, así que esta rama nunca devuelve PII.
    select a.* into v_athlete
    from public.memberships m
    join public.athletes a on a.id = m.athlete_id
    where m.member_code = p_code;
  end if;

  if v_athlete.id is null then
    raise exception 'Credencial no encontrada.' using errcode = 'PLU02';
  end if;

  -- La afiliación que cubre HOY. Antes se devolvía la que matcheara el token,
  -- que tras una renovación podía ser la del período anterior.
  select * into v_membership
  from public.memberships m
  where m.athlete_id = v_athlete.id
    and m.status = 'activa'
    and coalesce(m.start_date, current_date) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date
  order by m.expiration_date desc
  limit 1;

  -- Sin cobertura vigente se muestra la más reciente, para que la puerta vea
  -- "vencida el X" en vez de "sin afiliación".
  if v_membership.id is null then
    select * into v_membership
    from public.memberships m
    where m.athlete_id = v_athlete.id
    order by m.expiration_date desc nulls last, m.created_at desc
    limit 1;
  end if;

  if p_event_slug is not null then
    select * into v_event from public.events where slug = p_event_slug;
    if found then
      select * into v_registration
      from public.event_registrations
      where athlete_id = v_athlete.id and event_id = v_event.id and status <> 'cancelada';
      if v_registration.id is not null then
        select * into v_checkin from public.check_ins
        where registration_id = v_registration.id;
        v_schedule := plu_private.registration_schedule(v_registration);
      end if;
    end if;
  end if;

  -- Los torneos que la puerta necesita ver: los que no terminaron, por
  -- proximidad, acotados. Un atleta con años de historia no puede sepultar el
  -- dato del día bajo su archivo.
  v_registrations := plu_private.athlete_visible_registrations(v_athlete.id, 3);

  v_athlete_json := jsonb_build_object(
    'id', v_athlete.id,
    'full_name', v_athlete.full_name
  );

  -- Identidad para cotejar contra el documento físico. Solo por token: el
  -- member_code es correlativo y esto permitiría cosechar el padrón.
  if v_by_token then
    v_athlete_json := v_athlete_json || jsonb_build_object(
      'document_id', v_athlete.document_id,
      'birth_date', v_athlete.birth_date
    );
  end if;

  return jsonb_build_object(
    'athlete', v_athlete_json,
    'membership', case when v_membership.id is null then null else jsonb_build_object(
      'id', v_membership.id,
      'year', v_membership.year,
      'status', v_membership.status,
      'start_date', v_membership.start_date,
      'expiration_date', v_membership.expiration_date,
      'member_code', v_membership.member_code
    ) end,
    'registration', case when v_registration.id is null then null else jsonb_build_object(
      'id', v_registration.id,
      'athlete_id', v_registration.athlete_id,
      'division', v_registration.division,
      'category', v_registration.category,
      'status', v_registration.status,
      'event_slug', v_event.slug,
      'event_title', v_event.title,
      'event_starts_at', v_event.starts_at,
      'event_ends_at', v_event.ends_at,
      'schedule', v_schedule,
      'check_in', case when v_checkin.id is null then null else jsonb_build_object(
        'id', v_checkin.id,
        'gate', v_checkin.gate,
        'scanned_at', v_checkin.scanned_at
      ) end
    ) end,
    'registrations', v_registrations
  );
end;
$$;

revoke all on function plu_private.get_membership_by_code_or_token(text, text)
  from public, anon, authenticated, service_role;
grant execute on function plu_private.get_membership_by_code_or_token(text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Proyección de staff
-- ---------------------------------------------------------------------------
-- El staff autenticado ve el documento aunque haya resuelto por member_code:
-- ahí no hay riesgo de cosecha, porque la RPC exige service_role y la sesión
-- ya pasó por los permisos de Express. La fecha de nacimiento se suma por el
-- mismo motivo por el que se suma el documento: cotejar identidad en la puerta.
create or replace function public.staff_get_membership_by_code_or_token(
  p_code text,
  p_event_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_athlete public.athletes;
begin
  v_result := plu_private.get_membership_by_code_or_token(p_code, p_event_slug);

  select * into v_athlete
  from public.athletes
  where id = (v_result -> 'athlete' ->> 'id')::uuid;

  return jsonb_set(
    v_result,
    '{athlete}',
    (v_result -> 'athlete') || jsonb_build_object(
      'document_id', v_athlete.document_id,
      'birth_date', v_athlete.birth_date
    ),
    true
  );
end;
$$;

revoke all on function public.staff_get_membership_by_code_or_token(text, text)
  from public, anon, authenticated;
grant execute on function public.staff_get_membership_by_code_or_token(text, text)
  to service_role;
