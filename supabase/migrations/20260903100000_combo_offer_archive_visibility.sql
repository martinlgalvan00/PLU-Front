-- Baja y visibilidad canonica de ofertas combo
--
-- Una oferta usada no se puede borrar fisicamente sin romper su historial de
-- ordenes. La baja pasa a ser siempre efectiva para el producto: borra si no
-- tuvo actividad y archiva si debe conservar respaldo contable. En ambos casos
-- desaparece del panel, del catalogo publico y de las ofertas del atleta.

alter table public.event_combo_offers
  add column if not exists archived_at timestamptz;

create index if not exists event_combo_offers_visible_idx
  on public.event_combo_offers (organization_id, active, starts_at, ends_at)
  where archived_at is null;

drop policy if exists event_combo_offers_public_read on public.event_combo_offers;
create policy event_combo_offers_public_read
  on public.event_combo_offers for select
  to anon, authenticated
  using (
    archived_at is null
    and active = true
    and audience = 'public'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

-- staff_save_event_combo_offer hace un upsert sobre event_id. Si habia una
-- baja archivada, ese upsert es una nueva publicacion y debe revivir la fila.
create or replace function plu_private.unarchive_combo_offer_on_resave()
returns trigger
language plpgsql
set search_path = public, plu_private
as $$
begin
  if old.archived_at is not null
     and new.archived_at = old.archived_at
     and new.updated_at > old.updated_at then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists event_combo_offers_unarchive_on_resave on public.event_combo_offers;
create trigger event_combo_offers_unarchive_on_resave
before update on public.event_combo_offers
for each row execute function plu_private.unarchive_combo_offer_on_resave();

create or replace function public.staff_delete_event_combo_offer(
  p_event_slug text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_event public.events;
  v_offer public.event_combo_offers;
  v_order_count int := 0;
begin
  select * into v_event from public.events
  where organization_id = v_org and slug = btrim(coalesce(p_event_slug, ''));
  if not found then
    raise exception 'El torneo seleccionado no existe.' using errcode = 'PLU02';
  end if;

  select * into v_offer from public.event_combo_offers
  where event_id = v_event.id and archived_at is null for update;
  if not found then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  select count(*) into v_order_count
  from public.athlete_payment_orders o
  where o.concept = 'combo'
    and o.organization_id = v_org
    and exists (
      select 1 from public.event_registrations r
      where r.payment_order_id = o.id and r.event_id = v_event.id
    );

  -- Sin combo no hay alcance valido para estos codigos. Se archivan junto a
  -- la oferta para que tampoco queden fichas privadas o llaves huerfanas.
  update public.discount_codes
  set archived_at = now(), active = false, updated_at = now()
  where organization_id = v_org
    and event_id = v_event.id
    and applies_to = 'combo'
    and archived_at is null;

  if v_order_count > 0 then
    update public.event_combo_offers
    set archived_at = now(), active = false, updated_at = now()
    where id = v_offer.id
    returning * into v_offer;

    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'event_combo_offer.archived', 'event_combo_offer', v_offer.id::text,
      'staff', p_actor,
      jsonb_build_object('eventSlug', v_event.slug, 'orderCount', v_order_count), v_org
    );

    return jsonb_build_object(
      'deleted', true, 'archived', true, 'id', v_offer.id, 'orderCount', v_order_count
    );
  end if;

  delete from public.event_combo_offers where id = v_offer.id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'event_combo_offer.deleted', 'event_combo_offer', v_offer.id::text,
    'staff', p_actor, to_jsonb(v_offer), v_org
  );

  return jsonb_build_object('deleted', true, 'archived', false, 'id', v_offer.id);
end;
$$;

revoke all on function public.staff_delete_event_combo_offer(text, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_event_combo_offer(text, text)
  to service_role;

-- El panel conserva las ofertas apagadas para poder reactivarlas, pero una
-- baja archivada ya no es una configuracion editable y no se lista.
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
      left join public.event_combo_offers o
        on o.event_id = e.id and o.archived_at is null
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
          'fixedPriceManual', c.fixed_price_manual,
          'appliesTo', c.applies_to,
          'eventId', c.event_id,
          'eventSlug', ev.slug,
          'eventTitle', ev.title,
          'maxRedemptions', c.max_redemptions,
          'startsAt', c.starts_at,
          'expiresAt', c.expires_at,
          'active', c.active,
          'manualChannels', to_jsonb(c.manual_channels),
          'enablesManualPayment', c.enables_manual_payment,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'invitees', coalesce((
            select jsonb_agg(i.email order by i.email)
            from public.discount_code_invitations i
            where i.discount_code_id = c.id
          ), '[]'::jsonb),
          'redeemedCount', (
            select count(*) from public.discount_code_redemptions r
            where r.discount_code_id = c.id
          ),
          'unlockedCount', (
            select count(*) from public.discount_code_unlocks u
            where u.discount_code_id = c.id
          )
        ) order by c.created_at desc
      )
      from public.discount_codes c
      left join public.events ev on ev.id = c.event_id
      where c.organization_id = '00000000-0000-4000-8000-000000000001'::uuid
        and c.archived_at is null
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.staff_get_pricing_configuration()
  from public, anon, authenticated;
grant execute on function public.staff_get_pricing_configuration() to service_role;

-- Una baja tampoco debe sobrevivir en la pestaña privada de ofertas.
create or replace function public.athlete_list_offer_unlocks(
  p_organization_id uuid,
  p_athlete_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select coalesce(
    jsonb_agg(
      plu_private.offer_code_payload(c, p_athlete_id)
      order by u.unlocked_at desc
    ),
    '[]'::jsonb
  )
  from public.discount_code_unlocks u
  join public.discount_codes c on c.id = u.discount_code_id
  join public.event_combo_offers o
    on o.event_id = c.event_id
   and o.archived_at is null
   and o.active
   and (o.starts_at is null or o.starts_at <= now())
   and (o.ends_at is null or o.ends_at >= now())
  where u.athlete_id = p_athlete_id
    and u.organization_id = p_organization_id
    and c.archived_at is null;
$$;

revoke all on function public.athlete_list_offer_unlocks(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.athlete_list_offer_unlocks(uuid, uuid)
  to service_role;

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_combo_offers'
      and column_name = 'archived_at'
  ) then
    raise exception 'Falta archived_at en event_combo_offers.' using errcode = 'PLU01';
  end if;
end
$verification$;
