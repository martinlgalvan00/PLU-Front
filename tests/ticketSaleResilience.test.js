import { describe, expect, it } from 'vitest'
import { generateCredentialQr } from '../src/lib/credentialQr.js'
import { staffTicketAccessToken } from '../server/modules/ticketing/supabaseTicketRepository.js'

const KEY = '11111111-1111-4111-8111-111111111111'

describe('reintento de venta de mostrador', () => {
  it('la misma clave de idempotencia produce el mismo token de acceso', () => {
    expect(staffTicketAccessToken(KEY)).toBe(staffTicketAccessToken(KEY))
    expect(staffTicketAccessToken(KEY)).not.toBe(
      staffTicketAccessToken('22222222-2222-4222-8222-222222222222'),
    )
    expect(staffTicketAccessToken(KEY).length).toBeGreaterThanOrEqual(32)
  })

  it('rechaza una clave corta', () => {
    expect(() => staffTicketAccessToken('corta')).toThrow(/idempotencia/)
  })
})

describe('QR de credencial', () => {
  it('devuelve una imagen aunque el tratamiento de marca no pueda dibujarse', async () => {
    const dataUrl = await generateCredentialQr(
      'https://plu-arg.com/?credencial=TCK-00000001&tipo=ticket',
    )
    expect(dataUrl.startsWith('data:image/')).toBe(true)
  }, 10_000)
})
