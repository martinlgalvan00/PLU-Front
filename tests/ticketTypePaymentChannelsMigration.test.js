import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20261120100000_ticket_type_payment_channels.sql',
  'utf8',
)

/**
 * La columna sola no alcanza: si `staff_upsert_event` no la persiste, el panel
 * guarda y el override se pierde en silencio, y si la disponibilidad pública no
 * la devuelve, la pantalla de entradas ofrece un medio que después rebota.
 */
describe('migración: medios de pago por tipo de entrada', () => {
  it('agrega la columna heredando por defecto', () => {
    expect(migration).toContain('add column if not exists payment_channels jsonb null')
  })

  it('el constraint rechaza claves desconocidas y valores que no son booleanos', () => {
    expect(migration).toContain(
      "payment_channels - array['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer'] = '{}'::jsonb",
    )
    for (const channel of ['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer']) {
      expect(migration).toContain(
        `coalesce(jsonb_typeof(payment_channels -> '${channel}'), 'boolean') = 'boolean'`,
      )
    }
  })

  it('cerrar los cuatro no se puede guardar: sería una entrada incomprable', () => {
    for (const channel of ['mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer']) {
      expect(migration).toContain(`payment_channels @> '{"${channel}": true}'::jsonb`)
    }
    expect(migration).toContain('La entrada "%" no acepta ningun medio de pago.')
  })

  it('staff_upsert_event sólo acepta los canales conocidos con banderas booleanas', () => {
    expect(migration).toContain(
      "if v_type ? 'paymentChannels' and jsonb_typeof(v_type -> 'paymentChannels') = 'object' then",
    )
    expect(migration).toContain(
      "where key in ('mercado_pago', 'bank_transfer', 'cash_pitbull', 'wise_transfer')",
    )
    expect(migration).toContain("and jsonb_typeof(value) = 'boolean'")
  })

  it('staff_upsert_event persiste el override en alta y en edición', () => {
    expect(migration).toContain('payment_channels = v_type_channels,')
    expect(migration).toContain(
      'wise_price, sales_opens_at, sales_closes_at, payment_channels\n      )',
    )
    expect(migration).toContain('        v_type_channels\n      ) returning id into v_type_id;')
  })

  it('la disponibilidad pública devuelve los medios junto al cupo de cada tipo', () => {
    // Las dos ramas: con cupo y sin cupo. Una sola dejaba a la mitad de los
    // tipos sin medios en la pantalla de compra.
    const matches = migration.match(/'paymentChannels', v_type\.payment_channels/g) ?? []
    expect(matches).toHaveLength(2)
  })

  it('las dos funciones quedan sólo para service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.get_event_ticket_availability(text) from public, anon, authenticated;',
    )
    expect(migration).toContain(
      'grant execute on function public.get_event_ticket_availability(text) to service_role;',
    )
    expect(migration).toContain('revoke all on function public.staff_upsert_event(jsonb, text)')
  })
})
