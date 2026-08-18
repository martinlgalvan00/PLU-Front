-- Códigos de promoción: qué medios de pago habilita cada uno — PLU ARG
--
-- `enables_manual_payment` (20260823170000) era un booleano: o el código no
-- tocaba el canal de pago, o destrababa transferencia Y efectivo a la vez. No
-- alcanza para una promo que se cobra sólo por transferencia, ni para una que
-- se cobra sólo en efectivo el día del evento.
--
-- Pasa a ser una lista explícita de canales manuales habilitados:
--
--   {}                              -> sólo Mercado Pago (default)
--   {bank_transfer}                 -> Mercado Pago + transferencia
--   {cash_pitbull}                  -> Mercado Pago + efectivo
--   {bank_transfer,cash_pitbull}    -> los tres
--
-- Mercado Pago nunca se apaga: es el canal base de todo el checkout.
--
-- `enables_manual_payment` sobrevive como columna generada para que cualquier
-- lector que todavía la consulte (una API desplegada antes que esta migración)
-- siga viendo el mismo booleano, sin que exista una segunda fuente de verdad
-- que se pueda desincronizar.

-- ---------------------------------------------------------------------------
-- 1. Esquema
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists manual_channels text[] not null default '{}';

alter table public.discount_codes drop constraint if exists discount_codes_manual_channels_check;
alter table public.discount_codes
  add constraint discount_codes_manual_channels_check
  check (manual_channels <@ array['bank_transfer', 'cash_pitbull']::text[]);

do $migrate$
begin
  -- Un código que hoy destraba el canal manual lo destraba entero: se preserva
  -- ese significado antes de que la columna vieja deje de ser escribible.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'discount_codes'
      and column_name = 'enables_manual_payment'
      and is_generated = 'NEVER'
  ) then
    update public.discount_codes
    set manual_channels = array['bank_transfer', 'cash_pitbull']::text[]
    where enables_manual_payment = true
      and cardinality(manual_channels) = 0;

    alter table public.discount_codes drop column enables_manual_payment;
    alter table public.discount_codes
      add column enables_manual_payment boolean
      generated always as (cardinality(manual_channels) > 0) stored;
  end if;
end
$migrate$;

-- ---------------------------------------------------------------------------
-- 2. CRUD admin
-- ---------------------------------------------------------------------------

create or replace function public.staff_upsert_discount_code(
  p_code jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_code ->> 'id', '')::uuid;
  v_organization_id uuid := coalesce(
    nullif(p_code ->> 'organizationId', '')::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );
  v_code_text text := upper(trim(p_code ->> 'code'));
  v_kind text := coalesce(nullif(trim(p_code ->> 'kind'), ''), 'percent');
  v_percent int := nullif(p_code ->> 'percentOff', '')::int;
  v_fixed_price int := nullif(p_code ->> 'fixedPrice', '')::int;
  v_applies text := p_code ->> 'appliesTo';
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_manual_channels text[];
  v_before jsonb;
  v_result public.discount_codes;
begin
  if v_kind not in ('percent', 'fixed_price') then
    raise exception 'La modalidad del código es inválida.' using errcode = 'PLU01';
  end if;

  -- Cada modalidad ignora el campo de la otra: así editar un cupón de un tipo
  -- al otro desde el panel no deja el valor viejo colgado.
  if v_kind = 'percent' then
    v_fixed_price := null;
  else
    v_percent := null;
  end if;

  if jsonb_typeof(p_code -> 'manualChannels') = 'array' then
    select coalesce(array_agg(distinct channel), '{}'::text[])
    into v_manual_channels
    from jsonb_array_elements_text(p_code -> 'manualChannels') as channel;
  elsif coalesce((p_code ->> 'enablesManualPayment')::boolean, false) then
    -- Payload de la API anterior: el booleano significaba los dos canales.
    v_manual_channels := array['bank_transfer', 'cash_pitbull']::text[];
  else
    v_manual_channels := '{}'::text[];
  end if;

  if not (v_manual_channels <@ array['bank_transfer', 'cash_pitbull']::text[]) then
    raise exception 'Los medios de pago del código son inválidos.' using errcode = 'PLU01';
  end if;

  if v_code_text is null or v_code_text !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
     or length(v_code_text) < 3 or length(v_code_text) > 32
     or v_applies not in ('membership', 'registration', 'combo', 'both')
     or (v_max_redemptions is not null and v_max_redemptions <= 0) then
    raise exception 'Los datos del código son inválidos.' using errcode = 'PLU01';
  end if;

  if v_kind = 'percent' and (v_percent is null or v_percent < 1 or v_percent > 99) then
    raise exception 'El porcentaje de descuento debe estar entre 1 y 99.' using errcode = 'PLU01';
  end if;

  if v_kind = 'fixed_price' then
    if v_fixed_price is null or v_fixed_price <= 0 or v_fixed_price > 10000000 then
      raise exception 'El precio promocional es inválido.' using errcode = 'PLU01';
    end if;
    if v_applies = 'both' then
      raise exception 'Un código con precio promocional necesita un alcance único: afiliación, inscripción o combo.'
        using errcode = 'PLU01';
    end if;
  end if;

  if v_id is not null then
    select * into v_result from public.discount_codes
    where id = v_id and organization_id = v_organization_id
    for update;
    if not found then
      raise exception 'El código no existe.' using errcode = 'PLU02';
    end if;
    v_before := to_jsonb(v_result);

    update public.discount_codes
    set code = v_code_text,
        description = nullif(trim(p_code ->> 'description'), ''),
        kind = v_kind,
        percent_off = v_percent,
        fixed_price = v_fixed_price,
        applies_to = v_applies,
        max_redemptions = v_max_redemptions,
        expires_at = v_expires,
        active = v_active,
        manual_channels = v_manual_channels,
        updated_at = now()
    where id = v_id
    returning * into v_result;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.updated', 'discount_code', v_result.id::text, 'staff', p_actor,
      jsonb_build_object('before', v_before, 'after', to_jsonb(v_result)), v_organization_id
    );
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, percent_off, fixed_price, applies_to,
        max_redemptions, expires_at, active, manual_channels
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_percent, v_fixed_price, v_applies, v_max_redemptions, v_expires,
        v_active, v_manual_channels
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Ya existe un código con ese nombre.' using errcode = 'PLU13';
    end;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.created', 'discount_code', v_result.id::text, 'staff', p_actor,
      to_jsonb(v_result), v_organization_id
    );
  end if;

  return to_jsonb(v_result);
