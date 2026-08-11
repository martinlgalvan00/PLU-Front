import { describe, expect, it } from 'vitest'
import { resolveAfterLoginDestination } from '../src/lib/navigation.js'

describe('continuidad después del login', () => {
  it('retoma la inscripción elegida por un atleta', () => {
    expect(
      resolveAfterLoginDestination('profile', 'athlete_plu', {
        view: 'competition',
        options: { eventSlug: 'test-2026' },
      }),
    ).toEqual({ view: 'competition', options: { eventSlug: 'test-2026' } })
  })

  it('retoma la afiliación elegida por un atleta', () => {
    expect(
      resolveAfterLoginDestination('profile', 'athlete_plu', {
        view: 'membership',
        options: {},
      }),
    ).toEqual({ view: 'membership', options: {} })
  })

  it('no redirige a un usuario de staff a un flujo de atleta', () => {
    expect(
      resolveAfterLoginDestination('admin', 'admin_maximal', {
        view: 'competition',
        options: { eventSlug: 'test-2026' },
      }),
    ).toEqual({ view: 'admin', options: {} })
  })
})
