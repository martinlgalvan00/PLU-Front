import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261121100000_ticket_type_manual_price.sql',
  'utf8',
)

describe('migración: precio de entradas por medio de pago (manual_price)', () => {
  it('agrega la columna con su tope, espejo de events.manual_price', () => {
    expect(migration).toContain('add column if not exists manual_price int null')
    expect(migration).toContain(
      'check (manual_price is null or (manual_price > 0 and manual_price <= 10000000));',
    )
  })

  it('el helper resuelve por canal manual y deja afuera a Wise', () => {
    expect(migration).toContain(
      'create or replace function plu_private.resolve_ticket_channel_price(',
    )
    expect(migration).toMatch(
      /when p_provider = 'manual'\s*and p_manual_channel in \('bank_transfer', 'cash_pitbull'\)\s*and p_manual_price is not null\s*then p_manual_price/,
    )
    // wise_transfer no debe aparecer en ninguna rama del case: su precio es el
    // USD de wise_price, no este descuento en pesos.
    const helperBody = migration.slice(
      migration.indexOf('create or replace function plu_private.resolve_ticket_channel_price('),
      migration.indexOf('$$;', migration.indexOf('resolve_ticket_channel_price(')),
    )
    expect(helperBody).not.toContain('wise_transfer')
    expect(migration).toContain(
      'revoke all on function plu_private.resolve_ticket_channel_price(text, text, numeric, numeric)\n  from public, anon, authenticated;',
    )
  })

  it('create_ticket_order_v2 cobra por canal en los dos lugares donde arma v_unit_price', () => {
    const calls = migration.match(
      /v_unit_price := plu_private\.resolve_ticket_channel_price\(\s*v_provider, v_channel, v_type\.price, v_type\.manual_price\s*\)::int \+ coalesce\(\(v_addon_result ->> 'total'\)::int, 0\);/g,
    )
    expect(calls).toHaveLength(2)
    // La primera aparición es el loop de totales; la segunda, el loop que
    // inserta tickets.unit_price — el insert tiene que quedar después de las
    // dos, o el total de la orden no coincidiría con la suma de los tickets.
    const insertIndex = migration.indexOf('insert into public.ticket_orders (')
    const [firstCallIndex, secondCallIndex] = [...migration.matchAll(
      /v_unit_price := plu_private\.resolve_ticket_channel_price/g,
    )].map((match) => match.index)
    expect(firstCallIndex).toBeLessThan(insertIndex)
    expect(secondCallIndex).toBeGreaterThan(insertIndex)
  })

  it('staff_upsert_event rechaza un precio manual por encima del precio de lista', () => {
    expect(migration).toContain("v_type_manual := nullif(v_type ->> 'manualPrice', '')::int;")
    expect(migration).toMatch(
      /if v_type_manual is not null\s*and v_type_manual > coalesce\(\(v_type ->> 'price'\)::int, 0\) then\s*raise exception 'El precio con descuento de "%" supera el precio de lista\.', trim\(v_type ->> 'name'\)\s*using errcode = 'PLU01';/,
    )
  })

  it('staff_upsert_event persiste manual_price en alta y en edición', () => {
    expect(migration).toContain('manual_price = v_type_manual,')
    expect(migration).toMatch(
      /insert into public\.ticket_types\(\s*event_id, name, price, quota, sort_order, active,\s*wise_price, manual_price, sales_opens_at, sales_closes_at, payment_channels\s*\)/,
    )
  })

  it('la verificación cubre la columna, el helper y las dos funciones', () => {
    expect(migration).toContain(
      "table_schema = 'public' and table_name = 'ticket_types' and column_name = 'manual_price'",
    )
    expect(migration).toContain(
      "to_regprocedure(\n    'plu_private.resolve_ticket_channel_price(text,text,numeric,numeric)'\n  ) is null",
    )
  })
})
