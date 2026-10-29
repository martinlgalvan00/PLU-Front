import { describe, expect, it } from 'vitest'
import { resolveCheckinEvent } from '../src/lib/checkinEvent.js'

const NOW = new Date('2026-12-11T15:00:00-03:00')
const EVENTS = [
  { id: 'a', slug: 'barbell-submission-2027', startsAt: '2027-03-06T12:00:00Z' },
  {
    id: 'b',
    slug: 'pitbull-classic-2026',
    startsAt: '2026-12-11T12:00:00Z',
    endsAt: '2026-12-11T23:00:00Z',
  },
  { id: 'c', slug: 'torneo-viejo', startsAt: '2026-05-01T12:00:00Z' },
]

describe('resolveCheckinEvent', () => {
  it('usa el evento asignado a la cuenta de seguridad', () => {
    expect(resolveCheckinEvent({ eventSlug: 'barbell-submission-2027' }, EVENTS, NOW).id).toBe('a')
  })

  it('sin evento asignado, toma el que está en curso antes que el próximo', () => {
    expect(resolveCheckinEvent({}, EVENTS, NOW).slug).toBe('pitbull-classic-2026')
  })

  it('pasado el evento en curso, pasa al próximo', () => {
    expect(resolveCheckinEvent({}, EVENTS, new Date('2026-12-20T12:00:00Z')).slug).toBe(
      'barbell-submission-2027',
    )
  })

  it('una cuenta asignada a un evento que no está en la lista igual conserva su slug', () => {
    expect(resolveCheckinEvent({ eventSlug: 'otro' }, EVENTS, NOW)).toEqual({ slug: 'otro' })
  })
})
