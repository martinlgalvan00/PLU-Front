-- Mi cuenta deja de anunciar un código de oferta ya desactivado — PLU ARG
--
-- 20260915100000 apagó (`active = false`) todas las filas `kind in ('offer',
-- 'access')` y blindó la escritura para que ninguna nueva vuelva a quedar
-- activa. Pero `athlete_list_offer_unlocks` -la que alimenta la ficha "Oferta
-- exclusiva" de Mi cuenta y el auto-canje del checkout- nunca miró `active`:
-- sólo exige `archived_at is null`, que esa migración no toca. Un atleta que
-- hubiera tipeado el código para verificarlo (`discount_code_unlocks`, que no
-- es lo mismo que haberlo comprado) seguía viendo la ficha con el precio
-- congelado después de que el código se apagara.
--
-- El otro lado de la lectura, `athlete_preview_discount_code`, ya rechaza un
-- código inactivo (`reason: 'inactive'`) sea cual sea el alcance, así que el
-- cobro nunca estuvo en riesgo — esto cierra la última vidriera que quedaba
-- abierta, no un agujero de cobro.

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
  left join public.event_combo_offers o
    on o.event_id = c.event_id
   and o.archived_at is null
   and o.active
   and (o.starts_at is null or o.starts_at <= now())
   and (o.ends_at is null or o.ends_at >= now())
  where u.athlete_id = p_athlete_id
    and u.organization_id = p_organization_id
    and c.archived_at is null
    -- Un código apagado no alimenta ninguna ficha: ni el desbloqueo previo ni
    -- una compra ya hecha necesitan que siga listado acá para explicarse (la
    -- orden ya cobrada guarda su propio importe, no depende de esta lectura).
    and c.active
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

do $verification$
begin
  if exists (
    select 1
    from public.discount_code_unlocks u
    join public.discount_codes c on c.id = u.discount_code_id
    where c.active = false
      and c.archived_at is null
  ) then
    raise notice 'Quedan desbloqueos de códigos apagados: ya no los va a listar athlete_list_offer_unlocks, pero siguen en la tabla para auditoría.';
  end if;
end
$verification$;
