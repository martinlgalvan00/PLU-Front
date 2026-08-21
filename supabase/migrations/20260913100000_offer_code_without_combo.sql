-- La oferta exclusiva se sostiene sola: un código deja de necesitar un combo — PLU ARG
--
-- Crear una oferta secreta eran tres pantallas y dos objetos. Primero cargar el
-- combo del evento en Precios (plan, precio, ventana, visibilidad Restringido y
-- su propio código de acceso), después crear el código `kind = 'offer'` sobre
-- ese combo, y sólo entonces el atleta podía canjear. El operador lo describió
-- como "todo muy repetitivo", y lo es: de las siete cosas que guarda
-- `event_combo_offers`, seis ya viven en el código —precio, precio manual,
-- moneda, ventana, canales, financiamiento (20260912100000)— y la séptima, QUÉ
-- afiliación se empaqueta, era el único dato que el código no sabía decir.
--
-- Esta migración le da al código ese dato y corta la dependencia en las cinco
-- capas donde estaba atada:
--
--   1. LA GUARDA DEL TRIGGER (`discount_codes_secret_combo_visibility`,
--      20260904100000). La que no se ve leyendo funciones y la que realmente
--      hacía imposible el orden inverso: rechazaba en el INSERT cualquier
--      código secreto activo cuyo evento no tuviera un combo encendido y
--      Restringido. Se relaja sólo para la oferta que trae su propia
--      afiliación.
--
--   2. ALTA (`staff_upsert_discount_code`). Dejaba de guardar con PLU02 si el
--      evento no tenía combo. Ahora resuelve la afiliación del paquete en tres
--      pasos —la que eligió el panel, la del combo si hay combo, la única de
--      pago único vigente— y compara el precio contra un techo real: lo que ese
--      atleta pagaría sin el código. Con combo encendido ese techo es el precio
--      del combo, así que la regla anterior queda intacta.
--
--   3. CANJE (`athlete_unlock_offer_code`). Exigía el combo cargado, encendido
--      y en ventana. Con plan propio la vigencia de la oferta es la del código
--      —que ya se chequea— y lo único que se valida es que la afiliación siga
--      vigente. Sin plan propio (un 'access', que cobra el precio del combo) el
--      combo sigue siendo obligatorio.
--
--   4. FICHA (`athlete_list_offer_unlocks`). Un inner join contra el combo
--      vigente hacía desaparecer de Mi cuenta la oferta canjeada. Ahora la
--      sostiene cualquiera de las dos fuentes del paquete.
--
--   5. COMPRA (`create_membership_registration_combo_order_core`). Leía del
--      combo el plan, el importe y la moneda. Sin combo vigente los toma de la
--      llave que el atleta YA canjeó (`discount_code_unlocks`, la única prueba
--      que el navegador no puede falsificar) y cotiza contra la suma de las
--      partes; el importe promocional lo sigue aplicando
--      `apply_discount_code_to_order` después de crear la orden, igual que
--      sobre un combo. Una orden nunca nace por debajo del precio de lista sin
--      un código que la baje.
--
-- Qué NO cambia:
--
--   * El combo público sigue existiendo y sigue siendo lo que era: un producto
--     del evento, con su precio y su visibilidad. Lo que deja de ser es un paso
--     obligatorio para pactar un precio con una persona.
--   * La contabilidad. `discount_code_redemptions` sigue siendo el registro que
--     consume cupo y el unlock sigue siendo sólo "tengo la llave"
--     (20260902100000).
--   * Las firmas. Las siete funciones que se reemplazan conservan exactamente
--     su firma vigente, así que no hace falta ningún `drop function` (la disciplina
--     de este repo: `create or replace` con firma nueva crea un overload, ya
--     hubo que limpiar dos veces — 20260824120000, 20260824130000). Las dos
--     nuevas nacen con firma propia.

-- ---------------------------------------------------------------------------
-- 1. Esquema: la oferta nombra su paquete
-- ---------------------------------------------------------------------------

alter table public.discount_codes
  add column if not exists membership_plan_id uuid
  references public.membership_plans(id) on delete restrict;

comment on column public.discount_codes.membership_plan_id is
  'Afiliación que empaqueta una oferta exclusiva (kind=offer). Null en el resto de las modalidades: el paquete sale del combo del evento.';

-- Backfill en dos pasos, de la fuente más específica a la más general. Las
-- ofertas que ya existen se quedan con el plan que estaban vendiendo: el del
-- combo de su inscripción.
update public.discount_codes c
set membership_plan_id = o.membership_plan_id,
    updated_at = now()
from public.event_combo_offers o
where o.event_id = c.event_id
  and o.archived_at is null
  and c.kind = 'offer'
  and c.membership_plan_id is null;

-- Una oferta cuyo combo se archivó hereda la afiliación de pago único vigente,
-- y sólo cuando hay exactamente una: con dos candidatas, elegir por nosotros
-- cambiaría qué compró alguien que ya tiene el código en la mano. El bloque de
-- verificación de más abajo corta la migración con el código a la vista.
update public.discount_codes c
set membership_plan_id = pl.id,
    updated_at = now()
from public.membership_plans pl
where c.kind = 'offer'
  and c.membership_plan_id is null
  and pl.organization_id = c.organization_id
  and pl.active
  and pl.collection_mode = 'one_time'
  and pl.effective_from <= now()
  and (pl.retired_at is null or pl.retired_at > now())
  and (
    select count(*) from public.membership_plans p2
    where p2.organization_id = c.organization_id
      and p2.active
      and p2.collection_mode = 'one_time'
      and p2.effective_from <= now()
      and (p2.retired_at is null or p2.retired_at > now())
  ) = 1;

do $backfill$
declare
  v_pending text;
begin
  select string_agg(code, ', ' order by code) into v_pending
  from public.discount_codes
  where kind = 'offer' and membership_plan_id is null;
  if v_pending is not null then
    raise exception 'Estas ofertas no tienen combo cargado y hay más de una afiliación vigente para empaquetar: %. Cargá el combo de su inscripción o dejá una sola afiliación vigente antes de migrar.', v_pending;
  end if;
end
$backfill$;

-- Sólo una oferta con precio propio instancia un paquete. Un 'access' cobra el
-- del combo y un porcentaje no abre nada: dejarles el campo escrito sería
-- guardar una decisión que ninguna pantalla lee.
alter table public.discount_codes drop constraint if exists discount_codes_membership_plan_kind_check;
alter table public.discount_codes
  add constraint discount_codes_membership_plan_kind_check
  check (membership_plan_id is null or kind = 'offer');

-- Y al revés: una oferta sin paquete es la que obligaba a cargar el combo
-- antes. Es el invariante que hace innecesario ese paso.
alter table public.discount_codes drop constraint if exists discount_codes_offer_membership_plan_check;
alter table public.discount_codes
  add constraint discount_codes_offer_membership_plan_check
  check (kind <> 'offer' or membership_plan_id is not null);

create index if not exists discount_codes_membership_plan_idx
  on public.discount_codes(membership_plan_id)
  where membership_plan_id is not null and archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. La guarda que vivía en un trigger
