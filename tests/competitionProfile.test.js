import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getMissingCompetitionProfileFields } from '../src/services/competitionProfile.js'

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260819140000_athlete_profile_competition_snapshot.sql',
  ),
  'utf8',
)
const routes = readFileSync(resolve(process.cwd(), 'server/routes/athletes.js'), 'utf8')
const bestTotalMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260819150000_athlete_declared_best_total.sql'),
  'utf8',
)

const completeAthlete = {
  fullName: 'Martina Rivas',
  birthDate: '1998-04-12',
  sex: 'Femenino',
  gym: 'Pitbull Team',
  phone: '11 4567 8901',
  country: 'Argentina',
  province: 'Buenos Aires',
}

describe('perfil reutilizable para inscripción', () => {
  it('identifica sólo los datos competitivos que faltan', () => {
    expect(getMissingCompetitionProfileFields(completeAthlete)).toEqual([])
    expect(
      getMissingCompetitionProfileFields({ ...completeAthlete, gym: '', province: null }),
    ).toEqual(['gym', 'province'])
  })

  it('no convierte el contacto de emergencia ni Instagram en un bloqueo de adultos', () => {
    expect(getMissingCompetitionProfileFields(completeAthlete)).toEqual([])
  })

  it('el backend revisa el perfil antes de crear inscripción o combo', () => {
    expect(
      routes.match(/assertCompetitionProfileComplete\(await repo\(\)\.findCompetitionProfile/g),
    ).toHaveLength(2)
    expect(routes).toContain("code: 'ATHLETE_PROFILE_INCOMPLETE'")
  })
})

describe('persistencia de perfil y snapshot operativo', () => {
  it('guarda contacto de emergencia e Instagram sólo a través de la RPC v2', () => {
    expect(migration).toContain('emergency_contact_name')
    expect(migration).toContain('emergency_contact_phone')
    expect(migration).toContain('instagram_handle')
    expect(migration).toContain('create or replace function public.update_athlete_profile_v2')
    expect(migration).toContain('grant execute on function public.update_athlete_profile_v2')
  })

  it('captura el perfil en la inserción de la inscripción, sin sobrescribir historial', () => {
    expect(migration).toContain('athlete_profile_snapshot jsonb not null')
    expect(migration).toContain('before insert on public.event_registrations')
    expect(migration).toContain('capture_registration_athlete_snapshot')
  })

  it('mantiene el mejor total declarado separado de los resultados oficiales', () => {
    expect(bestTotalMigration).toContain('declared_best_total_kg numeric(6,2)')
    expect(bestTotalMigration).toContain('update_athlete_profile_v3')
    expect(bestTotalMigration).toContain("'declaredBestTotalKg', v_athlete.declared_best_total_kg")
    expect(bestTotalMigration).toContain(
      'no reemplaza resultados oficiales importados desde LiftingCast',
    )
  })
})
