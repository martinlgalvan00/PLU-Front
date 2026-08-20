-- Visibilidad explicita de ofertas combo: publico, restringido y privado.
--
-- `active` sigue expresando si el producto esta operativo. `audience` responde
-- otra pregunta: quien puede descubrirlo. Separar ambos ejes permite preparar
-- o pausar comercialmente un combo sin borrarlo ni fingir que esta apagado.

alter table public.event_combo_offers
  drop constraint if exists event_combo_offers_audience_check;
alter table public.event_combo_offers
  add constraint event_combo_offers_audience_check
  check (audience in ('public', 'code', 'private'));

alter table public.event_combo_offers
  drop constraint if exists event_combo_offers_audience_code_check;
alter table public.event_combo_offers
  add constraint event_combo_offers_audience_code_check
  check (
    (audience = 'code' and access_code is not null)
    or (audience in ('public', 'private') and access_code is null)
  );

comment on column public.event_combo_offers.audience is
  'public: catalogo abierto; code: oculto hasta canje; private: oculto y no canjeable.';

-- Un codigo secreto activo solo puede apuntar a un combo restringido y
-- operativo. La misma guarda corre al reactivar un codigo pausado.
create or replace function plu_private.assert_secret_code_combo_visibility()
returns trigger
language plpgsql
set search_path = public, plu_private
as $$
declare
  v_combo public.event_combo_offers;
begin
  if new.archived_at is null
     and new.active
     and new.kind in ('access', 'offer')
     and new.event_id is not null then
    select * into v_combo
    from public.event_combo_offers
    where event_id = new.event_id and archived_at is null;

    if not found or not v_combo.active or v_combo.audience <> 'code' then
      raise exception 'El codigo secreto requiere un combo habilitado y restringido.'
        using errcode = 'PLU01';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists discount_codes_secret_combo_visibility on public.discount_codes;
create trigger discount_codes_secret_combo_visibility
before insert or update of active, kind, event_id, archived_at on public.discount_codes
for each row execute function plu_private.assert_secret_code_combo_visibility();

-- Al volver privado el combo, las llaves sin compra dejan de funcionar y
-- desaparecen de Mi cuenta. Las redenciones ya cobradas se conservan como
-- recibo historico; no se borra ningun asiento contable.
create or replace function plu_private.pause_codes_for_private_combo()
returns trigger
language plpgsql
set search_path = public, plu_private
as $$
begin
  if new.audience = 'private' then
    -- `OLD` no existe en INSERT. Mantener la bifurcacion anidada evita
    -- depender del cortocircuito de expresiones booleanas del motor.
    if tg_op = 'INSERT' or old.audience is distinct from new.audience then
    with paused as (
      update public.discount_codes c
      set active = false, updated_at = now()
      where c.organization_id = new.organization_id
        and c.event_id = new.event_id
        and c.applies_to = 'combo'
        and c.kind in ('access', 'offer')
        and c.archived_at is null
        and c.active
      returning c.id
    )
    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    )
    select
      'discount_code.paused_private_combo', 'discount_code', p.id::text,
      'system', 'combo-visibility',
      jsonb_build_object('eventId', new.event_id, 'comboOfferId', new.id),
      new.organization_id
    from paused p;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_combo_offers_pause_private_codes on public.event_combo_offers;
create trigger event_combo_offers_pause_private_codes
after insert or update of audience on public.event_combo_offers
for each row execute function plu_private.pause_codes_for_private_combo();

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
    raise exception 'El combo requiere un plan de afiliacion de pago unico.' using errcode = 'PLU01';
  end if;

  if v_price is null or v_price <= 0 or v_price > 10000000
     or v_price > v_plan.price + v_event.price
     or (v_manual_price is not null and (
       v_manual_price <= 0 or v_manual_price > 10000000
       or v_manual_price > coalesce(v_plan.manual_price, v_plan.price)
         + coalesce(v_event.manual_price, v_event.price)
     ))
     or (v_starts is not null and v_ends is not null and v_ends < v_starts) then
    raise exception 'La oferta combo es invalida.' using errcode = 'PLU01';
  end if;

  if v_audience not in ('public', 'code', 'private') then
    raise exception 'La visibilidad del combo es invalida.' using errcode = 'PLU01';
  end if;

  if v_audience = 'code' then
    if v_access_code is null
       or v_access_code !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
       or length(v_access_code) < 3 or length(v_access_code) > 32 then
      raise exception 'Un combo restringido necesita un codigo de acceso valido.'
        using errcode = 'PLU01';
    end if;
  else
    -- Publico y privado no conservan llaves viejas que puedan revivir al
    -- cambiar de visibilidad mas adelante.
    v_access_code := null;
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

do $verification$
begin
  if exists (
    select 1 from public.event_combo_offers
    where audience not in ('public', 'code', 'private')
  ) then
    raise exception 'Hay combos con visibilidad invalida.';
  end if;
  if to_regprocedure('public.staff_save_event_combo_offer(text,jsonb,text)') is null then
    raise exception 'Falta staff_save_event_combo_offer.';
  end if;
end;
$verification$;
