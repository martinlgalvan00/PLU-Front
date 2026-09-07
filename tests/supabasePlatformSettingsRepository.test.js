import { describe, expect, it } from 'vitest'
import { createSupabasePlatformSettingsRepository } from '../server/modules/settings/supabasePlatformSettingsRepository.js'

describe('createSupabasePlatformSettingsRepository', () => {
  it('si falta staff_payment_expiry_overview responde 409 pidiendo la migración', async () => {
    const client = {
      rpc: async () => ({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function' },
      }),
    }
    const repo = createSupabasePlatformSettingsRepository(client)
    await expect(repo.expiryOverview()).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('20261110100000'),
    })
  })
})
