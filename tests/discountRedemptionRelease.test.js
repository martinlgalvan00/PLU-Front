import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * discountRedemptionRelease.test.js — PLU ARG
 *
 * La redención se escribe al CREAR la orden, no al cobrarla. Una orden de
 * Mercado Pago vence a los 30 minutos y `expire_domain_orders` la cancela, así
 * que un atleta que abría el checkout de su oferta secreta y no terminaba de
 * pagar quedaba con el código quemado: unique (discount_code_id, athlete_id) ->
 * PLU22 en el segundo intento, `already_used` en el preview y "ya la usaste" en
 * la pestaña secreta. Sin haber pagado nada, y sin poder comprar el combo
 * restringido que ese mismo código destraba.
 *
 * Esta migración libera esas redenciones y deja el unlock intacto.
 */

const DIR = resolve('supabase/migrations')
const FILE = '20260906100000_release_unpaid_discount_redemptions.sql'
const migration = readFileSync(resolve(DIR, FILE), 'utf8')

describe('liberación de canjes impagos (migración)', () => {
  it('habilita el borrado que la tabla no tenía', () => {
    // Nació con `grant select, insert` (20260819100000).
    expect(migration).toContain('grant delete on public.discount_code_redemptions to service_role')
  })

  it('sólo libera órdenes muertas y nunca una venta', () => {
    expect(migration).toContain("v_order.status not in ('cancelado', 'rechazado')")
    // Un pago aprobado o reembolsado convierte el intento en venta: ahí el
    // código se usó de verdad y la redención es registro contable.
    expect(migration).toContain(
      "where order_id = p_order_id and status in ('aprobado', 'reembolsado')",
    )
  })

  it('deja el unlock en pie: la pestaña secreta sigue existiendo', () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.discount_code_unlocks/i)
  })

  it('no toca la orden: su importe y su código son la historia del intento', () => {
    expect(migration).not.toMatch(/update\s+public\.athlete_payment_orders\s+set\s+discount/i)
  })

  it('reabre el cupo que el cierre automático había apagado', () => {
    // `apply_discount_code_to_order` apaga el código al ocuparse el último
    // lugar. Si el lugar liberado era ése, el cupo tiene que volver.
    const reopen = migration.slice(
      migration.indexOf('if v_code.id is not null'),
      migration.indexOf('insert into public.domain_audit_logs'),
    )
    expect(reopen).toContain('v_code.max_redemptions is not null')
    expect(reopen).toContain('not v_code.active')
    expect(reopen).toContain('v_code.archived_at is null')
    expect(reopen).toContain('v_before >= v_code.max_redemptions')
    expect(reopen).toContain('v_after < v_code.max_redemptions')
    expect(reopen).toContain('set active = true')
  })

  it('audita cada liberación', () => {
    expect(migration).toContain("'discount_code.released', 'payment_order'")
  })

  it('cubre todos los caminos que matan una orden con un solo trigger', () => {
    // Vencimiento por cron, rechazo de Mercado Pago, rechazo o cancelación de
    // staff: un trigger los cubre a todos y no obliga a versionar ninguna RPC.
    expect(migration).toContain('after update of status on public.athlete_payment_orders')
    expect(migration).toContain('old.status is distinct from new.status')
    expect(migration).toContain("new.status in ('cancelado', 'rechazado')")
    expect(migration).toContain("old.status not in ('aprobado', 'reembolsado')")
    expect(migration).toContain('execute function plu_private.release_discount_on_dead_order()')
  })

  it('libera de una las ofertas que ya estaban quemadas', () => {
    expect(migration).toContain('$backfill$')
    expect(migration).toContain('plu_private.release_unpaid_discount_redemption(v_order)')
  })

  it('verifica su propia instalación', () => {
    expect(migration).toContain(
      "to_regprocedure('plu_private.release_unpaid_discount_redemption(uuid)')",
    )
    expect(migration).toContain("where tgname = 'release_discount_on_dead_order'")
    expect(migration).toContain("privilege_type = 'DELETE'")
  })
})

describe('la pestaña secreta habla de su campaña', () => {
  it('el payload de la oferta trae campaña y cupo restante', () => {
    // `offer_code_payload` nació antes de `promotion_campaigns`: la ficha leía
    // `offer.campaign?.name` y `offer.remaining` y recibía siempre vacío.
    const payload = migration.slice(migration.indexOf('plu_private.offer_code_payload'))
    expect(payload).toContain("'campaign', case when ca.id is null then null")
    expect(payload).toContain("'remaining', case")
    expect(payload).toContain(
      'left join public.promotion_campaigns ca on ca.id = p_code.campaign_id',
    )
    // Que la definición VIGENTE conserve estos campos se verifica en
    // offerPurchaseState.test.js, que mira la última migración que la define.
  })
})
