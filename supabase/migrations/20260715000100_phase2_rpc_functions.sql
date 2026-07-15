-- Fase 2: funciones RPC para athletes/memberships/event_registrations.
-- Mismo patron que 20260706030200_phase1_rpc_functions.sql: prefijo p_ en
-- parametros, SECURITY DEFINER + search_path fijo, codigos de error PLU0x,
-- grant execute explicito. check_in_registration ya existe desde la fase 1
-- y no se toca aca.

-- can_view_admin_data() ya esta definida en
-- 20260715000000_phase2_athletes_memberships.sql (la necesitan sus RLS
-- policies antes que esta migracion corra).

-- Precios hardcodeados, espejando PRICING en src/lib/constants.js (mismo
-- TODO que ticket_price_for_day_pass: mover a un catalogo real si hace
-- falta variar precio por evento/ano).
create or replace function public.membership_price()
returns int
language sql
immutable
as $$
  select 38000;
$$;

create or replace function public.registration_price()
returns int
language sql
immutable
as $$
  select 45000;
$$;

-- 'pendiente' para mercado_pago (queda a la espera del webhook/aprobacion),
-- 'validacion_manual' para el resto -- mismo mapeo que
-- src/services/paymentService.js getPaymentStatusForMethod.
create or replace function public.athlete_payment_status_for_method(p_method text)
returns text
language sql
immutable
as $$
  select case p_method when 'mercado_pago' then 'pendiente' else 'validacion_manual' end;
$$;

-- Codigo humano secuencial por ano, ej. PLU-ARG-2026-004. Se genera dentro
-- de la misma transaccion que el insert de memberships, asi que el conteo
-- es atomico frente a altas concurrentes.
create or replace function public.next_member_code(p_year text)
returns text
language sql
as $$
  select 'PLU-ARG-' || p_year || '-' || lpad(((select count(*) from public.memberships where year = p_year) + 1)::text, 3, '0');
$$;

