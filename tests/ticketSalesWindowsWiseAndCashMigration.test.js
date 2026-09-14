import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261119100000_ticket_sales_windows_wise_price_and_cash.sql',
  'utf8',
)

describe('migración: ventana por tipo, precio Wise propio y efectivo en entradas', () => {
  it('agrega las columnas del tipo de entrada con sus topes', () => {
    expect(migration).toContain('add column if not exists wise_price int null')
    expect(migration).toContain(
      'check (wise_price is null or (wise_price > 0 and wise_price <= 100000));',
    )
    expect(migration).toContain('add column if not exists sales_opens_at timestamptz null')
    expect(migration).toContain('add column if not exists sales_closes_at timestamptz null')
  })

  it('la ventana invertida no se puede guardar: sería un tipo que nunca se vende', () => {
    expect(migration).toMatch(
      /add constraint ticket_types_sales_window_check\s*check \(\s*sales_opens_at is null\s*or sales_closes_at is null\s*or sales_closes_at > sales_opens_at\s*\);/,
    )
  })

  it('ticket_orders acepta efectivo además de transferencia y Wise', () => {
    expect(migration).toMatch(
      /add constraint ticket_orders_manual_payment_channel_check\s*check \(\s*manual_payment_channel is null\s*or manual_payment_channel in \('bank_transfer', 'cash_pitbull', 'wise_transfer'\)\s*\);/,
    )
    expect(migration).toContain(
      "if v_channel not in ('bank_transfer', 'cash_pitbull', 'wise_transfer') then",
    )
  })

  it('staff_upsert_event persiste los tres campos nuevos, en alta y en edición', () => {
    expect(migration).toContain("wise_price = nullif(v_type ->> 'wisePrice', '')::int,")
    expect(migration).toContain(
      "sales_opens_at = nullif(v_type ->> 'salesOpensAt', '')::timestamptz,",
    )
    expect(migration).toContain(
      "sales_closes_at = nullif(v_type ->> 'salesClosesAt', '')::timestamptz,",
    )
    expect(migration).toMatch(
      /insert into public\.ticket_types\(\s*event_id, name, price, quota, sort_order, active,\s*wise_price, sales_opens_at, sales_closes_at\s*\)/,
    )
  })

  it('create_ticket_order_v2 corta por la ventana del tipo, sin dejar de mirar la del evento', () => {
    expect(migration).toContain(
      'if v_event.ticket_sales_opens_at is not null and now() < v_event.ticket_sales_opens_at then',
    )
    expect(migration).toContain(
      'if v_type.sales_opens_at is not null and now() < v_type.sales_opens_at then',
    )
    expect(migration).toContain(
      'if v_type.sales_closes_at is not null and now() > v_type.sales_closes_at then',
    )
  })

  it('el efectivo se acredita sin comprobante; transferencia y Wise lo siguen exigiendo', () => {
    expect(migration).toContain(
      "if v_without_proof and v_order.manual_payment_channel is distinct from 'cash_pitbull' then",
    )
    expect(migration).toContain("'withoutProof', v_without_proof")
  })

  it('las tres funciones quedan sólo para service_role', () => {
    for (const grant of [
      'grant execute on function public.staff_upsert_event(jsonb, text)\n  to service_role;',
      'grant execute on function public.create_ticket_order_v2(text, jsonb, jsonb, text, text)\n  to service_role;',
      'grant execute on function public.staff_approve_ticket_order(uuid, text) to service_role;',
    ]) {
      expect(migration).toContain(grant)
    }
    expect(migration).toContain(
      'revoke all on function public.staff_approve_ticket_order(uuid, text) from public, anon, authenticated;',
    )
  })
})
