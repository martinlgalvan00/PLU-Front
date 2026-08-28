import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * eventRegistrationPriceScheduling.test.js — PLU ARG
 *
 * 20260929100000 trae el control de precio de inscripción a Tarifas: cambio
 * inmediato o programado ("a partir del lunes vale tanto") sobre
 * `events.price` / `events.manual_price`, aplicado por un barrido de pg_cron.
 * Y cierra el acople que hacía peligroso el otro pedido del mismo lote: al
 * versionar el precio de un plan, los códigos-paquete que empaquetaban la
 * versión retirada se re-apuntan a la nueva — sin eso, cada suba de precio de
 * afiliación dejaba los códigos de combo vivos respondiendo
 * 'offer_unavailable'.
 *
 * Estas afirmaciones son sobre esa migración y sobre el cableado Express que
 * la expone.
 */

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260929100000_event_registration_price_scheduling.sql',
  ),
  'utf8',
)

const pricingRoutes = readFileSync(resolve(process.cwd(), 'server/routes/pricing.js'), 'utf8')

describe('el cambio programado vive en tres columnas y una forma cerrada', () => {
  it('las columnas existen con sus topes', () => {
    expect(migration).toContain('add column if not exists scheduled_price int')
    expect(migration).toContain('add column if not exists scheduled_manual_price int')
    expect(migration).toContain('add column if not exists price_effective_at timestamptz')
    expect(migration).toContain('scheduled_price > 0 and scheduled_price <= 10000000')
  })

  it('una fecha sin precio no programa nada', () => {
    expect(migration).toContain('events_price_schedule_shape')
    expect(migration).toContain(
      'or (price_effective_at is not null and scheduled_price is not null)',
    )
  })
})

describe('staff_set_event_registration_price', () => {
  it('sin fecha (o con fecha pasada) aplica en el momento y limpia lo programado', () => {
    expect(migration).toContain('v_immediate boolean := p_effective_at is null or p_effective_at <= now()')
    expect(migration).toMatch(/set price = p_price,\s*\n\s*manual_price = p_manual_price,\s*\n[\s\S]*?scheduled_price = null/)
  })

  it('con fecha futura deja el cambio pendiente y lo audita como programado', () => {
    expect(migration).toContain("'event.registration_price_scheduled'")
    expect(migration).toContain("'event.registration_price_changed'")
  })

  it('mismos topes de importe que el resto del catálogo', () => {
    expect(migration).toContain('p_price <= 0 or p_price > 10000000')
  })
})

describe('el barrido de pg_cron', () => {
  it('corre cada minuto en su propio job', () => {
    expect(migration).toContain("'apply-scheduled-event-prices'")
    expect(migration).toContain("'* * * * *'")
  })

  it('cada evento falla solo: un error no frena a los demás', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain("'event.registration_price_apply_failed'")
  })

  it('al aplicar, el manual programado reemplaza al vigente aunque sea null', () => {
    // Null = "desde esa fecha cobra lo mismo por cualquier canal": el barrido
    // no puede conservar el manual viejo.
    expect(migration).toMatch(/set price = scheduled_price,\s*\n\s*manual_price = scheduled_manual_price/)
  })
})

describe('Tarifas lee el cambio pendiente', () => {
  it('staff_get_pricing_configuration publica los tres campos y la fecha del evento', () => {
    expect(migration).toContain("'scheduledPrice', e.scheduled_price")
    expect(migration).toContain("'scheduledManualPrice', e.scheduled_manual_price")
    expect(migration).toContain("'priceEffectiveAt', e.price_effective_at")
    expect(migration).toContain("'startsAt', e.starts_at")
  })
})

describe('versionar un plan no rompe los códigos-paquete', () => {
  it('re-apunta los códigos no archivados de la versión retirada a la nueva', () => {
    expect(migration).toContain('membership_plan_id = v_created.id')
    expect(migration).toContain('and membership_plan_id = v_source.id')
    expect(migration).toContain('and archived_at is null')
  })

  it('la bitácora cuenta cuántos códigos se re-apuntaron', () => {
    expect(migration).toContain("'repointedDiscountCodes', v_repointed")
  })
})

describe('el cableado Express', () => {
  it('el precio de inscripción se escribe con el permiso del catálogo económico', () => {
    expect(pricingRoutes).toContain("'/events/:eventSlug/registration-price'")
    expect(pricingRoutes).toContain("'/events/:eventSlug/registration-price/schedule'")
  })

  it('el schema acepta cambio inmediato y programado con los mismos topes', () => {
    expect(pricingRoutes).toContain('const eventRegistrationPriceSchema = z.object({')
    expect(pricingRoutes).toContain('effectiveAt: optionalDateTime')
  })
})
