import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Inscripción sin afiliación activa (20260809180000).
 *
 * Crear la inscripción ya no exige membership vigente; el gate PLU05 queda
 * solo en check-in cuando el evento pide afiliación.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260809180000_registration_without_active_membership.sql',
  ),
  'utf8',
)

const checkinGate = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260806240000_checkin_membership_gate.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

describe('migración 20260809180000 — inscripción sin afiliación activa', () => {
  it('create_competition_registration_v2 ya no lanza PLU05 por requires_membership', () => {
    const body = functionBody(migration, 'function public.create_competition_registration_v2')
    expect(body).not.toMatch(/requires_membership[\s\S]*?errcode = 'PLU05'/)
    expect(body).not.toContain('Necesitas una afiliacion activa y vigente.')
  })

  it('sigue validando evento abierto, cupo y anti-duplicado', () => {
    const body = functionBody(migration, 'function public.create_competition_registration_v2')
    expect(body).toContain("v_event.status = 'agotado'")
    expect(body).toContain("errcode = 'PLU04'")
    expect(body).toContain('Ya estas inscripto en este evento.')
    expect(body).toContain("errcode = 'PLU08'")
  })

  it('la proyección de credencial expone requires_membership', () => {
    const lookup = functionBody(migration, 'function plu_private.get_membership_by_code_or_token')
    expect(lookup).toContain("'requires_membership', coalesce(v_event.requires_membership, true)")

    const visible = functionBody(migration, 'function plu_private.athlete_visible_registrations')
    expect(visible).toContain("'requires_membership', requires_membership")
  })

  it('el check-in sigue exigiendo afiliación cuando el evento la pide', () => {
    const body = functionBody(checkinGate, 'function public.staff_check_in_registration')
    expect(body).toMatch(
      /requires_membership[\s\S]*?La afiliacion esta vencida o inactiva\.[\s\S]*?errcode = 'PLU05'/,
    )
  })
})
