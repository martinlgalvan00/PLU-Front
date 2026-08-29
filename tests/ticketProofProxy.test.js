import { describe, expect, it, vi } from 'vitest'
import { createSupabaseTicketRepository } from '../server/modules/ticketing/supabaseTicketRepository.js'

describe('ticket payment proof proxy', () => {
  it('devuelve URL estable al proxy sin firmar Storage', async () => {
    const createSignedUrl = vi.fn()
    const repo = createSupabaseTicketRepository({
      rpc: vi.fn(),
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { payment_proof_path: 'ord-1/comprobante.pdf' },
              error: null,
            }),
          }),
        }),
      }),
      storage: { from: () => ({ createSignedUrl }) },
    })

    await expect(repo.proofUrl('11111111-1111-4111-8111-111111111111')).resolves.toBe(
      '/api/tickets/orders/11111111-1111-4111-8111-111111111111/proof',
    )
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
})
