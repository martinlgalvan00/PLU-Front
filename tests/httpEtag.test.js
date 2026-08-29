import { describe, expect, it } from 'vitest'
import { etagMatches, weakEtagFromParts } from '../server/lib/http.js'

describe('weakEtagFromParts / etagMatches', () => {
  it('genera el mismo ETag para las mismas partes', () => {
    const a = weakEtagFromParts('admin-data', '0', '1:ts')
    const b = weakEtagFromParts('admin-data', '0', '1:ts')
    expect(a).toBe(b)
    expect(a.startsWith('W/"')).toBe(true)
  })

  it('cambia el ETag si cambia la revision', () => {
    const a = weakEtagFromParts('admin-data', '0', '1:ts-a')
    const b = weakEtagFromParts('admin-data', '0', '1:ts-b')
    expect(a).not.toBe(b)
  })

  it('matchea If-None-Match con y sin prefijo W/', () => {
    const etag = weakEtagFromParts('athlete-session', 'id-1', 'rev')
    expect(etagMatches(etag, etag)).toBe(true)
    expect(etagMatches(etag.replace(/^W\//, ''), etag)).toBe(true)
    expect(etagMatches(`W/${etag.replace(/^W\//, '')}, other`, etag)).toBe(true)
    expect(etagMatches('W/"otro"', etag)).toBe(false)
    expect(etagMatches(null, etag)).toBe(false)
  })
})
