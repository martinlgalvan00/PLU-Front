import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * comboCodeKeepsItsBundlePlan.test.js — PLU ARG
 *
 * 20260922100000 agregó el plazo de financiamiento sobre una copia del cuerpo de
 * 20260912100000 en vez del vigente, y con eso se llevó puestas dos migraciones
 * en tres funciones: el alta dejó de guardar `membership_plan_id`, el panel dejó
 * de leerlo y el preview dejó de devolver `appliesTo`.
 *
 * El síntoma en producción fue exacto: un código dado de alta con tipo
 * "Combo (afiliación + inscripción)" nace sin afiliación, y entonces
 * `plu_private.athlete_unlocked_offer_code` lo filtra, el checkout responde 404
 * y el atleta ve "no se reconoce el código".
 *
 * Estas pruebas fijan la UNIÓN: cada función tiene que tener a la vez la mitad
 * de 20260918100000 (el paquete) y la de 20260922100000 (el plazo). Un
 * `create or replace` copiado de una versión vieja aplica limpio contra
 * Postgres, así que la única red barata es comparar el texto.
 */
const ROOT = process.cwd()
const migration = readFileSync(
  resolve(ROOT, 'supabase/migrations/20260925100000_combo_code_keeps_its_bundle_plan.sql'),
  'utf8',
)

