-- Campañas promocionales + canje universal — PLU ARG
--
-- Una campaña describe la experiencia y el destino; discount_codes conserva
-- el contrato económico que las órdenes ya validan. Esta separación permite
-- varios códigos por campaña sin duplicar páginas ni alterar el ledger.

create table if not exists public.promotion_campaigns (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  slug text not null,
  name text not null,
  description text,
  objective text not null check (objective in ('discount', 'fixed_price', 'access', 'exclusive_offer')),
  status text not null default 'active' check (status in ('draft', 'scheduled', 'active', 'paused', 'expired', 'archived')),
  visibility text not null default 'secret' check (visibility in ('public', 'secret', 'private')),
  destination_kind text not null default 'stay' check (destination_kind in ('stay', 'membership_checkout', 'event_checkout', 'account_offer')),
  event_id uuid references public.events(id) on delete set null,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_campaigns_org_slug_uidx unique (organization_id, slug),
  constraint promotion_campaigns_window_check check (
    starts_at is null or expires_at is null or expires_at > starts_at
  )
);

create index if not exists promotion_campaigns_org_status_idx
  on public.promotion_campaigns(organization_id, status, visibility);

create table if not exists public.promotion_campaign_benefits (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campaign_id uuid not null references public.promotion_campaigns(id) on delete cascade,
  benefit_type text not null check (benefit_type in ('percent_discount', 'fixed_price', 'combo_access', 'membership_registration')),
  event_id uuid references public.events(id) on delete set null,
  percent_off int check (percent_off is null or percent_off between 1 and 99),
  fixed_price int check (fixed_price is null or fixed_price > 0),
  fixed_price_manual int check (fixed_price_manual is null or fixed_price_manual > 0),
  currency text not null default 'ARS',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_campaign_benefits_campaign_uidx unique (campaign_id)
);

alter table public.discount_codes
  add column if not exists campaign_id uuid references public.promotion_campaigns(id) on delete set null;

create index if not exists discount_codes_campaign_idx
  on public.discount_codes(organization_id, campaign_id)
  where archived_at is null;

