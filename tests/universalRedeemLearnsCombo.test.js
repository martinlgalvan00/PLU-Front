import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * universalRedeemLearnsCombo.test.js — PLU ARG
 *
 * `athlete_redeem_promotion_code` (el canje universal de Mi cuenta >
 * Beneficios, y el auto-canje al llegar a un checkout) sólo desbloqueaba las
 * modalidades retiradas 'offer'/'access'. Un código de combo nuevo
 * (`fixed_price` + alcance 'combo', 20260918100000) caía en el `else`
 * genérico y nunca llamaba a `athlete_unlock_offer_code`: sin ese desbloqueo,
 * `plu_private.athlete_unlocked_offer_code` no encuentra nada, y el checkout
 * del torneo no tiene contra qué resolver el paquete. El destino SÍ era
 * correcto (el torneo, no una pestaña retirada) — lo que faltaba era la llave.
 */
const ROOT = process.cwd()
const MIGRATION_PATH = resolve(
  ROOT,
  'supabase/migrations/20260921100000_universal_redeem_learns_combo.sql',
)

describe('el canje universal desbloquea el combo nuevo', () => {
  it('la migración existe en el corpus', () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true)
  })

  const migration = readFileSync(MIGRATION_PATH, 'utf8')

  it('reconoce un precio fijo con alcance combo, no sólo offer/access', () => {
    expect(migration).toContain("v_code.kind = 'fixed_price' and v_code.applies_to = 'combo'")
    expect(migration).toContain(
      'v_unlock := public.athlete_unlock_offer_code(p_organization_id, p_athlete_id, v_code.code);',
    )
  })

  it('un combo desbloqueado aplica en el checkout del torneo, no en una pestaña retirada', () => {
    // El destino de 'offer'/'access' sigue siendo el que ya no existe
    // (account-offer, redirigido a Torneos por AthleteProfilePage): la rama
    // nueva no lo toca. La rama nueva manda al torneo, como cualquier código
    // de esa inscripción.
    expect(migration).toContain("v_action := 'apply_to_checkout';")
    expect(migration).toContain("'view', 'competition',")
  })

  it('rechaza igual que offer/access si el desbloqueo falla', () => {
    // Mismas dos inserciones de auditoría y el mismo motivo de rechazo que la
    // rama histórica: un código de combo que no se puede desbloquear (vencido,
    // agotado, no invitado) no queda a mitad de camino.
    const occurrences = migration.split("coalesce(v_unlock->>'reason', 'not_applicable')").length - 1
    expect(occurrences).toBeGreaterThanOrEqual(4)
  })
})
