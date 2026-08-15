import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EVENT_PRICING, isTicketSalesEnabled } from '../src/lib/eventPricing.js'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260823120000_suspend_spectator_ticket_sales.sql'),
  'utf8',
)

describe('suspensión de ventas de entradas', () => {
  it('parte cerrada y sólo abre una venta marcada explícitamente', () => {
    expect(DEFAULT_EVENT_PRICING.ticketsEnabled).toBe(false)
    expect(isTicketSalesEnabled({})).toBe(false)
    expect(isTicketSalesEnabled({ pricing: { ticketsEnabled: true } })).toBe(true)
  })

  it('cierra los toggles y eventos existentes sin tocar tickets emitidos', () => {
    expect(migration).toContain('set ticket_enabled = false')
    expect(migration).toContain("'{ticketsEnabled}', 'false'::jsonb")
    expect(migration).toContain('Las órdenes y QR emitidos previamente no se modifican.')
  })
})
