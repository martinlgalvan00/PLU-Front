import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Reinscripción tras cancelada (20260814120000).
 *
 * Bug: create_competition_registration_v2 y create_membership_registration_
 * combo_order_core buscaban una fila previa en event_registrations por
 * (event_id, athlete_id) sin filtrar por status, así que una inscripción
 * 'cancelada' (la deja el vencimiento de una orden sin pagar) bloqueaba para
 * siempre volver a inscribirse al mismo evento con "Ya estas inscripto".
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260814120000_registration_cancelled_reregistration_fix.sql',
  ),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

describe('migración 20260814120000 — reinscripción tras cancelada', () => {
  it('create_competition_registration_v2 excluye cancelada del chequeo de duplicado', () => {
    const body = functionBody(migration, 'function public.create_competition_registration_v2')
    expect(body).toMatch(
      /where event_id = v_event\.id and athlete_id = p_athlete_id and status <> 'cancelada'/,
    )
    expect(body).toContain('Ya estas inscripto en este evento.')
    expect(body).toContain("errcode = 'PLU08'")
  })

  it('create_membership_registration_combo_order_core excluye cancelada del chequeo de duplicado', () => {
    const body = functionBody(
      migration,
      'function public.create_membership_registration_combo_order_core',
    )
    expect(body).toMatch(
      /where event_id = v_event\.id and athlete_id = p_athlete_id and status <> 'cancelada'/,
    )
    expect(body).toContain('Ya estas inscripto en este evento.')
    expect(body).toContain("errcode = 'PLU08'")
  })

  it('mantiene el resto de las validaciones intactas (cupo, evento, idempotencia)', () => {
    const registration = functionBody(
      migration,
      'function public.create_competition_registration_v2',
    )
    const combo = functionBody(
      migration,
      'function public.create_membership_registration_combo_order_core',
    )
    for (const body of [registration, combo]) {
      expect(body).toContain("errcode = 'PLU04'")
      expect(body).toContain("errcode = 'PLU02'")
      expect(body).toContain('idempotency_key')
    }
  })
})
