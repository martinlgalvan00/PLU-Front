import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  'supabase/migrations/20261224110000_weight_class_checkout_atomic.sql',
  'utf8',
)
const columnSql = readFileSync(
  'supabase/migrations/20261224100000_registration_declared_weight_class.sql',
  'utf8',
)
const officialSql = readFileSync(
  'supabase/migrations/20261224120000_official_weight_class_and_roster_freeze.sql',
  'utf8',
)

describe('categoría de peso atómica', () => {
  it('la columna histórica acepta null y las clases canónicas', () => {
    expect(columnSql).toContain('add column if not exists declared_weight_class text')
    expect(columnSql).toContain('declared_weight_class is null')
    expect(columnSql).toContain("'67,5'")
    expect(columnSql).toContain("'140+'")
    expect(columnSql).not.toMatch(/update\s+public\.event_registrations\s+set\s+declared_weight_class/i)
  })

  it('el alta envuelve la RPC existente y actualiza en la misma función', () => {
    expect(sql).toContain('create_competition_registration_checkout_v2')
    expect(sql).toContain('create_membership_registration_combo_checkout_v2')
    expect(sql).toContain('public.create_competition_registration_checkout(')
    expect(sql).toContain('public.create_membership_registration_combo_checkout(')
    expect(sql).toContain('set declared_weight_class = v_class')
    expect(sql).not.toContain('drop function if exists public.create_competition_registration_checkout(')
  })

  it('separa la categoría oficial y el cierre del padrón', () => {
    expect(officialSql).toContain('add column if not exists official_weight_class text')
    expect(officialSql).toContain('add column if not exists roster_frozen_at timestamptz')
    expect(officialSql).toContain('official_weight_class is null')
    expect(officialSql).toContain("'140+'")
    expect(officialSql).not.toMatch(/update\s+public\.event_registrations/i)
  })
})
