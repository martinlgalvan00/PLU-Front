-- Los competidores entran cada día del torneo — PLU ARG
--
-- El unique de check_ins.registration_id quemaba la credencial en el primer
-- ingreso. En un meet de dos días, el escaneo del sábado dejaba al atleta
-- afuera el domingo aunque la inscripción lo habilita los dos días. La grilla
-- dice cuándo levanta; no recorta el acceso al predio.
--
-- Las entradas ya resolvieron esto con access_window_key
-- (event_day:YYYY-MM-DD, America/Argentina/Buenos_Aires). El competidor usa
-- la misma clave: un ingreso por día calendario, todos los días del meet.
-- El unique de tickets no se toca.

create or replace function plu_private.competitor_access_window_key(p_at timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select 'event_day:' || to_char(
    coalesce(p_at, clock_timestamp()) at time zone 'America/Argentina/Buenos_Aires',
    'YYYY-MM-DD'
  );
$$;

revoke all on function plu_private.competitor_access_window_key(timestamptz)
  from public, anon, authenticated;

-- Los ingresos ya registrados quedan en el día en que ocurrieron. Si no,
-- un escaneo de ayer con la clave vieja 'once_total' no coincidiría con
-- la de hoy y la puerta dejaría entrar dos veces el mismo día.
update public.check_ins
set access_window_key = plu_private.competitor_access_window_key(coalesce(scanned_at, clock_timestamp()))
where registration_id is not null
  and access_window_key = 'once_total';

alter table public.check_ins drop constraint if exists check_ins_registration_id_key;

create unique index if not exists check_ins_registration_access_window_key
  on public.check_ins (registration_id, access_window_key)
  where registration_id is not null;

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
  v_window text;
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

  v_window := plu_private.competitor_access_window_key(clock_timestamp());

  begin
    insert into public.check_ins(
      event_id, attendee_kind, registration_id, gate, scanned_by_label, access_window_key
    ) values (
      v_registration.event_id, 'athlete', v_registration.id,
      nullif(trim(p_gate), ''), left(p_actor, 200), v_window
    ) returning * into v_checkin;
  exception when unique_violation then
    raise exception 'Este competidor ya ingreso hoy.'
      using errcode = 'PLU06';
  end;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    'registration.checked_in', 'event_registration', v_registration.id::text,
    'staff', p_actor,
    jsonb_build_object(
      'eventSlug', v_event.slug,
      'gate', nullif(trim(p_gate), ''),
      'accessWindowKey', v_window,
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

-- La credencial muestra el ingreso de hoy. El de ayer no la marca como usada.
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

    if not found then
      select a.* into v_athlete
      from public.memberships m
      join public.athletes a on a.id = m.athlete_id
      where m.qr_token = v_token;
    end if;

    v_by_token := v_athlete.id is not null;
  else
    select a.* into v_athlete
    from public.memberships m
    join public.athletes a on a.id = m.athlete_id
    where m.member_code = p_code;
  end if;

  if v_athlete.id is null then
    raise exception 'Credencial no encontrada.' using errcode = 'PLU02';
  end if;

  select * into v_membership
  from public.memberships m
  where m.athlete_id = v_athlete.id
    and m.status = 'activa'
    and coalesce(m.start_date, current_date) <= current_date
    and coalesce(m.expiration_date, current_date - 1) >= current_date
  order by m.expiration_date desc
  limit 1;

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
        select * into v_checkin
        from public.check_ins
        where registration_id = v_registration.id
          and access_window_key = plu_private.competitor_access_window_key(clock_timestamp())
        order by scanned_at desc
        limit 1;
        v_schedule := plu_private.registration_schedule(v_registration);
      end if;
    end if;
  end if;

  v_registrations := plu_private.athlete_visible_registrations(v_athlete.id, 3);

  v_athlete_json := jsonb_build_object(
    'id', v_athlete.id,
    'full_name', v_athlete.full_name
  );

  if v_by_token then
    v_athlete_json := v_athlete_json || jsonb_build_object(
      'document_id', v_athlete.document_id,
      'birth_date', v_athlete.birth_date,
      'photo_path', v_athlete.photo_path
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
      'requires_membership', coalesce(v_event.requires_membership, true),
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
      coalesce(e.requires_membership, true) as requires_membership,
      plu_private.registration_schedule(r) as schedule,
      case when c.id is null then null else jsonb_build_object(
        'id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at
      ) end as check_in,
      (e.ends_at >= now()) as upcoming
    from public.event_registrations r
    join public.events e on e.id = r.event_id
    left join lateral (
      select c.id, c.gate, c.scanned_at
      from public.check_ins c
      where c.registration_id = r.id
        and c.access_window_key = plu_private.competitor_access_window_key(clock_timestamp())
      order by c.scanned_at desc
      limit 1
    ) c on true
    where r.athlete_id = p_athlete_id
      and r.status <> 'cancelada'
  ),
  chosen as (
    (select * from ranked where upcoming order by event_starts_at limit p_limit)
    union all
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
        'requires_membership', requires_membership,
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

create or replace function public.get_athlete_snapshot(p_athlete_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return jsonb_build_object(
    'athlete', to_jsonb(v_athlete),
    'memberships', (
      select coalesce(jsonb_agg(to_jsonb(m.*) order by m.created_at desc), '[]'::jsonb)
      from public.memberships m where m.athlete_id = p_athlete_id
    ),
    'registrations', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'registration', to_jsonb(r.*),
          'event', to_jsonb(e.*),
          'checkIn', to_jsonb(c.*),
          'schedule', plu_private.registration_schedule(r)
        )
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.event_registrations r
      join public.events e on e.id = r.event_id
      left join lateral (
        select c.*
        from public.check_ins c
        where c.registration_id = r.id
          and c.access_window_key = plu_private.competitor_access_window_key(clock_timestamp())
        order by c.scanned_at desc
        limit 1
      ) c on true
      where r.athlete_id = p_athlete_id
    ),
    'paymentOrders', (
      select coalesce(jsonb_agg(
        (to_jsonb(o.*) - 'provider_payload') || jsonb_build_object(
          'attempts', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'external_payment_id', p.external_payment_id,
              'status', p.status,
              'status_detail', p.status_detail,
              'amount', p.amount,
              'confirmed_at', p.confirmed_at,
              'created_at', p.created_at,
              'updated_at', p.updated_at
            ) order by p.created_at), '[]'::jsonb)
            from public.athlete_payments p where p.order_id = o.id
          )
        )
        order by o.created_at desc
      ), '[]'::jsonb)
      from public.athlete_payment_orders o where o.athlete_id = p_athlete_id
    )
  );
