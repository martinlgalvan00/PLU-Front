-- La credencial pasa a identificar a la PERSONA, no a un período de afiliación.
--
-- Hasta ahora el QR era `memberships.qr_token`: un uuid que nace con la fila de
-- cada año. De ese modelo salían cuatro problemas que se veían distintos pero
-- eran el mismo:
--
--   * Renovar cambiaba el token, así que la credencial impresa o guardada del
--     año anterior dejaba de ser la vigente y nadie avisaba.
--   * Un atleta inscripto a un evento con `requires_membership = false` no
--     tenía ninguna fila en `memberships`, con lo cual no tenía credencial: en
--     la puerta solo se lo podía buscar a mano en la lista.
--   * El QR de una inscripción era el de la afiliación, y el evento viajaba
--     como query param en la URL. Escaneado sin ese parámetro no se podía
--     resolver a qué inscripción correspondía.
--   * La proyección devolvía una sola membresía, la que matcheara el token, sin
--     preguntarse si era la vigente.
--
-- Ahora `athletes.credential_token` es estable de por vida: la card se imprime
-- una vez y la vigencia se responde al escanear. Los tokens de membresía
-- siguen resolviendo (credenciales ya emitidas), igual que el `member_code`.

-- ---------------------------------------------------------------------------
-- 1. Token de credencial por persona
-- ---------------------------------------------------------------------------

alter table public.athletes
  add column if not exists credential_token uuid;

-- En dos pasos y no con un default en el ADD COLUMN: así el backfill es
-- explícito y se puede leer qué pasó con las filas que ya existían.
update public.athletes
set credential_token = gen_random_uuid()
where credential_token is null;

alter table public.athletes
  alter column credential_token set default gen_random_uuid(),
  alter column credential_token set not null;

create unique index if not exists athletes_credential_token_uidx
  on public.athletes (credential_token);

