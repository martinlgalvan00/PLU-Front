import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Canal Wise (20260825120000): pagos del exterior reusando el flujo manual
 * de aprobación por comprobante, igual que 'cash_pitbull'. Se apoya sobre el
 * precio configurable por canal (20260824100000) y el settle con cupones
 * (20260825100000) sin reemplazarlos.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260825120000_wise_transfer_channel.sql'),
  'utf8',
)

describe('migración 20260825120000 — canal Wise', () => {
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

  it('dropea explícitamente cada firma vigente antes de agregar el parámetro nuevo (CREATE OR REPLACE con más parámetros crea un overload, no reemplaza)', () => {
    expect(migration).toContain(
      'drop function if exists plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric);',
    )
    expect(migration).toContain(
      'drop function if exists public.create_membership_order_checkout(uuid, text, text, text, text, numeric, numeric, text);',
    )
    expect(migration).toContain(
      'drop function if exists public.create_competition_registration_checkout(',
    )
    expect(migration).toContain(
      'drop function if exists public.create_membership_registration_combo_checkout(',
    )
  })

  it('settle_manual_checkout_pricing resuelve Wise en un branch temprano, sin tocar resolve_channel_price ni la lógica de cupón vigente', () => {
    expect(migration).toContain("if p_manual_payment_channel = 'wise_transfer' then")
    expect(migration).toContain('plu_private.resolve_channel_price(p_payment_method, p_default_price, p_manual_price)')
    expect(migration).toContain('plu_private.resolve_discount_amount(v_base, v_code.kind, v_code.percent_off, v_code.fixed_price)')
  })

  it('las tres RPC "_checkout" saltean configure_atomic_checkout_pricing sólo para wise_transfer, sin afectar mercado_pago (NULL)', () => {
    const occurrences = migration.match(
      /if p_manual_payment_channel is distinct from 'wise_transfer' then/g,
    )
    expect(occurrences).toHaveLength(3)
  })

  it('create_ticket_order_v2 valida el canal manual y fija precio propio para wise_transfer', () => {
    expect(migration).toContain("if v_channel not in ('bank_transfer', 'wise_transfer') then")
    expect(migration).toContain("raise exception 'Falta el importe de Wise.'")
    expect(migration).toContain("v_total := (p_buyer ->> 'wiseAmount')::int;")
  })

  it('el bloque de verificación exige wiseEnabled, la nueva firma de settle_manual_checkout_pricing y que no queden overloads viejos', () => {
    expect(migration).toContain("if v_toggles -> 'wiseEnabled' is null then")
    expect(migration).toContain(
      "to_regprocedure(\n    'plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric,numeric,text)'\n  )",
    )
    expect(migration).toContain(
      "to_regprocedure(\n    'plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric,numeric)'\n  ) is not null then",
    )
  })
})