end;
$$;

revoke all on function public.get_athlete_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.get_athlete_snapshot(uuid) to service_role;

-- Lista offline: checkedInAt es el ingreso de hoy. El sello incluye el día
-- de Argentina para que a la medianoche los teléfonos bajen la lista de nuevo
-- y no se queden con el "ya ingresó" de ayer.
create or replace function public.staff_get_event_checkin_allowlist(p_event_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_tickets jsonb;
  v_registrations jsonb;
begin
  select * into v_event from public.events where slug = p_event_slug;
  if not found then raise exception 'Evento no encontrado.' using errcode = 'PLU02'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token, 'ticketCode', t.ticket_code, 'gateCode', t.gate_code,
    'attendeeName', t.attendee_name, 'attendeeDni', t.attendee_dni,
    'ticketTypeId', t.ticket_type_id, 'ticketTypeName', tt.name,
    'ticketTypeDescription', tt.description,
    'validityMode', tt.qr_validity_mode,
    'credentialLabel', coalesce(t.credential_label, 'Entrada general'),
    'credentialScopes', coalesce(t.credential_scopes, array['gate_tickets']),
    'validFrom', w.valid_from, 'validUntil', w.valid_until,
    'validityStatus', w.validity_status, 'accessWindowKey', w.access_window_key,
    'status', t.status, 'checkedInAt', c.scanned_at
  )), '[]'::jsonb) into v_tickets
  from public.tickets t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  cross join lateral plu_private.resolve_ticket_type_access_window(t.id, clock_timestamp()) w
  left join public.check_ins c on c.ticket_id = t.id and c.access_window_key = w.access_window_key
  where t.event_id = v_event.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'credentialToken', a.credential_token,
    'qrToken', m.qr_token, 'memberCode', m.member_code,
    'registrationId', r.id, 'athleteName', a.full_name,
    'athleteDocument', a.document_id, 'division', r.division, 'category', r.category,
    'status', r.status, 'checkedInAt', c.scanned_at,
    'accessWindowKey', c.access_window_key
  )), '[]'::jsonb) into v_registrations
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  left join lateral (
    select mm.qr_token, mm.member_code
    from public.memberships mm
    where mm.athlete_id = a.id
      and mm.status = 'activa'
      and coalesce(mm.start_date, current_date) <= current_date
      and coalesce(mm.expiration_date, current_date - 1) >= current_date
    order by mm.expiration_date desc nulls last
    limit 1
  ) m on true
  left join lateral (
    select c.scanned_at, c.access_window_key
    from public.check_ins c
    where c.registration_id = r.id
      and c.access_window_key = plu_private.competitor_access_window_key(clock_timestamp())
    order by c.scanned_at desc
    limit 1
  ) c on true
  where r.event_id = v_event.id
    and r.status = 'confirmada'
    and (not coalesce(v_event.requires_membership, true) or m.qr_token is not null);

  return jsonb_build_object('tickets', v_tickets, 'registrations', v_registrations);
