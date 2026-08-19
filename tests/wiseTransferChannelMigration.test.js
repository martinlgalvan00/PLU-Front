import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260827120000_wise_transfer_channel.sql',
  'utf8',
)

describe('migración: Wise como canal de pago manual', () => {
  it('agrega wise_transfer a la matriz concepto x canal, cerrado en los tres conceptos', () => {
    expect(migration).toContain(
      "check (channel in ('mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer'));",
    )
    expect(migration).toContain(
      "select array['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer']::text[];",
    )
    expect(migration).toMatch(
      /'membership', jsonb_build_object\(\s*'mercado_pago', true, 'bank_transfer', false, 'cash_pitbull', false, 'wise_transfer', false\s*\)/,
    )
    expect(migration).toMatch(
      /'ticket', jsonb_build_object\(\s*'mercado_pago', true, 'bank_transfer', true, 'cash_pitbull', false, 'wise_transfer', false\s*\)/,
    )
  })

  it('amplía los CHECK de canal manual en athlete_payment_orders y ticket_orders', () => {
    expect(migration).toContain(
      "check (manual_payment_channel is null or manual_payment_channel in ('bank_transfer', 'cash_pitbull', 'wise_transfer'));",
    )
    expect(migration).toContain('add column if not exists manual_payment_channel text')
    expect(migration).toContain(
      "set manual_payment_channel = 'bank_transfer'\n  where provider = 'manual' and manual_payment_channel is null",
    )
    expect(migration).toContain(
      "check (manual_payment_channel is null or manual_payment_channel in ('bank_transfer', 'wise_transfer'));",
    )
  })

  it('dropea la firma vieja de settle_manual_checkout_pricing antes de agregar p_currency', () => {
    expect(migration).toContain(
      'drop function if exists plu_private.settle_manual_checkout_pricing(uuid, text, text, numeric, numeric);',
    )
    expect(migration).toMatch(
      /create or replace function plu_private\.settle_manual_checkout_pricing\(\s*p_order_id uuid,\s*p_payment_method text,\s*p_manual_payment_channel text,\s*p_default_price numeric,\s*p_manual_price numeric,\s*p_currency text default null\s*\)/,
    )
  })

  it('Wise sale antes por un branch propio, sin tocar resolve_channel_price ni cupones', () => {
    expect(migration).toContain("if p_manual_payment_channel = 'wise_transfer' then")
    expect(migration).toMatch(
      /set amount = coalesce\(p_default_price, amount\),\s*currency = coalesce\(p_currency, currency\),\s*manual_payment_channel = p_manual_payment_channel,\s*updated_at = now\(\)\s*where id = v_order\.id\s*returning \* into v_order;\s*return v_order;\s*end if;/,
    )
    // El branch de Wise corta antes de llegar a resolve_channel_price/cupón.
    const wiseBranchIndex = migration.indexOf("if p_manual_payment_channel = 'wise_transfer' then")
    const resolvePriceIndex = migration.indexOf('plu_private.resolve_channel_price(p_payment_method')
    expect(wiseBranchIndex).toBeGreaterThan(-1)
    expect(resolvePriceIndex).toBeGreaterThan(wiseBranchIndex)
  })

  it('dropea las firmas viejas de las tres RPC de checkout antes de agregar p_currency', () => {
    expect(migration).toContain(
      'drop function if exists public.create_membership_order_checkout(uuid, text, text, text, text, numeric, numeric, text);',
    )
    expect(migration).toContain(
      'drop function if exists public.create_competition_registration_checkout(\n  uuid, text, text, text, numeric, text, text, text, numeric, numeric, text\n);',
    )
    expect(migration).toContain(
      'drop function if exists public.create_membership_registration_combo_checkout(\n  uuid, text, text, text, numeric, text, text, numeric, numeric, text, text\n);',
    )
  })

  it('las tres RPC saltean configure_atomic_checkout_pricing sólo cuando el canal es Wise', () => {
    const skipGuard = "if p_manual_payment_channel is distinct from 'wise_transfer' then"
    expect(migration.split(skipGuard).length - 1).toBe(3)
    expect(migration).toContain(
      "perform plu_private.configure_atomic_checkout_pricing(\n      'membership', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price\n    );",
    )
    expect(migration).toContain(
      "perform plu_private.configure_atomic_checkout_pricing(\n      'registration', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price\n    );",
    )
    expect(migration).toContain(
      "perform plu_private.configure_atomic_checkout_pricing(\n      'combo', p_payment_method, p_manual_payment_channel, p_default_price, p_manual_price\n    );",
    )
  })

  it('las tres RPC de checkout pasan la moneda a settle sólo si el canal es Wise', () => {
    const currencyPassthrough =
      "case when p_manual_payment_channel = 'wise_transfer' then p_currency else null end"
    expect(migration.split(currencyPassthrough).length - 1).toBe(3)
  })

  it('crea el canal en create_ticket_order_v2 sin necesitar drop (firma idéntica)', () => {
    expect(migration).not.toContain('drop function if exists public.create_ticket_order_v2')
    expect(migration).toContain('create or replace function public.create_ticket_order_v2(')
    expect(migration).toContain(
      "v_channel := nullif(trim(p_buyer ->> 'manualPaymentChannel'), '');",
    )
    expect(migration).toContain("if v_channel not in ('bank_transfer', 'wise_transfer') then")
  })

  it('el precio de Wise en entradas viene de p_buyer, no del catálogo ARS', () => {
    expect(migration).toContain("if v_channel = 'wise_transfer' then")
    expect(migration).toContain("v_total := (p_buyer ->> 'wiseAmount')::int;")
    expect(migration).toContain(
      "v_currency := coalesce(nullif(trim(p_buyer ->> 'wiseCurrency'), ''), 'USD');",
    )
  })

  it('verifica en bloque final que wise_transfer nace cerrado y que no quedaron overloads huérfanos', () => {
    expect(migration).toContain(
      "if (v_channels -> v_concept ->> 'wise_transfer')::boolean is distinct from false then",
    )
    expect(migration).toContain(
      "'plu_private.settle_manual_checkout_pricing(uuid,text,text,numeric,numeric)'",
    )
    expect(migration).toContain(
      "'public.create_membership_registration_combo_checkout(uuid,text,text,text,numeric,text,text,numeric,numeric,text,text)'",
    )
  })
})
