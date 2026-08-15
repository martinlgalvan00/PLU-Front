import { describe, expect, it } from 'vitest'
import { mapAthleteData } from '../src/services/athleteApi.js'

describe('normalización del padrón para el panel', () => {
  it('conserva fechas de alta y comprobantes para recientes y validaciones', () => {
    const mapped = mapAthleteData({
      athletes: [
        {
          id: 'ath-1',
          full_name: 'Ana Torres',
          document_id: '30111222',
          email: 'ana@plu.test',
          status: 'registrado',
          created_at: '2026-08-11T13:00:00Z',
          updated_at: '2026-08-11T14:00:00Z',
        },
      ],
      memberships: [
        {
          id: 'mem-1',
          athlete_id: 'ath-1',
          status: 'pendiente_pago',
          start_date: '2026-08-11',
          created_at: '2026-08-11T13:10:00Z',
          payment_order_id: 'pay-1',
        },
      ],
      registrations: [
        {
          registration: {
            id: 'reg-1',
            athlete_id: 'ath-1',
            event_slug: 'test-2026',
            category: 'Raw',
            division: 'Open',
            public_visible: false,
            status: 'pendiente_pago',
            payment_order_id: 'pay-1',
            created_at: '2026-08-11T13:20:00Z',
          },
          event: { slug: 'test-2026', title: 'Test 2026' },
        },
      ],
      paymentOrders: [
        {
          id: 'pay-1',
          athlete_id: 'ath-1',
          concept: 'registration',
          amount: 75000,
          method: 'manual_link',
          manual_payment_channel: 'bank_transfer',
          status: 'validacion_manual',
          payment_proof_path: 'pay-1/comprobante.pdf',
          payment_proof_uploaded_at: '2026-08-11T13:30:00Z',
          created_at: '2026-08-11T13:20:00Z',
        },
      ],
    })

    expect(mapped.athletes[0]).toMatchObject({
      createdAt: '2026-08-11T13:00:00Z',
      updatedAt: '2026-08-11T14:00:00Z',
    })
    expect(mapped.memberships[0].createdAt).toBe('2026-08-11T13:10:00Z')
    expect(mapped.registrations[0]).toMatchObject({
      event: 'Test 2026',
      createdAt: '2026-08-11T13:20:00Z',
      paymentStatus: 'validacion_manual',
      publicVisible: false,
    })
    expect(mapped.payments[0]).toMatchObject({
      paymentProofPath: 'pay-1/comprobante.pdf',
      paymentProofUploadedAt: '2026-08-11T13:30:00Z',
      manualPaymentChannel: 'bank_transfer',
    })
  })
})
