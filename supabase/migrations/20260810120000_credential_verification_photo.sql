-- Foto en la verificación pública de credencial — PLU ARG
--
-- La página de puerta necesita cotejar la cara del atleta cuando el QR es un
-- token no adivinable. El bucket athlete-photos es privado, así que la
-- proyección solo expone `photo_path` (nunca una URL firmada) y solo cuando
-- `v_by_token` es verdadero — el mismo criterio que documento y nacimiento.
-- Firmar la URL queda del lado del API Express rate-limited.

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

  -- Identidad + foto solo por token: el member_code es correlativo.
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
