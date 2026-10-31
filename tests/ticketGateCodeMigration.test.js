import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/20270107100000_ticket_gate_code.sql', 'utf8')

describe('migración: código de puerta', () => {
  it('agrega un alias único del mismo ticket, sin tocar el QR ni el TCK', () => {
    expect(migration).toContain('add column if not exists gate_code text')
    expect(migration).toContain('tickets_gate_code_key')
    expect(migration).toContain('tickets_gate_code_format')
    expect(migration).toContain('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
    expect(migration).not.toContain('ticket_code_seq')
  })

  it('lo completa al insertar y en las entradas que ya existen', () => {
    expect(migration).toContain('tickets_assign_gate_code')
    expect(migration).toContain('before insert on public.tickets')
    expect(migration).toContain('where gate_code is null')
  })

  it('viaja en la lista offline de la puerta', () => {
    expect(migration).toContain("'gateCode', t.gate_code")
    expect(migration).toContain('staff_get_event_checkin_allowlist')
  })

  it('la credencial del titular muestra el alias y no el documento', () => {
    const credential = readFileSync(
      'supabase/migrations/20270108100000_ticket_gate_code_on_credential.sql',
      'utf8',
    )
    expect(credential).toContain("'gate_code', t.gate_code")
    expect(credential).not.toContain('attendee_dni')
    expect(credential).toContain('get_ticket_by_qr_token')
  })

  it('el listado de la puerta no arrastra el ingreso de otra jornada', () => {
    const list = readFileSync(
      'supabase/migrations/20270109110000_ticket_list_current_window.sql',
      'utf8',
    )
    expect(list).toContain('staff_list_tickets_for_event')
    expect(list).toContain('ci.access_window_key = w.access_window_key')
    expect(list).not.toContain('left join public.check_ins c on c.ticket_id = t.id')
  })

  it('un pase de varias jornadas que seguía en el default entra una vez por día', () => {
    expect(migration).toContain("access_usage_mode = 'once_per_event_day'")
    expect(migration).toContain("coalesce(tt.qr_validity_mode, 'event_days') = 'event_days'")
    expect(migration).toContain(') > 1')
  })
})
