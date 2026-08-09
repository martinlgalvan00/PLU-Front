-- Inscripción sin afiliación activa — PLU ARG
--
-- Antes `create_competition_registration_v2` exigía membership activa y vigente
-- cuando el evento tenía `requires_membership` (PLU05). Eso frenaba a quien
-- ya estaba en la app con afiliación pendiente o sin pagar todavía.
--
-- Política nueva:
--   * Crear/pagar la inscripción: permitido sin afiliación activa.
--   * Check-in en puerta: sigue exigiendo afiliación activa SOLO si el evento
--     la pide (`staff_check_in_registration`, sin cambios).
--
-- Además, la proyección de credencial incluye `requires_membership` para que
-- la UI de puerta muestre "falta afiliación" con el mismo criterio que la RPC.

-- ---------------------------------------------------------------------------
-- 1. create_competition_registration_v2 sin gate de afiliación
-- ---------------------------------------------------------------------------
create or replace function public.create_competition_registration_v2(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_event public.events;
  v_order public.athlete_payment_orders;
  v_registration public.event_registrations;
  v_count int;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link')
     or p_division not in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')
     or p_category not in ('Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited')
     or (p_bodyweight_kg is not null and (p_bodyweight_kg < 20 or p_bodyweight_kg > 400)) then
    raise exception 'Datos de inscripcion invalidos.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;
  select * into v_event from public.events where slug = p_event_slug for update;
  if not found or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  -- Cupo lleno es PLU04; cerrado/proximamente/finalizado siguen en PLU03.
  if v_event.status = 'agotado' then
    raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
  end if;
  if v_event.status not in ('inscripcion_abierta', 'cupos_limitados') then
    raise exception 'La inscripcion no esta abierta.' using errcode = 'PLU03';
  end if;
  if v_event.registration_opens_at is not null and now() < v_event.registration_opens_at
     or v_event.registration_closes_at is not null and now() > v_event.registration_closes_at then
    raise exception 'La inscripcion esta fuera de fecha.' using errcode = 'PLU03';
  end if;
  -- La afiliación ya no bloquea el alta de inscripción. Si el evento la
  -- exige, el gate vive en check-in (`staff_check_in_registration`).

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select * into v_registration from public.event_registrations where payment_order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', true);
  end if;

  select * into v_registration from public.event_registrations
    where event_id = v_event.id and athlete_id = p_athlete_id;
  if found then
    raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end if;

  if v_event.capacity is not null then
    select count(*) into v_count from public.event_registrations
    where event_id = v_event.id and status in ('pendiente_pago', 'pagada', 'confirmada');
    if v_count >= v_event.capacity then
      raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
    end if;
  end if;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'registration', v_event.price, v_event.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'RORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  ) returning * into v_order;

  insert into public.event_registrations (
    athlete_id, event_id, division, category, bodyweight_kg, status, payment_order_id
  ) values (
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg,
    'pendiente_pago', v_order.id
  ) returning * into v_registration;

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('registration.created', 'event_registration', v_registration.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('eventId', v_event.id, 'orderId', v_order.id));

  return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration), 'duplicate', false);
end;
$$;

revoke all on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.create_competition_registration_v2(uuid, text, text, text, numeric, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Proyección de credencial: requires_membership en cada inscripción
-- ---------------------------------------------------------------------------
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
    left join public.check_ins c on c.registration_id = r.id
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
        select * into v_checkin from public.check_ins
        where registration_id = v_registration.id;
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
