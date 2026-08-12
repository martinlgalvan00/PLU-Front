import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260812140000_athlete_identity_trigger_record_fix.sql',
  'utf8',
)

describe('trigger de auditoria de identidad de atleta', () => {
  it('resuelve el id por rama sin leer columnas inexistentes del record NEW', () => {
    expect(migration).toContain("if tg_table_name = 'athletes' then")
    expect(migration).toContain('v_athlete_id := new.id;')
    expect(migration).toContain('v_athlete_id := new.athlete_id;')
    expect(migration).toContain('v_athlete_id::text')
    expect(migration).not.toContain("case when tg_table_name = 'athletes'")
  })
})
