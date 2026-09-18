import { describe, expect, it } from 'vitest'
import {
  aggregateCapacity,
  aggregateRevenue,
  bucketByDay,
} from '../server/modules/ticketing/ticketSalesAggregation.js'

describe('aggregateCapacity', () => {
  const types = [
    { id: 'general', name: 'General', quota: 100 },
    { id: 'vip', name: 'VIP', quota: 10 },
  ]

  it('cuenta vendidas (pagada) y reservadas (no cancelada) por tipo', () => {
    const rows = [
      { ticket_type_id: 'general', status: 'pagada' },
      { ticket_type_id: 'general', status: 'pagada' },
      { ticket_type_id: 'general', status: 'pendiente_pago' },
      { ticket_type_id: 'general', status: 'cancelada' },
      { ticket_type_id: 'vip', status: 'pagada' },
    ]
    const result = aggregateCapacity(types, 150, rows)

    const general = result.byType.find((row) => row.ticketTypeId === 'general')
    expect(general).toEqual({
      ticketTypeId: 'general',
      name: 'General',
      quota: 100,
      sold: 2,
      reserved: 3,
      pending: 1,
    })
    const vip = result.byType.find((row) => row.ticketTypeId === 'vip')
    expect(vip.sold).toBe(1)
    expect(vip.reserved).toBe(1)

    expect(result.totals).toEqual({
      sold: 3,
      reserved: 4,
      pending: 1,
      eventLimit: 150,
      remaining: 146,
    })
  })

  it('una compra de entrenador (2 credenciales) sólo cuenta 1 porque el SELECT ya filtró is_primary_credential', () => {
    // El repositorio filtra `is_primary_credential = true` antes de llamar acá,
    // así que la fila secundaria de una compra de entrenador nunca llega. Esta
    // fixture representa esa llamada correcta: 1 fila por entrada real.
    const rows = [{ ticket_type_id: 'general', status: 'pagada' }]
    const result = aggregateCapacity(types, null, rows)
    expect(result.totals.sold).toBe(1)
  })

  it('sin tope de evento, remaining es null (no 0)', () => {
    const result = aggregateCapacity(types, null, [])
    expect(result.totals.eventLimit).toBeNull()
    expect(result.totals.remaining).toBeNull()
  })

  it('remaining nunca baja de 0 aunque haya más reservadas que el límite', () => {
    const rows = [
      { ticket_type_id: 'general', status: 'pagada' },
      { ticket_type_id: 'general', status: 'pagada' },
      { ticket_type_id: 'general', status: 'pagada' },
    ]
    const result = aggregateCapacity(types, 2, rows)
    expect(result.totals.remaining).toBe(0)
  })

  it('un ticket_type_id que no está en el catálogo (tipo desactivado) igual suma al total del evento', () => {
    const rows = [{ ticket_type_id: 'descontinuado', status: 'pagada' }]
    const result = aggregateCapacity(types, null, rows)
    expect(result.totals.sold).toBe(1)
    expect(result.byType.every((row) => row.ticketTypeId !== 'descontinuado')).toBe(true)
  })
})

describe('aggregateRevenue', () => {
  it('separa Mercado Pago, transferencia y efectivo, todos en ARS', () => {
    const rows = [
      { provider: 'mercado_pago', manual_payment_channel: null, currency: 'ARS', amount: 10000 },
      { provider: 'manual', manual_payment_channel: 'bank_transfer', currency: 'ARS', amount: 8000 },
      { provider: 'manual', manual_payment_channel: 'cash_pitbull', currency: 'ARS', amount: 5000 },
    ]
    const result = aggregateRevenue(rows)

    expect(result.byCurrency).toEqual([{ currency: 'ARS', amount: 23000, orders: 3 }])
    expect(result.byChannel).toEqual(
      expect.arrayContaining([
        { key: 'mercado_pago', currency: 'ARS', amount: 10000, orders: 1 },
        { key: 'bank_transfer', currency: 'ARS', amount: 8000, orders: 1 },
        { key: 'cash_pitbull', currency: 'ARS', amount: 5000, orders: 1 },
      ]),
    )
  })

  it('una orden Wise en USD no se mezcla con el total ARS', () => {
    const rows = [
      { provider: 'mercado_pago', manual_payment_channel: null, currency: 'ARS', amount: 10000 },
      { provider: 'manual', manual_payment_channel: 'wise_transfer', currency: 'USD', amount: 50 },
    ]
    const result = aggregateRevenue(rows)

    const ars = result.byCurrency.find((row) => row.currency === 'ARS')
    const usd = result.byCurrency.find((row) => row.currency === 'USD')
    expect(ars.amount).toBe(10000)
    expect(usd.amount).toBe(50)
    // Nunca un total combinado que sume 10050 sin unidad: son monedas distintas.
    expect(result.byCurrency).toHaveLength(2)

    const wiseChannel = result.byChannel.find((row) => row.key === 'wise_transfer')
    expect(wiseChannel.currency).toBe('USD')
    expect(wiseChannel.amount).toBe(50)
  })

  it('sin órdenes, devuelve arrays vacíos en vez de romper', () => {
    const result = aggregateRevenue([])
    expect(result).toEqual({ byCurrency: [], byChannel: [] })
  })
})

describe('bucketByDay', () => {
  it('llena todos los días del rango, incluso sin ventas', () => {
    const rows = [{ created_at: '2026-03-02T15:00:00.000Z' }]
    const result = bucketByDay(rows, '2026-03-01T00:00:00.000Z', '2026-03-04T00:00:00.000Z')

    expect(result).toEqual([
      { date: '2026-03-01', count: 0 },
      { date: '2026-03-02', count: 1 },
      { date: '2026-03-03', count: 0 },
    ])
  })

  it('agrupa varias ventas del mismo día', () => {
    const rows = [
      { created_at: '2026-03-01T09:00:00.000Z' },
      { created_at: '2026-03-01T22:00:00.000Z' },
    ]
    const result = bucketByDay(rows, '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z')
    expect(result).toEqual([{ date: '2026-03-01', count: 2 }])
  })
})
