import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260825100000_promo_codes_fixed_price.sql'),
  'utf8',
)

const previousChannelPricing = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260824100000_manual_price_per_channel.sql'),
  'utf8',
)

describe('códigos de promoción con precio fijo', () => {
  it('deja de pisar el descuento al liquidar el precio de canal', () => {
    // La regresión que se corrige: la versión anterior de settle reescribía
    // `amount` con el precio de lista, sin mirar el cupón ya aplicado.
    expect(previousChannelPricing).toContain(
      'set amount = coalesce(\n        plu_private.resolve_channel_price(p_payment_method, p_default_price, p_manual_price),\n        amount\n      ),',
    )

    const settle = migration.slice(
      migration.indexOf('create or replace function plu_private.settle_manual_checkout_pricing'),
    )
    expect(settle).toContain('v_order.discount_code_id is not null')
    expect(settle).toContain('plu_private.resolve_discount_amount(')
    expect(settle).toContain('set amount = v_base - v_discount')
  })

  it('nunca deja una orden con cupón en cero y mantiene el canje coherente', () => {
    // Mercado Pago no puede cobrar $0 y no existe flujo de orden gratuita.
    expect(migration).toContain('greatest(v_base - 1, 0)')
    expect(migration).toContain('update public.discount_code_redemptions')
  })

  it('calcula las dos modalidades en un único lugar', () => {
    expect(migration).toContain('create or replace function plu_private.resolve_discount_amount')
    expect(migration).toContain(
      "when p_kind = 'fixed_price' then greatest(p_base - coalesce(p_fixed_price, p_base), 0)",
    )
    // El canje y el preview tienen que usar el mismo cálculo que la
    // liquidación, o el atleta ve un número y paga otro.
    const apply = migration.slice(
      migration.indexOf('create or replace function public.apply_discount_code_to_order'),
    )
    const preview = migration.slice(
      migration.indexOf('create or replace function public.athlete_preview_discount_code'),
    )
    expect(apply).toContain('plu_private.resolve_discount_amount(')
    expect(preview).toContain('plu_private.resolve_discount_amount(')
  })

  it('rechaza un precio promocional que no mejore el importe', () => {
    expect(migration).toContain("using errcode = 'PLU24'")
    expect(migration).toContain("'no_savings'")
  })

  it('habilita el alcance combo y exige alcance único con precio fijo', () => {
    expect(migration).toContain(
      "check (applies_to in ('membership', 'registration', 'combo', 'both'))",
    )
    expect(migration).toContain('discount_codes_kind_shape_check')
    expect(migration).toContain("and applies_to in ('membership', 'registration', 'combo')")
  })

  it('expone la modalidad al panel y al checkout', () => {
    expect(migration).toContain("'kind', c.kind")
    expect(migration).toContain("'fixedPrice', c.fixed_price")
    expect(migration).toContain("'kind', v_code.kind")
    expect(migration).toContain("'fixedPrice', v_code.fixed_price")
  })

  it('verifica la corrección en la propia migración', () => {
    expect(migration).toContain('La liquidación de checkout sigue pisando el descuento.')
  })
})