end;
$$;

revoke all on function public.staff_upsert_discount_code(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_discount_code(jsonb, text)
  to service_role;

create or replace function public.staff_get_pricing_configuration()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plans', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.family_code, p.version desc)
      from public.membership_plans p
      where p.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'slug', e.slug,
          'title', e.title,
          'registrationPrice', e.price,
          'registrationManualPrice', e.manual_price,
          'currency', e.currency,
          'status', e.status,
          'published', e.published,
          'comboOffer', case when o.id is null then null else
            jsonb_build_object(
              'id', o.id,
              'membershipPlanId', o.membership_plan_id,
              'price', o.price,
              'manualPrice', o.manual_price,
              'currency', o.currency,
              'active', o.active,
              'startsAt', o.starts_at,
              'endsAt', o.ends_at,
              'updatedAt', o.updated_at
            )
          end
        ) order by e.starts_at
      )
      from public.events e
      left join public.event_combo_offers o on o.event_id = e.id
      where e.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb),
    'discountCodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'code', c.code,
          'description', c.description,
          'kind', c.kind,
          'percentOff', c.percent_off,
          'fixedPrice', c.fixed_price,
          'appliesTo', c.applies_to,
          'maxRedemptions', c.max_redemptions,
          'expiresAt', c.expires_at,
          'active', c.active,
          'manualChannels', to_jsonb(c.manual_channels),
          'enablesManualPayment', c.enables_manual_payment,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'redeemedCount', (
            select count(*) from public.discount_code_redemptions r
            where r.discount_code_id = c.id
          )
        ) order by c.created_at desc
      )
      from public.discount_codes c
      where c.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Preview: informa qué canales destraba, para que el checkout muestre
--    exactamente esos medios y no los tres.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_preview_discount_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text,
  p_applies_to text,
  p_base_amount int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code public.discount_codes;
  v_discount int;
  v_already_redeemed boolean;
begin
  select * into v_code from public.discount_codes
  where organization_id = p_organization_id and code = upper(trim(p_code));
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if not v_code.active then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if v_code.applies_to not in (p_applies_to, 'both') then
    return jsonb_build_object('valid', false, 'reason', 'not_applicable');
  end if;
  if v_code.max_redemptions is not null
     and (select count(*) from public.discount_code_redemptions where discount_code_id = v_code.id)
         >= v_code.max_redemptions then
    return jsonb_build_object('valid', false, 'reason', 'limit_reached');
  end if;

  select exists(
    select 1 from public.discount_code_redemptions
    where discount_code_id = v_code.id and athlete_id = p_athlete_id
  ) into v_already_redeemed;
  if v_already_redeemed then
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;

  v_discount := plu_private.resolve_discount_amount(
    p_base_amount, v_code.kind, v_code.percent_off, v_code.fixed_price
  )::int;
  if v_discount <= 0 or v_discount >= p_base_amount then
    return jsonb_build_object('valid', false, 'reason', 'no_savings');
  end if;

  return jsonb_build_object(
    'valid', true,
    'code', v_code.code,
    'kind', v_code.kind,
    'percentOff', v_code.percent_off,
    'fixedPrice', v_code.fixed_price,
    'discountAmount', v_discount,
    'finalAmount', p_base_amount - v_discount,
    'manualChannels', to_jsonb(v_code.manual_channels),
    'enablesManualPayment', v_code.enables_manual_payment
  );
end;
$$;

revoke all on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  from public, anon, authenticated;
grant execute on function public.athlete_preview_discount_code(uuid, uuid, text, text, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes'
      and column_name = 'manual_channels'
  ) then
    raise exception 'Falta la lista de canales por código.' using errcode = 'PLU01';
  end if;

  -- El booleano viejo tiene que seguir existiendo y derivarse de la lista, no
  -- guardarse aparte.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'discount_codes'
      and column_name = 'enables_manual_payment' and is_generated = 'ALWAYS'
  ) then
    raise exception 'enables_manual_payment debe ser una columna generada.' using errcode = 'PLU01';
  end if;

  if exists (
    select 1 from public.discount_codes
    where not (manual_channels <@ array['bank_transfer', 'cash_pitbull']::text[])
  ) then
    raise exception 'Hay códigos con canales de pago inválidos.' using errcode = 'PLU01';
  end if;
end
$verification$;
