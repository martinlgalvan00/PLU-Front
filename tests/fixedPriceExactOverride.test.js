import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/20261015100000_exact_fixed_promotion_prices.sql'),
  'utf8',
)

describe('precio fijo promocional exacto', () => {
  it('fija el caso real de $92.500 en $85.000, sin restar un peso', () => {
    expect(migration).toContain(
      "plu_private.resolve_discount_amount(92500, 'fixed_price', null, 85000) <> 7500",
    )
    expect(migration).toContain('set fixed_price = 85000,')
    expect(migration).toContain('fixed_price_manual = 85000,')
    expect(migration).not.toMatch(/set fixed_price = 84999|fixed_price_manual = 84999,/)
  })

  it('repara sólo órdenes manuales abiertas y sin pago declarado', () => {
    expect(migration).toContain("and status in ('creado', 'pendiente')")
    expect(migration).toContain('and payment_proof_path is null')
    expect(migration).toContain('and manual_payment_declared_at is null')
    expect(migration).toContain('and provider_preference_id is null')
    expect(migration).toContain('set amount = 85000,')
  })

  it('deja auditoría del código y de cada orden reparada', () => {
    expect(migration).toContain("'discount_code.fixed_price_repaired'")
    expect(migration).toContain("'payment_order.fixed_price_repaired'")
  })
})
