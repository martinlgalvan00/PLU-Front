import { describe, expect, it } from 'vitest'
import {
  describePaymentConcept,
  paymentConceptInputFromOrder,
  paymentConceptTitle,
} from '../src/lib/paymentConcept.js'

/**
 * En la app de Mercado Pago toda venta de afiliación se llamaba "Afiliación PLU"
 * —el mismo texto para el plan anual, el combo con inscripción y una
 * renovación—, así que ni el atleta en su resumen de tarjeta ni Finanzas podían
 * saber qué se había cobrado.
 */
describe('descripción declarada del cobro', () => {
  it('la afiliación declara modalidad y año', () => {
    expect(
      paymentConceptTitle({ concept: 'membership', planFrequency: 'annual', membershipYear: '2026' }),
    ).toBe('Afiliación PLU anual 2026')
  })

  it('la inscripción nombra el torneo y deja división y categoría en el detalle', () => {
    const described = describePaymentConcept({
      concept: 'registration',
      eventTitle: 'Pitbull Classic',
      division: 'Open',
      category: 'Raw',
    })

    expect(described.title).toBe('Inscripción Pitbull Classic')
    // El detalle no entra al título: Mercado Pago lo recorta.
    expect(described.detail).toBe('Open · Raw')
  })

  it('el combo declara las dos cosas que se están pagando', () => {
    expect(
      paymentConceptTitle({
        concept: 'combo',
        planFrequency: 'annual',
        membershipYear: '2026',
        eventTitle: 'Pitbull Classic',
      }),
    ).toBe('Afiliación PLU anual 2026 + Inscripción Pitbull Classic')
  })

  it('sin año de afiliación usa el de la orden en vez de omitirlo', () => {
    // Antes de acreditar todavía no hay fila de `memberships`, y el cobro igual
    // tiene que decir de qué temporada es.
    expect(
      paymentConceptTitle({ concept: 'membership', planFrequency: 'annual', fallbackYear: '2026' }),
    ).toBe('Afiliación PLU anual 2026')
  })

  it('degrada sin romper cuando no hay contexto', () => {
    expect(paymentConceptTitle({ concept: 'membership' })).toBe('Afiliación PLU')
    expect(paymentConceptTitle({ concept: 'registration' })).toBe('Inscripción a competencia')
    expect(paymentConceptTitle({})).toBe('Pago PLU ARG')
  })

  it('lee una fila de orden tal como la devuelve PostgREST', () => {
    // `membership` y `registration` llegan como array (relación inversa) y
    // `plan` como objeto: el mapeo tiene que aguantar las dos formas.
    const input = paymentConceptInputFromOrder({
      concept: 'combo',
      created_at: '2026-08-20T14:23:21.048Z',
      plan: { billing_frequency: 'annual' },
      membership: [{ year: '2026' }],
      registration: [
        { division: 'Open', category: 'Raw', event: { title: 'Pitbull Classic' } },
      ],
    })

    expect(describePaymentConcept(input).title).toBe(
      'Afiliación PLU anual 2026 + Inscripción Pitbull Classic',
    )
  })
})
