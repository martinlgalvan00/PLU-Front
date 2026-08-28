-- El precio de inscripción se cambia rápido y se programa — PLU ARG
--
-- Pedido de operaciones: "poder controlar el precio de afiliaciones e
-- inscripciones muy rápido, y poder establecer que a partir del lunes el
-- precio es tanto".
--
-- La mitad de afiliaciones ya existía: `membership_plans` versiona con
-- `effective_from` / `retired_at` desde 20260810140000, y el catálogo público,
-- el alta de orden y el panel ya respetan la vigencia. Lo que faltaba era del
-- lado de inscripciones: `events.price` / `events.manual_price` son columnas
-- planas que sólo se tocan guardando el evento ENTERO desde su editor (un
-- upsert que reescribe jornadas y tipos de entrada), sin programación posible.
--
-- Diseño elegido: el precio del evento sigue siendo UNA columna —todos los
-- lectores (catálogo público, checkout, ficha del paquete) quedan intactos— y
-- el cambio programado viaja en tres columnas nuevas que un barrido de pg_cron
-- aplica cuando llega la fecha. No se versiona el precio del evento como el de
-- los planes a propósito: los tres RPC del checkout, el catálogo y el trigger
-- atómico leen `events.price` hoy, y re-emitir toda esa cadena para una tabla
-- de versiones es exactamente el patrón de riesgo que ya mordió a este repo
-- (20260922100000 pisó cuerpos vigentes al copiar de una versión vieja). El
-- historial de cambios queda en `domain_audit_logs`, como el resto del dominio.
--
-- El barrido corre CADA MINUTO (no cada 3, como los vencimientos): un precio
-- que "arranca el lunes 00:00" puede tolerar un minuto de gracia, no tres. Las
-- órdenes ya creadas conservan su cotización: el importe se congela en el
-- INSERT de la orden (20260819190000) y eso no cambia.
--
-- Además: al publicar una nueva versión de un plan, los códigos-paquete que
-- empaquetaban la versión anterior se re-apuntan a la nueva. Sin esto, cada
-- cambio de precio de afiliación rompía todos los códigos de combo vivos: su
-- `membership_plan_id` quedaba apuntando a un plan retirado y el unlock
-- respondía 'offer_unavailable' (la economía del paquete no cambia: su precio
-- es el `fixed_price` del propio código; el plan sólo dice QUÉ afiliación
-- otorga).

-- ---------------------------------------------------------------------------
-- 1. Las tres columnas del cambio programado
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists scheduled_price int,
  add column if not exists scheduled_manual_price int,
  add column if not exists price_effective_at timestamptz;

alter table public.events
  drop constraint if exists events_scheduled_price_positive;
alter table public.events
  add constraint events_scheduled_price_positive
  check (scheduled_price is null or (scheduled_price > 0 and scheduled_price <= 10000000));

alter table public.events
  drop constraint if exists events_scheduled_manual_price_positive;
alter table public.events
  add constraint events_scheduled_manual_price_positive
  check (
    scheduled_manual_price is null
    or (scheduled_manual_price > 0 and scheduled_manual_price <= 10000000)
  );

-- Un cambio programado es la terna completa o nada: una fecha sin precio no
-- programa nada, y un precio sin fecha no espera a nadie. `scheduled_manual_price`
-- puede ser null con fecha puesta — significa "desde esa fecha cobra lo mismo
-- por cualquier canal", igual que un `manual_price` vacío hoy.
alter table public.events
  drop constraint if exists events_price_schedule_shape;
alter table public.events
  add constraint events_price_schedule_shape
  check (
    (price_effective_at is null and scheduled_price is null and scheduled_manual_price is null)
    or (price_effective_at is not null and scheduled_price is not null)
  );

comment on column public.events.scheduled_price is
  'Precio de inscripción (Mercado Pago) que regirá desde price_effective_at. Lo aplica apply_scheduled_event_registration_prices.';
