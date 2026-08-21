import { describe, expect, it } from 'vitest'
import { derivePaymentProgress } from '../src/lib/paymentProgress.js'
import {
  findAthleteStateDivergences,
  isPlaceholderReason,
  resolveEntitlementBacking,
} from '../src/services/stateCoherenceService.js'

/**
 * El caso real que originó esto: Michelle Sofía Correa, afiliación 'activa' con
 * la orden de Mercado Pago en 'cancelado'. La orden nunca tuvo un intento de
 * cobro (venció a los 30 minutos) y un operador activó la afiliación a mano
 * cuatro horas después porque la plata había llegado por transferencia.
 *
 * Los datos son los de esa fila, no un fixture inventado: es lo que garantiza
 * que la pantalla explique EL caso que se reportó y no una versión idealizada.
 */
const MICHELLE_ORDER_ID = '321e2026-0db4-4968-9f7e-a57d874cf3cc'

function cancelledMembershipOrder(overrides = {}) {
  return {
    id: MICHELLE_ORDER_ID,
    concept: 'Afiliación anual',
    conceptType: 'membership',
    status: 'cancelado',
    method: 'mercado_pago',
    amount: 85000,
    createdAt: '2026-08-20T19:06:32.131105+00:00',
    updatedAt: '2026-08-20T19:39:00.100422+00:00',
    expiresAt: '2026-08-20T19:36:32.131105+00:00',
    cancellationCode: 'resolved_off_platform',
    cancellationReason: null,
    ...overrides,
  }
}

function activeMembership(overrides = {}) {
  return {
    id: 'd5fe8171-fd58-4906-a3bd-2d08f5c66073',
    status: 'activa',
    paymentOrderId: MICHELLE_ORDER_ID,
    manualOverride: {
      status: 'activa',
      channel: 'bank_transfer',
      reason: 'Pagó por transferencia el 20/08.',
      by: 'cmss0uv:staff@pluarg.com.ar',
      at: '2026-08-20T23:35:55.487078+00:00',
    },
    ...overrides,
  }
}

describe('motivo de cierre persistido', () => {
  it('usa el código sellado por la base en vez de inferirlo de las fechas', () => {
    const progress = derivePaymentProgress({
      order: cancelledMembershipOrder(),
      attempts: [],
      outcome: { kind: 'membership', status: 'activa' },
    })

    expect(progress.state).toBe('cancelado')
    expect(progress.reasonCode).toBe('resolved_off_platform')
    // El derecho quedó otorgado con el cobro muerto: es la línea que evita que
    // la ficha se contradiga entre el tab de Afiliaciones y el de Pagos.
    expect(progress.resolvedElsewhere).toBe(true)
  })

  it('no reporta un vencimiento cuando la orden se cerró antes de vencer', () => {
    // La heurística vieja comparaba `updated_at >= expires_at`. Una orden
    // reemplazada por otra se cierra ANTES de vencer, así que la inferencia no
    // la alcanzaba; el código sellado sí la nombra.
    const progress = derivePaymentProgress({
      order: cancelledMembershipOrder({
        cancellationCode: 'superseded_by_new_order',
        updatedAt: '2026-08-20T19:10:00.000000+00:00',
      }),
      attempts: [],
    })

    expect(progress.reasonCode).toBe('superseded_by_new_order')
  })

  it('distingue vencer sin intentos de vencer con un intento rechazado', () => {
    const sinIntentos = derivePaymentProgress({
      order: cancelledMembershipOrder({ cancellationCode: 'expired_without_payment' }),
      attempts: [],
    })
    const conIntento = derivePaymentProgress({
      order: cancelledMembershipOrder({ cancellationCode: 'expired_after_failed_attempt' }),
      attempts: [
        {
          status: 'rechazado',
          status_detail: 'cc_rejected_high_risk',
          created_at: '2026-08-20T19:20:00Z',
        },
      ],
    })

    expect(sinIntentos.reasonCode).toBe('expired_without_attempt')
    expect(conIntento.reasonCode).toBe('expired_after_attempt')
    // El motivo del intento viaja aparte: "venció" y "la tarjeta rechazó" son
    // dos datos, y el segundo es el que pregunta el atleta.
    expect(conIntento.attemptReasonCode).toBe('cc_rejected_high_risk')
  })

  it('no deja que el relleno del backfill tape la frase del catálogo', () => {
    // El backfill copió "Sin motivo registrado…" a algunas órdenes. El texto
    // libre normalmente gana sobre el catálogo, y acá eso mostraría un hueco en
    // lugar de la única frase que el operador necesita leer: que no corresponde
    // acreditar esta orden.
    const progress = derivePaymentProgress({
      order: cancelledMembershipOrder({
        cancellationReason: 'Sin motivo registrado (anterior a 20260910100000).',
      }),
      attempts: [],
    })

    expect(progress.reasonText).toBeNull()
    expect(progress.reasonCode).toBe('resolved_off_platform')
  })

  it('respeta el motivo escrito por una persona', () => {
    const progress = derivePaymentProgress({
      order: cancelledMembershipOrder({
        cancellationReason: 'RECIBÍ EL PAGO Y TODA LA INFORMACIÓN CORRECTAMENTE.',
      }),
      attempts: [],
    })

    expect(progress.reasonText).toBe('RECIBÍ EL PAGO Y TODA LA INFORMACIÓN CORRECTAMENTE.')
  })

  it('cae a la inferencia por fechas cuando la fila no trae el campo sellado', () => {
    const progress = derivePaymentProgress({
      order: cancelledMembershipOrder({ cancellationCode: null }),
      attempts: [],
    })

    expect(progress.reasonCode).toBe('expired_without_attempt')
  })
})

