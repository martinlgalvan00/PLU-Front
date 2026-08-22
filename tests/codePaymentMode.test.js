import { describe, expect, it, vi } from 'vitest'
import {
  CODE_PAYMENT_MODES,
  MANUAL_PAYMENT_CHANNELS,
  applyCodePaymentMode,
  codePaymentModeOf,
  generateDiscountCode,
  mapWithConcurrency,
  normalizeCodePrefix,
} from '../src/services/pricingAdminService.js'

/**
 * codePaymentMode.test.js — PLU ARG
 *
 * Cómo se cobra un código eran tres columnas independientes y cuatro casillas
 * en el panel cuya validez dependía entre sí: financiar sin canal manual
 * quedaba inerte, destildar las tres dejaba un código que nadie podía pagar.
 * Acá se fija que las tres intenciones reales sean una sola decisión y que
 * ninguna combinación inválida sea alcanzable desde el selector.
 */
describe('modo de cobro de un código', () => {
  it('ofrece exactamente las tres intenciones reales', () => {
    expect(CODE_PAYMENT_MODES).toEqual(['mercado_pago', 'manual', 'manual_financed'])
  })

  it('lee el modo de un código guardado, incluso de uno anterior al selector', () => {
    expect(codePaymentModeOf({ manualChannels: [], mercadoPagoEnabled: true })).toBe('mercado_pago')
    expect(codePaymentModeOf({ manualChannels: ['bank_transfer'] })).toBe('manual')
    expect(codePaymentModeOf({ manualChannels: ['cash_pitbull'], financed: true })).toBe(
      'manual_financed',
    )
    // Un código viejo con la pasarela abierta Y canales manuales no se pierde:
    // se lee como manual con la reapertura marcada.
    const legacy = { manualChannels: ['bank_transfer'], mercadoPagoEnabled: true }
    expect(codePaymentModeOf(legacy)).toBe('manual')
    // Y sin campos, el default histórico.
    expect(codePaymentModeOf({})).toBe('mercado_pago')
    expect(codePaymentModeOf(null)).toBe('mercado_pago')
  })

  it('elegir un modo manual cierra la pasarela y abre los dos canales', () => {
    const draft = { code: 'X', manualChannels: [], mercadoPagoEnabled: true, financed: false }
    expect(applyCodePaymentMode(draft, 'manual')).toMatchObject({
      manualChannels: MANUAL_PAYMENT_CHANNELS,
      mercadoPagoEnabled: false,
      financed: false,
    })
  })

  it('el modo que habilita al avisar el pago nunca puede nacer inerte', () => {
    // Era el agujero: financiado con sólo Mercado Pago no habilitaba nada,
    // porque la pasarela acredita sola y no hay nada que declarar.
    const applied = applyCodePaymentMode({ manualChannels: [] }, 'manual_financed')
    expect(applied.financed).toBe(true)
    expect(applied.manualChannels.length).toBeGreaterThan(0)
  })

  it('moverse entre los dos modos manuales conserva lo que el operador ajustó', () => {
    const narrowed = { manualChannels: ['cash_pitbull'], mercadoPagoEnabled: true, financed: false }
    expect(applyCodePaymentMode(narrowed, 'manual_financed')).toMatchObject({
      manualChannels: ['cash_pitbull'],
      mercadoPagoEnabled: true,
      financed: true,
    })
  })

  it('volver a Mercado Pago no deja financiamiento ni canales guardados', () => {
    const manual = {
      manualChannels: ['bank_transfer', 'cash_pitbull'],
      mercadoPagoEnabled: false,
      financed: true,
    }
    expect(applyCodePaymentMode(manual, 'mercado_pago')).toMatchObject({
      manualChannels: [],
      mercadoPagoEnabled: true,
      financed: false,
    })
  })

  it('el importe pactado viaja con el cambio de modo, en los dos sentidos', () => {
    // Con la pasarela cerrada el campo de Mercado Pago desaparece y lo que se
    // cobra es el precio del canal manual: si no se trasladaba, el alta
    // rechazaba pidiendo un importe que el operador creía haber escrito.
    const conPasarela = { fixedPrice: 120000, fixedPriceManual: '' }
    expect(applyCodePaymentMode(conPasarela, 'manual').fixedPriceManual).toBe(120000)

    const aMano = { fixedPrice: '', fixedPriceManual: 115000, manualChannels: ['bank_transfer'] }
    expect(applyCodePaymentMode(aMano, 'mercado_pago').fixedPrice).toBe(115000)

    // Y no pisa un precio por canal que ya estaba pactado distinto.
    const distintos = { fixedPrice: 120000, fixedPriceManual: 110000 }
    expect(applyCodePaymentMode(distintos, 'manual')).toMatchObject({
      fixedPrice: 120000,
      fixedPriceManual: 110000,
    })
  })

  it('cualquier modo produce un contrato que la base acepta', () => {
    // Las dos constraints que rechazan filas contradictorias:
    // `discount_codes_financed_channel_check` y el chequeo de "algún canal".
    for (const mode of CODE_PAYMENT_MODES) {
      const applied = applyCodePaymentMode({ manualChannels: [] }, mode)
      expect(applied.financed === true && applied.manualChannels.length === 0).toBe(false)
      expect(applied.mercadoPagoEnabled === false && applied.manualChannels.length === 0).toBe(
        false,
      )
    }
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