--
-- La quinta capa, y la que no se ve leyendo funciones:
-- `discount_codes_secret_combo_visibility` (20260904100000) rechaza en el INSERT
-- cualquier código secreto activo cuyo evento no tenga un combo encendido y
-- Restringido. Es la que realmente hacía imposible crear la oferta primero.
--
-- Se relaja sólo para la oferta autosuficiente. Para 'access' sigue igual: su
-- precio ES el del combo, y un combo público no tiene nada que destrabar.
--
-- El trigger no se recrea —sigue apuntando a esta función, misma firma— y su
-- lista de columnas tampoco cambia: la escritura del backfill de arriba toca
-- `membership_plan_id`, que no está en ese `update of`, así que no dispara.
-- ---------------------------------------------------------------------------

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
     and new.event_id is not null
     -- Una oferta autosuficiente no depende de ningun combo: trae su propia
     -- afiliacion y su propio precio. Esta guarda era la quinta capa que
     -- obligaba a cargar el combo antes de poder crear el codigo, y la unica
     -- que vivia en un trigger.
     and not (new.kind = 'offer' and new.membership_plan_id is not null) then
    select * into v_combo
    from public.event_combo_offers
    where event_id = new.event_id and archived_at is null;

    -- Sigue valiendo para 'access', que cobra el precio del combo: el combo
    -- tiene que existir, estar operativo y estar restringido -- si fuera
    -- publico, el codigo no destrabaria nada que no este a la vista.
    if not found or not v_combo.active or v_combo.audience <> 'code' then
      raise exception 'El codigo secreto requiere un combo habilitado y restringido.'
        using errcode = 'PLU01';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Borrar un plan: hay una referencia nueva que explicar
--
-- `staff_delete_membership_plan` (20260817125000) limpiaba los combos que
-- apuntaban al plan y contaba las referencias operativas para negarse. La
-- columna nueva agrega una: un código de oferta empaqueta ese plan, y la FK es
-- `on delete restrict` a propósito —borrar el plan de una oferta que alguien
-- tiene en la mano no es limpieza de catálogo—. Sin esta versión, eliminar el
-- plan devolvía un error de FK crudo en vez de decir qué lo está usando.
--
-- Cuerpo idéntico salvo el chequeo nuevo, y misma firma.
-- ---------------------------------------------------------------------------

create or replace function public.staff_delete_membership_plan(
  p_plan_id uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans;
  v_before jsonb;
  v_reference_count int := 0;
  v_combo_count int := 0;
begin
  select * into v_plan
  from public.membership_plans
  where id = p_plan_id
  for update;

  if not found then
    raise exception 'Plan no encontrado.' using errcode = 'PLU02';
  end if;

  v_before := to_jsonb(v_plan);

  select
    (select count(*) from public.memberships where plan_id = p_plan_id)
    + (select count(*) from public.athlete_payment_orders where plan_id = p_plan_id)
    + (select count(*) from public.billing_subscriptions where plan_id = p_plan_id)
    + (select count(*) from public.membership_order_targets where plan_id = p_plan_id)
  into v_reference_count;

  if v_reference_count > 0 then
    raise exception 'No se puede eliminar un plan con afiliaciones, ordenes o suscripciones asociadas.'
      using errcode = 'PLU03';
  end if;

  -- Un código de oferta empaqueta este plan, y su FK es `on delete restrict`:
  -- sin este chequeo el borrado moría con un error de integridad crudo. No se
  -- limpia como el combo -- el combo es configuración del catálogo, la oferta
  -- es un precio pactado con alguien que ya tiene el código en la mano.
  if exists (
    select 1 from public.discount_codes where membership_plan_id = p_plan_id
  ) then
    raise exception 'Hay códigos de oferta que empaquetan este plan. Eliminá esas ofertas o apuntalas a otra afiliación antes de borrarlo.'
      using errcode = 'PLU03';
  end if;

  delete from public.event_combo_offers
  where membership_plan_id = p_plan_id;
  get diagnostics v_combo_count = row_count;

  delete from public.membership_plans
  where id = p_plan_id;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    'membership_plan.deleted',
    'membership_plan',
    p_plan_id::text,
    'staff',
    p_actor,
    jsonb_build_object(
      'before', v_before,
      'referencesChecked', v_reference_count,
      'comboOffersDeleted', v_combo_count
    ),
    v_plan.organization_id
  );

  return jsonb_build_object(
    'deleted', true,
    'planId', p_plan_id,
    'comboOffersDeleted', v_combo_count
  );
end;
$$;

