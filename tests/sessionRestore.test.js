import { describe, expect, it } from 'vitest'
import { resolveRestoredSession } from '../src/lib/sessionRestore.js'

describe('resolveRestoredSession', () => {
  const staff = { id: 'usr-1', role: 'admin_plu_arg', email: 'admin@pluarg.com' }
  const athlete = {
    role: 'athlete_plu',
    athleteId: 'ath-1',
    email: 'admin@pluarg.com',
  }

  it('en /perfil con ambas cookies restaura atleta con staffAvailable', () => {
    expect(
      resolveRestoredSession({ staffUser: staff, athleteUser: athlete, pathView: 'profile' }),
    ).toEqual({
      mode: 'athlete',
      session: { ...athlete, staffAvailable: true },
    })
  })

  it('fuera de landings de cuenta prioriza staff si hay cookie de panel', () => {
    expect(
      resolveRestoredSession({ staffUser: staff, athleteUser: athlete, pathView: null }),
    ).toEqual({ mode: 'staff', session: staff })
  })

  it('conserva staffAvailable del snapshot de atleta aunque no haya cookie staff', () => {
    expect(
      resolveRestoredSession({
        staffUser: null,
        athleteUser: { ...athlete, staffAvailable: true },
        pathView: 'profile',
      }),
    ).toEqual({
      mode: 'athlete',
      session: { ...athlete, staffAvailable: true },
    })
  })

  it('atleta puro sin bridge no inventa staffAvailable', () => {
    expect(
      resolveRestoredSession({ staffUser: null, athleteUser: athlete, pathView: 'profile' }),
    ).toEqual({
      mode: 'athlete',
      session: { ...athlete, staffAvailable: false },
    })
  })
})
