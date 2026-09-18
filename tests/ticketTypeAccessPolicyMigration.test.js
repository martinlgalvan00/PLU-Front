import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261125120000_ticket_type_access_policies.sql',
  'utf8',
)

describe('migración: acceso por tipo de entrada', () => {
  it('mantiene el QR como identificador y la regla de uso en el tipo', () => {
    expect(migration).toContain('access_usage_mode')
    expect(migration).toContain("'once_total'")
    expect(migration).toContain("'once_per_event_day'")
    expect(migration).toContain('resolve_ticket_type_access_window')
  })

  it('permite una única credencial por jornada mediante una llave de consumo', () => {
    expect(migration).toContain('access_window_key')
    expect(migration).toContain('check_ins_ticket_access_window_key')
    expect(migration).toContain("'event_day:'")
  })

  it('activa la duración desde pago en la entrada, no en el token QR', () => {
    expect(migration).toContain('access_activated_at')
    expect(migration).toContain('new.access_activated_at := v_now')
  })

  it('permite una excepción individual auditada sin mutar la credencial', () => {
    expect(migration).toContain('access_override_enabled')
    expect(migration).toContain('staff_set_ticket_access_override')
    expect(migration).toContain('ticket.access_override_updated')
  })
})
