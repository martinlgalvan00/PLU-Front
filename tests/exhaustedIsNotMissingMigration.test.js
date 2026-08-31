import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * exhaustedIsNotMissingMigration.test.js — PLU ARG
 *
 * Dos cosas que el rechazo de un código le contaba mal al atleta:
 *
 *   1. Un cupo agotado salía como 'inactive', y `concealInactiveReason` lo
 *      colapsa a 'not_found' — así que un código repartido a mano que se
 *      llenaba le decía al resto "Ese código no existe.".
 *   2. El preview salteaba su cascade ante CUALQUIER redención propia
 *      (20261017100000), así que un código ya usado y pagado seguía anunciando
 *      un ahorro sobre otra compra que el alta después rechaza con PLU22.
 *
 * La antienumeración no se toca: una pausa de staff sigue siendo indistinguible
 * de un código inexistente.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261018100000_exhausted_is_not_missing.sql'),
  'utf8',
)

describe('agotado no es inexistente', () => {
  it('el motivo del apagado sale de un solo lugar', () => {
    expect(migration).toContain(
      'create or replace function plu_private.inactive_code_reason(p_code public.discount_codes)',
    )
    // El sello del autocierre es lo que separa "se agotó" de "lo pausó staff":
    // `staff_set_discount_code_state` lo borra siempre.
    expect(migration).toContain('when p_code.quota_closed_at is not null')
    expect(migration).toContain("then 'limit_reached'")
    expect(migration).toContain("else 'inactive'")
  })

  it('exige además el cupo efectivamente lleno, no sólo el sello', () => {
    // Un sello colgado no puede convertir una pausa en un "se agotó" que el
    // contador desmiente.
    expect(migration).toContain('p_code.max_redemptions is not null')
    expect(migration).toContain('where r.discount_code_id = p_code.id')
    expect(migration).toContain(') >= p_code.max_redemptions')
  })

  it('lo usan las tres puertas del atleta, y no queda ningún motivo crudo', () => {
    for (const fn of [
      'public.athlete_preview_discount_code',
      'public.athlete_redeem_promotion_code',
      'public.athlete_unlock_offer_code',
    ]) {
      expect(migration).toContain(`create or replace function ${fn}(`)
    }
    expect(
      migration.match(/plu_private\.inactive_code_reason\(v_code\)/g),
    ).toHaveLength(3)
    // Ninguna de las tres se quedó con el literal viejo.
    expect(migration).not.toContain("'reason', 'inactive'")
  })

  it('las tres siguen siendo del service_role y de nadie más', () => {
    expect(
      migration.match(/revoke all on function\s+(public|plu_private)\.[a-z_]+/g),
    ).toHaveLength(4)
    expect(migration.match(/grant execute on function/g)).toHaveLength(3)
    // El helper no se expone: sólo lo llaman las RPC, que ya son security definer.
    expect(migration).not.toContain('grant execute on function plu_private.inactive_code_reason')
  })
})

describe('el preview saltea su cascade sólo por una compra viva', () => {
  it('la redención que perdona es la de una orden abierta', () => {
    expect(migration).toContain('join public.athlete_payment_orders o on o.id = r.payment_order_id')
    // 'creado' no existe en el check de `athlete_payment_orders`: son las dos.
    expect(migration).toContain("and o.status in ('pendiente', 'validacion_manual')")
  })

  it('con la orden cerrada vuelve "ya lo usaste", antes que el cupo', () => {
    // 20260928100000 puso 'already_used' antes de 'limit_reached': si el tope
    // está lleno CON la redención propia, "se agotó" sugiere que se lo llevaron
    // otros.
    const alreadyUsed = migration.indexOf("'reason', 'already_used'")
    const limitReached = migration.indexOf("'reason', 'limit_reached'")
    expect(alreadyUsed).toBeGreaterThan(-1)
    expect(limitReached).toBeGreaterThan(-1)
    expect(alreadyUsed).toBeLessThan(limitReached)
  })

  it('no toca la puerta dura', () => {
    // La integridad la sigue arbitrando `apply_discount_code_to_order` dentro de
    // la transacción que crea la orden: esta migración sólo corrige lo que se
    // anuncia.
    expect(migration).not.toContain(
      'create or replace function public.apply_discount_code_to_order',
    )
    // Ni el unique que impide una segunda orden con el mismo código.
    expect(migration).not.toContain('discount_code_redemptions_athlete_uidx')
    expect(migration).not.toContain('alter table')
  })
})
