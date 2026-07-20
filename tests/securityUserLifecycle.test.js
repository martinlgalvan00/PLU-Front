import { describe, expect, it } from 'vitest'
import { classifySecurityUsers } from '../server/jobs/securityUserLifecycleJob.js'

const GRACE_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-19T12:00:00.000Z')

function eventsMap(entries) {
  return new Map(entries.map(([id, endsAt]) => [id, { endsAt }]))
}

describe('classifySecurityUsers', () => {
  it('no toca cuentas de un evento en curso', () => {
    const users = [{ eventId: 'evt-live', status: 'active' }]
    const eventsById = eventsMap([['evt-live', '2026-07-20T00:00:00.000Z']]) // termina mañana
    const result = classifySecurityUsers({ users, eventsById, now: NOW, graceMs: GRACE_MS })
    expect(result).toEqual({ disableEventIds: [], purgeEventIds: [] })
  })

  it('desactiva pero no purga dentro de la gracia', () => {
    const users = [{ eventId: 'evt-just-ended', status: 'active' }]
    // terminó hace 1 h, gracia de 24 h todavía no cumplida
    const eventsById = eventsMap([['evt-just-ended', '2026-07-19T11:00:00.000Z']])
    const result = classifySecurityUsers({ users, eventsById, now: NOW, graceMs: GRACE_MS })
    expect(result.disableEventIds).toEqual(['evt-just-ended'])
    expect(result.purgeEventIds).toEqual([])
  })

  it('purga (y desactiva) pasada la gracia', () => {
    const users = [{ eventId: 'evt-old', status: 'disabled' }]
    // terminó hace 2 días -> gracia de 24 h cumplida
    const eventsById = eventsMap([['evt-old', '2026-07-17T12:00:00.000Z']])
    const result = classifySecurityUsers({ users, eventsById, now: NOW, graceMs: GRACE_MS })
    expect(result.disableEventIds).toEqual(['evt-old'])
    expect(result.purgeEventIds).toEqual(['evt-old'])
  })

  it('trata como huérfano al evento ausente del Map (borrado de Supabase)', () => {
    const users = [{ eventId: 'evt-gone', status: 'active' }]
    const result = classifySecurityUsers({ users, eventsById: new Map(), now: NOW, graceMs: GRACE_MS })
    expect(result.disableEventIds).toEqual(['evt-gone'])
    expect(result.purgeEventIds).toEqual(['evt-gone'])
  })

  it('ignora cuentas sin eventId', () => {
    const users = [{ eventId: null, status: 'active' }]
    const result = classifySecurityUsers({ users, eventsById: new Map(), now: NOW, graceMs: GRACE_MS })
    expect(result).toEqual({ disableEventIds: [], purgeEventIds: [] })
  })

  it('deduplica: varias cuentas del mismo evento producen un solo eventId', () => {
    const users = [
      { eventId: 'evt-old', status: 'active' },
      { eventId: 'evt-old', status: 'disabled' },
    ]
    const eventsById = eventsMap([['evt-old', '2026-07-17T12:00:00.000Z']])
    const result = classifySecurityUsers({ users, eventsById, now: NOW, graceMs: GRACE_MS })
    expect(result.disableEventIds).toEqual(['evt-old'])
    expect(result.purgeEventIds).toEqual(['evt-old'])
  })

  it('no clasifica eventos sin ends_at (fin desconocido)', () => {
    const users = [{ eventId: 'evt-nofin', status: 'active' }]
    const eventsById = eventsMap([['evt-nofin', null]])
    const result = classifySecurityUsers({ users, eventsById, now: NOW, graceMs: GRACE_MS })
    expect(result).toEqual({ disableEventIds: [], purgeEventIds: [] })
  })
})
