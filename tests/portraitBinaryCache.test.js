import { describe, expect, it } from 'vitest'
import {
  forgetPortraitCache,
  getCachedPortraitBinary,
  getCachedPublicVisibility,
  portraitEtag,
  sendPortraitBinary,
  setCachedPortraitBinary,
  setCachedPublicVisibility,
} from '../server/lib/portraitBinaryCache.js'

function mockRes() {
  const headers = {}
  return {
    headers,
    statusCode: 200,
    body: null,
    set(key, value) {
      headers[key.toLowerCase()] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    end() {
      this.body = null
    },
    send(payload) {
      this.body = payload
    },
  }
}

describe('portraitBinaryCache', () => {
  it('arma ETag estable por path', () => {
    expect(portraitEtag('a/1.webp')).toBe(portraitEtag('a/1.webp'))
    expect(portraitEtag('a/1.webp')).not.toBe(portraitEtag('a/2.webp'))
  })

  it('guarda y olvida binarios en memoria', () => {
    const path = `cache-test/${Date.now()}.webp`
    const body = Buffer.from('fake-webp')
    setCachedPortraitBinary(path, { body, contentType: 'image/webp' })
    expect(getCachedPortraitBinary(path)?.body).toEqual(body)
    forgetPortraitCache(path)
    expect(getCachedPortraitBinary(path)).toBeNull()
  })

  it('cachea visibilidad pública', () => {
    const path = `vis-test/${Date.now()}.webp`
    setCachedPublicVisibility(path, true)
    expect(getCachedPublicVisibility(path)).toBe(true)
    forgetPortraitCache(path)
    expect(getCachedPublicVisibility(path)).toBeNull()
  })

  it('responde 304 sin tocar Storage cuando If-None-Match coincide', async () => {
    const path = `etag-test/${Date.now()}.webp`
    const etag = portraitEtag(path)
    let downloads = 0
    const client = {
      storage: {
        from: () => ({
          download: async () => {
            downloads += 1
            return { data: Buffer.from('x'), error: null }
          },
        }),
      },
    }
    const res = mockRes()
    const status = await sendPortraitBinary({
      req: { headers: { 'if-none-match': etag } },
      res,
      client,
      path,
      cacheControl: 'public, max-age=60',
    })
    expect(status).toBe('etag')
    expect(res.statusCode).toBe(304)
    expect(downloads).toBe(0)
  })

  it('sirve desde memoria en el segundo hit', async () => {
    const path = `mem-test/${Date.now()}.webp`
    const payload = Buffer.from('portrait-bytes')
    let downloads = 0
    const client = {
      storage: {
        from: () => ({
          download: async () => {
            downloads += 1
            return {
              data: {
                type: 'image/webp',
                arrayBuffer: async () => payload,
              },
              error: null,
            }
          },
        }),
      },
    }

    const first = mockRes()
    await sendPortraitBinary({
      req: { headers: {} },
      res: first,
      client,
      path,
      cacheControl: 'private, max-age=60',
    })
    expect(first.headers['x-portrait-cache']).toBe('storage')
    expect(downloads).toBe(1)

    const second = mockRes()
    await sendPortraitBinary({
      req: { headers: {} },
      res: second,
      client,
      path,
      cacheControl: 'private, max-age=60',
    })
    expect(second.headers['x-portrait-cache']).toBe('memory')
    expect(downloads).toBe(1)
    forgetPortraitCache(path)
  })
})
