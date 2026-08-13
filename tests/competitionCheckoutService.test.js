import { describe, expect, it } from 'vitest'
import {
  buildCompetitionCreatedOrder,
  findOpenPaymentForRegistration,
  findPendingEventRegistration,
} from '../src/services/competitionCheckoutService.js'

const event = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }
const athlete = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  email: 'ana@plu.test',
}

describe('competitionCheckoutService', () => {
  it('encuentra la inscripción impaga del atleta en ese evento', () => {
    const pending = findPendingEventRegistration(
      [
        { athleteId: 'ath-1', eventSlug: 'otro', status: 'pendiente_pago' },
        {
          athleteId: 'ath-1',
          eventSlug: 'pitbull-classic-2026',
          status: 'pendiente_pago',
          paymentOrderId: 'ord-1',
        },
        {
          athleteId: 'ath-1',
          eventSlug: 'pitbull-classic-2026',
          status: 'confirmada',
          paymentOrderId: 'ord-2',
        },
      ],
      { athleteId: athlete.id, event },
    )
    expect(pending.paymentOrderId).toBe('ord-1')
  })

  it('no reanuda una orden ya cerrada', () => {
    const registration = { paymentOrderId: 'ord-1' }
    expect(
      findOpenPaymentForRegistration(
        [{ id: 'ord-1', status: 'aprobado', method: 'manual_link' }],
        registration,
      ),
    ).toBeNull()
    expect(
      findOpenPaymentForRegistration(
        [{ id: 'ord-1', status: 'validacion_manual', method: 'manual_link', amount: 120000 }],
        registration,
      )?.method,
    ).toBe('manual_link')
  })

  it('arma el createdOrder de competencia para abrir el checkout', () => {
    const created = buildCompetitionCreatedOrder({
      athlete,
      payment: {
        id: 'ord-1',
        concept: 'Afiliación + inscripción Pitbull Classic 2026',
        amount: 120000,
        method: 'manual_link',
        status: 'validacion_manual',
        reference: 'RORD-1',
        createdAt: '2026-08-13T12:00:00.000Z',
      },
      purchaseType: 'combo',
      session: { email: 'ana@plu.test' },
    })
    expect(created.type).toBe('competition')
    expect(created.paymentMethod).toBe('manual_link')
    expect(created.paymentId).toBe('ord-1')
    expect(created.amount).toBe(120000)
  })
})
