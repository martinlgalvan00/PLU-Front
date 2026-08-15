import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260823110000_registration_commitment_and_public_visibility.sql'),
  'utf8',
)
const routes = readFileSync(resolve(process.cwd(), 'server/routes/athletes.js'), 'utf8')
const repository = readFileSync(
  resolve(process.cwd(), 'server/modules/athletes/supabaseAthleteRepository.js'),
  'utf8',
)

describe('compromiso competitivo y padrón público', () => {
  it('mantiene inmutables división, categoría y peso declarado ante cualquier update', () => {
    expect(migration).toContain('lock_registration_competition_selection')
    expect(migration).toContain('new.division := old.division')
    expect(migration).toContain('new.category := old.category')
    expect(migration).toContain('new.bodyweight_kg := old.bodyweight_kg')
  })

  it('publica por defecto, permite ocultar desde staff y no altera el cupo', () => {
    expect(migration).toContain('public_visible boolean not null default true')
    expect(migration).toContain('staff_set_registration_public_visibility')
    expect(migration).toMatch(/and r\.public_visible[\s\S]*and r\.status in \('pendiente_pago', 'pagada', 'confirmada'\)/)
    expect(migration).toMatch(/where r\.event_id = v_event\.id\s+and r\.status in \('pendiente_pago', 'pagada', 'confirmada'\);/)
  })

  it('protege la mutación con permisos y la dirige a una RPC auditada', () => {
    expect(routes).toContain("'/admin/registrations/:registrationId/public-visibility'")
    expect(routes).toContain('...registrationWriteGuard')
    expect(repository).toContain("rpc(\n      'staff_set_registration_public_visibility'")
  })

  it('habilita completar datos competitivos pendientes sin reescribir los oficiales existentes', () => {
    expect(migration).toContain('update_athlete_profile_v4')
    expect(migration).toContain('sex = coalesce(p_sex, sex)')
    expect(migration).toContain('when nullif(trim(full_name), \'\') is null then nullif(trim(p_full_name), \'\')')
    expect(migration).toContain('birth_date = case when birth_date is null then p_birth_date else birth_date end')
    expect(migration).toContain('country = case')
    expect(repository).toContain("rpc('update_athlete_profile_v4'")
  })
})