describe('resolveEntitlementBacking', () => {
  it('marca la divergencia como explicada cuando hay canal y motivo escrito', () => {
    const backing = resolveEntitlementBacking(activeMembership(), [cancelledMembershipOrder()])

    expect(backing.diverges).toBe(true)
    expect(backing.explained).toBe(true)
    expect(backing.backing).toBe('manual')
    expect(backing.closureCode).toBe('resolved_off_platform')
  })

  it('trata el texto de relleno del backfill como un pendiente, no como motivo', () => {
    const backing = resolveEntitlementBacking(
      activeMembership({
        manualOverride: {
          ...activeMembership().manualOverride,
          reason: 'Sin motivo registrado (anterior a 20260910100000).',
        },
      }),
      [cancelledMembershipOrder()],
    )

    expect(backing.diverges).toBe(true)
    // Es el estado real de las tres afiliaciones que había al migrar: la
    // divergencia está declarada pero nadie escribió por qué, y eso tiene que
    // seguir apareciendo como algo que falta.
    expect(backing.explained).toBe(false)
  })

  it('no marca divergencia cuando la orden está aprobada', () => {
    const backing = resolveEntitlementBacking(
      activeMembership({ manualOverride: null }),
      [cancelledMembershipOrder({ status: 'aprobado', cancellationCode: null })],
    )

    expect(backing.diverges).toBe(false)
    expect(backing.backing).toBe('payment')
  })

  it('ignora un derecho que no está otorgado', () => {
    expect(
      resolveEntitlementBacking(activeMembership({ status: 'cancelada' }), [
        cancelledMembershipOrder(),
      ]),
    ).toBeNull()
  })

  it('no inventa divergencia cuando no hay orden vinculada', () => {
    const backing = resolveEntitlementBacking(
      activeMembership({ paymentOrderId: null }),
      [cancelledMembershipOrder()],
    )

    expect(backing.diverges).toBe(false)
    expect(backing.backing).toBe('manual')
  })
})

describe('findAthleteStateDivergences', () => {
  it('junta afiliaciones e inscripciones otorgadas sobre cobros cerrados', () => {
    const divergences = findAthleteStateDivergences({
      memberships: [activeMembership()],
      registrations: [
        {
          id: 'reg-1',
          status: 'confirmada',
          paymentOrderId: 'order-reg',
          manualOverride: {
            status: 'confirmada',
            channel: null,
            reason: 'RECIBÍ EL PAGO Y TODA LA INFORMACIÓN CORRECTAMENTE.',
            by: 'cmss0uv:staff@pluarg.com.ar',
            at: '2026-08-17T23:51:59.513412+00:00',
          },
        },
        // Confirmada con la orden aprobada: no es divergencia y no debe listarse.
        { id: 'reg-2', status: 'confirmada', paymentOrderId: 'order-ok' },
      ],
      payments: [
        cancelledMembershipOrder(),
        { id: 'order-reg', status: 'cancelado', cancellationCode: 'resolved_off_platform' },
        { id: 'order-ok', status: 'aprobado' },
      ],
    })

    expect(divergences.map((item) => item.kind)).toEqual(['membership', 'registration'])
    expect(divergences.every((item) => item.backing.explained)).toBe(true)
  })

  it('no devuelve nada cuando todo cierra', () => {
    expect(
      findAthleteStateDivergences({
        memberships: [activeMembership({ manualOverride: null })],
        registrations: [],
        payments: [cancelledMembershipOrder({ status: 'aprobado' })],
      }),
    ).toEqual([])
  })
})

describe('isPlaceholderReason', () => {
  it('reconoce el hueco que dejó el backfill y nada más', () => {
    expect(isPlaceholderReason('Sin motivo registrado (anterior a 20260910100000).')).toBe(true)
    expect(isPlaceholderReason('Pagó por transferencia.')).toBe(false)
    expect(isPlaceholderReason(null)).toBe(false)
  })
})
