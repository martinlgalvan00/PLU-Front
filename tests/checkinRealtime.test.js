import { describe, expect, it } from 'vitest'
import { readCheckinBroadcastSlug } from '../src/services/checkinRealtime.js'

describe('aviso de check-in entre puestos', () => {
  it('acepta solo el slug y refresca ese meet', () => {
    expect(readCheckinBroadcastSlug({ payload: { eventSlug: 'pitbull-classic' } })).toBe(
      'pitbull-classic',
    )
    expect(
      readCheckinBroadcastSlug({ payload: { eventSlug: 'pitbull-classic', id: 'msg-1' } }),
    ).toBe('pitbull-classic')
  })

  it('no refresca si el aviso trae datos de la persona', () => {
    expect(
      readCheckinBroadcastSlug({
        payload: { eventSlug: 'pitbull-classic', attendeeName: 'Ana', dni: '1' },
      }),
    ).toBeNull()
    expect(readCheckinBroadcastSlug({ payload: { qrToken: 'abc' } })).toBeNull()
    expect(readCheckinBroadcastSlug(null)).toBeNull()
  })
})