end;
$$;

create or replace function public.staff_get_event_checkin_allowlist_revision(p_event_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws(
    '|',
    e.id::text,
    current_date::text,
    to_char(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'),
    (select count(*)::text from public.tickets t where t.event_id = e.id),
    (select coalesce(max(t.updated_at)::text, '0') from public.tickets t where t.event_id = e.id),
    (select count(*)::text from public.check_ins c where c.event_id = e.id),
    (select coalesce(max(c.scanned_at)::text, '0') from public.check_ins c where c.event_id = e.id),
    (select count(*)::text from public.event_registrations r where r.event_id = e.id and r.status = 'confirmada'),
    (select coalesce(max(r.updated_at)::text, '0') from public.event_registrations r where r.event_id = e.id),
    (select coalesce(max(tt.updated_at)::text, '0') from public.ticket_types tt where tt.event_id = e.id),
    (
      select coalesce(max(a.updated_at)::text, '0')
      from public.athletes a
      where a.id in (
        select r.athlete_id
        from public.event_registrations r
        where r.event_id = e.id and r.status = 'confirmada'
      )
    ),
    (
      select coalesce(max(m.updated_at)::text, '0')
      from public.memberships m
      where m.athlete_id in (
        select r.athlete_id
        from public.event_registrations r
        where r.event_id = e.id and r.status = 'confirmada'
      )
    )
  )
  from public.events e
  where e.slug = p_event_slug;
$$;

revoke all on function public.staff_get_event_checkin_allowlist_revision(text)
  from public, anon, authenticated;
grant execute on function public.staff_get_event_checkin_allowlist_revision(text)
  to service_role;

-- Sin el límite, dos ingresos (sábado y domingo) duplicaban al atleta en el tablero.
create or replace function plu_private.board_registration_rows(p_event_id uuid)
returns table (
  id uuid,
  athlete_id uuid,
  full_name text,
  gym text,
  division text,
  category text,
  bodyweight_kg numeric,
  sex text,
  age int,
  status text,
  event_day_id uuid,
  event_session_id uuid,
  checked_in boolean,
  is_first_meet boolean,
  competition_best_total_kg numeric,
  training_best_total_kg numeric
)
language sql
stable
set search_path = public
as $$
  select
    r.id,
    r.athlete_id,
    a.full_name,
    coalesce(nullif(trim(a.gym), ''), '') as gym,
    r.division,
    r.category,
    r.bodyweight_kg,
    a.sex,
    case
      when a.birth_date is null then null
      else extract(year from age(e.starts_at::date, a.birth_date))::int
    end as age,
    r.status,
    r.event_day_id,
    r.event_session_id,
    (c.id is not null) as checked_in,
    r.is_first_meet,
    r.competition_best_total_kg,
    r.training_best_total_kg
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  join public.events e on e.id = r.event_id
  left join lateral (
    select c.id
    from public.check_ins c
    where c.registration_id = r.id
      and c.access_window_key = plu_private.competitor_access_window_key(clock_timestamp())
    limit 1
  ) c on true
  where r.event_id = p_event_id
    and r.status <> 'cancelada'
$$;

do $verification$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'check_ins_registration_id_key'
  ) then
    raise exception 'el unique eterno de la inscripcion sigue activo';
  end if;
  if not exists (
    select 1 from pg_indexes
    where indexname = 'check_ins_registration_access_window_key'
  ) then
    raise exception 'falta el unique diario del competidor';
  end if;
  if position('competitor_access_window_key' in pg_get_functiondef(
    'public.staff_check_in_registration(uuid,text,text)'::regprocedure
  )) = 0 then
    raise exception 'staff_check_in_registration no abre por dia';
  end if;
  if position('competitor_access_window_key' in pg_get_functiondef(
    'public.staff_get_event_checkin_allowlist(text)'::regprocedure
  )) = 0 then
    raise exception 'la lista de puerta sigue marcando usado el ingreso de otro dia';
  end if;
end
$verification$;
