import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseAthleteRepository } from '../server/modules/athletes/supabaseAthleteRepository.js'

const migration = readFileSync(
  'supabase/migrations/20260819190000_atomic_checkout_pricing.sql',
  'utf8',
)
const manualPriceMigration = readFileSync(
  'supabase/migrations/20260824100000_manual_price_per_channel.sql',
  'utf8',
)

function rpcClient() {
  return {
    rpc: vi.fn().mockResolvedValue({ data: { order: { id: 'order-1' } }, error: null }),
  }
}

describe('cotizacion atomica del checkout', () => {
  it('fija importe y canal en un trigger BEFORE INSERT y valida la matriz de preventa en base', () => {
    expect(migration).toMatch(
      /create trigger athlete_payment_orders_apply_atomic_checkout_pricing\s+before insert on public\.athlete_payment_orders/,
    )
    expect(migration).toContain("p_manual_payment_channel = 'bank_transfer' then 120000")
    expect(migration).toContain("p_manual_payment_channel = 'cash_pitbull' then 150000")
    expect(migration).toContain("when p_payment_method = 'manual_link' then 75000")
    expect(migration).toContain('else 85000')
    expect(migration).toContain("when p_concept = 'combo' then 170000")
    expect(migration).toContain("p_order_amount is distinct from v_expected_amount")
  })

  it('expone RPCs de checkout solo al backend y conserva el importe de catálogo al vencer la promo', () => {
    expect(migration).toContain("if not v_presale_active then")
    expect(migration).toContain("if p_order_amount is not null then")
    expect(migration).toMatch(/grant execute on function public\.create_membership_order_checkout[\s\S]*to service_role/)
    expect(migration).toMatch(/grant execute on function public\.create_competition_registration_checkout[\s\S]*to service_role/)
    expect(migration).toMatch(/grant execute on function public\.create_membership_registration_combo_checkout[\s\S]*to service_role/)
  })

  it('el repositorio llama a las RPC atómicas sin un UPDATE directo posterior', async () => {
    const client = rpcClient()
    const repository = createSupabaseAthleteRepository(client)

    await repository.createMembershipOrder('athlete-1', {
      paymentMethod: 'manual_link',
      planCode: 'plu-annual-v6',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      discountCode: null,
      defaultPrice: 85000,
      manualPrice: 75000,
      manualPaymentChannel: 'bank_transfer',
    })

    expect(client.rpc).toHaveBeenCalledWith('create_membership_order_checkout', {
      p_athlete_id: 'athlete-1',
      p_payment_method: 'manual_link',
      p_plan_code: 'plu-annual-v6',
      p_idempotency_key: '11111111-1111-4111-8111-111111111111',
      p_discount_code: null,
      p_default_price: 85000,
      p_manual_price: 75000,
      p_manual_payment_channel: 'bank_transfer',
    })
  })
})

describe('precio configurable por medio de pago (reemplaza la matriz hardcodeada)', () => {
  it('ya no valida el importe contra una fecha ni una tabla de montos fijos', () => {
    expect(manualPriceMigration).toContain('plu_private.resolve_channel_price')
    expect(manualPriceMigration).not.toContain('v_presale_active')
    expect(manualPriceMigration).not.toContain('2026-08-29')
  })

  it('agrega manual_price a los tres catálogos de precio', () => {
    expect(manualPriceMigration).toMatch(/alter table public\.membership_plans[\s\S]*?manual_price/)
    expect(manualPriceMigration).toMatch(/alter table public\.events[\s\S]*?manual_price/)
    expect(manualPriceMigration).toMatch(/alter table public\.event_combo_offers[\s\S]*?manual_price/)
  })

  it('las tres RPC de checkout reciben precio por defecto y precio manual, no un importe ya decidido', () => {
    expect(manualPriceMigration).toContain(
      'create function public.create_membership_order_checkout(',
    )
    expect(manualPriceMigration).toMatch(/create_membership_order_checkout\([\s\S]*?p_default_price numeric,\s*\n\s*p_manual_price numeric/)
    // Los comentarios sí pueden nombrar el parámetro viejo para explicar el
    // cambio; ninguna declaración de función real puede seguir teniéndolo.
    expect(manualPriceMigration).not.toMatch(/create function[\s\S]*?p_order_amount numeric/)
  })
})
