import { describe, expect, it, vi } from 'vitest'
import {
  normalizeRedemptionCode,
  redeemSecretOfferCode,
  shouldTrySecretOfferFallback,
  waitForSecretOfferRedirect,
} from '../src/services/secretOfferRedemptionService.js'

describe('canje transversal de ofertas secretas', () => {
  it('normaliza el código y usa un único canje sin depender de la pantalla', async () => {
    const unlock = vi.fn().mockResolvedValue({ unlocked: true, offer: { code: 'ONLY-PITBULL' } })

    const result = await redeemSecretOfferCode('  only-pitbull ', { unlock })

    expect(unlock).toHaveBeenCalledWith({ code: 'ONLY-PITBULL' })
    expect(result).toMatchObject({ unlocked: true, code: 'ONLY-PITBULL' })
  })

  it('no consulta el servidor si no hay código', async () => {
    const unlock = vi.fn()

    await expect(redeemSecretOfferCode('  ', { unlock })).resolves.toEqual({
      unlocked: false,
      reason: 'not_found',
      code: '',
    })
    expect(unlock).not.toHaveBeenCalled()
  })

  it('espera el intervalo solicitado antes de redirigir', async () => {
    vi.useFakeTimers()
    const completed = vi.fn()

    void waitForSecretOfferRedirect(700).then(completed)
    await vi.advanceTimersByTimeAsync(699)
    expect(completed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(completed).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('normaliza valores nulos', () => {
    expect(normalizeRedemptionCode(null)).toBe('')
  })

  it('reintenta un rechazo por alcance aunque la respuesta no incluya modalidad', () => {
    expect(shouldTrySecretOfferFallback({ valid: false, reason: 'not_applicable' })).toBe(true)
    expect(
      shouldTrySecretOfferFallback({ valid: false, reason: 'expired', kind: 'offer' }),
    ).toBe(false)
  })
})
