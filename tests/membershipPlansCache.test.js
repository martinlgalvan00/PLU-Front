import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiRequest: vi.fn(),
}))

const { apiGet } = await import('../src/lib/api.js')
const { clearMembershipPlansCache, listMembershipPlans } = await import(
  '../src/services/paymentService.js'
)

describe('cache de planes de afiliación', () => {
  beforeEach(() => {
    clearMembershipPlansCache()
    apiGet.mockReset()
  })

  it('comparte una consulta en vuelo entre la página pública y la cuenta', async () => {
    apiGet.mockResolvedValue({ plans: [{ code: 'plu-annual' }] })

    const [publicPlans, accountPlans] = await Promise.all([
      listMembershipPlans(),
      listMembershipPlans(),
    ])

    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(publicPlans).toBe(accountPlans)
  })

  it('reutiliza el resultado y permite forzar una actualización', async () => {
    apiGet.mockResolvedValue({ plans: [] })

    await listMembershipPlans()
    await listMembershipPlans()
    await listMembershipPlans({ force: true })

    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('no deja una promesa fallida bloqueando el reintento', async () => {
    apiGet.mockRejectedValueOnce(new Error('sin red')).mockResolvedValueOnce({ plans: [] })

    await expect(listMembershipPlans()).rejects.toThrow('sin red')
    await expect(listMembershipPlans()).resolves.toEqual({ plans: [] })
    expect(apiGet).toHaveBeenCalledTimes(2)
  })
})
