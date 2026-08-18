import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812160000_pricing_recurring_75k_2026.sql'),
  'utf8',
)

describe('migración pricing recurring 75k 2026', () => {
  it('versiona el plan recurring a 75000 sin mutar price in-place', () => {
    expect(migration).toContain("collection_mode = 'recurring'")
    expect(migration).toContain("'plu-annual-auto'")
    expect(migration).toContain('75000')
    expect(migration).toMatch(/insert into public\.membership_plans[\s\S]*'recurring'/)
    expect(migration).toContain('v_source.price is distinct from 75000')
    expect(migration).not.toMatch(/update public\.membership_plans\s+set\s+price\s*=\s*75000/)
    expect(migration).toContain('retired_at = v_effective')
    expect(migration).toContain('active = false')
  })

  it('reafirma one-time 75k, evento 75k y combo 120k', () => {
    expect(migration).toContain("collection_mode = 'one_time'")
    expect(migration).toContain("slug = 'pitbull-classic-2026'")
    expect(migration).toMatch(/update public\.events[\s\S]*price = 75000/)
    expect(migration).toContain("'comboPrice', 120000")
    expect(migration).toMatch(/insert into public\.event_combo_offers[\s\S]*120000/)
    expect(migration).toContain('pricing.recurring_75k_2026_applied')
  })
})
