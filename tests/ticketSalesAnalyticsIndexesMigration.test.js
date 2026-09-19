import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261128100000_ticket_sales_analytics_indexes.sql',
  'utf8',
)

describe('migración: índices para el reporte de ventas de entradas', () => {
  it('agrega el índice de recaudado por evento sólo para órdenes aprobadas', () => {
    expect(migration).toContain(
      'create index if not exists ticket_orders_event_created_approved_idx\n' +
        '  on public.ticket_orders (event_id, created_at desc)\n' +
        "  where status = 'aprobado';",
    )
  })

  it('agrega el índice de entradas vendidas filtrando is_primary_credential', () => {
    expect(migration).toContain(
      'create index if not exists tickets_event_created_primary_idx\n' +
        '  on public.tickets (event_id, created_at desc)\n' +
        "  where is_primary_credential and status <> 'cancelada';",
    )
  })

  it('son índices normales, no concurrently (corren dentro de la transacción de la migración)', () => {
    expect(migration).not.toMatch(/create index concurrently/i)
  })

  it('actualiza estadísticas de las dos tablas al final', () => {
    expect(migration).toContain('analyze public.ticket_orders;')
    expect(migration).toContain('analyze public.tickets;')
  })
})
