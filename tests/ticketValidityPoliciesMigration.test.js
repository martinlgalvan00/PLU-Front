import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261125110000_ticket_qr_validity_policies.sql',
  'utf8',
)

describe('migración: políticas de vigencia de QR', () => {
  it('define jornadas, ventana fija y duración desde pago', () => {
    expect(migration).toContain("'event_days'")
    expect(migration).toContain("'fixed_window'")
    expect(migration).toContain("'from_payment'")
    expect(migration).toContain('qr_validity_duration_minutes')
  })

  it('activa la duración relativa de forma atómica al acreditarse el pago', () => {
    expect(migration).toContain('activate_ticket_validity_on_payment')
    expect(migration).toContain("new.status = 'pagada'")
    expect(migration).toContain('clock_timestamp()')
    expect(migration).toContain('make_interval(mins => new.qr_validity_duration_minutes)')
  })

  it('mantiene el snapshot y registra los cambios de política', () => {
    expect(migration).toContain("new.qr_validity_mode := coalesce(v_mode, 'event_days')")
    expect(migration).toContain('event.ticket_qr_validity_policy_updated')
    expect(migration).toContain('staff_merge_ticket_type_validity_policy')
  })
})