/** El cuerpo de una sola función dentro del archivo, para no cruzar aserciones. */
function functionBody(source, name) {
  const start = source.indexOf(`create or replace function ${name}(`)
  expect(start, `no está ${name} en la migración`).toBeGreaterThan(-1)
  const end = source.indexOf('\n$$;', start)
  expect(end, `no cierra ${name}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('el alta vuelve a resolver y guardar la afiliación del paquete', () => {
  const upsert = functionBody(migration, 'public.staff_upsert_discount_code')

  it('lee la afiliación que eligió el panel', () => {
    expect(upsert).toContain("v_membership_plan_id uuid := nullif(p_code ->> 'membershipPlanId', '')::uuid;")
  })

  it('la resuelve sola cuando el panel no eligió: combo del evento, y si no la única vigente', () => {
    expect(upsert).toContain('v_membership_plan_id := v_combo.membership_plan_id;')
    expect(upsert).toContain('select array_agg(pl.id) into v_plan_ids')
    expect(upsert).toContain(
      "raise exception 'Hay más de una afiliación de pago único vigente: elegí cuál empaqueta el combo.'",
    )
  })

  it('la escribe en la fila, que es lo que se había perdido', () => {
    expect(upsert).toMatch(/insert into public\.discount_codes\([\s\S]*?membership_plan_id/)
    expect(upsert).toMatch(/\) values \([\s\S]*?v_membership_plan_id/)
  })

  it('conserva el plazo de financiamiento de 20260922100000', () => {
    expect(upsert).toContain(
      "v_financing_term_days int := coalesce(nullif(p_code ->> 'financingTermDays', '')::int, 7);",
    )
    expect(upsert).toContain('financing_term_days = v_financing_term_days,')
    expect(upsert).toContain(
      "raise exception 'El plazo de pago tiene que ser de entre 1 y 90 días.'",
    )
  })

  it('vuelve a validar el paquete antes de guardarlo, no en el checkout del atleta', () => {
    expect(upsert).toContain(
      "raise exception 'Elegí a qué inscripción aplica el combo: sin inscripción no hay paquete que armar.'",
    )
    expect(upsert).toContain(
      "raise exception 'El combo se reparte como código: no puede ser una promoción pública.'",
    )
  })
})

describe('el panel vuelve a leer qué afiliación empaqueta cada código', () => {
  const configuration = functionBody(migration, 'public.staff_get_pricing_configuration')

  it('devuelve membershipPlanId junto al resto del código', () => {
    expect(configuration).toContain("'membershipPlanId', c.membership_plan_id,")
  })

  it('sin perder el plazo que agregó 20260922100000', () => {
    expect(configuration).toContain("'financingTermDays', c.financing_term_days,")
    expect(configuration).toContain("'financingTermDays', o.financing_term_days,")
  })
})

describe('el preview vuelve a decir el alcance', () => {
  const preview = functionBody(migration, 'public.athlete_preview_discount_code')

  it('devuelve appliesTo, que es lo único que distingue el paquete de una afiliación suelta', () => {
    expect(preview).toContain("'appliesTo', v_code.applies_to,")
  })

  it('sin perder el plazo', () => {
    expect(preview).toContain("'financingTermDays', v_code.financing_term_days,")
  })
})

describe('el canje no promete un paquete que el checkout no puede armar', () => {
  const unlock = functionBody(migration, 'public.athlete_unlock_offer_code')

  it('un código-paquete sin afiliación contesta offer_unavailable', () => {
    expect(unlock).toContain("elsif v_code.kind = 'fixed_price' and v_code.applies_to = 'combo' then")
  })

  it('y sigue sin exigir el combo legado, que es lo que arregló 20260924100000', () => {
    expect(unlock).toMatch(/elsif v_code\.kind = 'offer' and not exists \(\s*\n\s*select 1 from public\.event_combo_offers/)
  })
})

describe('las filas que se guardaron rotas se arreglan solas', () => {
  it('resuelve la afiliación desde el combo del evento y desde la única vigente', () => {
    expect(migration).toContain('set membership_plan_id = o.membership_plan_id,')
    expect(migration).toContain('set membership_plan_id = pl.id,')
    expect(migration).toContain("and c.applies_to = 'combo'")
    expect(migration).toContain('and c.membership_plan_id is null')
  })

  it('avisa cuál queda sin resolver en vez de cortar el deploy', () => {
    const backfill = migration.slice(
      migration.indexOf('do $backfill$'),
      migration.indexOf('$backfill$;'),
    )
    expect(backfill).toContain('raise notice')
    expect(backfill).not.toContain('raise exception')
  })
})

describe('la verificación corta el próximo rebase accidental', () => {
  it('exige las dos mitades en cada función', () => {
    expect(migration).toContain(
      "raise exception 'staff_upsert_discount_code no guarda la afiliacion del paquete (20260918100000).'",
    )
    expect(migration).toContain(
      "raise exception 'staff_upsert_discount_code no guarda el plazo de financiamiento (20260922100000).'",
    )
    expect(migration).toContain(
      "raise exception 'staff_get_pricing_configuration no devuelve la afiliacion del paquete.'",
    )
    expect(migration).toContain(
      "raise exception 'athlete_preview_discount_code no devuelve el alcance del codigo.'",
    )
  })
})

describe('la bandeja de Finanzas recibe el vencimiento del financiamiento', () => {
  const repository = readFileSync(
    resolve(ROOT, 'server/modules/athletes/supabaseAthleteRepository.js'),
    'utf8',
  )
  const panel = readFileSync(
    resolve(ROOT, 'src/pages/admin/AthletePaymentOrdersSection.jsx'),
    'utf8',
  )

  it('la lista de órdenes trae financed_payment_due_at', () => {
    expect(repository).toMatch(
      /PAYMENT_ORDER_LIST_COLUMNS = \[[\s\S]*?'financed_payment_due_at'[\s\S]*?\]\.join/,
    )
  })

  it('y el snapshot del panel también', () => {
    expect(repository).toMatch(
      /financed_entitlements_revoked_at, financed_payment_due_at'/,
    )
  })

  it('porque la pantalla ya pintaba la cuenta regresiva contra ese campo', () => {
    expect(panel).toContain('financingDueInfo(row.financedPaymentDueAt, t)')
    expect(panel).toContain('financedPaymentDueAt: order.financedPaymentDueAt ?? null,')
  })
})

describe('la migración del gimnasio no corta el corpus local', () => {
  const gym = readFileSync(
    resolve(ROOT, 'supabase/migrations/20260825132710_create_gym_table.sql'),
    'utf8',
  )

  it('las tablas del esquema Prisma se chequean antes de referenciarlas', () => {
    // "Organization" y "OrganizationMember" existen sólo en la base hosteada:
    // sin guarda, `supabase db reset` (local y el de CI) se cortaba acá con
    // 42P01 y ninguna migración posterior llegaba a aplicarse.
    expect(gym).toContain('to_regclass(\'public."Organization"\')')
    expect(gym).toContain('to_regclass(\'public."OrganizationMember"\')')
    expect(gym).not.toMatch(/^ALTER TABLE "public"\."Gym" ADD CONSTRAINT/m)
  })
})
