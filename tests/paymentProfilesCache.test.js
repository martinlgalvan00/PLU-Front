import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Cuentas de cobro compartidas entre pantallas: el editor del evento se vuelve
 * a montar al guardar y al cambiar de pestaña, y antes pedía las listas cada vez.
 */

const apiGet = vi.fn(async () => ({ profiles: [{ id: 'p1' }], secretsKeyConfigured: true }))
const apiPost = vi.fn(async () => ({ profile: { id: 'p2' } }))

vi.mock('../src/lib/api.js', () => ({
  apiGet: (...args) => apiGet(...args),
  apiPost: (...args) => apiPost(...args),
  apiPatch: vi.fn(async () => ({ profile: { id: 'p1' } })),
  apiDelete: vi.fn(async () => ({})),
}))

const { createPaymentProfile, fetchPaymentProfiles, invalidatePaymentProfiles } = await import(
  '../src/services/paymentProfileService.js'
)

afterEach(() => {
  invalidatePaymentProfiles()
  apiGet.mockClear()
})

describe('fetchPaymentProfiles — caché compartido', () => {
  it('dos pantallas que piden la misma lista hacen un solo pedido', async () => {
    await fetchPaymentProfiles({ kind: 'mercado_pago' })
    await fetchPaymentProfiles({ kind: 'mercado_pago' })
    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('cada tipo de cuenta tiene su propia entrada', async () => {
    await fetchPaymentProfiles({ kind: 'mercado_pago' })
    await fetchPaymentProfiles({ kind: 'bank_transfer' })
    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('dar de alta una cuenta invalida el caché', async () => {
    await fetchPaymentProfiles({ kind: 'mercado_pago' })
    await createPaymentProfile({ name: 'Nueva', kind: 'mercado_pago', config: {} })
    await fetchPaymentProfiles({ kind: 'mercado_pago' })
    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('`fresh` y las lecturas con uso por evento no usan el caché', async () => {
    await fetchPaymentProfiles({ kind: 'mercado_pago' })
    await fetchPaymentProfiles({ kind: 'mercado_pago', fresh: true })
    await fetchPaymentProfiles({ kind: 'mercado_pago', includeUsage: true })
    await fetchPaymentProfiles({ kind: 'mercado_pago', includeUsage: true })
    expect(apiGet).toHaveBeenCalledTimes(4)
  })

  it('un error no queda cacheado', async () => {
    apiGet.mockRejectedValueOnce(new Error('red'))
    await expect(fetchPaymentProfiles({ kind: 'bank_transfer' })).rejects.toThrow('red')
    await fetchPaymentProfiles({ kind: 'bank_transfer' })
    expect(apiGet).toHaveBeenCalledTimes(2)
  })
})
