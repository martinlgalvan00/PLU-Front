import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812170000_pitbull_registration_price_75k.sql'),
  'utf8',
)
const registrationOpenMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260812171000_pitbull_registration_open.sql'),
  'utf8',
)
const seed = readFileSync(resolve(process.cwd(), 'supabase/seed.sql'), 'utf8')

describe('precio de inscripción Pitbull Classic', () => {
  it('corrige el catálogo Supabase a ARS 75.000 de forma identificable', () => {
    expect(migration).toContain("slug = 'pitbull-classic-2026'")
    expect(migration).toContain('set price = 75000')
    expect(migration).toContain("currency = 'ARS'")
    expect(migration).toContain("'registrationPrice', 75000")
    expect(migration).toContain("'migration:20260812170000'")
  })

  it('abre la inscripcion real para que la RPC no rechace el checkout', () => {
    expect(registrationOpenMigration).toContain("slug = 'pitbull-classic-2026'")
    expect(registrationOpenMigration).toContain("status = 'inscripcion_abierta'")
    expect(registrationOpenMigration).toContain('published = true')
    expect(registrationOpenMigration).toContain("'migration:20260812171000'")
  })

  it('siembra Pitbull abierto: db reset aplica seed despues de las migraciones', () => {
    expect(seed).toMatch(
      /'pitbull-classic-2026'[\s\S]*?'inscripcion_abierta'[\s\S]*?75000,\s*'ARS'/,
    )
  })
})
