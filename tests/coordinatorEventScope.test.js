import { describe, expect, it } from 'vitest'
import { assertEventAccess } from '../server/lib/eventScope.js'

const PITBULL = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function coordinatorReq() {
  return {
    auth: {
      user: {
        eventScoped: true,
        eventAccess: [{ eventId: PITBULL, eventSlug: 'pitbull-classic-2026' }],
      },
    },
  }
}

describe('alcance del coordinador de seguridad', () => {
  it('opera Pitbull Classic y recibe 403 en otro evento', () => {
    const req = coordinatorReq()
    expect(() => assertEventAccess(req, { eventId: PITBULL, slug: 'pitbull-classic-2026' })).not.toThrow()
    expect(() => assertEventAccess(req, { eventId: OTHER })).toThrow(/no tiene acceso/)
    try {
      assertEventAccess(req, { slug: 'otro-evento' })
    } catch (error) {
      expect(error.status).toBe(403)
      expect(error.details.code).toBe('event_not_assigned')
    }
  })
})
