import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildOfferResumeOrder,
  getOfferPurchase,
  getOfferState,
  pickPrimaryOffer,
} from '../src/services/exclusiveOfferService.js'

/**
 * offerPurchaseState.test.js — PLU ARG
 *
 * `redeemed` se escribe al CREAR la orden, no al cobrarla. Sin el estado de esa
 * orden, la pestaña secreta anunciaba "Ya compraste esta oferta. Tu afiliación y
 * tu inscripción quedaron registradas" a alguien que todavía no había pagado
 * nada, y el único botón que le daba era "Ver mi inscripción": no había forma de
 * terminar de pagar desde la pestaña que desbloqueó la oferta.
 */

const DIR = resolve('supabase/migrations')
const FILE = '20260906110000_offer_purchase_state.sql'
const migration = readFileSync(resolve(DIR, FILE), 'utf8')

const PAYLOAD_DEFINITION = 'function plu_private.offer_code_payload'

function lastPayloadMigration() {
  return readdirSync(DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => readFileSync(resolve(DIR, file), 'utf8').includes(PAYLOAD_DEFINITION))
    .at(-1)
}

describe('estado de la compra en el payload (migración)', () => {
  it('adjunta la orden que ocupó el canje, con su estado', () => {
    const purchase = migration.slice(
      migration.indexOf("'purchase', ("),
      migration.indexOf("'campaign',"),
    )
    expect(purchase).toContain("'orderId', po.id")
    expect(purchase).toContain("'status', po.status")
    expect(purchase).toContain("'amount', po.amount")
    expect(purchase).toContain("'method', po.method")
    expect(purchase).toContain(
      'join public.athlete_payment_orders po on po.id = r.payment_order_id',
    )
    expect(purchase).toContain('order by po.created_at desc')
  })

  /**
   * El riesgo real no es esta migración: es que una futura vuelva a definir el
   * payload y se lleve puesto un campo que la ficha ya usa. La que corre es la
   * última, así que la invariante se verifica sobre ella y no sobre este archivo.
   */
  it('la definición vigente del payload conserva campaña, cupo y compra', () => {
    const effective = readFileSync(resolve(DIR, lastPayloadMigration()), 'utf8')
    // Desde el último `create or replace`, no desde la última mención: el
    // `revoke` del final también nombra la función.
    const payload = effective.slice(
      effective.lastIndexOf(`create or replace ${PAYLOAD_DEFINITION}`),
    )
    for (const field of ["'campaign'", "'remaining'", "'purchase'", "'redeemed'", "'comboOffer'"]) {
      expect(payload, `falta ${field} en ${lastPayloadMigration()}`).toContain(field)
    }
  })

  /**
   * El tripwire, no la invariante: cuando una migración nueva redefine el
   * payload hay que venir acá, verificar que el test de arriba siga cubriendo lo
   * que la ficha usa y mover el nombre. 20260908100000 lo redefinió para agregar
   * `mercadoPagoEnabled` —los medios que habilita el código— conservando el
   * cuerpo de este archivo. 20260909100000 vuelve a definirlo para sumar la
   * condicion financiada y el aviso manual sin perder los campos anteriores.
   * 20260912100000 lo redefine para exponer `financed` del propio código: la
   * ficha necesita anunciar el pago delegable ANTES de crear la orden, y hasta
   * ahí sólo llegaba la condición del combo del evento.
   */
  it('es esta migración la que está vigente', () => {
    expect(lastPayloadMigration()).toBe('20260912100000_promo_code_financing.sql')
  })

  it('la definición vigente también dice qué medios habilita el código', () => {
    const effective = readFileSync(resolve(DIR, lastPayloadMigration()), 'utf8')
    const payload = effective.slice(
      effective.lastIndexOf(`create or replace ${PAYLOAD_DEFINITION}`),
    )
    expect(payload).toContain("'manualChannels'")
    expect(payload).toContain("'mercadoPagoEnabled'")
    expect(payload).toContain("'financingAllowed'")
    expect(payload).toContain("'manualPaymentDeclaredAt'")
  })
})

/** Espejo en el frontend: lo que la ficha decide con ese payload. */
function offerWith(purchase) {
  return {
    code: 'ONLY-PITBULL',
    kind: 'offer',
    fixedPrice: 120000,
    active: true,
    redeemed: Boolean(purchase),
    purchase,
    event: { slug: 'pitbull-classic', title: 'Pitbull Classic', registrationPrice: 65000 },
    comboOffer: { price: 150000, active: true, audience: 'code', currency: 'ARS' },
    membershipPlan: { name: 'Afiliación anual', price: 85000 },
  }
}

const OPEN_PURCHASE = {
  orderId: 'ord-1',
  status: 'pendiente',
  amount: 120000,
  currency: 'ARS',
  concept: 'combo',
  method: 'mercado_pago',
}

describe('lectura de la compra en la ficha', () => {
  it('sin compra no hay nada que retomar', () => {
    expect(getOfferPurchase(offerWith(null))).toBe(null)
    expect(getOfferState(offerWith(null)).available).toBe(true)
  })

  it('una orden impaga de Mercado Pago se cobra en la ficha', () => {
    const state = getOfferState(offerWith(OPEN_PURCHASE))
    expect(state).toMatchObject({ available: false, resumable: true, reason: 'pending_payment' })

    const order = buildOfferResumeOrder(offerWith(OPEN_PURCHASE), {
      athlete: { id: 'ath-1', fullName: 'Ana', email: 'ana@plu.test' },
      concept: 'Afiliación + inscripción Pitbull Classic',
    })
    // El importe es el de la orden: la ficha no recalcula lo que se cobra.
    expect(order).toMatchObject({
      paymentId: 'ord-1',
      amount: 120000,
      paymentMode: 'payment',
      payerEmail: 'ana@plu.test',
      concept: 'Afiliación + inscripción Pitbull Classic',
    })
  })

  it('una orden aprobada cierra la ficha como recibo', () => {
    const state = getOfferState(offerWith({ ...OPEN_PURCHASE, status: 'aprobado' }))
    expect(state).toMatchObject({ available: false, reason: 'redeemed' })
    expect(state.resumable).toBeUndefined()
    expect(state.purchase.paid).toBe(true)
    expect(pickPrimaryOffer([offerWith({ ...OPEN_PURCHASE, status: 'aprobado' })])).toBe(null)
  })

  it('la oferta con un pago abierto gana sobre una ya cobrada', () => {
    const paid = offerWith({ ...OPEN_PURCHASE, orderId: 'ord-0', status: 'aprobado' })
    const pending = offerWith(OPEN_PURCHASE)
    // Reclama una acción: es la que la ficha tiene que mostrar primero.
    expect(pickPrimaryOffer([paid, pending])).toBe(pending)
  })
})
