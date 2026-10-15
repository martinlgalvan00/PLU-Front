import { describe, expect, it } from 'vitest'
import {
  matchesRegistrationEventFilter,
  registrationEventFilterKey,
} from '../src/lib/athleteEventStatus.js'

const EVENT_A = { slug: 'torneo-a-2026', title: 'Torneo A' }
const EVENT_B = { slug: 'torneo-b-2026', title: 'Torneo B' }

describe('registrationEventFilterKey / matchesRegistrationEventFilter', () => {
  it('prioriza slug como clave de filtro', () => {
    expect(
      registrationEventFilterKey({ eventSlug: 'torneo-a-2026', event: 'Torneo A Renombrado' }),
    ).toBe('torneo-a-2026')
  })

  it('cae al título si no hay slug', () => {
    expect(registrationEventFilterKey({ event: 'Torneo Legacy' })).toBe('Torneo Legacy')
  })

  it('filtra por slug aunque el título haya cambiado', () => {
    const registration = { eventSlug: 'torneo-a-2026', event: 'Torneo A Renombrado' }
    expect(matchesRegistrationEventFilter(registration, 'torneo-a-2026', [EVENT_A])).toBe(true)
    expect(matchesRegistrationEventFilter(registration, 'torneo-b-2026', [EVENT_A, EVENT_B])).toBe(
      false,
    )
  })

  it('acepta filtro legacy por título', () => {
    const registration = { event: 'Torneo A', eventSlug: null }
    expect(matchesRegistrationEventFilter(registration, 'Torneo A', [EVENT_A])).toBe(true)
  })

  it('resuelve filas solo-título cuando el filtro es slug vía catálogo', () => {
    const registration = { event: 'Torneo A' }
    expect(matchesRegistrationEventFilter(registration, 'torneo-a-2026', [EVENT_A])).toBe(true)
    expect(matchesRegistrationEventFilter(registration, 'torneo-b-2026', [EVENT_A, EVENT_B])).toBe(
      false,
    )
  })

  it('all deja pasar todo', () => {
    expect(matchesRegistrationEventFilter({ eventSlug: 'x' }, 'all')).toBe(true)
  })
})
