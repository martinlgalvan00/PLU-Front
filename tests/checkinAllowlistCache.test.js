import { describe, expect, it } from 'vitest'
import { checkinAllowlistCache } from '../server/lib/checkinAllowlistCache.js'

describe('etag de la lista de puerta', () => {
  it('sin revisión no contesta 304', () => {
    expect(checkinAllowlistCache('pitbull-classic-2026', null, 'W/"x"')).toEqual({
      etag: null,
      notModified: false,
    })
  })

  it('el mismo sello es 304 y otro sello obliga a bajar la lista', () => {
    const first = checkinAllowlistCache('pitbull-classic-2026', 'rev-1', null)
    expect(first.notModified).toBe(false)
    expect(first.etag).toMatch(/^W\//)

    expect(checkinAllowlistCache('pitbull-classic-2026', 'rev-1', first.etag).notModified).toBe(
      true,
    )
    expect(checkinAllowlistCache('pitbull-classic-2026', 'rev-2', first.etag).notModified).toBe(
      false,
    )
  })
})
