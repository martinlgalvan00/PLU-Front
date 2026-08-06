-- Login de atleta inalcanzable por mayúsculas, y órdenes de afiliación
-- devueltas con el medio de pago equivocado.
--
-- 1) `register_athlete` guardaba el email tal cual venía del formulario, pero
--    `findLogin` (server/modules/athletes/supabaseAthleteRepository.js) busca
--    por `email.toLowerCase()`. Cualquier cuenta creada con una mayúscula --
--    el autocompletado de iOS/Android las mete solo -- quedaba muerta: no
--    podía loguearse, `forgot-password` tampoco la encontraba (y por el diseño
--    anti-enumeración devolvía el mensaje de éxito igual, así que el atleta
--    esperaba un mail que nunca salía), y el índice único sobre lower(email)
--    impedía registrarse de nuevo. La normalización va también acá y no solo
--    en el schema de Express: la base es la que tiene que garantizar la
--    invariante que su propio índice único ya asume.
--
-- 2) La query de reuso de orden abierta en `create_membership_order_v2` no
--    filtraba por medio de pago. Si el atleta creaba una orden por
--    transferencia (vigente 24 h) y después elegía Mercado Pago, se le
--    devolvía la orden manual: el checkout embebido solo se monta cuando
--    `order.method = 'mercado_pago'`, así que se quedaba un día entero sin
--    ninguna forma de pagar. Ahora el reuso exige el mismo medio y la orden
--    abierta del medio anterior se cancela, para no dejar dos pendientes por
--    la misma afiliación en la bandeja de Finanzas.

-- ---------------------------------------------------------------------------
-- 1. Normalización de los emails ya guardados
-- ---------------------------------------------------------------------------

-- `athletes_org_email_ci_uidx` (unique sobre lower(email), migración
-- 20260722130000) garantiza que no puede haber dos filas que colisionen al
-- bajar a minúsculas. Se verifica igual antes de tocar nada: si la premisa no
-- se cumple, es mejor fallar acá con un mensaje claro que romper con un
-- unique_violation sin contexto a mitad del update.
do $$
declare
  v_collisions bigint;
begin
  select count(*) into v_collisions from (
    select organization_id, lower(email)
    from public.athletes
    group by organization_id, lower(email)
    having count(*) > 1
  ) duplicated;

  if v_collisions > 0 then
    raise exception
      'Hay % email(s) que colisionan al normalizar a minúsculas. Resolvelos a mano antes de correr esta migración.',
      v_collisions;
  end if;
end $$;

update public.athletes
set email = lower(trim(email)),
    updated_at = now()
where email <> lower(trim(email));

-- ---------------------------------------------------------------------------
-- 2. register_athlete: email normalizado en el alta
-- ---------------------------------------------------------------------------

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
      -- Única fuente de verdad del formato del email guardado.
      lower(trim(p_form ->> 'email')),
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

