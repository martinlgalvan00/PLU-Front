-- Combo financiado — PLU ARG
--
-- El combo con código de acceso (20260827110000) resuelve visibilidad: quién
-- ve la oferta. Faltaba resolver fricción de pago para el mismo caso de uso
-- (código repartido a mano a gente de la que ya se sabe que va a pagar): hoy
-- el checkout obliga a elegir un método de pago igual, aunque el atleta no
-- vaya a pagar en el momento.
--
-- `financed` es un eje aparte de `audience`: un combo puede estar restringido
-- con código y además marcado como financiado, o público y financiado, son
-- ortogonales. Con `financed = true` el frontend deja de mostrarle al atleta
-- el selector de método de pago — la orden se crea igual, en `pendiente`,
-- como cualquier otra, y Finanzas la aprueba después a mano desde el panel de
-- Pagos. No cambia la máquina de estados de pagos ni quién puede aprobar: eso
-- sigue siendo exclusivo de Finanzas (`docs/BUSINESS_RULES.md`).

alter table public.event_combo_offers
  add column if not exists financed boolean not null default false;

create or replace function public.staff_save_event_combo_offer(
  p_event_slug text,
  p_offer jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events;
  v_plan public.membership_plans;
  v_offer public.event_combo_offers;
  v_before jsonb;
  v_price int := nullif(p_offer ->> 'price', '')::int;
  v_manual_price int := nullif(p_offer ->> 'manualPrice', '')::int;
  v_starts timestamptz := nullif(p_offer ->> 'startsAt', '')::timestamptz;
  v_ends timestamptz := nullif(p_offer ->> 'endsAt', '')::timestamptz;
  v_audience text := coalesce(nullif(trim(p_offer ->> 'audience'), ''), 'public');
  v_access_code text := nullif(upper(trim(coalesce(p_offer ->> 'accessCode', ''))), '');
  v_financed boolean := coalesce((p_offer ->> 'financed')::boolean, false);
begin
  select * into v_event from public.events where slug = trim(p_event_slug) for update;
  if not found then
    raise exception 'Evento no encontrado.' using errcode = 'PLU02';
  end if;

  select * into v_plan
  from public.membership_plans
  where id = nullif(p_offer ->> 'membershipPlanId', '')::uuid
    and organization_id = v_event.organization_id;
  if not found or v_plan.collection_mode <> 'one_time' then
    raise exception 'El combo requiere un plan de afiliación de pago único.' using errcode = 'PLU01';
  end if;

  if v_price is null or v_price <= 0 or v_price > 10000000
     or v_price > v_plan.price + v_event.price
     or (v_manual_price is not null and (
       v_manual_price <= 0 or v_manual_price > 10000000
       or v_manual_price > coalesce(v_plan.manual_price, v_plan.price) + coalesce(v_event.manual_price, v_event.price)
     ))
     or (v_starts is not null and v_ends is not null and v_ends < v_starts) then
    raise exception 'La oferta combo es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia del combo es inválida.' using errcode = 'PLU01';
  end if;

  -- Un combo público no conserva el código: dejarlo guardado haría que volver a
  -- restringirlo reviviera en silencio un código que ya se repartió.
  if v_audience = 'public' then
    v_access_code := null;
  else
    if v_access_code is null
       or v_access_code !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
       or length(v_access_code) < 3 or length(v_access_code) > 32 then
      raise exception 'Un combo restringido necesita un código de acceso válido: mayúsculas, números y guiones.'
        using errcode = 'PLU01';
    end if;
  end if;

  select to_jsonb(o) into v_before
  from public.event_combo_offers o where o.event_id = v_event.id;

  insert into public.event_combo_offers(
    organization_id, event_id, membership_plan_id, price, manual_price, currency,
    active, starts_at, ends_at, audience, access_code, financed
  ) values (
    v_event.organization_id, v_event.id, v_plan.id, v_price, v_manual_price, 'ARS',
    coalesce((p_offer ->> 'active')::boolean, false), v_starts, v_ends,
    v_audience, v_access_code, v_financed
  ) on conflict(event_id) do update set
    membership_plan_id = excluded.membership_plan_id,
    price = excluded.price,
    manual_price = excluded.manual_price,
    currency = excluded.currency,
    active = excluded.active,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    audience = excluded.audience,
    access_code = excluded.access_code,
    financed = excluded.financed,
    updated_at = now()
  returning * into v_offer;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'event_combo_offer.upserted', 'event_combo_offer', v_offer.id::text,
    'staff', p_actor,
    -- El código no viaja a la bitácora: la auditoría registra que el combo pasó
    -- a restringido, no el material que se reparte.
    jsonb_build_object(
      'before', (v_before - 'access_code'),
      'after', (to_jsonb(v_offer) - 'access_code'),
      'audience', v_offer.audience,
      'accessCodeSet', v_offer.access_code is not null,
      'financed', v_offer.financed
    ),
    v_event.organization_id
  );

  return to_jsonb(v_offer);
end;
$$;

revoke all on function public.staff_save_event_combo_offer(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_save_event_combo_offer(text, jsonb, text)
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
              'audience', o.audience,
              'accessCode', o.access_code,
              'financed', o.financed,
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
          'audience', c.audience,
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
        and c.archived_at is null
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_combo_offers'
      and column_name = 'financed'
  ) then
    raise exception 'Falta la columna financed de la oferta combo.' using errcode = 'PLU01';
  end if;
end
$verification$;
