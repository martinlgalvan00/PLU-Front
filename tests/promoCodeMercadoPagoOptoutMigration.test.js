import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * promoCodeMercadoPagoOptoutMigration.test.js — PLU ARG
 *
 * `manual_channels` (20260825110000) sólo SUMA canales manuales: su cabecera
 * dice "Mercado Pago nunca se apaga". Esta migración agrega el eje que faltaba
 * para una oferta pactada a un precio que sólo cierra cobrado en efectivo o por
 * transferencia.
 */

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260908100000_promo_code_mercado_pago_optout.sql'),
  'utf8',
)

describe('Mercado Pago apagable por código', () => {
  it('nace abierto para no cambiar lo que ya está cargado', () => {
    expect(migration).toContain(
      'add column if not exists mercado_pago_enabled boolean not null default true',
    )
  })

  it('no deja un código sin ningún medio de pago', () => {
    expect(migration).toContain('check (mercado_pago_enabled or cardinality(manual_channels) > 0)')
    expect(migration).toContain('discount_codes_any_channel_check')
  })

  it('una promo pública no puede cerrar la pasarela', () => {
    // Se aplica sola a todas las compras: cerrarle Mercado Pago sería cerrar el
    // checkout entero desde la pantalla de precios.
    expect(migration).toContain("check (audience = 'code' or mercado_pago_enabled)")
    expect(migration).toContain('discount_codes_public_channel_check')
  })

  it('la guarda dura vive en el canje, no sólo en Express', () => {
    // Es la única que no se puede eludir con un POST directo a la RPC.
    expect(migration).toContain(
      "if v_order.method = 'mercado_pago' and not v_code.mercado_pago_enabled then",
    )
    expect(migration).toContain("using errcode = 'PLU28'")
  })

  it('la celda viaja a las tres pantallas que la necesitan', () => {
    // Checkout (preview), ficha secreta (payload) y panel (configuración).
    expect(migration).toContain("'mercadoPagoEnabled', v_code.mercado_pago_enabled")
    expect(migration).toContain("'mercadoPagoEnabled', p_code.mercado_pago_enabled")
    expect(migration).toContain("'mercadoPagoEnabled', c.mercado_pago_enabled")
  })

  it('el alta acepta el payload nuevo y sigue aceptando el viejo', () => {
    expect(migration).toContain(
      "v_mercado_pago_enabled boolean := coalesce((p_code ->> 'mercadoPagoEnabled')::boolean, true)",
    )
    expect(migration).toContain('mercado_pago_enabled = v_mercado_pago_enabled')
    expect(migration).toContain('active, manual_channels, mercado_pago_enabled')
  })

  it('explica los dos errores con un mensaje accionable', () => {
    expect(migration).toContain(
      'Si el código no acepta Mercado Pago, habilitá al menos transferencia o efectivo.',
    )
    expect(migration).toContain('Una promoción pública no puede cerrar Mercado Pago.')
  })
})