create table if not exists public.promotion_campaign_events (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  campaign_id uuid references public.promotion_campaigns(id) on delete set null,
  discount_code_id uuid references public.discount_codes(id) on delete set null,
  athlete_id uuid references public.athletes(id) on delete set null,
  event_type text not null check (event_type in ('resolved', 'rejected', 'unlocked')),
  surface text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists promotion_campaign_events_funnel_idx
  on public.promotion_campaign_events(organization_id, campaign_id, event_type, created_at desc);

alter table public.promotion_campaigns enable row level security;
alter table public.promotion_campaign_benefits enable row level security;
alter table public.promotion_campaign_events enable row level security;
revoke all on public.promotion_campaigns from public, anon, authenticated;
revoke all on public.promotion_campaign_benefits from public, anon, authenticated;
revoke all on public.promotion_campaign_events from public, anon, authenticated;
grant select, insert, update, delete on public.promotion_campaigns to service_role;
grant select, insert, update, delete on public.promotion_campaign_benefits to service_role;
grant select, insert, update, delete on public.promotion_campaign_events to service_role;

-- Traducción única entre el código legado y su campaña. El código sigue
-- cobrando; la campaña describe qué experiencia abre y cómo medirla.
create or replace function plu_private.sync_discount_code_campaign()
returns trigger
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_campaign_id uuid := coalesce(new.campaign_id, new.id);
  v_objective text;
  v_benefit_type text;
  v_status text;
  v_visibility text;
  v_destination text;
begin
  v_objective := case new.kind
    when 'offer' then 'exclusive_offer'
    when 'access' then 'access'
    when 'fixed_price' then 'fixed_price'
    else 'discount'
  end;
  v_benefit_type := case new.kind
    when 'offer' then 'membership_registration'
    when 'access' then 'combo_access'
    when 'fixed_price' then 'fixed_price'
    else 'percent_discount'
  end;
  v_status := case
    when new.archived_at is not null then 'archived'
    when not new.active then 'paused'
    when new.expires_at is not null and new.expires_at < now() then 'expired'
    when new.starts_at is not null and new.starts_at > now() then 'scheduled'
    else 'active'
  end;
  v_visibility := case when new.audience = 'public' then 'public' else 'secret' end;
  v_destination := case
    when new.kind = 'offer' then 'account_offer'
    when new.applies_to = 'membership' then 'membership_checkout'
    when new.applies_to in ('registration', 'combo') then 'event_checkout'
    else 'stay'
  end;

  insert into public.promotion_campaigns(
    id, organization_id, slug, name, description, objective, status,
    visibility, destination_kind, event_id, starts_at, expires_at
  ) values (
    v_campaign_id,
    new.organization_id,
    lower(new.code) || '-' || left(new.id::text, 8),
    coalesce(nullif(trim(new.description), ''), new.code),
    new.description,
    v_objective,
    v_status,
    v_visibility,
    v_destination,
    new.event_id,
    new.starts_at,
    new.expires_at
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    objective = excluded.objective,
    status = excluded.status,
    visibility = excluded.visibility,
    destination_kind = excluded.destination_kind,
    event_id = excluded.event_id,
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at,
    updated_at = now();

  insert into public.promotion_campaign_benefits(
    organization_id, campaign_id, benefit_type, event_id, percent_off,
    fixed_price, fixed_price_manual, currency, metadata
  ) values (
    new.organization_id,
    v_campaign_id,
    v_benefit_type,
    new.event_id,
    new.percent_off,
    new.fixed_price,
    new.fixed_price_manual,
    'ARS',
    jsonb_build_object(
      'appliesTo', new.applies_to,
      'manualChannels', to_jsonb(coalesce(new.manual_channels, '{}'::text[]))
    )
  )
  on conflict (campaign_id) do update set
    benefit_type = excluded.benefit_type,
    event_id = excluded.event_id,
    percent_off = excluded.percent_off,
    fixed_price = excluded.fixed_price,
    fixed_price_manual = excluded.fixed_price_manual,
    metadata = excluded.metadata,
    updated_at = now();

  new.campaign_id := v_campaign_id;
  return new;
end;
$$;

-- Backfill idempotente: usar el UUID del código permite enlazar sin tabla
-- temporal y deja abierta la posibilidad de mover otros códigos a la misma
-- campaña más adelante.
insert into public.promotion_campaigns(
  id, organization_id, slug, name, description, objective, status,
  visibility, destination_kind, event_id, starts_at, expires_at, created_at, updated_at
)
select
  c.id,
  c.organization_id,
  lower(c.code) || '-' || left(c.id::text, 8),
  coalesce(nullif(trim(c.description), ''), c.code),
  c.description,
  case c.kind when 'offer' then 'exclusive_offer' when 'access' then 'access' when 'fixed_price' then 'fixed_price' else 'discount' end,
  case when c.archived_at is not null then 'archived' when not c.active then 'paused' when c.expires_at is not null and c.expires_at < now() then 'expired' when c.starts_at is not null and c.starts_at > now() then 'scheduled' else 'active' end,
  case when c.audience = 'public' then 'public' else 'secret' end,
  case when c.kind = 'offer' then 'account_offer' when c.applies_to = 'membership' then 'membership_checkout' when c.applies_to in ('registration', 'combo') then 'event_checkout' else 'stay' end,
  c.event_id,
  c.starts_at,
  c.expires_at,
  c.created_at,
  c.updated_at
from public.discount_codes c
on conflict (id) do nothing;

update public.discount_codes set campaign_id = id where campaign_id is null;

insert into public.promotion_campaign_benefits(
  organization_id, campaign_id, benefit_type, event_id, percent_off,
  fixed_price, fixed_price_manual, currency, metadata
)
select
  c.organization_id,
  c.campaign_id,
  case c.kind when 'offer' then 'membership_registration' when 'access' then 'combo_access' when 'fixed_price' then 'fixed_price' else 'percent_discount' end,
  c.event_id,
  c.percent_off,
  c.fixed_price,
  c.fixed_price_manual,
  'ARS',
  jsonb_build_object('appliesTo', c.applies_to, 'manualChannels', to_jsonb(coalesce(c.manual_channels, '{}'::text[])))
from public.discount_codes c
where c.campaign_id is not null
on conflict (campaign_id) do nothing;

drop trigger if exists discount_codes_campaign_sync on public.discount_codes;
create trigger discount_codes_campaign_sync
before insert or update of code, description, kind, audience, applies_to, event_id,
  percent_off, fixed_price, fixed_price_manual, manual_channels, starts_at,
  expires_at, active, archived_at
on public.discount_codes
for each row execute function plu_private.sync_discount_code_campaign();

-- La ficha privada consume la misma campaña que el resolvedor. Se conserva
-- todo el payload histórico para no romper checkouts ya desplegados.
create or replace function plu_private.offer_code_payload(
  p_code public.discount_codes,
  p_athlete_id uuid
)
returns jsonb
language sql
stable
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'id', p_code.id,
    'code', p_code.code,
    'description', p_code.description,
    'kind', p_code.kind,
    'appliesTo', p_code.applies_to,
    'fixedPrice', p_code.fixed_price,
    'fixedPriceManual', p_code.fixed_price_manual,
    'manualChannels', to_jsonb(p_code.manual_channels),
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'active', p_code.active,
    'maxRedemptions', p_code.max_redemptions,
    'redeemedCount', usage.redeemed_count,
    'remaining', case when p_code.max_redemptions is null then null else greatest(0, p_code.max_redemptions - usage.redeemed_count) end,
    'redeemed', usage.redeemed,
    'campaign', case when pc.id is null then null else jsonb_build_object(
      'id', pc.id, 'slug', pc.slug, 'name', pc.name,
      'description', pc.description, 'objective', pc.objective,
      'visibility', pc.visibility, 'status', pc.status
    ) end,
    'benefit', case when pb.id is null then null else jsonb_build_object(
      'type', pb.benefit_type, 'percentOff', pb.percent_off,
      'fixedPrice', pb.fixed_price, 'fixedPriceManual', pb.fixed_price_manual,
      'currency', pb.currency
    ) end,
    'event', case when e.id is null then null else jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title, 'startsAt', e.starts_at,
      'status', e.status, 'registrationPrice', e.price,
      'registrationManualPrice', e.manual_price, 'currency', e.currency
    ) end,
    'comboOffer', case when o.id is null then null else jsonb_build_object(
      'id', o.id, 'price', o.price, 'manualPrice', o.manual_price,
      'currency', o.currency, 'active', o.active, 'audience', o.audience,
      'startsAt', o.starts_at, 'endsAt', o.ends_at
    ) end,
    'membershipPlan', case when pl.id is null then null else jsonb_build_object(
      'id', pl.id, 'code', pl.code, 'name', pl.name, 'price', pl.price,
      'manualPrice', pl.manual_price, 'currency', pl.currency
    ) end
  )
  from (select
    count(*)::int as redeemed_count,
    exists (
      select 1 from public.discount_code_redemptions own
      where own.discount_code_id = p_code.id and own.athlete_id = p_athlete_id
    ) as redeemed
    from public.discount_code_redemptions all_uses
    where all_uses.discount_code_id = p_code.id
  ) usage
  left join public.promotion_campaigns pc on pc.id = p_code.campaign_id
  left join public.promotion_campaign_benefits pb on pb.campaign_id = pc.id
  left join public.events e on e.id = p_code.event_id
  left join public.event_combo_offers o on o.event_id = e.id and o.archived_at is null
  left join public.membership_plans pl on pl.id = o.membership_plan_id;
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