-- ---------------------------------------------------------------------
-- register_athlete: alta publica de un perfil de atleta (sin cuenta).
-- ---------------------------------------------------------------------
create or replace function public.register_athlete(p_form jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
begin
  begin
    insert into public.athletes (
      full_name, document_id, email, birth_date, phone, country, province, city, gym, sex,
      division, category, estimated_weight, status
    )
    values (
      p_form ->> 'fullName',
      p_form ->> 'documentId',
      p_form ->> 'email',
      nullif(p_form ->> 'birthDate', '')::date,
      p_form ->> 'phone',
      p_form ->> 'country',
      p_form ->> 'province',
      p_form ->> 'city',
      p_form ->> 'gym',
      p_form ->> 'sex',
      coalesce(p_form ->> 'division', 'Open'),
      coalesce(p_form ->> 'category', 'Raw'),
      nullif(p_form ->> 'estimatedWeight', '')::numeric,
      'registrado'
    )
    returning * into v_athlete;
  exception
    when unique_violation then
      raise exception 'Ya existe un atleta con ese documento o email.' using errcode = 'PLU07';
  end;

  return to_jsonb(v_athlete);
end;
$$;

grant execute on function public.register_athlete(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- create_membership_order: alta de la orden de pago + membership
-- 'pendiente_pago' para un atleta ya existente.
-- ---------------------------------------------------------------------
create or replace function public.create_membership_order(p_athlete_id uuid, p_payment_method text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_year text := '2026';
begin
  select * into v_athlete from public.athletes where id = p_athlete_id;
  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  insert into public.athlete_payment_orders (athlete_id, concept, amount, method, status, reference)
  values (
    p_athlete_id, 'membership', public.membership_price(), p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    (case p_payment_method when 'mercado_pago' then 'MP-' else 'MANUAL-' end) || extract(epoch from now())::bigint
  )
  returning * into v_order;

  insert into public.memberships (athlete_id, year, status, start_date, expiration_date, member_code, payment_order_id)
  values (
    p_athlete_id, v_year, 'pendiente_pago', current_date, (v_year || '-01-31')::date + interval '1 year',
    public.next_member_code(v_year), v_order.id
  )
  on conflict (athlete_id, year) do update
    set status = 'pendiente_pago', payment_order_id = excluded.payment_order_id, updated_at = now()
  returning * into v_membership;

  return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership));
end;
$$;

grant execute on function public.create_membership_order(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- create_competition_registration: alta de la orden de pago + inscripcion
-- a torneo. Exige membresia activa -- hoy ese gate solo vivia en el
-- cliente (useAppData.submitCompetition), aca queda tambien del lado
-- servidor.
-- ---------------------------------------------------------------------
create or replace function public.create_competition_registration(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_order public.athlete_payment_orders;
  v_registration public.event_registrations;
begin
  if not exists (select 1 from public.memberships where athlete_id = p_athlete_id and status = 'activa') then
    raise exception 'Necesitas tener la afiliacion activa antes de inscribirte a una competencia.' using errcode = 'PLU05';
  end if;

  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  insert into public.athlete_payment_orders (athlete_id, concept, amount, method, status, reference)
  values (
    p_athlete_id, 'registration', public.registration_price(), p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    (case p_payment_method when 'mercado_pago' then 'MP-' else 'MANUAL-' end) || extract(epoch from now())::bigint
  )
  returning * into v_order;

  begin
    insert into public.event_registrations (athlete_id, event_id, division, category, bodyweight_kg, status, payment_order_id)
    values (p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg, 'pendiente_pago', v_order.id)
    returning * into v_registration;
  exception
    when unique_violation then
      raise exception 'Ya estas inscripto en este evento.' using errcode = 'PLU08';
  end;

  return jsonb_build_object('order', to_jsonb(v_order), 'registration', to_jsonb(v_registration));
end;
$$;

grant execute on function public.create_competition_registration(uuid, text, text, text, numeric, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- approve_athlete_payment_order: "Simular pago" -- intencionalmente
-- publico, mismo criterio que approve_ticket_order (stand-in del webhook).
-- Aprueba la orden y activa la membership/registration asociada.
-- ---------------------------------------------------------------------
create or replace function public.approve_athlete_payment_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_athlete public.athletes;
begin
  update public.athlete_payment_orders
    set status = 'aprobado', updated_at = now()
    where id = p_order_id
    returning * into v_order;

  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'PLU02';
  end if;

  if v_order.concept = 'membership' then
    update public.memberships
      set status = 'activa', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_membership;

    update public.athletes
      set status = 'afiliado_activo', updated_at = now()
      where id = v_order.athlete_id
      returning * into v_athlete;
  elsif v_order.concept = 'registration' then
    update public.event_registrations
      set status = 'confirmada', updated_at = now()
      where payment_order_id = p_order_id
      returning * into v_registration;
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration)
  );
end;
$$;

grant execute on function public.approve_athlete_payment_order(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_membership_by_code_or_token: verificacion publica de solo lectura --
-- a donde apunta el QR. Acepta tanto el qr_token nuevo (uuid opaco) como
-- el member_code legible viejo, para que las credenciales ya impresas
-- sigan funcionando indefinidamente sin tener que regenerarlas.
-- ---------------------------------------------------------------------
create or replace function public.get_membership_by_code_or_token(p_code text, p_event_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
  v_membership public.memberships;
  v_athlete public.athletes;
  v_registration public.event_registrations;
  v_event public.events;
begin
  begin
    v_token := p_code::uuid;
  exception
    when invalid_text_representation then
      v_token := null;
  end;

  if v_token is not null then
    select * into v_membership from public.memberships where qr_token = v_token;
  else
    select * into v_membership from public.memberships where member_code = p_code;
  end if;

  if not found then
    raise exception 'Credencial no encontrada.' using errcode = 'PLU02';
  end if;

  select * into v_athlete from public.athletes where id = v_membership.athlete_id;

  if p_event_slug is not null then
    select * into v_event from public.events where slug = p_event_slug;
    if found then
      select * into v_registration
        from public.event_registrations
        where athlete_id = v_athlete.id and event_id = v_event.id and status <> 'cancelada';
    end if;
  end if;

  return jsonb_build_object(
    'athlete', to_jsonb(v_athlete),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration)
  );
end;
$$;

grant execute on function public.get_membership_by_code_or_token(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_athlete_snapshot: lectura publica del perfil completo de UN atleta
-- (sus membresias + inscripciones + ordenes de pago). La usan el perfil
-- del atleta y los formularios de afiliacion/inscripcion (RegisterPage,
-- AthleteProfilePage) -- esas paginas corren con sesion athlete_plu, que
-- a proposito no tiene puente a Supabase Auth (igual que la compra de
-- entradas: alcanza con conocer el uuid, no hace falta login real).
-- ---------------------------------------------------------------------
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
        jsonb_build_object('registration', to_jsonb(r.*), 'event', to_jsonb(e.*), 'checkIn', to_jsonb(c.*))
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.event_registrations r
      join public.events e on e.id = r.event_id
      left join public.check_ins c on c.registration_id = r.id
      where r.athlete_id = p_athlete_id
    ),
    'paymentOrders', (
      select coalesce(jsonb_agg(to_jsonb(o.*) order by o.created_at desc), '[]'::jsonb)
      from public.athlete_payment_orders o where o.athlete_id = p_athlete_id
    )
  );
end;
$$;

grant execute on function public.get_athlete_snapshot(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------
-- list_athlete_admin_data: panel admin -- todos los atletas, membresias,
-- inscripciones (con su evento embebido) y ordenes de pago. El dataset de
-- este dominio es chico (afiliados de PLU ARG, no un producto masivo), asi
-- que un solo snapshot alcanza -- mismo criterio que el resto del panel
-- admin, que hoy ya trabaja con arrays completos en memoria.
-- ---------------------------------------------------------------------
create or replace function public.list_athlete_admin_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_view_admin_data() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'athletes', (select coalesce(jsonb_agg(to_jsonb(a.*) order by a.created_at desc), '[]'::jsonb) from public.athletes a),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(m.*) order by m.created_at desc), '[]'::jsonb) from public.memberships m),
    'registrations', (
      select coalesce(jsonb_agg(
        jsonb_build_object('registration', to_jsonb(r.*), 'event', to_jsonb(e.*), 'checkIn', to_jsonb(c.*))
        order by r.created_at desc
      ), '[]'::jsonb)
      from public.event_registrations r
      join public.events e on e.id = r.event_id
      left join public.check_ins c on c.registration_id = r.id
    ),
    'paymentOrders', (select coalesce(jsonb_agg(to_jsonb(o.*) order by o.created_at desc), '[]'::jsonb) from public.athlete_payment_orders o)
  );
