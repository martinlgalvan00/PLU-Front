-- El paquete deja de ser un objeto aparte: vive dentro del código — PLU ARG
--
-- 20260913100000 hizo que un código de oferta no NECESITE el combo del evento.
-- Esto termina el trabajo: el combo deja de existir como cosa que se configura.
-- El operador lo pidió así — "que toda la lógica esté dentro del código y no
-- dividirlo en dos secciones" — y el estado de producción le da la razón: la
-- única fila de `event_combo_offers` existía sólo para que los códigos pudieran
-- apuntarle, y ningún código activo la usaba.
--
-- Qué se va, y de dónde:
--
--   * La sección "Oferta combo" de Precios, con su formulario, su visibilidad
--     comercial, su código de acceso propio y su baja.
--   * Los endpoints `PUT`/`DELETE /api/pricing/events/:slug/combo`, su schema y
--     los dos métodos del repositorio. Sin superficie que los llame, dejarlos
--     vivos era dejar la puerta para volver a partir la configuración en dos.
--   * La modalidad `access` como algo que se pueda crear: era la oferta SIN
--     precio propio, que cobraba el del combo. Sin combo no hay precio que
--     heredar, así que una oferta siempre trae su importe.
--
-- Qué queda, y por qué:
--
--   * La tabla `event_combo_offers` y la rama del checkout que la lee
--     (`create_membership_registration_combo_order_core`). Es historia contable
--     —hay órdenes que se cobraron con esos precios— y borrarla obligaría a
--     re-versionar las RPC más pesadas del dominio sin ninguna ganancia.
--   * Las filas `kind = 'access'` que ya existen: siguen siendo válidas en la
--     base. Editarlas desde el panel las guarda como `offer` con importe propio,
--     que es lo único que se puede describir sin combo.
--
-- Esta migración hace dos cosas: archiva las filas vivas para que nada las
-- sirva, y cierra la puerta a nivel base revocando las dos RPC de escritura.
-- Reabrirla es un `grant` explícito, que es exactamente lo que queremos que
-- cueste.

-- ---------------------------------------------------------------------------
-- 1. Archivar los combos vivos
--
-- `archived_at` (20260903100000) es el mecanismo que ya usaban la ficha, el
-- listado y el checkout para ignorar un combo sin borrar su historia. No se
-- toca `active` ni `price`: la fila queda tal como estaba el día que se dejó de
-- ofrecer, que es lo que hace legible una orden vieja.
-- ---------------------------------------------------------------------------

with archived as (
  update public.event_combo_offers
  set archived_at = now(),
      updated_at = now()
  where archived_at is null
  returning id, organization_id, event_id, price, audience, active
)
insert into public.domain_audit_logs(
  action, entity_type, entity_id, actor_type, actor_id, metadata, organization_id
)
select
  'event_combo_offer.archived',
  'event_combo_offer',
  a.id::text,
  'system',
  'bundle-lives-in-the-code',
  jsonb_build_object(
    'eventId', a.event_id,
    'price', a.price,
    'audience', a.audience,
    'wasActive', a.active,
    'reason', 'El paquete se configura dentro del código de oferta.'
  ),
  a.organization_id
from archived a;

-- ---------------------------------------------------------------------------
-- 2. Cerrar la escritura
--
-- Las dos funciones se conservan —una migración vieja las define y borrarlas
-- rompería la reproducibilidad del corpus— pero nadie puede ejecutarlas: el
-- backend entra siempre como `service_role`. Un `grant execute` explícito las
-- devuelve si alguna vez hace falta volver atrás.
-- ---------------------------------------------------------------------------

revoke execute on function public.staff_save_event_combo_offer(text, jsonb, text)
  from service_role;
revoke execute on function public.staff_delete_event_combo_offer(text, text)
  from service_role;

comment on table public.event_combo_offers is
  'Historia: el paquete de afiliación + inscripción se configura dentro del código de oferta (discount_codes.membership_plan_id + fixed_price). Esta tabla sólo sostiene órdenes ya cobradas; su escritura está revocada desde 20260914100000.';

do $verification$
begin
  if exists (select 1 from public.event_combo_offers where archived_at is null) then
    raise exception 'Quedaron combos sin archivar.';
  end if;
  -- La rama de compatibilidad sigue en pie: una orden vieja tiene que poder
  -- leerse, y el checkout tiene que poder resolver el paquete desde la llave.
  if to_regprocedure('public.create_membership_registration_combo_order_core(uuid,text,text,text,numeric,text,text)') is null then
    raise exception 'Falta el core del checkout combo.';
  end if;
  if to_regprocedure('public.athlete_event_offer_bundle(uuid,uuid,text)') is null then
    raise exception 'Falta el resolvedor del paquete por código.';
  end if;
  if has_function_privilege(
    'service_role',
    'public.staff_save_event_combo_offer(text, jsonb, text)',
    'execute'
  ) then
    raise exception 'La escritura del combo sigue abierta.';
  end if;
end
$verification$;