-- Resolvedor universal. No recibe importe ni confirma pagos: clasifica el
-- código y, cuando es una llave, delega el unlock a la RPC canónica existente.
create or replace function public.athlete_redeem_promotion_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_code public.discount_codes;
  v_campaign public.promotion_campaigns;
  v_candidate text := upper(trim(coalesce(p_code, '')));
  v_surface text := nullif(trim(coalesce(p_context->>'surface', '')), '');
  v_redeemed int := 0;
  v_unlock jsonb;
  v_action text;
  v_destination jsonb;
  v_result jsonb;
begin
  select * into v_code
  from public.discount_codes
  where organization_id = p_organization_id
    and code = v_candidate
    and archived_at is null;

  if not found then
    insert into public.promotion_campaign_events(
      organization_id, athlete_id, event_type, surface, reason
    ) values (p_organization_id, p_athlete_id, 'rejected', v_surface, 'not_found');
    return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'code', v_candidate);
  end if;

  select * into v_campaign from public.promotion_campaigns where id = v_code.campaign_id;

  if not v_code.active then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'inactive');
  elsif v_code.starts_at is not null and v_code.starts_at > now() then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'not_started', 'startsAt', v_code.starts_at);
  elsif v_code.expires_at is not null and v_code.expires_at < now() then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'expired');
  elsif not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
    v_result := jsonb_build_object('status', 'rejected', 'reason', 'not_invited');
  else
    if v_code.max_redemptions is not null then
      select count(*) into v_redeemed
      from public.discount_code_redemptions where discount_code_id = v_code.id;
    end if;
    if v_code.max_redemptions is not null and v_redeemed >= v_code.max_redemptions then
      v_result := jsonb_build_object('status', 'rejected', 'reason', 'limit_reached');
    end if;
  end if;

  if v_result is not null then
    insert into public.promotion_campaign_events(
      organization_id, campaign_id, discount_code_id, athlete_id,
      event_type, surface, reason
    ) values (
      p_organization_id, v_code.campaign_id, v_code.id, p_athlete_id,
      'rejected', v_surface, v_result->>'reason'
    );
    return v_result || jsonb_build_object('code', v_code.code);
  end if;

  if v_code.kind in ('offer', 'access') and v_code.event_id is not null then
    v_unlock := public.athlete_unlock_offer_code(p_organization_id, p_athlete_id, v_code.code);
    if not coalesce((v_unlock->>'unlocked')::boolean, false) then
      insert into public.promotion_campaign_events(
        organization_id, campaign_id, discount_code_id, athlete_id,
        event_type, surface, reason
      ) values (
        p_organization_id, v_code.campaign_id, v_code.id, p_athlete_id,
        'rejected', v_surface, coalesce(v_unlock->>'reason', 'not_applicable')
      );
      return jsonb_build_object(
        'status', 'rejected', 'reason', coalesce(v_unlock->>'reason', 'not_applicable'),
        'code', v_code.code
      );
    end if;
    v_action := 'open_exclusive_offer';
    v_destination := jsonb_build_object('view', 'profile', 'tab', 'account-offer');
  else
    v_action := 'apply_to_checkout';
    v_destination := case
      when v_code.applies_to = 'membership' then jsonb_build_object('view', 'profile', 'tab', 'account-membership')
      when v_code.applies_to in ('registration', 'combo') and v_code.event_id is not null then jsonb_build_object(
        'view', 'competition',
        'eventSlug', (select slug from public.events where id = v_code.event_id)
      )
      else jsonb_build_object('view', 'current')
    end;
  end if;

  insert into public.promotion_campaign_events(
    organization_id, campaign_id, discount_code_id, athlete_id,
    event_type, surface, metadata
  ) values (
    p_organization_id, v_code.campaign_id, v_code.id, p_athlete_id,
    'resolved', v_surface,
    jsonb_build_object('action', v_action, 'appliesTo', v_code.applies_to)
  );

  return jsonb_build_object(
    'status', 'accepted',
    'action', v_action,
    'code', v_code.code,
    'kind', v_code.kind,
    'appliesTo', v_code.applies_to,
    'destination', v_destination,
    'campaign', jsonb_build_object(
      'id', v_campaign.id,
      'slug', v_campaign.slug,
      'name', v_campaign.name,
      'description', v_campaign.description,
      'objective', v_campaign.objective,
      'visibility', v_campaign.visibility,
      'status', v_campaign.status
    ),
    'benefit', jsonb_build_object(
      'percentOff', v_code.percent_off,
      'fixedPrice', v_code.fixed_price,
      'fixedPriceManual', v_code.fixed_price_manual,
      'eventId', v_code.event_id,
      'maxRedemptions', v_code.max_redemptions,
      'redeemedCount', v_redeemed,
      'remaining', case when v_code.max_redemptions is null then null else greatest(0, v_code.max_redemptions - v_redeemed) end,
      'expiresAt', v_code.expires_at
    ),
    'offer', v_unlock->'offer'
  );
