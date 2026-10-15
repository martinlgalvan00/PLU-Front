import { describe, expect, it } from 'vitest'
import { buildEventRegistrationStatusCounts } from '../src/components/admin/AdminEventRegistrationsPanel.jsx'

const EVENT = { slug: 'torneo-a-2026', title: 'Torneo A' }

describe('buildEventRegistrationStatusCounts', () => {
  it('cuenta solo inscripciones del evento (por slug)', () => {
    const counts = buildEventRegistrationStatusCounts(
      [
        { id: '1', eventSlug: 'torneo-a-2026', status: 'confirmada' },
        { id: '2', eventSlug: 'torneo-a-2026', status: 'pendiente_pago' },
        { id: '3', eventSlug: 'otro-2026', status: 'confirmada' },
        { id: '4', event: 'Torneo A', status: 'observada' },
      ],
      EVENT,
    )
    expect(counts.total).toBe(3)
    expect(counts.confirmada).toBe(1)
    expect(counts.pendiente_pago).toBe(1)
    expect(counts.observada).toBe(1)
  })
})
