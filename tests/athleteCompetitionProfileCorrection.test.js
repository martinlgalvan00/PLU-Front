import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isProfileComplete } from '../src/lib/athleteProfile.js'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20261114100000_athlete_competition_profile_and_staff_correction.sql',
  ),
  'utf8',
)
const routes = readFileSync(resolve(process.cwd(), 'server/routes/athletes.js'), 'utf8')
const repository = readFileSync(
  resolve(process.cwd(), 'server/modules/athletes/supabaseAthleteRepository.js'),
  'utf8',
)

describe('perfil competitivo editable y corrección staff', () => {
  it('permite a staff saltar el lock de la inscripción con una RPC auditada', () => {
    expect(migration).toContain("current_setting('plu.skip_competition_lock', true) = 'on'")
    expect(migration).toContain('staff_correct_registration_competition')
    expect(migration).toContain('registration.competition_corrected')
    expect(migration).toContain("perform set_config('plu.skip_competition_lock', 'on', true)")
    expect(routes).toContain("'/admin/registrations/:registrationId/competition-correction'")
    expect(repository).toMatch(/rpc\(\s*'staff_correct_registration_competition'/)
  })

  it('persiste división, categoría y peso estimado desde el perfil del atleta', () => {
    expect(migration).toContain('update_athlete_profile_v5')
    expect(migration).toContain('p_estimated_weight numeric')
    expect(repository).toMatch(/rpc\(\s*'update_athlete_profile_v5'/)
    expect(repository).toContain('p_division: data.division')
    expect(repository).toContain('estimated_weight')
  })

  it('exige división, categoría y peso estimado para considerar el perfil completo', () => {
    const complete = {
      phone: '1155551234',
      city: 'Banfield',
      province: 'Buenos Aires',
      gym: 'Maximal',
      division: 'Junior',
      category: 'Raw',
      estimatedWeight: 90,
    }
    expect(isProfileComplete(complete).complete).toBe(true)
    expect(isProfileComplete({ ...complete, division: 'Open', estimatedWeight: '' }).missing).toEqual(
      ['estimatedWeight'],
    )
  })
})