end;
$$;

grant execute on function public.list_athlete_admin_data() to authenticated;

-- ---------------------------------------------------------------------
-- update_athlete_profile: edicion de datos de contacto (no identidad).
-- Publica, igual que register_athlete -- el atleta no tiene sesion de
-- Supabase Auth (ver server/services/supabaseAuthBridge.js), asi que
-- alcanza con conocer su propio athleteId, mismo criterio que el resto de
-- este dominio.
-- ---------------------------------------------------------------------
create or replace function public.update_athlete_profile(
  p_athlete_id uuid,
  p_email text,
  p_phone text,
  p_city text,
  p_province text,
  p_gym text
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
    set email = p_email, phone = p_phone, city = p_city, province = p_province, gym = p_gym, updated_at = now()
    where id = p_athlete_id
    returning * into v_athlete;

  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return to_jsonb(v_athlete);
end;
$$;

grant execute on function public.update_athlete_profile(uuid, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- get_event_checkin_allowlist: snapshot descargable para el scanner de
-- seguridad -- soporta check-in con conectividad inestable en la puerta
-- del evento. Solo lo minimo necesario para decidir "dejar pasar" sin
-- conexion (sin fotos: el sistema no las maneja hoy).
-- ---------------------------------------------------------------------
create or replace function public.get_event_checkin_allowlist(p_event_slug text)
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
  if not public.can_check_in() then
    raise exception 'No tenes permisos para esta accion.' using errcode = '42501';
  end if;

  select * into v_event from public.events where slug = p_event_slug;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', t.qr_token,
    'ticketCode', t.ticket_code,
    'attendeeName', t.attendee_name,
    'attendeeDni', t.attendee_dni,
    'dayPass', t.day_pass,
    'status', t.status,
    'checkedInAt', c.scanned_at
  )), '[]'::jsonb)
  into v_tickets
  from public.tickets t
  left join public.check_ins c on c.ticket_id = t.id
  where t.event_id = v_event.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'qrToken', m.qr_token,
    'memberCode', m.member_code,
    'registrationId', r.id,
    'athleteName', a.full_name,
    'athleteDocument', a.document_id,
    'division', r.division,
    'category', r.category,
    'status', r.status,
    'checkedInAt', c.scanned_at
  )), '[]'::jsonb)
  into v_registrations
  from public.event_registrations r
  join public.athletes a on a.id = r.athlete_id
  join public.memberships m on m.athlete_id = a.id
  left join public.check_ins c on c.registration_id = r.id
  where r.event_id = v_event.id and r.status <> 'cancelada';

  return jsonb_build_object('tickets', v_tickets, 'registrations', v_registrations);
end;
$$;

grant execute on function public.get_event_checkin_allowlist(text) to authenticated;
