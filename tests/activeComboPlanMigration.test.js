import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819160000_repoint_active_pitbull_combo_plan.sql'),
  'utf8',
)

describe('oferta activa del combo Pitbull', () => {
  it('siempre toma la última versión anual vigente y no altera órdenes históricas', () => {
    expect(migration).toContain("family_code = 'plu-annual'")
    expect(migration).toContain('active = true')
    expect(migration).toContain('retired_at is null')
    expect(migration).toContain("event.slug = 'pitbull-classic-2026'")
    expect(migration).toContain('offer.membership_plan_id <> active_annual_plan.id')
  })
})
