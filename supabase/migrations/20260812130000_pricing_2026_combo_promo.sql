-- Precios temporada 2026 + promo combo Pitbull Classic
--
-- Afiliacion one-time: $75.000 (nueva version de plan; no muta filas ligadas a MP)
-- Inscripcion PC: $75.000
-- Combo afiliacion + inscripcion: $120.000 hasta 2026-08-28 23:59:59 ART

do $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_source public.membership_plans;
  v_new public.membership_plans;
  v_event public.events;
  v_version int;
  v_code text;
  v_effective timestamptz := now();
  v_ends timestamptz := timestamptz '2026-08-28 23:59:59-03';
begin
  -- Plan one-time vigente de la familia plu-annual (o el code historico).
  select p.* into v_source
  from public.membership_plans p
  where p.organization_id = v_org
    and p.collection_mode = 'one_time'
    and p.billing_frequency = 'annual'
    and (
      p.family_code = 'plu-annual'
      or p.code = 'plu-annual'
      or p.family_code like 'plu-annual%'
    )
    and p.active = true
    and (p.retired_at is null or p.retired_at > v_effective)
  order by
    case when p.family_code = 'plu-annual' then 0 else 1 end,
    p.version desc
  limit 1;

  if v_source.id is null then
    raise exception 'No hay plan one-time anual para versionar.';
  end if;

  if v_source.price is distinct from 75000 then
    select coalesce(max(version), 0) + 1 into v_version
    from public.membership_plans
    where organization_id = v_org and family_code = v_source.family_code;

    v_code := case
      when v_version = 1 then v_source.family_code
      else v_source.family_code || '-v' || v_version::text
    end;

    insert into public.membership_plans (
      organization_id, family_code, version, code, name, description, price,
      currency, billing_frequency, collection_mode, interval_count, grace_days,
      effective_from, active
    ) values (
      v_org,
      v_source.family_code,
      v_version,
      v_code,
      v_source.name,
      coalesce(v_source.description, 'Afiliacion anual Powerlifting Union Argentina'),
      75000,
      coalesce(v_source.currency, 'ARS'),
      'annual',
      'one_time',
      greatest(coalesce(v_source.interval_count, 1), 1),
      coalesce(v_source.grace_days, 0),
      v_effective,
      true
    )
    returning * into v_new;

    update public.membership_plans
    set retired_at = v_effective,
        active = false,
        updated_at = now()
    where id = v_source.id
      and (retired_at is null or retired_at > v_effective);
  else
    v_new := v_source;
  end if;

  select * into v_event
  from public.events
  where organization_id = v_org and slug = 'pitbull-classic-2026'
  for update;

  if v_event.id is null then
    raise notice 'Evento pitbull-classic-2026 no encontrado; se omite precio/combo.';
    return;
  end if;

  update public.events
  set price = 75000,
      currency = 'ARS',
      rules = coalesce(rules, '{}'::jsonb) || jsonb_build_object(
        'membershipPrice', 75000,
        'comboPrice', 120000
      ),
      updated_at = now()
  where id = v_event.id;

  insert into public.event_combo_offers (
    organization_id, event_id, membership_plan_id, price, currency,
    active, starts_at, ends_at
  ) values (
    v_org, v_event.id, v_new.id, 120000, 'ARS',
    true, v_effective, v_ends
  )
  on conflict (event_id) do update set
    membership_plan_id = excluded.membership_plan_id,
    price = excluded.price,
    currency = excluded.currency,
    active = true,
    starts_at = least(coalesce(public.event_combo_offers.starts_at, excluded.starts_at), excluded.starts_at),
    ends_at = excluded.ends_at,
    updated_at = now();

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values (
    v_org,
    'pricing.promo_2026_applied',
    'event',
    v_event.id::text,
    'system',
    'migration:20260812130000',
    jsonb_build_object(
      'membershipPrice', 75000,
      'registrationPrice', 75000,
      'comboPrice', 120000,
      'comboEndsAt', v_ends,
      'planId', v_new.id,
      'planCode', v_new.code
    )
  );
end;
$$;