end;
$$;

revoke all on function public.athlete_redeem_promotion_code(uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.athlete_redeem_promotion_code(uuid, uuid, text, jsonb)
  to service_role;

create or replace function public.staff_simulate_promotion_code(p_code_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select jsonb_build_object(
    'status', case when c.archived_at is not null or not c.active then 'unavailable' else 'ready' end,
    'code', c.code,
    'kind', c.kind,
    'appliesTo', c.applies_to,
    'campaign', jsonb_build_object(
      'id', pc.id, 'name', pc.name, 'objective', pc.objective,
      'visibility', pc.visibility, 'status', pc.status
    ),
    'destination', jsonb_build_object(
      'kind', pc.destination_kind,
      'eventSlug', e.slug,
      'tab', case when pc.destination_kind = 'account_offer' then 'account-offer' when pc.destination_kind = 'membership_checkout' then 'account-membership' else null end
    ),
    'checks', jsonb_build_object(
      'active', c.active,
      'withinWindow', (c.starts_at is null or c.starts_at <= now()) and (c.expires_at is null or c.expires_at >= now()),
      'restrictedCombo', case when c.kind = 'offer' then coalesce(o.active and o.audience = 'code', false) else true end,
      'hasEvent', case when c.kind = 'offer' then c.event_id is not null else true end,
      'hasPrice', case when c.kind in ('offer', 'fixed_price') then c.fixed_price is not null else true end
    )
  )
  from public.discount_codes c
  left join public.promotion_campaigns pc on pc.id = c.campaign_id
  left join public.events e on e.id = c.event_id
  left join public.event_combo_offers o on o.event_id = c.event_id and o.archived_at is null
  where c.id = p_code_id;
$$;

revoke all on function public.staff_simulate_promotion_code(uuid) from public, anon, authenticated;
grant execute on function public.staff_simulate_promotion_code(uuid) to service_role;

create or replace function public.staff_get_promotion_campaign_analytics()
returns jsonb
language sql
stable
security definer
set search_path = public, plu_private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'campaignId', c.campaign_id,
    'codeId', c.id,
    'code', c.code,
    'resolvedCount', coalesce(ev.resolved_count, 0),
    'rejectedCount', coalesce(ev.rejected_count, 0),
    'unlockedCount', coalesce(u.unlocked_count, 0),
    'checkoutCount', coalesce(r.checkout_count, 0),
    'paidCount', coalesce(r.paid_count, 0),
    'revenue', coalesce(r.revenue, 0)
  ) order by c.created_at desc), '[]'::jsonb)
  from public.discount_codes c
  left join lateral (
    select
      count(distinct athlete_id) filter (where event_type = 'resolved') as resolved_count,
      count(*) filter (where event_type = 'rejected') as rejected_count
    from public.promotion_campaign_events e where e.discount_code_id = c.id
  ) ev on true
  left join lateral (
    select count(*) as unlocked_count
    from public.discount_code_unlocks x where x.discount_code_id = c.id
  ) u on true
  left join lateral (
    select
      count(*) as checkout_count,
      count(*) filter (where o.status = 'aprobado') as paid_count,
      coalesce(sum(o.amount) filter (where o.status = 'aprobado'), 0) as revenue
    from public.discount_code_redemptions d
    join public.athlete_payment_orders o on o.id = d.payment_order_id
    where d.discount_code_id = c.id
  ) r on true
  where c.archived_at is null;
$$;

revoke all on function public.staff_get_promotion_campaign_analytics() from public, anon, authenticated;
grant execute on function public.staff_get_promotion_campaign_analytics() to service_role;

do $$
begin
  if to_regprocedure('public.athlete_redeem_promotion_code(uuid,uuid,text,jsonb)') is null then
    raise exception 'Falta el resolvedor universal de campañas.' using errcode = 'PLU01';
  end if;
  if exists (select 1 from public.discount_codes where campaign_id is null) then
    raise exception 'Quedaron códigos sin campaña.' using errcode = 'PLU01';
  end if;
end;
$$;
