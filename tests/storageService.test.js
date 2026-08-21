import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearStorage,
  purgeLegacyCreatedOrder,
  readCurrentOrder,
  readStorage,
  writeStorage,
} from '../src/services/storageService.js'
import { STORAGE_KEY } from '../src/lib/constants.js'

/**
 * `createdOrder` lleva `orderAccessToken`: un token portador de una orden de
 * pago, que el retorno de Mercado Pago usa para conciliar. Estaba en
 * `localStorage`, o sea sin vencimiento y compartido entre pestañas y personas
 * que usaran el mismo navegador.
 *
 * Estos tests fijan las tres propiedades del cambio: que el token no vuelva a
 * `localStorage`, que siga estando donde el flujo lo necesita, y que lo que ya
 * quedó escrito se limpie solo.
 */

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

const ORDER = {
  id: 'ord-1',
  orderId: 'ord-1',
  orderAccessToken: 'tok-secreto',
  type: 'membership',
}

describe('persistencia de la orden en curso', () => {
  it('no escribe el token de la orden en localStorage', () => {
    writeStorage({ createdOrder: ORDER, shopProducts: [], users: [] })

    const persisted = window.localStorage.getItem(STORAGE_KEY)
    expect(persisted).toBeTruthy()
    expect(persisted).not.toContain('tok-secreto')
    expect(JSON.parse(persisted).createdOrder).toBeUndefined()
  })

  it('la deja en sessionStorage, que es lo que sobrevive al retorno de Mercado Pago', () => {
    writeStorage({ createdOrder: ORDER })

    expect(readCurrentOrder()).toEqual(ORDER)
    expect(readStorage().createdOrder).toEqual(ORDER)
  })

  it('la borra cuando la compra termina', () => {
    writeStorage({ createdOrder: ORDER })
    writeStorage({ createdOrder: null })

    expect(readCurrentOrder()).toBeNull()
    expect(readStorage().createdOrder).toBeNull()
  })

  it('devuelve la orden aunque no haya nada más guardado', () => {
    // Primera visita: no hay blob de preferencias todavía, pero sí una compra en
    // curso. Antes `readStorage` devolvía null y la orden se perdía.
    window.sessionStorage.setItem('plu:current-order', JSON.stringify(ORDER))

    expect(readStorage()).toEqual({ createdOrder: ORDER })
  })

  it('clearStorage se lleva las dos mitades', () => {
    writeStorage({ createdOrder: ORDER, users: [{ id: 'u1' }] })
    clearStorage()

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(readCurrentOrder()).toBeNull()
  })

  it('purga el token que dejaron las versiones anteriores en localStorage', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ createdOrder: ORDER, shopProducts: [], users: [] }),
    )

    purgeLegacyCreatedOrder()

    const persisted = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
    expect(persisted.createdOrder).toBeUndefined()
    expect(persisted).toHaveProperty('shopProducts')
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain('tok-secreto')
  })

  it('la purga no rompe con un blob ilegible', () => {
    window.localStorage.setItem(STORAGE_KEY, '{no es json')
    expect(() => purgeLegacyCreatedOrder()).not.toThrow()
  })

  it('lee la clave legacy sin volver a escribirle el token', () => {
    window.localStorage.setItem(
      'maximal-plu-arg-demo',
      JSON.stringify({ createdOrder: ORDER, users: [] }),
    )

    purgeLegacyCreatedOrder()

    expect(window.localStorage.getItem('maximal-plu-arg-demo')).not.toContain('tok-secreto')
  })
})
