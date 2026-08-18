import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getDiscountCodeAvailability } from '../src/services/pricingAdminService.js'

describe('cupos de cupones en administración', () => {
  it('calcula canjes restantes sin dejar que el contador visual sea negativo', () => {
    expect(getDiscountCodeAvailability({ maxRedemptions: 10, redeemedCount: 4 })).toMatchObject({
      status: 'active',
      hasLimit: true,
      remaining: 6,
      progress: 40,
    })

    expect(getDiscountCodeAvailability({ maxRedemptions: 10, redeemedCount: 12 })).toMatchObject({
      status: 'exhausted',
      remaining: 0,
      progress: 100,
    })
  })

  it('distingue un cupón agotado de uno desactivado manualmente', () => {
    expect(
      getDiscountCodeAvailability({ active: false, maxRedemptions: 3, redeemedCount: 3 }).status,
    ).toBe('exhausted')
    expect(
      getDiscountCodeAvailability({ active: false, maxRedemptions: 3, redeemedCount: 1 }).status,
    ).toBe('inactive')
  })
})

describe('migración de cierre automático de cupos', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260821150000_discount_code_quota_auto_close.sql'),
    'utf8',
  )

  it('serializa el último canje y desactiva el cupón en esa misma transacción', () => {
    expect(migration).toContain('for update;')
    expect(migration).toContain(
      "raise exception 'El código de descuento alcanzó el máximo de usos.'",
    )
    expect(migration).toMatch(
      /update public\.discount_codes\s+set active = false, updated_at = now\(\)/,
    )
  })
})
