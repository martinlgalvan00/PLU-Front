import { describe, expect, it, vi } from 'vitest'
import {
  generateDiscountCode,
  mapWithConcurrency,
  normalizeCodePrefix,
  transferPriceOnChannelToggle,
} from '../src/services/pricingAdminService.js'

/**
 * codePaymentMode.test.js — PLU ARG
 *
 * Cómo se cobra un código eran tres columnas independientes que el panel
 * mostraba primero como cuatro casillas, después como un selector de "modo"
 * de tres intenciones. El operador pidió volver a los casilleros directos
 * —uno por medio de pago— porque el selector era más lento que tildar lo que
 * el código acepta. Las dos combinaciones que la base rechaza (ningún medio,
 * o financiado sin canal manual) siguen sin poder guardarse: el fieldset las
 * avisa y bloquea el envío en vez de volverlas inalcanzables desde un select
 * (ver esos casos en pricingSection.render.test.jsx). Acá sólo queda el
 * traslado de importe entre canales, que es lo único que sigue viviendo en el
 * servicio.
 */
describe('importe pactado al tildar o destildar Mercado Pago', () => {
  it('traslada el importe al campo que queda visible si el otro estaba vacío', () => {
    // Con la pasarela abierta y sin nada tipeado en el canal manual: cerrarla
    // traslada el importe en vez de dejar el campo visible pidiendo un precio
    // que el operador ya había escrito.
    const conPasarela = { fixedPrice: 120000, fixedPriceManual: '' }
    expect(transferPriceOnChannelToggle(conPasarela, false)).toMatchObject({
      mercadoPagoEnabled: false,
      fixedPrice: 120000,
      fixedPriceManual: 120000,
    })

    const aMano = { fixedPrice: '', fixedPriceManual: 115000 }
    expect(transferPriceOnChannelToggle(aMano, true)).toMatchObject({
      mercadoPagoEnabled: true,
      fixedPrice: 115000,
      fixedPriceManual: 115000,
    })
  })

  it('no pisa un precio por canal que ya estaba pactado distinto', () => {
    const distintos = { fixedPrice: 120000, fixedPriceManual: 110000 }
    expect(transferPriceOnChannelToggle(distintos, false)).toMatchObject({
      fixedPrice: 120000,
      fixedPriceManual: 110000,
    })
    expect(transferPriceOnChannelToggle(distintos, true)).toMatchObject({
      fixedPrice: 120000,
      fixedPriceManual: 110000,
    })
  })
})

describe('formato del código generado', () => {
  it('son dos bloques de cuatro, sin caracteres que se confundan al dictarlo', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      // Sin 0/O, 1/I/L ni 5/S: el código se pasa por WhatsApp y se tipea a mano.
      expect(generateDiscountCode()).toMatch(
        /^[ABCDEFGHJKMNPQRTUVWXY2346789]{4}-[ABCDEFGHJKMNPQRTUVWXY2346789]{4}$/,
      )
    }
  })

  it('nunca sale más corto de lo pedido', () => {
    // El generador anterior usaba `Math.random().toString(36).substring(2, 6)`,
    // que no siempre trae cuatro dígitos: había códigos de dos letras.
    const lengths = new Set(
      Array.from({ length: 300 }, () => generateDiscountCode().replace('-', '').length),
    )
    expect([...lengths]).toEqual([8])
  })

  it('respeta el prefijo y lo normaliza al formato que acepta la base', () => {
    expect(generateDiscountCode({ prefix: 'club' })).toMatch(/^CLUB-/)
    expect(normalizeCodePrefix('  pre--fijo ñ! ')).toBe('PRE-FIJO')
    expect(normalizeCodePrefix('-borde-')).toBe('BORDE')
    expect(normalizeCodePrefix(null)).toBe('')
  })

  it('no repite uno ya tomado', () => {
    const taken = new Set()
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateDiscountCode({ prefix: 'LOTE', taken })
      expect(taken.has(code)).toBe(false)
      taken.add(code)
    }
    expect(taken.size).toBe(200)
  })

  it('no entra en bucle infinito cuando todo está tomado', () => {
    // `taken` que responde siempre sí: devuelve algo más largo en vez de colgar.
    const code = generateDiscountCode({ prefix: 'X', taken: { has: () => true } })
    expect(code.startsWith('X-')).toBe(true)
    expect(code.length).toBeGreaterThan(10)
  })
})

describe('alta de un lote', () => {
  it('no corta en el primer error: intenta todos y dice cuáles fallaron', async () => {
    // Antes un lote de 200 que fallaba en el tercero dejaba dos códigos creados
    // y ningún reporte de cuáles.
    const task = vi.fn(async (item) => {
      if (item === 2) throw new Error('Ya existe un código con ese nombre.')
      return item * 10
    })

    const results = await mapWithConcurrency([0, 1, 2, 3], task, { limit: 2 })

    expect(task).toHaveBeenCalledTimes(4)
    expect(results.map((result) => result.ok)).toEqual([true, true, false, true])
    expect(results[3].value).toBe(30)
    expect(results[2].error.message).toContain('Ya existe')
  })

  it('respeta el límite de concurrencia y conserva el orden', async () => {
    let inFlight = 0
    let peak = 0
    const task = async (item) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return item
    }

    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], task, { limit: 3 })

    expect(peak).toBeLessThanOrEqual(3)
    expect(results.map((result) => result.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('con una lista vacía no dispara ningún request', async () => {
    const task = vi.fn()
    await expect(mapWithConcurrency([], task)).resolves.toEqual([])
    expect(task).not.toHaveBeenCalled()
  })
})
