import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819200000_fix_database_lint.sql'),
  'utf8',
)

describe('correcciones para el lint de Supabase', () => {
  it('retira la sobrecarga de egresos que referencia una función inexistente', () => {
    expect(migration).toContain(
      'drop function if exists public.create_financial_expense(date, text, text, integer, uuid, text, text)',
    )
    expect(migration).toContain(
      "to_regprocedure('public.create_financial_expense(date,text,text,integer,uuid,text,text)') is not null",
    )
    expect(migration).toContain(
      "to_regprocedure('public.create_financial_expense(date,text,text,integer,uuid,text,text,uuid)') is null",
    )
  })

  it('bloquea y valida al atleta sin declarar una variable sin uso', () => {
    expect(migration).toContain('perform 1 from public.athletes where id = p_athlete_id for update')
    expect(migration).toContain('if not found then')
    expect(migration).not.toContain('v_athlete public.athletes')
  })
})
