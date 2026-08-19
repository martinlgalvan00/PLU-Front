import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Canal Wise (20260825100000): pagos del exterior reusando el flujo manual
 * de aprobación por comprobante, igual que 'cash_pitbull'.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260825100000_wise_transfer_channel.sql'),
  'utf8',
)

describe('migración 20260825100000 — canal Wise', () => {
  it('amplía el CHECK de manual_payment_channel en athlete_payment_orders', () => {
    expect(migration).toContain(
      "check (manual_payment_channel is null or manual_payment_channel in ('bank_transfer', 'cash_pitbull', 'wise_transfer'))",
    )
  })

  it('agrega manual_payment_channel a ticket_orders con backfill de las órdenes manuales existentes', () => {
    expect(migration).toContain('add column if not exists manual_payment_channel text')
    expect(migration).toContain(
      "set manual_payment_channel = 'bank_transfer'\n  where provider = 'manual' and manual_payment_channel is null",
    )
    expect(migration).toContain(
      "check (manual_payment_channel is null or manual_payment_channel in ('bank_transfer', 'wise_transfer'))",
    )
  })

  it('agrega wise_enabled con default false y lo expone en el payload de toggles', () => {
    expect(migration).toContain('add column if not exists wise_enabled boolean not null default false')
    expect(migration).toContain("'wiseEnabled', p_row.wise_enabled")
    expect(migration).toContain("when 'wise' then 'wise_enabled'")
    expect(migration).toContain('v_row.wise_enabled := false;')
  })

  it('settle_manual_checkout_pricing acepta y aplica moneda', () => {
    expect(migration).toContain('p_currency text default null')
    expect(migration).toContain('currency = coalesce(p_currency, currency)')
  })

  it('las tres RPC "_checkout" saltean la política de preventa ARS sólo para wise_transfer, sin afectar NULL (mercado_pago)', () => {
    const occurrences = migration.match(
      /if p_manual_payment_channel is distinct from 'wise_transfer' then/g,
    )
    expect(occurrences).toHaveLength(3)
    expect(migration).not.toMatch(/if p_manual_payment_channel <> 'wise_transfer' then/)
  })

  it('create_ticket_order_v2 valida el canal manual y fija precio propio para wise_transfer', () => {
    expect(migration).toContain("if v_channel not in ('bank_transfer', 'wise_transfer') then")
    expect(migration).toContain("raise exception 'Falta el importe de Wise.'")
    expect(migration).toContain("v_total := (p_buyer ->> 'wiseAmount')::int;")
  })

  it('el bloque de verificación exige wiseEnabled y la nueva firma de settle_manual_checkout_pricing', () => {
    expect(migration).toContain("if v_toggles -> 'wiseEnabled' is null then")
    expect(migration).toContain(
      "to_regprocedure(\n    'plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric,text)'\n  )",
    )
  })
})
