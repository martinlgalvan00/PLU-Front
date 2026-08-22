import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * offerCodeWithoutCombo.test.js — PLU ARG
 *
 * Crear una oferta secreta eran dos objetos y tres pantallas: cargar el combo
 * del evento, después el código, y sólo entonces el atleta podía canjear. De
 * las siete cosas que guarda `event_combo_offers`, seis ya vivían en el código;
 * la séptima —qué afiliación se empaqueta— era la que obligaba a cargar el
 * combo antes. 20260913100000 le da ese dato al código y corta la dependencia
 * en las cuatro capas donde estaba atada: alta, canje, ficha y compra.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260913100000_offer_code_without_combo.sql'),
  'utf8',
)

/** El cuerpo de una función de la migración, para no buscar en todo el archivo. */
function functionBody(header) {
  const start = migration.indexOf(header)
  expect(start).toBeGreaterThan(-1)
  const end = migration.indexOf('\n$$;\n', start)
  expect(end).toBeGreaterThan(start)
  return migration.slice(start, end)
}

describe('esquema: la oferta nombra su paquete', () => {
  it('agrega la afiliación empaquetada sin poder borrarla por debajo', () => {
    expect(migration).toContain('add column if not exists membership_plan_id uuid')
    // `restrict` y no `cascade`: borrar el plan de una oferta que alguien tiene
    // en la mano no es limpieza de catálogo.
    expect(migration).toContain('references public.membership_plans(id) on delete restrict')
  })

  it('sólo una oferta instancia un paquete, y toda oferta tiene uno', () => {
    expect(migration).toContain("check (membership_plan_id is null or kind = 'offer')")
    expect(migration).toContain("check (kind <> 'offer' or membership_plan_id is not null)")
  })

  it('el backfill conserva lo que cada oferta ya vendía', () => {
    // Primero el plan del combo de su inscripción: es exactamente el paquete
    // que esa oferta estaba cobrando.
    expect(migration).toContain('set membership_plan_id = o.membership_plan_id')
    expect(migration).toContain('from public.event_combo_offers o')
  })

  it('no adivina el paquete cuando hay más de una afiliación vigente', () => {
    // El segundo paso sólo corre con una única candidata, y si queda alguna
    // oferta sin paquete la migración corta con el código a la vista en vez de
    // repuntar a ciegas lo que alguien ya compró.
    expect(migration).toContain(') = 1;')
    expect(migration).toContain("select string_agg(code, ', ' order by code) into v_pending")
    expect(migration).toContain('Estas ofertas no tienen combo cargado')
  })
})

describe('la guarda que vivía en un trigger', () => {
  const guard = functionBody(
    'create or replace function plu_private.assert_secret_code_combo_visibility()',
  )

  it('deja de exigir el combo sólo para la oferta autosuficiente', () => {
    // Era la capa que hacía imposible el orden inverso, y la única que no se ve
    // leyendo funciones: rechazaba el INSERT del código, no su uso.
    expect(guard).toContain(
      "and not (new.kind = 'offer' and new.membership_plan_id is not null) then",
    )
  })

  it('para un access sigue exigiendo combo encendido y restringido', () => {
    expect(guard).toContain("if not found or not v_combo.active or v_combo.audience <> 'code' then")
    expect(guard).toContain('El codigo secreto requiere un combo habilitado y restringido.')
  })

  it('no recrea el trigger ni cambia las columnas que lo disparan', () => {
    // La misma firma sigue atada al trigger existente. Y el backfill escribe
    // `membership_plan_id`, que no está en su `update of`: no dispara.
    expect(migration).not.toContain('create trigger discount_codes_secret_combo_visibility')
    expect(migration).not.toContain('drop trigger')
  })
})

describe('alta: la oferta resuelve su paquete y su techo', () => {
  const upsert = functionBody('create or replace function public.staff_upsert_discount_code(')

  it('ya no exige que la inscripción tenga combo cargado', () => {
    expect(upsert).not.toContain('todavía no tiene combo de afiliación e inscripción configurado')
  })

  it('resuelve el paquete en tres pasos, del más explícito al más general', () => {
    expect(upsert).toContain("v_membership_plan_id uuid := nullif(p_code ->> 'membershipPlanId', '')::uuid")
    expect(upsert).toContain('v_membership_plan_id := v_combo.membership_plan_id;')
    expect(upsert).toContain('select array_agg(pl.id) into v_plan_ids')
    expect(upsert).toContain('v_membership_plan_id := v_plan_ids[1];')
  })

  it('con más de una afiliación vigente pide elegir en vez de adivinar', () => {
    expect(upsert).toContain('if cardinality(v_plan_ids) > 1 then')
    expect(upsert).toContain('elegí cuál empaqueta la oferta')
  })

  it('el techo es lo que el atleta pagaría sin el código', () => {
    // Con combo encendido es su precio (la regla anterior); sin combo, la suma
    // de las partes.
    expect(upsert).toContain('if v_combo.id is not null and v_combo.active then')
    expect(upsert).toContain('v_ceiling := least(v_combo.price, v_plan.price + v_event.price);')
    expect(upsert).toContain('v_ceiling := v_plan.price + v_event.price;')
    expect(upsert).toContain('if v_fixed_price >= v_ceiling then')
  })

  it('una oferta sin precio propio sigue necesitando el combo', () => {
    // Es la contracara: sin importe, lo que se cobra es el precio del combo.
    expect(upsert).toContain("if v_kind = 'access' and v_event_id is not null and not exists (")
    expect(upsert).toContain('Poné un precio o cargá el combo.')
  })

  it('el paquete no queda colgado al cambiar de modalidad', () => {
    expect(upsert).toContain("if v_kind <> 'offer' then\n    v_membership_plan_id := null;")
  })

  it('escribe la columna en el alta y en la edición', () => {
    expect(upsert).toContain('membership_plan_id = v_membership_plan_id,')
    expect(upsert).toContain('financed, membership_plan_id\n      ) values (')
  })
})

