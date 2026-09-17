import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261122100000_ticket_type_description_and_validity.sql',
  'utf8',
)

describe('migración: descripción y vigencia de entradas', () => {
  it('persiste la descripción configurable del tipo', () => {
    expect(migration).toContain('add column if not exists description text null')
    expect(migration).toContain('staff_merge_ticket_type_descriptions')
  })

  it('congela una ventana de validez en cada QR emitido', () => {
    expect(migration).toContain('add column if not exists valid_from timestamptz')
    expect(migration).toContain('add column if not exists valid_until timestamptz')
    expect(migration).toContain("at time zone 'America/Argentina/Buenos_Aires'")
    expect(migration).toContain(
      "(b.last_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires'",
    )
    expect(migration).toContain('before insert on public.tickets')
  })

  it('hace cumplir la misma ventana al escanear online y al bajar la allowlist', () => {
    expect(migration).toContain('clock_timestamp() < v_ticket.valid_from')
    expect(migration).toContain('clock_timestamp() >= v_ticket.valid_until')
    expect(migration).toContain(
      'create or replace function public.staff_get_event_checkin_allowlist',
    )
    expect(migration).toMatch(/'validFrom', t\.valid_from,[\s\S]*'validUntil', t\.valid_until/)
  })
})
