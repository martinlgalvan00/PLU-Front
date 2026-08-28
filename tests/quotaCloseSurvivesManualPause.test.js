import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contrato de 20261001100000 (el cierre por cupo lleva sello) y de
 * 20261002100000 (pisar el precio cancela la programación vieja).
 *
 * El comportamiento vivo lo cubren los tests de integración
 * (discountCodeQuotaLifecycle, eventPriceScheduleLifecycle); acá se fija el
 * texto para que una futura re-emisión de estas funciones no pierda los
 * deltas — el mismo accidente que ya pasó en 20260922100000.
 */
const quotaMigration = readFileSync(
  resolve('supabase/migrations/20261001100000_quota_close_survives_manual_pause.sql'),
  'utf8',
)
const priceMigration = readFileSync(
  resolve('supabase/migrations/20261002100000_price_overwrite_cancels_stale_schedule.sql'),
  'utf8',
)

describe('20261001100000 — quota_closed_at', () => {
  it('agrega el sello y lo backfillea sólo sobre la firma del autocierre', () => {
    expect(quotaMigration).toContain('add column if not exists quota_closed_at timestamptz')
    const backfill = quotaMigration.slice(
      quotaMigration.indexOf('-- Backfill'),
      quotaMigration.indexOf('-- ---', quotaMigration.indexOf('-- Backfill')),
    )
    expect(backfill).toContain('c.active = false')
    expect(backfill).toContain('c.archived_at is null')
    expect(backfill).toContain('>= c.max_redemptions')
  })

  it('el autocierre por cupo sella, sobre el cuerpo vigente (20260908)', () => {
    const apply = quotaMigration.slice(
      quotaMigration.indexOf('create or replace function public.apply_discount_code_to_order('),
      quotaMigration.indexOf('create or replace function public.staff_set_discount_code_state('),
    )
    expect(apply).toContain('set active = false, quota_closed_at = now(), updated_at = now()')
    // Marcas del cuerpo vigente: si desaparecen, se copió una versión vieja.
    expect(apply).toContain('PLU28')
    expect(apply).toContain('resolve_public_promo')
  })

  it('la decisión manual borra el sello y conserva el rechazo por cupo lleno', () => {
    const state = quotaMigration.slice(
      quotaMigration.indexOf('create or replace function public.staff_set_discount_code_state('),
      quotaMigration.indexOf(
        'create or replace function plu_private.release_unpaid_discount_redemption(',
      ),
    )
    expect(state).toContain('quota_closed_at = null')
    expect(state).toContain('agotó su cupo')
    expect(state).toContain('está archivada')
  })

  it('la reapertura exige el sello: la pausa manual sobrevive a la liberación', () => {
    const release = quotaMigration.slice(
      quotaMigration.indexOf(
        'create or replace function plu_private.release_unpaid_discount_redemption(',
      ),
    )
    expect(release).toContain('and v_code.quota_closed_at is not null')
    expect(release).toContain('set active = true, quota_closed_at = null, updated_at = now()')
    // Y no pierde las guardas que ya tenía (20260906100000).
    expect(release).toContain("status in ('aprobado', 'reembolsado')")
    expect(release).toContain('v_before >= v_code.max_redemptions')
  })

  it('achicar el cupo por debajo de lo canjeado cierra en la misma escritura', () => {
    expect(quotaMigration).toContain('close_discount_code_on_quota_shrink')
    expect(quotaMigration).toContain('before update of max_redemptions on public.discount_codes')
    expect(quotaMigration).toContain(
      'when (old.max_redemptions is distinct from new.max_redemptions)',
    )
  })
})

describe('20261002100000 — pisar el precio cancela la programación', () => {
  it('el trigger corre sólo cuando el precio cambia', () => {
    expect(priceMigration).toContain('before update of price, manual_price on public.events')
    expect(priceMigration).toContain('old.price is distinct from new.price')
    expect(priceMigration).toContain('old.manual_price is distinct from new.manual_price')
  })

  it('respeta a los escritores que gestionan la programación (cron y Tarifas)', () => {
    // El barrido y el cambio inmediato limpian price_effective_at en su propio
    // UPDATE; el trigger sólo actúa si la programación quedó tal cual estaba.
    expect(priceMigration).toContain(
      'new.price_effective_at is not distinct from old.price_effective_at',
    )
    expect(priceMigration).toContain('new.scheduled_price := null')
    expect(priceMigration).toContain("'event.registration_price_schedule_cancelled'")
  })
})
