import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Acceso diario del competidor (20271116120000).
 *
 * La inscripción confirmada habilita la credencial los dos días del torneo.
 * El ingreso se traba por día calendario de Argentina, no por el meet entero.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20271116120000_competitor_daily_access.sql'),
  'utf8',
)

function functionBody(source, signature) {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`No se encontró ${signature}`)
  const end = source.indexOf('$$;', start)
  return source.slice(start, end)
}

describe('migración 20271116120000 — acceso diario del competidor', () => {
  it('suelta el unique eterno y deja uno por día', () => {
    expect(migration).toContain('drop constraint if exists check_ins_registration_id_key')
    expect(migration).toContain('check_ins_registration_access_window_key')
    expect(migration).toContain('on public.check_ins (registration_id, access_window_key)')
    expect(migration).toContain("access_window_key = 'once_total'")
  })

  it('el check-in abre por día y sigue pidiendo afiliación si el evento la exige', () => {
    const body = functionBody(migration, 'function public.staff_check_in_registration')
    expect(body).toContain('plu_private.competitor_access_window_key(clock_timestamp())')
    expect(body).toContain('access_window_key')
    expect(body).toContain('Este competidor ya ingreso hoy.')
    expect(body).toContain("errcode = 'PLU06'")
    expect(body).toMatch(
      /requires_membership[\s\S]*?La afiliacion esta vencida o inactiva\.[\s\S]*?errcode = 'PLU05'/,
    )
  })

  it('la credencial, el perfil y la puerta miran solo el ingreso de hoy', () => {
    const credential = functionBody(migration, 'function plu_private.get_membership_by_code_or_token')
    const visible = functionBody(migration, 'function plu_private.athlete_visible_registrations')
    const snapshot = functionBody(migration, 'function public.get_athlete_snapshot')
    const allowlist = functionBody(migration, 'function public.staff_get_event_checkin_allowlist')
    const board = functionBody(migration, 'function plu_private.board_registration_rows')

    for (const body of [credential, visible, snapshot, allowlist, board]) {
      expect(body).toContain('plu_private.competitor_access_window_key(clock_timestamp())')
    }
    expect(visible).not.toContain('left join public.check_ins c on c.registration_id = r.id')
    expect(snapshot).not.toContain('left join public.check_ins c on c.registration_id = r.id')
    expect(allowlist).toContain("'accessWindowKey', c.access_window_key")
    expect(snapshot).toContain("to_jsonb(o.*) - 'provider_payload'")
    expect(snapshot).toContain("'attempts'")
  })

  it('la lista offline se renueva a la medianoche de Argentina', () => {
    const revision = functionBody(
      migration,
      'function public.staff_get_event_checkin_allowlist_revision',
    )
    expect(revision).toContain(
      "to_char(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')",
    )
  })
})