describe('canje: la vigencia del paquete es la del código', () => {
  const unlock = functionBody('create or replace function public.athlete_unlock_offer_code(')

  it('con plan propio valida el plan, no el combo', () => {
    expect(unlock).toContain('if v_code.membership_plan_id is not null then')
    expect(unlock).toContain("and pl.collection_mode = 'one_time'")
  })

  it('sin plan propio sigue exigiendo el combo vigente, y ahora no archivado', () => {
    expect(unlock).toContain('elsif not exists (\n      select 1 from public.event_combo_offers o')
    expect(unlock).toContain('and o.archived_at is null')
  })
})

describe('ficha: la oferta canjeada no desaparece de Mi cuenta', () => {
  const listing = functionBody('create or replace function public.athlete_list_offer_unlocks(')

  it('el combo pasó de obligatorio a una de las dos fuentes del paquete', () => {
    expect(listing).toContain('left join public.event_combo_offers o')
    expect(listing).toContain('o.id is not null\n      or exists (')
  })
})

describe('compra: el paquete puede venir de la llave', () => {
  const core = functionBody(
    'create or replace function public.create_membership_registration_combo_order_core(',
  )

  it('sin combo vigente resuelve el paquete con la llave ya canjeada', () => {
    expect(core).toContain('v_offer_code := plu_private.athlete_unlocked_offer_code(')
    // Sin llave se comporta igual que antes: no hay combo que vender.
    expect(core).toContain("raise exception 'El combo no esta disponible para este evento.'")
  })

  it('la orden nace al precio de lista y el código la baja después', () => {
    expect(core).toContain('else v_plan.price + v_event.price')
    expect(core).toContain("'combo', v_bundle_price,")
    expect(core).toContain('upper(v_bundle_currency), p_payment_method,')
  })

  it('no inventa un combo en la respuesta cuando no hay ninguno', () => {
    expect(core).toContain("'comboOffer', case when v_has_combo then to_jsonb(v_offer) else null end")
    expect(core).toContain("'offerCodeId', v_offer_code.id,")
  })

  it('una sola definición de "este atleta tiene la llave"', () => {
    // La comparte con el resolvedor de precio que lee Express: duplicarla
    // dejaría al panel cotizando una cosa y a la RPC cobrando otra.
    expect(migration).toContain(
      'create or replace function plu_private.athlete_unlocked_offer_code(',
    )
    expect(
      migration.match(/plu_private\.athlete_unlocked_offer_code\(p_athlete_id/g),
    ).toHaveLength(2)
  })
})

describe('precio del paquete para Express', () => {
  const bundle = functionBody('create or replace function public.athlete_event_offer_bundle(')

  it('con combo vigente no opina: manda el combo', () => {
    expect(bundle).toContain('if exists (\n    select 1 from public.event_combo_offers o')
    expect(bundle).toContain('return null;')
  })

  it('cotiza la suma de las partes por canal', () => {
    expect(bundle).toContain("'price', v_plan.price + v_event.price")
    expect(bundle).toContain('coalesce(v_plan.manual_price, v_plan.price)')
    expect(bundle).toContain('coalesce(v_event.manual_price, v_event.price)')
  })

  it('el paquete de una llave nunca es público ni tiene código de combo', () => {
    expect(bundle).toContain("'audience', 'code'")
    expect(bundle).toContain("'accessCode', null")
  })

  it('queda cerrado al navegador', () => {
    expect(migration).toContain(
      'revoke all on function public.athlete_event_offer_bundle(uuid, uuid, text)\n  from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.athlete_event_offer_bundle(uuid, uuid, text)\n  to service_role;',
    )
  })
})

describe('borrar un plan explica qué lo está usando', () => {
  const del = functionBody('create or replace function public.staff_delete_membership_plan(')

  it('una oferta que empaqueta el plan bloquea el borrado con un mensaje', () => {
    expect(del).toContain('select 1 from public.discount_codes where membership_plan_id = p_plan_id')
    expect(del).toContain('Hay códigos de oferta que empaquetan este plan.')
    // El combo se sigue limpiando: es configuración del catálogo, no un precio
    // pactado con alguien.
    expect(del).toContain('delete from public.event_combo_offers\n  where membership_plan_id = p_plan_id;')
  })
})

describe('disciplina de migraciones', () => {
  it('ninguna función reemplazada cambia de firma', () => {
    expect(migration).toContain("raise exception 'Quedaron overloads de las funciones reemplazadas.'")
    // Ningún `drop function` ejecutado: la cabecera lo menciona para explicar
    // por qué no hace falta, y eso no es una sentencia.
    expect(migration).not.toMatch(/^\s*drop function/im)
  })

  it('verifica el invariante antes de dar la migración por buena', () => {
    expect(migration).toContain("raise exception 'Hay ofertas exclusivas sin afiliación empaquetada.'")
  })
})