comment on column public.events.scheduled_manual_price is
  'Precio por transferencia/efectivo que regirá desde price_effective_at. Null = desde esa fecha cobra igual que scheduled_price en cualquier canal.';
comment on column public.events.price_effective_at is
  'Cuándo entra a regir el precio programado. Null = no hay cambio pendiente.';

-- ---------------------------------------------------------------------------
-- 2. Cambiar el precio de inscripción, ahora o desde una fecha
--
-- Es el gemelo chico de `staff_create_membership_plan_version`: mismo guard de
-- montos, mismo actor auditado, pero sobre la columna del evento. Sin fecha (o
-- con una fecha ya pasada) aplica en el momento; con fecha futura deja el
-- cambio programado y pisa el que hubiera — un evento tiene A LO SUMO un
-- cambio pendiente, que es como razona quien opera: "a partir del lunes vale
-- tanto".
-- ---------------------------------------------------------------------------

create or replace function public.staff_set_event_registration_price(
  p_event_slug text,
  p_price int,
  p_manual_price int default null,
  p_effective_at timestamptz default null,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_event public.events;
  v_immediate boolean := p_effective_at is null or p_effective_at <= now();
  v_previous_price int;
  v_previous_manual int;
begin
  select * into v_event
  from public.events
  where slug = lower(trim(coalesce(p_event_slug, '')))
    and organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;
  if not found then
    raise exception 'El evento no existe.' using errcode = 'PLU02';
  end if;

  if p_price is null or p_price <= 0 or p_price > 10000000
     or (p_manual_price is not null and (p_manual_price <= 0 or p_manual_price > 10000000)) then
    raise exception 'El precio de inscripción es inválido.' using errcode = 'PLU01';
  end if;

  v_previous_price := v_event.price;
  v_previous_manual := v_event.manual_price;

  if v_immediate then
    update public.events
    set price = p_price,
        manual_price = p_manual_price,
        -- Un cambio inmediato reemplaza también al programado: quien fija el
        -- precio de hoy está decidiendo el precio, no conviviendo con una
        -- programación vieja que lo pisaría después.
        scheduled_price = null,
        scheduled_manual_price = null,
        price_effective_at = null,
        updated_at = now()
    where id = v_event.id
    returning * into v_event;

    perform plu_private.record_domain_audit(
      'event.registration_price_changed', 'event', v_event.id::text,
      'staff', p_actor,
      jsonb_build_object(
        'eventSlug', v_event.slug,
        'previousPrice', v_previous_price,
        'previousManualPrice', v_previous_manual,
        'price', v_event.price,
        'manualPrice', v_event.manual_price,
        'currency', v_event.currency
      ),
      v_event.organization_id
    );
  else
    update public.events
    set scheduled_price = p_price,
        scheduled_manual_price = p_manual_price,
        price_effective_at = p_effective_at,
        updated_at = now()
    where id = v_event.id
    returning * into v_event;

    perform plu_private.record_domain_audit(
      'event.registration_price_scheduled', 'event', v_event.id::text,
      'staff', p_actor,
      jsonb_build_object(
        'eventSlug', v_event.slug,
        'currentPrice', v_previous_price,
        'currentManualPrice', v_previous_manual,
        'scheduledPrice', p_price,
        'scheduledManualPrice', p_manual_price,
        'priceEffectiveAt', p_effective_at,
        'currency', v_event.currency
      ),
      v_event.organization_id
    );
  end if;

  return jsonb_build_object(
    'id', v_event.id,
    'slug', v_event.slug,
    'title', v_event.title,
    'registrationPrice', v_event.price,
    'registrationManualPrice', v_event.manual_price,
    'scheduledPrice', v_event.scheduled_price,
    'scheduledManualPrice', v_event.scheduled_manual_price,
    'priceEffectiveAt', v_event.price_effective_at,
    'currency', v_event.currency,
    'applied', v_immediate
  );
end;
$$;

revoke all on function public.staff_set_event_registration_price(text, int, int, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.staff_set_event_registration_price(text, int, int, timestamptz, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Cancelar un cambio programado que todavía no corrió
-- ---------------------------------------------------------------------------

create or replace function public.staff_clear_event_registration_price_schedule(
  p_event_slug text,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_event public.events;
  v_had_schedule boolean;
begin
  select * into v_event
  from public.events
  where slug = lower(trim(coalesce(p_event_slug, '')))
    and organization_id = '00000000-0000-4000-8000-000000000001'::uuid
  for update;
  if not found then
    raise exception 'El evento no existe.' using errcode = 'PLU02';
  end if;

  v_had_schedule := v_event.price_effective_at is not null;

  if v_had_schedule then
    perform plu_private.record_domain_audit(
      'event.registration_price_schedule_cancelled', 'event', v_event.id::text,
      'staff', p_actor,
      jsonb_build_object(
        'eventSlug', v_event.slug,
        'scheduledPrice', v_event.scheduled_price,
        'scheduledManualPrice', v_event.scheduled_manual_price,
        'priceEffectiveAt', v_event.price_effective_at
      ),
      v_event.organization_id
    );

    update public.events
    set scheduled_price = null,
        scheduled_manual_price = null,
        price_effective_at = null,
        updated_at = now()
    where id = v_event.id
    returning * into v_event;
  end if;

  return jsonb_build_object(
    'id', v_event.id,
    'slug', v_event.slug,
    'title', v_event.title,
    'registrationPrice', v_event.price,
    'registrationManualPrice', v_event.manual_price,
    'scheduledPrice', v_event.scheduled_price,
    'scheduledManualPrice', v_event.scheduled_manual_price,
    'priceEffectiveAt', v_event.price_effective_at,
    'currency', v_event.currency,
    'duplicate', not v_had_schedule
  );
end;
$$;

revoke all on function public.staff_clear_event_registration_price_schedule(text, text)
  from public, anon, authenticated;
grant execute on function public.staff_clear_event_registration_price_schedule(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. El barrido que aplica los cambios cuando llega la fecha
--
-- Mismo esqueleto que `expire_financed_payment_orders` (20260923100000):
-- cursor con `for update skip locked`, cada fila en su propia excepción para
-- que un evento roto no frene a los demás, y asiento de auditoría por cambio.
-- ---------------------------------------------------------------------------

create or replace function public.apply_scheduled_event_registration_prices(
  p_now timestamptz default now()
)
returns int
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_event record;
  v_applied int := 0;
begin
  for v_event in
    select id from public.events
    where price_effective_at is not null
      and price_effective_at <= p_now
    for update skip locked
  loop
    begin
      update public.events
      set price = scheduled_price,
          manual_price = scheduled_manual_price,
          scheduled_price = null,
          scheduled_manual_price = null,
          price_effective_at = null,
          updated_at = now()
      where id = v_event.id;

      perform plu_private.record_domain_audit(
        'event.registration_price_applied', 'event', v_event.id::text,
        'system', 'price-schedule',
        (
          select jsonb_build_object(
            'eventSlug', e.slug,
            'price', e.price,
            'manualPrice', e.manual_price,
            'currency', e.currency
          )
          from public.events e where e.id = v_event.id
        )
      );

      v_applied := v_applied + 1;
    exception when others then
      perform plu_private.record_domain_audit(
        'event.registration_price_apply_failed', 'event', v_event.id::text,
        'system', 'price-schedule',
        jsonb_build_object('error', sqlerrm)
      );
    end;
  end loop;

  return v_applied;
end;
$$;

revoke all on function public.apply_scheduled_event_registration_prices(timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_scheduled_event_registration_prices(timestamptz)
  to service_role;

-- Cada minuto y en su propio job (no en el barrido de vencimientos de 3
-- minutos): "a partir del lunes" tolera un minuto de gracia, no tres.
select cron.unschedule(jobid)
from cron.job
where jobname = 'apply-scheduled-event-prices';

select cron.schedule(
  'apply-scheduled-event-prices',
  '* * * * *',
  $$ select public.apply_scheduled_event_registration_prices(now()); $$
);

-- ---------------------------------------------------------------------------
-- 5. Tarifas lee el cambio pendiente (y la fecha del evento)
--
-- Cuerpo de 20260925100000 + los tres campos del cambio programado y
-- `startsAt`, que el bloque de Inscripciones necesita para ordenar y fechar
-- las filas sin volver a pedir el catálogo de eventos.
-- ---------------------------------------------------------------------------

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
          'startsAt', e.starts_at,
          'registrationPrice', e.price,
          'registrationManualPrice', e.manual_price,
          'scheduledPrice', e.scheduled_price,
          'scheduledManualPrice', e.scheduled_manual_price,
          'priceEffectiveAt', e.price_effective_at,
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
              'financingTermDays', o.financing_term_days,
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
          -- Qué afiliación empaqueta el combo. Sin este campo el formulario
          -- de Tarifas abre cada código-paquete con el selector vacío y lo
          -- vuelve a guardar sin elección (20260918100000).
          'membershipPlanId', c.membership_plan_id,
          'eventId', c.event_id,
          'eventSlug', ev.slug,
          'eventTitle', ev.title,
          'maxRedemptions', c.max_redemptions,
          'startsAt', c.starts_at,
          'expiresAt', c.expires_at,
          'active', c.active,
          'manualChannels', to_jsonb(c.manual_channels),
          'mercadoPagoEnabled', c.mercado_pago_enabled,
          'financed', c.financed,
          'financingTermDays', c.financing_term_days,
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

-- ---------------------------------------------------------------------------
-- 6. Versionar un plan re-apunta los códigos-paquete que lo empaquetaban
--
-- Cuerpo de 20260824100000 + el re-apuntado. El paquete de un código de combo
-- cobra SU precio (`fixed_price`); el plan sólo nombra qué afiliación otorga.
-- Retirar el plan viejo sin re-apuntar dejaba cada código vivo respondiendo
-- 'offer_unavailable' en el canje y PLU03 en el checkout — o sea: cambiar el
-- precio de la afiliación rompía todos los acuerdos privados vigentes.
-- ---------------------------------------------------------------------------

create or replace function public.staff_create_membership_plan_version(
  p_plan jsonb,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.membership_plans;
  v_created public.membership_plans;
  v_organization_id uuid := coalesce(
    nullif(p_plan ->> 'organizationId', '')::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );
  v_source_id uuid := nullif(p_plan ->> 'sourcePlanId', '')::uuid;
  v_family_code text := lower(trim(p_plan ->> 'familyCode'));
  v_version int;
  v_code text;
  v_price int := nullif(p_plan ->> 'price', '')::int;
  v_manual_price int := nullif(p_plan ->> 'manualPrice', '')::int;
  v_currency text := upper(coalesce(nullif(trim(p_plan ->> 'currency'), ''), 'ARS'));
  v_frequency text := p_plan ->> 'billingFrequency';
  v_collection text := p_plan ->> 'collectionMode';
  v_interval int := coalesce(nullif(p_plan ->> 'intervalCount', '')::int, 1);
  v_grace int := coalesce(nullif(p_plan ->> 'graceDays', '')::int, 0);
  v_effective timestamptz := coalesce(nullif(p_plan ->> 'effectiveFrom', '')::timestamptz, now());
  v_retires timestamptz := nullif(p_plan ->> 'retiresAt', '')::timestamptz;
  v_repointed int := 0;
begin
  if v_source_id is not null then
    select * into v_source
    from public.membership_plans
    where id = v_source_id and organization_id = v_organization_id
    for update;
    if not found then
      raise exception 'El plan de origen no existe.' using errcode = 'PLU02';
    end if;
    v_family_code := v_source.family_code;
  end if;

  if v_family_code is null or v_family_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or coalesce(length(trim(p_plan ->> 'name')), 0) < 3
     or v_price is null or v_price <= 0 or v_price > 10000000
     or (v_manual_price is not null and (v_manual_price <= 0 or v_manual_price > 10000000))
     or v_currency <> 'ARS'
     or v_frequency not in ('monthly', 'annual')
     or v_collection not in ('one_time', 'recurring')
     or v_interval < 1 or v_interval > 24
     or v_grace < 0 or v_grace > 90 then
    raise exception 'Los datos del plan son inválidos.' using errcode = 'PLU01';
  end if;

  if v_retires is not null and v_retires <= v_effective then
    raise exception 'La fecha de corte debe ser posterior a la vigencia.' using errcode = 'PLU01';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.membership_plans
  where organization_id = v_organization_id and family_code = v_family_code;

  v_code := case when v_version = 1 then v_family_code
    else v_family_code || '-v' || v_version::text end;

  insert into public.membership_plans(
    organization_id, family_code, version, code, name, description, price, manual_price,
    currency, billing_frequency, collection_mode, interval_count, grace_days,
    effective_from, retired_at, active
  ) values (
    v_organization_id, v_family_code, v_version, v_code,
    trim(p_plan ->> 'name'), nullif(trim(p_plan ->> 'description'), ''),
    v_price, v_manual_price, v_currency, v_frequency, v_collection, v_interval, v_grace,
    v_effective, v_retires, true
  ) returning * into v_created;

  if v_source.id is not null then
    update public.membership_plans
    set retired_at = v_effective, updated_at = now()
    where id = v_source.id;

    -- Los códigos-paquete que empaquetaban la versión retirada pasan a la
    -- nueva. Su economía no cambia (cobran su propio fixed_price): sólo se
    -- actualiza QUÉ fila de plan otorga la afiliación, para que el canje y el
    -- checkout no rechacen un acuerdo vigente por un plan retirado. Se
    -- re-apuntan también los pausados: si staff los vuelve a prender, tienen
    -- que apuntar al plan que rige.
    update public.discount_codes
    set membership_plan_id = v_created.id,
        updated_at = now()
    where organization_id = v_organization_id
      and membership_plan_id = v_source.id
      and archived_at is null;
    get diagnostics v_repointed = row_count;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'membership_plan.version_created', 'membership_plan', v_created.id::text,
    'staff', p_actor,
    jsonb_build_object(
      'sourcePlanId', v_source.id,
      'familyCode', v_created.family_code,
      'version', v_created.version,
      'price', v_created.price,
      'manualPrice', v_created.manual_price,
      'currency', v_created.currency,
      'effectiveFrom', v_created.effective_from,
      'retiresAt', v_created.retired_at,
      'repointedDiscountCodes', v_repointed
    ),
    v_organization_id
  );

  return to_jsonb(v_created);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Verificación
-- ---------------------------------------------------------------------------

do $verification$
declare
  v_def text;
begin
  if to_regprocedure('public.staff_set_event_registration_price(text,int,int,timestamptz,text)') is null then
    raise exception 'Falta staff_set_event_registration_price.';
  end if;
  if to_regprocedure('public.staff_clear_event_registration_price_schedule(text,text)') is null then
    raise exception 'Falta staff_clear_event_registration_price_schedule.';
  end if;
  if to_regprocedure('public.apply_scheduled_event_registration_prices(timestamptz)') is null then
    raise exception 'Falta apply_scheduled_event_registration_prices.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events'
      and column_name in ('scheduled_price', 'scheduled_manual_price', 'price_effective_at')
    having count(*) = 3
  ) then
    raise exception 'Faltan las columnas del cambio de precio programado.';
  end if;

  if not exists (select 1 from cron.job where jobname = 'apply-scheduled-event-prices') then
    raise exception 'El barrido de precios programados no quedó agendado.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'staff_get_pricing_configuration';
  if v_def not like '%scheduledPrice%' or v_def not like '%priceEffectiveAt%' then
    raise exception 'Tarifas no lee el cambio de precio pendiente.';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'staff_create_membership_plan_version';
  if v_def not like '%membership_plan_id = v_created.id%' then
    raise exception 'Versionar un plan sigue rompiendo los códigos-paquete que lo empaquetan.';
  end if;
end
$verification$;