revoke all on function public.register_athlete(jsonb) from public, anon, authenticated;
grant execute on function public.register_athlete(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. update_athlete_profile: misma normalización al editar el contacto
-- ---------------------------------------------------------------------------

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
    set email = lower(trim(p_email)),
        phone = p_phone,
        city = p_city,
        province = p_province,
        gym = p_gym,
        updated_at = now()
    where id = p_athlete_id
    returning * into v_athlete;

  if not found then
    raise exception 'Atleta no encontrado.' using errcode = 'PLU02';
  end if;

  return to_jsonb(v_athlete);
end;
$$;

revoke all on function public.update_athlete_profile(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.update_athlete_profile(uuid, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. create_membership_order_v2: el reuso de orden abierta respeta el medio
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_order_v2(
  p_athlete_id uuid,
  p_payment_method text,
  p_plan_code text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_plan public.membership_plans;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_existing public.memberships;
  v_pending public.memberships;
  v_start date;
  v_end date;
  v_year text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link') then
    raise exception 'Medio de pago invalido.' using errcode = 'PLU01';
  end if;

  select * into v_athlete from public.athletes where id = p_athlete_id for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;
  select * into v_plan from public.membership_plans where code = p_plan_code and active = true;
  if not found then raise exception 'Plan de afiliacion no encontrado.' using errcode = 'PLU02'; end if;
  if v_plan.collection_mode = 'recurring' and p_payment_method <> 'mercado_pago' then
    raise exception 'Los planes recurrentes requieren Mercado Pago.' using errcode = 'PLU10';
  end if;

  select * into v_order from public.athlete_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    select m.* into v_membership from public.membership_order_targets t
      join public.memberships m on m.id = t.membership_id where t.order_id = v_order.id;
    return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', true);
  end if;

  -- Una afiliación que todavía no se cobró se reusa tal cual. Antes `v_existing`
  -- tomaba la última fila por vencimiento sin mirar el estado, así que el
  -- período nuevo se calculaba desde el vencimiento de una afiliación impaga:
  -- cambiar de medio de pago abría una segunda afiliación para el año
  -- siguiente. No se notaba porque el reuso de orden tapaba el camino; al
  -- exigir el mismo medio, queda a la vista.
  select m.* into v_pending from public.memberships m
  where m.athlete_id = p_athlete_id and m.plan_id = v_plan.id and m.status = 'pendiente_pago'
  order by m.created_at desc limit 1 for update;

  -- La renovación se calcula sobre el último período realmente vigente.
  select m.* into v_existing from public.memberships m
  where m.athlete_id = p_athlete_id and m.status <> 'pendiente_pago'
  order by m.expiration_date desc nulls last limit 1 for update;

  -- Reusar una orden abierta evita dobles cobros aunque el browser haya
  -- perdido su clave original antes de reintentar. El medio de pago forma
  -- parte de la identidad de la orden: devolver una de transferencia a quien
  -- pidió Mercado Pago (o al revés) lo deja sin checkout usable hasta que la
  -- orden vieja vence.
  select o.* into v_order from public.athlete_payment_orders o
  join public.membership_order_targets t on t.order_id = o.id
  join public.memberships m on m.id = t.membership_id
  where m.athlete_id = p_athlete_id and m.plan_id = v_plan.id
    and o.method = p_payment_method
    and o.status in ('pendiente', 'validacion_manual')
    and coalesce(o.expires_at, now() + interval '1 minute') > now()
  order by o.created_at desc limit 1;
  if found then
    return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_existing), 'plan', to_jsonb(v_plan), 'duplicate', true);
  end if;

  -- Cambió de medio: la orden abierta del medio anterior se cancela en la
  -- misma transacción. Sin esto quedaban dos pendientes por la misma
  -- afiliación y Finanzas no podía saber cuál iba a pagar el atleta.
  update public.athlete_payment_orders o
  set status = 'cancelado', updated_at = now()
  from public.membership_order_targets t
  join public.memberships m on m.id = t.membership_id
  where t.order_id = o.id
    and m.athlete_id = p_athlete_id
    and m.plan_id = v_plan.id
    and o.method <> p_payment_method
    and o.status in ('pendiente', 'validacion_manual');

  if v_pending.id is not null then
    v_start := v_pending.start_date;
    v_end := v_pending.expiration_date;
    v_year := v_pending.year;
  else
    v_start := greatest(current_date, coalesce(v_existing.expiration_date + 1, current_date));
    v_end := case when v_plan.billing_frequency = 'monthly'
      then (v_start + make_interval(months => v_plan.interval_count))::date
      else (v_start + make_interval(years => v_plan.interval_count))::date end;
    v_year := extract(year from v_start)::int::text;
  end if;

  insert into public.athlete_payment_orders (
    athlete_id, concept, amount, currency, method, status, reference,
    idempotency_key, expires_at
  ) values (
    p_athlete_id, 'membership', v_plan.price, v_plan.currency, p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'MORD-' || encode(extensions.gen_random_bytes(8), 'hex'), p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  ) returning * into v_order;

  if v_pending.id is not null then
    -- Se repunta a la orden nueva: la anterior quedó cancelada más arriba y
    -- dejar la afiliación apuntando ahí la volvía inaprobable.
    update public.memberships
    set payment_order_id = v_order.id, updated_at = now()
    where id = v_pending.id
    returning * into v_membership;
  elsif v_existing.id is null or v_existing.year <> v_year then
    insert into public.memberships (
      athlete_id, year, status, start_date, expiration_date, member_code,
      payment_order_id, plan_id
    ) values (
      p_athlete_id, v_year, 'pendiente_pago', v_start, v_end,
      'PLU-ARG-' || v_year || '-' || lpad(nextval('public.membership_code_seq')::text, 8, '0'),
      v_order.id, v_plan.id
    ) returning * into v_membership;
  else
    v_membership := v_existing;
  end if;

  insert into public.membership_order_targets(order_id, membership_id, starts_at, ends_at)
  values (v_order.id, v_membership.id, v_start, v_end);

  insert into public.domain_audit_logs(action, entity_type, entity_id, actor_type, actor_id, metadata)
  values ('membership_order.created', 'payment_order', v_order.id::text, 'athlete', p_athlete_id::text,
    jsonb_build_object('membershipId', v_membership.id, 'planCode', v_plan.code));

  return jsonb_build_object('order', to_jsonb(v_order), 'membership', to_jsonb(v_membership), 'plan', to_jsonb(v_plan), 'duplicate', false);
end;
$$;

revoke all on function public.create_membership_order_v2(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_membership_order_v2(uuid, text, text, text) to service_role;
