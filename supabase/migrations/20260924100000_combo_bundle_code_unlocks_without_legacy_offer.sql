-- El código-paquete se desbloquea sin el combo legado — PLU ARG
--
-- 20260918100000 ("combo_code_is_the_bundle") dejó al `fixed_price` con
-- `applies_to = 'combo'` autosuficiente: `offer_code_payload` ya arma el
-- precio del paquete desde el propio código (`fixedPrice`, `fixedPriceManual`),
-- sin tocar `event_combo_offers` (ver su columna `comboOffer`, que es sólo
-- metadata adicional, no la fuente del precio). Pero la guarda de
-- disponibilidad de `athlete_unlock_offer_code` quedó sin actualizar: seguía
-- exigiendo un `event_combo_offers` activo y sin archivar para CUALQUIER
-- código sin `membership_plan_id`, tratando al código-paquete nuevo igual que
-- a la modalidad vieja `kind = 'offer'` (que sí cobra el precio del combo del
-- evento, no el suyo propio).
--
-- El caso real: un operador da de alta el combo como `fixed_price` +
-- `applies_to = 'combo'` (el flujo vigente) y archiva la fila vieja de
-- `event_combo_offers` que había quedado de un intento anterior. Desde ese
-- momento CUALQUIER código de este tipo, para este evento, rebota con
-- `offer_unavailable` — no es un problema del código puntual, es que la
-- guarda nunca dejó de pedir la tabla retirada.
--
-- Cuerpo idéntico a 20260918100000 salvo separar las dos ramas: el chequeo de
-- `event_combo_offers` queda sólo para `kind = 'offer'`. Un código-paquete sin
-- plan propio no tiene nada más que validar acá — su vigencia y estado ya se
-- comprobaron arriba con sus propias columnas.
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
  if v_code.kind not in ('offer', 'access')
     and not (v_code.kind = 'fixed_price' and v_code.applies_to = 'combo') then
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
  -- con que ese plan siga vigente. El código-paquete (`fixed_price` +
  -- `applies_to = 'combo'`) es igual de autosuficiente: su precio es el suyo
  -- propio (`offer_code_payload` lo arma desde `fixed_price`/`fixed_price_manual`,
  -- nunca desde `event_combo_offers`), así que no le queda nada más que pedirle
  -- a una tabla retirada. Sólo la modalidad legada `kind = 'offer'` sigue
  -- cobrando el precio del combo del evento, y sólo ella sigue exigiendo ese
  -- combo cargado, encendido y en ventana — `archived_at` incluido, porque uno
  -- archivado no se puede vender.
  if v_code.membership_plan_id is not null
     and (v_code.kind = 'offer' or (v_code.kind = 'fixed_price' and v_code.applies_to = 'combo')) then
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
  elsif v_code.kind = 'offer' and not exists (
    select 1 from public.event_combo_offers o
    where o.event_id = v_code.event_id
      and o.archived_at is null
      and o.active
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at >= now())
  ) then
    return jsonb_build_object('unlocked', false, 'reason', 'offer_unavailable');
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

do $verification$
begin
  if to_regprocedure('public.athlete_unlock_offer_code(uuid,uuid,text)') is null then
    raise exception 'Falta public.athlete_unlock_offer_code.';
  end if;
  -- Un código-paquete sin `membership_plan_id` ya no debe mencionar
  -- `event_combo_offers`: esta migración existe para borrar esa dependencia.
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'athlete_unlock_offer_code'
      and pg_get_functiondef(p.oid) ilike '%elsif not exists (%event_combo_offers%'
  ) then
    raise exception 'El código-paquete todavía depende del combo legado.';
  end if;
end
$verification$;