revoke all on function public.staff_delete_membership_plan(uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_delete_membership_plan(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. La llave desbloqueada de un atleta para una inscripción
--
-- UNA definición de "este atleta tiene una oferta autosuficiente vigente para
-- este evento", consultada por el checkout y por el resolvedor de precio que
-- lee Express. Duplicarla dejaría al panel cotizando una cosa y a la RPC
-- cobrando otra.
--
-- No consume nada ni escribe nada: el cupo lo sigue consumiendo la redención.
-- Con dos llaves para el mismo evento gana la última canjeada, que es la que el
-- atleta tiene a la vista en Mi cuenta.
-- ---------------------------------------------------------------------------

create or replace function plu_private.athlete_unlocked_offer_code(
  p_athlete_id uuid,
  p_event_id uuid
)
returns public.discount_codes
language sql
stable
set search_path = public
as $$
  select c.*
  from public.discount_code_unlocks u
  join public.discount_codes c on c.id = u.discount_code_id
  where u.athlete_id = p_athlete_id
    and c.event_id = p_event_id
    and c.kind = 'offer'
    and c.active
    and c.archived_at is null
    and c.membership_plan_id is not null
    and (c.starts_at is null or c.starts_at <= now())
    and (c.expires_at is null or c.expires_at >= now())
  order by u.unlocked_at desc
  limit 1;
$$;

revoke all on function plu_private.athlete_unlocked_offer_code(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Precio del paquete sin combo, para el checkout de Express
--
-- `findEventComboOffer` devuelve null cuando el evento no tiene combo vigente y
-- la ruta contestaba 404. Esta función es su continuación: el mismo paquete,
-- cotizado contra el catálogo, cuando el atleta tiene la llave. Devuelve null
-- —no excepción— porque "no hay paquete" es una respuesta, no un error.
--
-- Con combo vigente devuelve null a propósito: manda el combo, y esta función
-- sólo existe para el caso que antes era un 404.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_event_offer_bundle(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_event_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, plu_private
as $$
declare
  v_event public.events;
  v_code public.discount_codes;
  v_plan public.membership_plans;
begin
  select * into v_event from public.events
  where organization_id = p_organization_id and slug = trim(coalesce(p_event_slug, ''));
  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.event_combo_offers o
    where o.event_id = v_event.id
      and o.archived_at is null
      and o.active
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at >= now())
  ) then
    return null;
  end if;

  v_code := plu_private.athlete_unlocked_offer_code(p_athlete_id, v_event.id);
  if v_code.id is null then
    return null;
  end if;

  select * into v_plan from public.membership_plans
  where id = v_code.membership_plan_id
    and organization_id = p_organization_id
    and active
    and collection_mode = 'one_time'
    and effective_from <= now()
    and (retired_at is null or retired_at > now());
  if not found or upper(v_plan.currency) <> upper(v_event.currency) then
    return null;
  end if;

  -- Precio de lista del paquete, por canal. Es la base contra la que el código
  -- descuenta: el importe final lo fija igual `fixed_price`/`fixed_price_manual`
  -- dentro de la transacción, así que esto no puede abaratar nada — sólo evita
  -- que el ahorro que se anuncia sea distinto del que se cobra.
  return jsonb_build_object(
    'price', v_plan.price + v_event.price,
    'manualPrice', coalesce(v_plan.manual_price, v_plan.price)
      + coalesce(v_event.manual_price, v_event.price),
    'currency', upper(v_event.currency),
    -- Un paquete que sólo existe detrás de una llave nunca es público.
    'audience', 'code',
    -- La llave es el código, no un `access_code` del combo: no hay combo.
    'accessCode', null,
    'financed', v_code.financed,
    'membershipPlanId', v_plan.id,
    'codeId', v_code.id
  );
end;
$$;

revoke all on function public.athlete_event_offer_bundle(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.athlete_event_offer_bundle(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Canje: la vigencia del paquete es la del código
--
-- Cuerpo idéntico a 20260902100000 salvo el bloque de disponibilidad.
-- ---------------------------------------------------------------------------

create or replace function public.athlete_unlock_offer_code(
  p_organization_id uuid,
  p_athlete_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, plu_private
as $$
declare
  v_code public.discount_codes;
  v_candidate text := upper(trim(coalesce(p_code, '')));
  v_redeemed int;
  v_unlock_id uuid;
begin
  if v_candidate = '' then
    return jsonb_build_object('unlocked', false, 'reason', 'not_found');
  end if;

  select * into v_code from public.discount_codes
  where organization_id = p_organization_id
    and code = v_candidate
    and archived_at is null;
  if not found then
    return jsonb_build_object('unlocked', false, 'reason', 'not_found');
  end if;

  -- Sólo las dos modalidades que desbloquean algo. Un porcentaje o un precio
  -- promocional sueltos se aplican en el checkout y no abren ninguna ficha:
  -- ofrecerles un canje sería prometer una pantalla que no existe.
  if v_code.kind not in ('offer', 'access') then
    return jsonb_build_object('unlocked', false, 'reason', 'not_applicable');
  end if;

  -- Un 'access' sin alcance de inscripción es el código legado que destraba
  -- CUALQUIER combo restringido: sirve en el checkout, pero no se puede
  -- convertir en una ficha —no hay evento del que sacar el paquete ni el
  -- precio—. Registrar el unlock dejaría en Mi cuenta una oferta que no se
  -- puede describir ni comprar.
  if v_code.event_id is null then
    return jsonb_build_object('unlocked', false, 'reason', 'not_applicable');
  end if;

  if v_code.starts_at is not null and v_code.starts_at > now() then
    return jsonb_build_object(
      'unlocked', false, 'reason', 'not_started', 'startsAt', v_code.starts_at
    );
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    return jsonb_build_object('unlocked', false, 'reason', 'expired');
  end if;
  if not plu_private.athlete_allowed_by_invitations(v_code.id, p_athlete_id) then
    return jsonb_build_object('unlocked', false, 'reason', 'not_invited');
  end if;

  -- Ya comprada: el unlock se conserva (la ficha muestra la oferta usada) pero
  -- no se vuelve a evaluar cupo ni estado — la compra ya está hecha.
  if exists (
    select 1 from public.discount_code_redemptions
    where discount_code_id = v_code.id and athlete_id = p_athlete_id
  ) then
    insert into public.discount_code_unlocks(organization_id, discount_code_id, athlete_id)
    values (p_organization_id, v_code.id, p_athlete_id)
    on conflict (discount_code_id, athlete_id) do nothing;
    return jsonb_build_object(
      'unlocked', true,
      'alreadyUnlocked', true,
      'offer', plu_private.offer_code_payload(v_code, p_athlete_id)
    );
  end if;

  if not v_code.active then
    return jsonb_build_object('unlocked', false, 'reason', 'inactive');
  end if;
  if v_code.max_redemptions is not null then
    select count(*) into v_redeemed
    from public.discount_code_redemptions where discount_code_id = v_code.id;
    if v_redeemed >= v_code.max_redemptions then
      return jsonb_build_object('unlocked', false, 'reason', 'limit_reached');
    end if;
  end if;

  -- Una oferta que no se puede comprar no se desbloquea: mejor decirlo en el
  -- canje que dejar la ficha ofreciendo algo que el checkout va a rechazar.
  --
  -- De dónde sale el paquete decide qué se valida. Una oferta autosuficiente
  -- nombra su plan y su vigencia es la del código, ya chequeada arriba: alcanza
  -- con que ese plan siga vigente. Una oferta sin plan propio cobra el precio
  -- del combo del evento, así que sigue exigiendo ese combo cargado, encendido
  -- y en ventana. `archived_at` se suma a esa condición: un combo archivado no
  -- se puede vender y antes pasaba el filtro.
  if v_code.kind = 'offer' then
    if v_code.membership_plan_id is not null then
      if not exists (
        select 1 from public.membership_plans pl
        where pl.id = v_code.membership_plan_id
          and pl.organization_id = p_organization_id
          and pl.active
          and pl.collection_mode = 'one_time'
          and pl.effective_from <= now()
          and (pl.retired_at is null or pl.retired_at > now())
      ) then
        return jsonb_build_object('unlocked', false, 'reason', 'offer_unavailable');
      end if;
    elsif not exists (
      select 1 from public.event_combo_offers o
      where o.event_id = v_code.event_id
        and o.archived_at is null
        and o.active
        and (o.starts_at is null or o.starts_at <= now())
        and (o.ends_at is null or o.ends_at >= now())
    ) then
      return jsonb_build_object('unlocked', false, 'reason', 'offer_unavailable');
    end if;
  end if;

  insert into public.discount_code_unlocks(organization_id, discount_code_id, athlete_id)
  values (p_organization_id, v_code.id, p_athlete_id)
  on conflict (discount_code_id, athlete_id) do nothing
  returning id into v_unlock_id;

  -- Sólo el canje nuevo se audita: re-tipear el código no es un evento.
  if v_unlock_id is not null then
    insert into public.domain_audit_logs(
      action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
    ) values (
      'discount_code.unlocked', 'discount_code', v_code.id::text,
      'athlete', p_athlete_id::text,
      jsonb_build_object(
        'code', v_code.code,
        'kind', v_code.kind,
        'eventId', v_code.event_id,
        'fixedPrice', v_code.fixed_price
      ),
      p_organization_id
    );
  end if;

  return jsonb_build_object(
    'unlocked', true,
    'alreadyUnlocked', v_unlock_id is null,
    'offer', plu_private.offer_code_payload(v_code, p_athlete_id)
  );
end;
$$;

revoke all on function public.athlete_unlock_offer_code(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.athlete_unlock_offer_code(uuid, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. La ficha de Mi cuenta sobrevive sin combo
--
-- Cuerpo idéntico a 20260903100000 salvo el join.
-- ---------------------------------------------------------------------------

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
  -- Era un inner join contra el combo vigente: sin combo la ficha desaparecía
  -- de Mi cuenta y el atleta perdía de vista lo que había canjeado. Ahora la
  -- sostiene cualquiera de las dos fuentes del paquete -- el combo del evento o
  -- el plan del propio código -- y no hay ninguna que se sostenga sola.
  left join public.event_combo_offers o
    on o.event_id = c.event_id
   and o.archived_at is null
   and o.active
   and (o.starts_at is null or o.starts_at <= now())
   and (o.ends_at is null or o.ends_at >= now())
  where u.athlete_id = p_athlete_id
    and u.organization_id = p_organization_id
    and c.archived_at is null
    and (
      o.id is not null
      or exists (
        select 1 from public.membership_plans pl
        where pl.id = c.membership_plan_id
          and pl.active
          and pl.collection_mode = 'one_time'
          and pl.effective_from <= now()
          and (pl.retired_at is null or pl.retired_at > now())
      )
    );
$$;

revoke all on function public.athlete_list_offer_unlocks(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.athlete_list_offer_unlocks(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. Payload de la oferta: el plan sale del código
--
-- Cuerpo idéntico a 20260912100000 salvo el join del plan.
-- ---------------------------------------------------------------------------

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
    'mercadoPagoEnabled', p_code.mercado_pago_enabled,
    'financed', p_code.financed,
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'active', p_code.active,
    'maxRedemptions', p_code.max_redemptions,
    'remaining', case
      when p_code.max_redemptions is null then null
      else greatest(0, p_code.max_redemptions - (
        select count(*) from public.discount_code_redemptions r
        where r.discount_code_id = p_code.id
      ))
    end,
    'redeemed', exists (
      select 1 from public.discount_code_redemptions r
      where r.discount_code_id = p_code.id and r.athlete_id = p_athlete_id
    ),
    'purchase', (
      select jsonb_build_object(
        'orderId', po.id,
        'status', po.status,
        'amount', po.amount,
        'currency', po.currency,
        'concept', po.concept,
        'method', po.method,
        'manualPaymentChannel', po.manual_payment_channel,
        'financingAllowed', po.financing_allowed,
        'manualPaymentDeclaredAt', po.manual_payment_declared_at,
        'financedEntitlementsAt', po.financed_entitlements_at,
        'financedEntitlementsRevokedAt', po.financed_entitlements_revoked_at,
        'expiresAt', po.expires_at,
        'createdAt', po.created_at
      )
      from public.discount_code_redemptions r
      join public.athlete_payment_orders po on po.id = r.payment_order_id
      where r.discount_code_id = p_code.id
        and r.athlete_id = p_athlete_id
      order by po.created_at desc
      limit 1
    ),
    'campaign', case when ca.id is null then null else jsonb_build_object(
      'id', ca.id, 'slug', ca.slug, 'name', ca.name,
      'description', ca.description, 'objective', ca.objective,
      'status', ca.status, 'visibility', ca.visibility
    ) end,
    'event', case when e.id is null then null else jsonb_build_object(
      'id', e.id, 'slug', e.slug, 'title', e.title,
      'startsAt', e.starts_at, 'status', e.status,
      'registrationPrice', e.price,
      'registrationManualPrice', e.manual_price,
      'currency', e.currency
    ) end,
    'comboOffer', case when o.id is null then null else jsonb_build_object(
      'id', o.id, 'price', o.price, 'manualPrice', o.manual_price,
      'currency', o.currency, 'active', o.active, 'audience', o.audience,
      'financed', o.financed, 'startsAt', o.starts_at, 'endsAt', o.ends_at
    ) end,
    'membershipPlan', case when pl.id is null then null else jsonb_build_object(
      'id', pl.id, 'code', pl.code, 'name', pl.name,
      'price', pl.price, 'manualPrice', pl.manual_price, 'currency', pl.currency
    ) end
  )
  from (select 1) as anchor
  left join public.promotion_campaigns ca on ca.id = p_code.campaign_id
  left join public.events e on e.id = p_code.event_id
  left join public.event_combo_offers o on o.event_id = e.id and o.archived_at is null
  -- El plan del código gana sobre el del combo: una oferta autosuficiente
  -- nombra su propio paquete y no necesita que el evento tenga combo cargado.
  -- Con `membership_plan_id` nulo -- un 'access', o una oferta creada antes de
  -- esta migración -- sigue saliendo del combo, exactamente como antes.
  left join public.membership_plans pl
    on pl.id = coalesce(p_code.membership_plan_id, o.membership_plan_id);
$$;

revoke all on function plu_private.offer_code_payload(public.discount_codes, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. Compra: el paquete puede venir de la llave
--
-- Cuerpo idéntico a 20260911100000 salvo la resolución del paquete y su
-- importe. Sigue siendo privada incluso para service_role: se llega por el
-- wrapper, que es el que aplica el código.
-- ---------------------------------------------------------------------------

create or replace function public.create_membership_registration_combo_order_core(
  p_athlete_id uuid,
  p_event_slug text,
  p_division text,
  p_category text,
  p_bodyweight_kg numeric,
  p_payment_method text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete public.athletes;
  v_event public.events;
  v_offer public.event_combo_offers;
  v_plan public.membership_plans;
  -- La llave que ya canjeó el atleta, cuando el evento no tiene combo vigente.
  v_offer_code public.discount_codes;
  v_has_combo boolean := false;
  v_bundle_price int;
  v_bundle_currency text;
  v_order public.athlete_payment_orders;
  v_membership public.memberships;
  v_registration public.event_registrations;
  v_pending public.memberships;
  v_existing public.memberships;
  v_same_year public.memberships;
  v_start date;
  v_end date;
  v_year text;
  v_count int;
  v_resume jsonb;
  v_placed jsonb;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Falta una clave de idempotencia valida.' using errcode = 'PLU01';
  end if;
  if p_payment_method not in ('mercado_pago', 'manual_link')
     or p_division not in ('Open', 'Youth', 'Junior', 'Sub-Masters', 'Masters')
     or p_category not in ('Raw', 'Raw With Wraps', 'Single-Ply', 'Multi-Ply', 'Unlimited')
     or (p_bodyweight_kg is not null and (p_bodyweight_kg < 20 or p_bodyweight_kg > 400)) then
    raise exception 'Datos del combo invalidos.' using errcode = 'PLU01';
  end if;

  -- Orden de locks compartida con las RPC individuales: atleta -> evento ->
  -- oferta/plan. Serializa dos checkouts del mismo atleta y el contador de
  -- cupos del evento sin depender de checks del navegador.
  select * into v_athlete
  from public.athletes
  where id = p_athlete_id
  for update;
  if not found or v_athlete.status = 'bloqueado' then
    raise exception 'Atleta no encontrado o bloqueado.' using errcode = 'PLU02';
  end if;

  select * into v_event
  from public.events
  where slug = p_event_slug
  for update;
  if not found or v_event.organization_id <> v_athlete.organization_id or not v_event.published then
    raise exception 'Evento no encontrado o no publicado.' using errcode = 'PLU02';
  end if;
  if v_event.status = 'agotado' then
    raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
  end if;
  if v_event.status not in ('inscripcion_abierta', 'cupos_limitados')
     or (v_event.registration_opens_at is not null and now() < v_event.registration_opens_at)
     or (v_event.registration_closes_at is not null and now() > v_event.registration_closes_at) then
    raise exception 'La inscripcion no esta abierta.' using errcode = 'PLU03';
  end if;

  select * into v_offer
  from public.event_combo_offers
  where event_id = v_event.id and archived_at is null
  for update;
  v_has_combo := found and v_offer.active
    and (v_offer.starts_at is null or now() >= v_offer.starts_at)
    and (v_offer.ends_at is null or now() <= v_offer.ends_at);

  -- Sin combo vigente el paquete lo define la llave que el atleta ya canjeó:
  -- una oferta autosuficiente nombra su afiliación y se cotiza contra la suma
  -- de las partes. El unlock es la unica prueba que el navegador no puede
  -- falsificar -- lo escribe `athlete_unlock_offer_code` contra el evento REAL
  -- del codigo -- y sin el no hay combo que vender, igual que antes.
  if not v_has_combo then
    v_offer_code := plu_private.athlete_unlocked_offer_code(p_athlete_id, v_event.id);
    if v_offer_code.id is null then
      raise exception 'El combo no esta disponible para este evento.' using errcode = 'PLU03';
    end if;
  end if;

  select * into v_plan
  from public.membership_plans
  where id = case
    when v_has_combo then v_offer.membership_plan_id
    else v_offer_code.membership_plan_id
  end
  for update;
  if not found
     or v_plan.organization_id <> v_event.organization_id
     or v_plan.collection_mode <> 'one_time'
     or not v_plan.active
     or v_plan.effective_from > now()
     or (v_plan.retired_at is not null and v_plan.retired_at <= now()) then
    raise exception 'El plan del combo no esta vigente.' using errcode = 'PLU03';
  end if;
  -- Importe y moneda del paquete. El combo los trae cargados; sin combo son
  -- los del catalogo -- la suma de las partes -- y el importe promocional lo
  -- aplica despues `apply_discount_code_to_order`, exactamente como sobre un
  -- combo. La orden nunca nace por debajo del precio de lista sin un codigo.
  v_bundle_price := case
    when v_has_combo then v_offer.price
    else v_plan.price + v_event.price
  end;
  v_bundle_currency := case
    when v_has_combo then v_offer.currency
    else v_event.currency
  end;
  if upper(v_bundle_currency) <> upper(v_plan.currency)
     or upper(v_bundle_currency) <> upper(v_event.currency)
     or v_bundle_price > v_plan.price + v_event.price then
    raise exception 'La configuracion economica del combo es invalida.' using errcode = 'PLU11';
  end if;

  -- La misma clave devuelve exactamente los tres recursos, pero no puede
  -- reutilizarse para otro atleta, evento, plan o concepto.
  select * into v_order
  from public.athlete_payment_orders
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_order.athlete_id <> p_athlete_id
       or v_order.organization_id <> v_athlete.organization_id
       or v_order.concept <> 'combo'
       or v_order.plan_id <> v_plan.id then
      raise exception 'La clave de idempotencia pertenece a otra operacion.' using errcode = 'PLU13';
    end if;

    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;
    select * into v_registration
    from public.event_registrations
    where payment_order_id = v_order.id;

    if v_membership.id is null or v_registration.id is null
       or v_registration.event_id <> v_event.id
       or v_order.method <> p_payment_method
       or v_registration.division <> p_division
       or v_registration.category <> p_category
       or v_registration.bodyweight_kg is distinct from p_bodyweight_kg then
      raise exception 'La orden combo existente esta incompleta.' using errcode = 'PLU13';
    end if;

    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'plan', to_jsonb(v_plan),
      'comboOffer', case when v_has_combo then to_jsonb(v_offer) else null end,
      'duplicate', true
    );
  end if;

  -- Impaga: reanudar la orden (combo o solo) en vez de PLU08.
  v_resume := public.resume_pending_event_registration_checkout(
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg, p_payment_method
  );
  if v_resume is not null then
    select * into v_order
    from public.athlete_payment_orders
    where id = (v_resume->'order'->>'id')::uuid;
    select * into v_registration
    from public.event_registrations
    where id = (v_resume->'registration'->>'id')::uuid;
    select m.* into v_membership
    from public.membership_order_targets t
    join public.memberships m on m.id = t.membership_id
    where t.order_id = v_order.id;
    return jsonb_build_object(
      'order', to_jsonb(v_order),
      'membership', to_jsonb(v_membership),
      'registration', to_jsonb(v_registration),
      'plan', to_jsonb(v_plan),
      'comboOffer', case when v_has_combo then to_jsonb(v_offer) else null end,
      'duplicate', true
    );
  end if;

  if v_event.capacity is not null then
    select count(*) into v_count
    from public.event_registrations
    where event_id = v_event.id
      and status in ('pendiente_pago', 'pagada', 'confirmada');
    if v_count >= v_event.capacity then
      raise exception 'No quedan cupos para este evento.' using errcode = 'PLU04';
    end if;
  end if;

  -- Si ya hay un cobro de afiliacion enviado a Mercado Pago no se lo puede
  -- transformar: un checkout viejo podria acreditar el importe anterior.
  if exists (
    select 1
    from public.athlete_payment_orders o
    join public.membership_order_targets t on t.order_id = o.id
    join public.memberships m on m.id = t.membership_id
    where m.athlete_id = p_athlete_id
      and o.concept = 'membership'
      and o.status in ('pendiente', 'validacion_manual')
      and (
        o.provider_preference_id is not null
        or o.payment_proof_path is not null
        or exists (
          select 1 from public.embedded_payment_attempts a
          where a.order_kind = 'athlete'
            and a.order_id = o.id
            and a.status in ('processing', 'submitted')
        )
      )
  ) then
    raise exception 'Ya existe un pago de afiliacion en curso; completalo o espera su vencimiento.'
      using errcode = 'PLU13';
  end if;

  select m.* into v_pending
  from public.memberships m
  where m.athlete_id = p_athlete_id and m.status = 'pendiente_pago'
  order by
    case when m.plan_id is not distinct from v_plan.id then 0 else 1 end,
    m.created_at desc
  limit 1
  for update;

  select m.* into v_existing
  from public.memberships m
  where m.athlete_id = p_athlete_id and m.status in ('activa', 'vencida')
  order by m.expiration_date desc nulls last
  limit 1
  for update;

  if v_existing.id is not null
     and v_existing.status = 'activa'
     and (
       v_existing.start_date > current_date
       or coalesce(v_existing.expiration_date, current_date) >= current_date
     ) then
    raise exception 'El atleta ya tiene una afiliacion vigente o programada.'
      using errcode = 'PLU13';
  end if;

  if v_pending.id is not null and v_pending.plan_id is not distinct from v_plan.id then
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

  -- Solo se reemplazan ordenes que todavia no llegaron al proveedor. El
  -- trigger puede marcar temporalmente la afiliacion como cancelada; mas
  -- abajo se repunta a la nueva orden dentro de esta misma transaccion.
  update public.athlete_payment_orders o
  set status = 'cancelado', updated_at = now()
  from public.membership_order_targets t
  join public.memberships m on m.id = t.membership_id
  where t.order_id = o.id
    and m.athlete_id = p_athlete_id
    and o.concept = 'membership'
    and o.status in ('pendiente', 'validacion_manual');

  insert into public.athlete_payment_orders (
    organization_id, athlete_id, plan_id, concept, amount, currency, method,
    status, reference, idempotency_key, expires_at
  ) values (
    v_athlete.organization_id, p_athlete_id, v_plan.id, 'combo', v_bundle_price,
    upper(v_bundle_currency), p_payment_method,
    public.athlete_payment_status_for_method(p_payment_method),
    'CORD-' || encode(extensions.gen_random_bytes(8), 'hex'),
    p_idempotency_key,
    now() + case when p_payment_method = 'manual_link' then interval '1 day' else interval '30 minutes' end
  )
  returning * into v_order;

  if v_pending.id is not null then
    update public.memberships
    set organization_id = v_athlete.organization_id,
        year = v_year,
        status = 'pendiente_pago',
        start_date = v_start,
        expiration_date = v_end,
        payment_order_id = v_order.id,
        plan_id = v_plan.id,
        updated_at = now()
    where id = v_pending.id
    returning * into v_membership;
  else
    select m.* into v_same_year
    from public.memberships m
    where m.athlete_id = p_athlete_id and m.year = v_year
    for update;

    if v_same_year.id is not null then
      if v_same_year.status = 'activa'
         and (
           v_same_year.start_date > current_date
           or coalesce(v_same_year.expiration_date, current_date) >= current_date
         ) then
        raise exception 'El atleta ya tiene una afiliacion vigente o programada para este periodo.'
          using errcode = 'PLU13';
      end if;

      update public.memberships
      set organization_id = v_athlete.organization_id,
          status = 'pendiente_pago',
          start_date = v_start,
          expiration_date = v_end,
          payment_order_id = v_order.id,
          plan_id = v_plan.id,
          updated_at = now()
      where id = v_same_year.id
      returning * into v_membership;
    else
      insert into public.memberships (
        organization_id, athlete_id, year, status, start_date, expiration_date,
        member_code, payment_order_id, plan_id
      ) values (
        v_athlete.organization_id, p_athlete_id, v_year, 'pendiente_pago',
        v_start, v_end,
        'PLU-ARG-' || v_year || '-' || lpad(nextval('public.membership_code_seq')::text, 8, '0'),
        v_order.id, v_plan.id
      )
      returning * into v_membership;
    end if;
  end if;

  insert into public.membership_order_targets (
    organization_id, order_id, membership_id, plan_id, starts_at, ends_at
  ) values (
    v_athlete.organization_id, v_order.id, v_membership.id, v_plan.id, v_start, v_end
  );

  -- Reactiva la fila cancelada si existe; inserta sólo cuando no hay ninguna.
  v_placed := plu_private.place_event_registration(
    p_athlete_id, v_event.id, p_division, p_category, p_bodyweight_kg, v_order.id
  );
  select * into v_registration
  from public.event_registrations
  where id = (v_placed->'registration'->>'id')::uuid;

  insert into public.domain_audit_logs (
    organization_id, action, entity_type, entity_id, actor_type, actor_id, metadata
  ) values
  (
    v_athlete.organization_id,
    'combo_order.created', 'athlete_payment_order', v_order.id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object(
      'eventId', v_event.id,
      'offerId', case when v_has_combo then v_offer.id else null end,
      'offerCodeId', v_offer_code.id,
      'planId', v_plan.id,
      'membershipId', v_membership.id,
      'registrationId', v_registration.id,
      'amount', v_order.amount,
      'currency', v_order.currency
    )
  ),
  (
    v_athlete.organization_id,
    'registration.created', 'event_registration', v_registration.id::text,
    'athlete', p_athlete_id::text,
    jsonb_build_object(
      'eventId', v_event.id,
      'orderId', v_order.id,
      'source', 'combo',
      'reactivated', (v_placed->>'reactivated')::boolean
    )
  );

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'membership', to_jsonb(v_membership),
    'registration', to_jsonb(v_registration),
    'plan', to_jsonb(v_plan),
    'comboOffer', case when v_has_combo then to_jsonb(v_offer) else null end,
    'duplicate', false
  );
end;
$$;

revoke all on function public.create_membership_registration_combo_order_core(
  uuid, text, text, text, numeric, text, text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Alta y edición desde el panel
--
-- Cuerpo idéntico a 20260912100000 salvo la resolución del paquete, el techo
-- de precio y la escritura de la columna nueva.
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
  v_audience text := coalesce(nullif(trim(p_code ->> 'audience'), ''), 'code');
  v_percent int := nullif(p_code ->> 'percentOff', '')::int;
  v_fixed_price int := nullif(p_code ->> 'fixedPrice', '')::int;
  v_fixed_price_manual int := nullif(p_code ->> 'fixedPriceManual', '')::int;
  v_applies text := p_code ->> 'appliesTo';
  v_event_id uuid := nullif(p_code ->> 'eventId', '')::uuid;
  v_max_redemptions int := nullif(p_code ->> 'maxRedemptions', '')::int;
  v_starts timestamptz := nullif(p_code ->> 'startsAt', '')::timestamptz;
  v_expires timestamptz := nullif(p_code ->> 'expiresAt', '')::timestamptz;
  v_active boolean := coalesce((p_code ->> 'active')::boolean, true);
  v_manual_channels text[];
  -- Default true: los códigos que existían antes de esta migración, y cualquier
  -- payload de una API desplegada sin el campo, siguen aceptando la pasarela.
  v_mercado_pago_enabled boolean := coalesce((p_code ->> 'mercadoPagoEnabled')::boolean, true);
  -- Default false: ningun codigo ya cargado empieza a financiar porque una
  -- API vieja no mande el campo.
  v_financed boolean := coalesce((p_code ->> 'financed')::boolean, false);
  v_invitees text[];
  v_before jsonb;
  v_combo public.event_combo_offers;
  -- Qué afiliación empaqueta la oferta. Es el único dato del combo que un
  -- código no podía deducir, y por eso había que cargar el combo antes.
  v_membership_plan_id uuid := nullif(p_code ->> 'membershipPlanId', '')::uuid;
  v_plan public.membership_plans;
  v_event public.events;
  v_plan_ids uuid[];
  v_ceiling int;
  v_result public.discount_codes;
begin
  if v_kind not in ('percent', 'fixed_price', 'access', 'offer') then
    raise exception 'La modalidad del código es inválida.' using errcode = 'PLU01';
  end if;

  if v_audience not in ('public', 'code') then
    raise exception 'La audiencia de la promoción es inválida.' using errcode = 'PLU01';
  end if;

  -- Cada modalidad ignora los campos de las otras: así editar un cupón de un
  -- tipo a otro desde el panel no deja el valor viejo colgado.
  if v_kind = 'percent' then
    v_fixed_price := null;
    v_fixed_price_manual := null;
  elsif v_kind in ('fixed_price', 'offer') then
    v_percent := null;
  else
    v_percent := null;
    v_fixed_price := null;
    v_fixed_price_manual := null;
  end if;

  -- El paquete es propiedad de una oferta con precio propio: ninguna otra
  -- modalidad instancia uno, y dejarlo colgado al cambiar de tipo desde el
  -- panel reviviría un plan que nadie eligió.
  if v_kind <> 'offer' then
    v_membership_plan_id := null;
  end if;

  -- Una afiliación no pertenece a ninguna inscripción: el alcance de evento se
  -- descarta en vez de rechazar el guardado, por el mismo criterio que arriba.
  if v_applies not in ('registration', 'combo') then
    v_event_id := null;
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

  -- Ver la cabecera de 20260827105000: una promo pública que además abre un
  -- canal manual es el interruptor de canal escondido en otra pantalla.
  if v_audience = 'public' and cardinality(v_manual_channels) > 0 then
    raise exception 'Una promoción pública no puede habilitar medios de pago manuales. Abrilos desde Acceso y habilitación.'
      using errcode = 'PLU01';
  end if;

  -- Un código que no acepta ningún canal es un código que nadie puede pagar:
  -- el atleta lo canjea, la ficha se abre y no hay un solo medio que ofrecer.
  if not v_mercado_pago_enabled and cardinality(v_manual_channels) = 0 then
    raise exception 'Si el código no acepta Mercado Pago, habilitá al menos transferencia o efectivo.'
      using errcode = 'PLU01';
  end if;

  -- Mismo criterio que el de arriba, del otro lado: una promo pública se aplica
  -- sola a todas las compras, así que cerrarle la pasarela es cerrar el
  -- checkout entero desde la pantalla de precios. Se cierra en Acceso y
  -- habilitación, que es donde queda auditado como decisión de plataforma.
  if v_audience = 'public' and not v_mercado_pago_enabled then
    raise exception 'Una promoción pública no puede cerrar Mercado Pago. Cerralo desde Acceso y habilitación.'
      using errcode = 'PLU01';
  end if;

  -- Financiar es delegar la liquidación a un canal que se cobra a mano: sin
  -- transferencia ni efectivo, el atleta sólo ve la pasarela —que acredita
  -- sola— y el interruptor queda inerte. Era el agujero que reportó Precios.
  if v_financed and cardinality(v_manual_channels) = 0 then
    raise exception 'Para financiar el código habilitá transferencia o efectivo: son los canales que el atleta puede declarar.'
      using errcode = 'PLU01';
  end if;

  -- Una promo pública se aplica sola a todas las compras: financiarla sería
  -- abrir deuda para cualquiera que pase por el checkout.
  if v_financed and v_audience = 'public' then
    raise exception 'Una promoción pública no puede financiar: el financiamiento se pacta con quien recibe el código.'
      using errcode = 'PLU01';
  end if;

  if jsonb_typeof(p_code -> 'invitees') = 'array' then
    select coalesce(array_agg(distinct lower(trim(email))), '{}'::text[])
    into v_invitees
    from jsonb_array_elements_text(p_code -> 'invitees') as email
    where trim(email) <> '';

    if cardinality(v_invitees) > 500 then
      raise exception 'La lista de invitados no puede tener más de 500 direcciones.'
        using errcode = 'PLU01';
    end if;
    if exists (
      select 1 from unnest(v_invitees) as t(email)
      where t.email not like '%_@_%._%' or t.email like '% %' or length(t.email) > 200
    ) then
      raise exception 'Hay direcciones de correo inválidas en la lista de invitados.'
        using errcode = 'PLU01';
    end if;
  else
    v_invitees := null;
  end if;

  if v_code_text is null or v_code_text !~ '^[A-Z0-9]+(?:-[A-Z0-9]+)*$'
     or length(v_code_text) < 3 or length(v_code_text) > 32
     or v_applies not in ('membership', 'registration', 'combo', 'both')
     or (v_max_redemptions is not null and v_max_redemptions <= 0) then
    raise exception 'Los datos del código son inválidos.' using errcode = 'PLU01';
  end if;

  if v_starts is not null and v_expires is not null and v_expires <= v_starts then
    raise exception 'El cierre de la promoción debe ser posterior a su apertura.'
      using errcode = 'PLU01';
  end if;

  -- Ver `discount_codes_public_event_check`: el resolver de promo pública no
  -- recibe el evento, así que una promo pública con alcance de inscripción
  -- podría bloquear la aplicación de cualquier otra.
  if v_audience = 'public' and v_event_id is not null then
    raise exception 'Una promoción pública no puede limitarse a una inscripción. Repartila como código.'
      using errcode = 'PLU01';
  end if;

  if v_event_id is not null
     and not exists (select 1 from public.events where id = v_event_id
                       and organization_id = v_organization_id) then
    raise exception 'La inscripción del código no existe.' using errcode = 'PLU02';
  end if;

  if v_kind = 'percent' and (v_percent is null or v_percent < 1 or v_percent > 99) then
    raise exception 'El porcentaje de descuento debe estar entre 1 y 99.' using errcode = 'PLU01';
  end if;

  if v_kind in ('fixed_price', 'offer') then
    if v_fixed_price is null or v_fixed_price <= 0 or v_fixed_price > 10000000 then
      raise exception 'El precio promocional es inválido.' using errcode = 'PLU01';
    end if;
    -- A propósito sin comparar contra `v_fixed_price`: el precio del canal
    -- manual puede ser igual, menor o mayor. Ver el punto 2 de la cabecera de
    -- 20260828100000.
    if v_fixed_price_manual is not null
       and (v_fixed_price_manual <= 0 or v_fixed_price_manual > 10000000) then
      raise exception 'El precio promocional por transferencia o efectivo es inválido.'
        using errcode = 'PLU01';
    end if;
  end if;

  if v_kind = 'fixed_price' and v_applies = 'both' then
    raise exception 'Un código con precio promocional necesita un alcance único: afiliación, inscripción o combo.'
      using errcode = 'PLU01';
  end if;

  -- Un código de acceso puro no tiene sentido fuera del combo: ver el
  -- comentario de discount_codes_kind_shape_check sobre por qué 'both' queda
  -- afuera.
  if v_kind = 'access' and v_applies <> 'combo' then
    raise exception 'Un código de acceso sólo puede aplicarse al combo.' using errcode = 'PLU01';
  end if;

  -- La contracara de la oferta autosuficiente: una oferta SIN precio propio
  -- cobra el del combo de su inscripción, así que ahí el combo sigue siendo
  -- obligatorio. Sin él la ficha anunciaría un paquete sin importe y el
  -- checkout lo rechazaría dos pantallas después.
  if v_kind = 'access' and v_event_id is not null and not exists (
    select 1 from public.event_combo_offers
    where event_id = v_event_id and archived_at is null
  ) then
    raise exception 'Sin precio propio la oferta cobra el combo de esa inscripción, y esa inscripción no tiene combo cargado. Poné un precio o cargá el combo.'
      using errcode = 'PLU02';
  end if;

  if v_kind = 'offer' then
    if v_applies <> 'combo' then
      raise exception 'Una oferta exclusiva se aplica al combo de afiliación e inscripción.'
        using errcode = 'PLU01';
    end if;
    if v_audience <> 'code' then
      raise exception 'Una oferta exclusiva se reparte como código: no puede ser pública.'
        using errcode = 'PLU01';
    end if;
    if v_event_id is null then
      raise exception 'Elegí a qué inscripción aplica la oferta exclusiva.' using errcode = 'PLU01';
    end if;

    -- QUÉ se está ofertando. Antes lo definía el combo del evento, y por eso
    -- había que cargarlo antes de poder crear el código: tres pantallas para
    -- pactar un precio. Ahora la oferta nombra su propio plan y el combo pasó
    -- a ser una fuente más, en este orden:
    --
    --   1. el plan que eligió el panel,
    --   2. el del combo del evento, si hay combo,
    --   3. el único plan de pago único vigente de la organización.
    --
    -- Con más de un candidato en el paso 3 no se adivina: elegir mal cambia qué
    -- afiliación compra el atleta.
    select * into v_event from public.events where id = v_event_id;
    select * into v_combo from public.event_combo_offers
    where event_id = v_event_id and archived_at is null;

    if v_membership_plan_id is null then
      v_membership_plan_id := v_combo.membership_plan_id;
    end if;
    if v_membership_plan_id is null then
      -- `array_agg` y no `min(id)`: uuid no tiene agregado de mínimo, y contar
      -- primero para elegir después repetiría el filtro de vigencia.
      select array_agg(pl.id) into v_plan_ids
      from public.membership_plans pl
      where pl.organization_id = v_organization_id
        and pl.active
        and pl.collection_mode = 'one_time'
        and pl.effective_from <= now()
        and (pl.retired_at is null or pl.retired_at > now());
      if v_plan_ids is null or cardinality(v_plan_ids) = 0 then
        raise exception 'No hay ninguna afiliación de pago único vigente para empaquetar en la oferta.'
          using errcode = 'PLU02';
      end if;
      if cardinality(v_plan_ids) > 1 then
        raise exception 'Hay más de una afiliación de pago único vigente: elegí cuál empaqueta la oferta.'
          using errcode = 'PLU01';
      end if;
      v_membership_plan_id := v_plan_ids[1];
    end if;

    select * into v_plan from public.membership_plans
    where id = v_membership_plan_id and organization_id = v_organization_id;
    if not found
       or v_plan.collection_mode <> 'one_time'
       or not v_plan.active
       or v_plan.effective_from > now()
       or (v_plan.retired_at is not null and v_plan.retired_at <= now()) then
      raise exception 'La afiliación que empaqueta la oferta no está vigente.'
        using errcode = 'PLU01';
    end if;
    -- Mismo criterio que create_membership_registration_combo_order_core: el
    -- paquete cobra un solo importe, así que sus dos partes van en la misma
    -- moneda.
    if upper(v_plan.currency) <> upper(v_event.currency) then
      raise exception 'La afiliación y la inscripción de la oferta están en monedas distintas.'
        using errcode = 'PLU11';
    end if;

    -- Techo: lo que ese atleta pagaría sin el código. Es el precio del combo
    -- cuando el evento tiene uno encendido -- podría comprarlo igual -- y la
    -- suma de las partes cuando no hay combo o está apagado. Con combo
    -- encendido son el mismo número o el combo es menor
    -- (staff_save_event_combo_offer no deja cargarlo por encima de la suma),
    -- así que la regla anterior queda conservada exactamente.
    if v_combo.id is not null and v_combo.active then
      v_ceiling := least(v_combo.price, v_plan.price + v_event.price);
    else
      v_ceiling := v_plan.price + v_event.price;
    end if;
    -- Una "oferta" que cobra igual o más que eso no es una oferta, y el canje
    -- la rechazaría con PLU24 recién en el checkout.
    if v_fixed_price >= v_ceiling then
      raise exception 'El precio de la oferta (%) tiene que ser menor a lo que ya cuesta el paquete (%).',
        v_fixed_price, v_ceiling using errcode = 'PLU01';
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
        audience = v_audience,
        percent_off = v_percent,
        fixed_price = v_fixed_price,
        fixed_price_manual = v_fixed_price_manual,
        applies_to = v_applies,
        event_id = v_event_id,
        max_redemptions = v_max_redemptions,
        starts_at = v_starts,
        expires_at = v_expires,
        active = v_active,
        manual_channels = v_manual_channels,
        mercado_pago_enabled = v_mercado_pago_enabled,
        financed = v_financed,
        membership_plan_id = v_membership_plan_id,
        updated_at = now()
    where id = v_id
    returning * into v_result;
  else
    begin
      insert into public.discount_codes(
        organization_id, code, description, kind, audience, percent_off, fixed_price,
        fixed_price_manual, applies_to, event_id, max_redemptions, starts_at, expires_at,
        active, manual_channels, mercado_pago_enabled, financed, membership_plan_id
      ) values (
        v_organization_id, v_code_text, nullif(trim(p_code ->> 'description'), ''),
        v_kind, v_audience, v_percent, v_fixed_price, v_fixed_price_manual, v_applies,
        v_event_id, v_max_redemptions, v_starts, v_expires, v_active, v_manual_channels,
        v_mercado_pago_enabled, v_financed, v_membership_plan_id
      ) returning * into v_result;
    exception when unique_violation then
      raise exception 'Ya existe un código con ese nombre.' using errcode = 'PLU13';
    end;
  end if;

  -- La lista se reemplaza entera en la misma transacción que el código: no hay
  -- ventana en la que la promo esté guardada con la exclusividad a medio migrar.
  if v_invitees is not null then
    delete from public.discount_code_invitations
    where discount_code_id = v_result.id
      and not (email = any(v_invitees));

    if cardinality(v_invitees) > 0 then
      insert into public.discount_code_invitations(organization_id, discount_code_id, email)
      select v_organization_id, v_result.id, t.email from unnest(v_invitees) as t(email)
      on conflict (discount_code_id, email) do nothing;
    end if;
  end if;

  insert into public.domain_audit_logs(
    action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
  ) values (
    case when v_before is null then 'discount_code.created' else 'discount_code.updated' end,
    'discount_code', v_result.id::text, 'staff', p_actor,
    case
      when v_before is null then to_jsonb(v_result) || jsonb_build_object(
        'inviteeCount', coalesce(cardinality(v_invitees), 0)
      )
      else jsonb_build_object(
        'before', v_before,
        'after', to_jsonb(v_result),
        'inviteeCount', coalesce(cardinality(v_invitees), 0)
      )
    end,
    v_organization_id
  );

  return to_jsonb(v_result) || jsonb_build_object(
    'invitees', coalesce((
      select jsonb_agg(i.email order by i.email)
      from public.discount_code_invitations i
      where i.discount_code_id = v_result.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_upsert_discount_code(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.staff_upsert_discount_code(jsonb, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 11. Configuración del panel: el paquete de cada oferta
--
-- Cuerpo idéntico a 20260912100000 salvo el campo nuevo. Sin él, editar una
-- oferta la reabriría sin plan y el formulario volvería a adivinarlo.
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

do $verification$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'discount_codes'
      and column_name = 'membership_plan_id'
  ) then
    raise exception 'Falta membership_plan_id en discount_codes.';
  end if;
  if exists (
    select 1 from public.discount_codes
    where kind = 'offer' and membership_plan_id is null
  ) then
    raise exception 'Hay ofertas exclusivas sin afiliación empaquetada.';
  end if;
  if to_regprocedure('plu_private.athlete_unlocked_offer_code(uuid,uuid)') is null then
    raise exception 'Falta plu_private.athlete_unlocked_offer_code.';
  end if;
  if to_regprocedure('public.athlete_event_offer_bundle(uuid,uuid,text)') is null then
    raise exception 'Falta public.athlete_event_offer_bundle.';
  end if;
  -- Ningún overload nuevo de las funciones reemplazadas: cada una sigue con
  -- una sola firma.
  if (
    select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'athlete_unlock_offer_code',
        'athlete_list_offer_unlocks',
        'staff_upsert_discount_code',
        'staff_get_pricing_configuration',
        'staff_delete_membership_plan',
        'create_membership_registration_combo_order_core'
      )
  ) <> 6 then
    raise exception 'Quedaron overloads de las funciones reemplazadas.';
  end if;
end
$verification$;