-- ---------------------------------------------------------------------------
-- 2. Resolución de credencial: por persona, con la afiliación vigente
-- ---------------------------------------------------------------------------
-- A donde apunta el QR impreso, sin sesión. Sigue sin devolver documento,
-- contacto ni ningún token (el `member_code` es correlativo y devolver un token
-- permitiría cosecharlos iterando códigos).
--
-- Acepta, en este orden: el token de persona, el token de una membresía
-- (credenciales emitidas con el modelo viejo) y el member_code legible.
--
-- `membership` puede venir en null: un inscripto a un evento que no exige
-- afiliación también tiene credencial válida, y su veredicto lo da la
-- inscripción, no la afiliación.
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
  else
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
      end if;
    end if;
  end if;

  -- Sin evento en la URL se listan las inscripciones vigentes, para que quien
  -- escanea pueda elegir. Antes, escanear sin el query param no devolvía
  -- ninguna inscripción y la puerta se quedaba sin acción posible.
  select coalesce(jsonb_agg(entry order by entry ->> 'event_starts_at'), '[]'::jsonb)
  into v_registrations
  from (
    select jsonb_build_object(
      'id', r.id,
      'athlete_id', r.athlete_id,
      'division', r.division,
      'category', r.category,
      'status', r.status,
      'event_slug', e.slug,
      'event_title', e.title,
      'event_starts_at', e.starts_at,
      'check_in', case when c.id is null then null else jsonb_build_object(
        'id', c.id, 'gate', c.gate, 'scanned_at', c.scanned_at
      ) end
    ) as entry
    from public.event_registrations r
    join public.events e on e.id = r.event_id
    left join public.check_ins c on c.registration_id = r.id
    where r.athlete_id = v_athlete.id
      and r.status <> 'cancelada'
      and e.status <> 'finalizado'
  ) rows;

  return jsonb_build_object(
    'athlete', jsonb_build_object(
      'id', v_athlete.id,
      'full_name', v_athlete.full_name
    ),
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
-- 3. Proyección de staff: la misma credencial, con documento
-- ---------------------------------------------------------------------------
-- El documento sale del atleta que ya resolvió la proyección privada, en vez
-- de repetir la búsqueda por token: con tres formatos de código aceptados,
-- duplicar esa resolución era garantía de que las dos ramas se desincronizaran.
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
  v_document text;
begin
  v_result := plu_private.get_membership_by_code_or_token(p_code, p_event_slug);

  select document_id into v_document
  from public.athletes
  where id = (v_result -> 'athlete' ->> 'id')::uuid;

  return jsonb_set(v_result, '{athlete,document_id}', to_jsonb(v_document), true);
end;
$$;

revoke all on function public.staff_get_membership_by_code_or_token(text, text)
  from public, anon, authenticated;
grant execute on function public.staff_get_membership_by_code_or_token(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Rotación del token de persona
-- ---------------------------------------------------------------------------
-- Equivalente a `staff_rotate_membership_qr_token`, que sigue existiendo para
-- las credenciales del modelo viejo. Rotar invalida la card impresa: es la
-- salida cuando un token se filtró.
create or replace function public.staff_rotate_athlete_credential_token(
  p_athlete_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  update public.athletes
  set credential_token = gen_random_uuid(), updated_at = now()
  where id = p_athlete_id
  returning * into v_athlete;

  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  perform plu_private.record_domain_audit(
    'athlete.credential_rotated', 'athlete', p_athlete_id::text, 'staff', p_actor,
    jsonb_build_object('fullName', v_athlete.full_name),
    v_athlete.organization_id
  );

  return jsonb_build_object('athlete', jsonb_build_object(
    'id', v_athlete.id,
    'full_name', v_athlete.full_name,
    'credential_token', v_athlete.credential_token
  ));
end;
$$;

revoke all on function public.staff_rotate_athlete_credential_token(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_rotate_athlete_credential_token(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. La vigencia se cuenta desde el pago, no desde que se creó la orden
-- ---------------------------------------------------------------------------
-- `membership_order_targets.starts_at` se fija cuando el atleta genera la orden.
-- Para una transferencia que se aprueba tres semanas más tarde, eso significaba
-- que la afiliación arrancaba retroactivamente y el socio perdía esas semanas.
--
-- El período se recalcula al acreditarse, conservando la duración del plan
-- (`ends_at - starts_at`). Una renovación encadenada -- la que arranca cuando
-- vence la cobertura vigente -- mantiene su fecha futura: ahí el corrimiento
-- es intencional.
create or replace function public.project_membership_order_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.membership_order_targets;
  v_payment_id uuid;
  v_duration int;
  v_covered_until date;
  v_start date;
  v_end date;
begin
  if new.concept not in ('membership', 'combo') or new.status = old.status then return new; end if;
  select * into v_target from public.membership_order_targets where order_id = new.id;
  if not found then return new; end if;

  if new.status = 'aprobado' then
    select id into v_payment_id from public.athlete_payments
    where order_id = new.id and status = 'aprobado'
    order by confirmed_at desc nulls last, updated_at desc limit 1;

    v_duration := greatest(v_target.ends_at - v_target.starts_at, 1);

    -- Si ya hay cobertura paga vigente, el período nuevo empieza cuando esa
    -- termina; si no, el día del pago. Nunca antes de lo previsto al crear la
    -- orden, para no acortar una renovación programada.
    select max(c.ends_at) into v_covered_until
    from public.membership_cycles c
    where c.membership_id = v_target.membership_id
      and c.order_id <> new.id
      and c.status = 'active'
      and c.ends_at >= current_date;

    if v_target.starts_at > current_date then
      -- Renovación programada sobre una cobertura que sigue corriendo: la
      -- fecha futura es intencional y se respeta.
      v_start := v_target.starts_at;
    else
      v_start := greatest(current_date, coalesce(v_covered_until + 1, current_date));
    end if;
    v_end := v_start + v_duration;

    update public.membership_order_targets
    set starts_at = v_start, ends_at = v_end
    where order_id = new.id;

    insert into public.membership_cycles(membership_id, order_id, payment_id, starts_at, ends_at, status)
    values(v_target.membership_id, new.id, v_payment_id, v_start, v_end, 'active')
    on conflict (membership_id, order_id) do update set
      payment_id = coalesce(excluded.payment_id, public.membership_cycles.payment_id),
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      status = 'active', updated_at = now();

    update public.memberships set
      status = 'activa',
      start_date = least(coalesce(start_date, v_start), v_start),
      expiration_date = greatest(coalesce(expiration_date, v_end), v_end),
      updated_at = now()
    where id = v_target.membership_id;
    update public.athletes set status = 'afiliado_activo', updated_at = now()
    where id = new.athlete_id;
  elsif new.status in ('cancelado', 'reembolsado') then
    update public.membership_cycles set
      status = case when new.status = 'reembolsado' then 'refunded' else 'cancelled' end,
      updated_at = now()
    where order_id = new.id;
    if not exists (
      select 1 from public.membership_cycles c
      where c.membership_id = v_target.membership_id and c.status = 'active'
        and c.starts_at <= current_date and c.ends_at >= current_date
    ) then
      update public.memberships set
        status = case when new.status = 'reembolsado' then 'reembolsada' else 'cancelada' end,
        updated_at = now()
      where id = v_target.membership_id;
    end if;
  end if;
  return new;
end;
$$;
