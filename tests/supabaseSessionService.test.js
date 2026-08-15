import { describe, expect, it, vi } from 'vitest'
import { establishSupabaseSession } from '../src/services/supabaseSessionService.js'

describe('sesión Supabase del staff', () => {
  it('canjea el hash de magic link con token_hash', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { session: {} }, error: null })
    const getClient = vi.fn().mockResolvedValue({ auth: { verifyOtp } })

    await expect(
      establishSupabaseSession(
        { email: 'staff@pluarg.test', tokenHash: 'hash-entregado-por-generate-link' },
        { configured: true, getClient },
      ),
    ).resolves.toEqual({ ok: true })

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash-entregado-por-generate-link',
      type: 'magiclink',
    })
  })

  it('no intenta autenticar si el puente no entregó una credencial', async () => {
    const getClient = vi.fn()

    await expect(establishSupabaseSession(null, { configured: true, getClient })).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
    expect(getClient).not.toHaveBeenCalled()
  })
})
