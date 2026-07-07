import { describe, expect, it } from 'vitest'
import { applyServerRuntimeDefaults } from '../server/lib/runtime.js'

describe('server runtime defaults', () => {
  it('configura timeouts defensivos para HTTP server', () => {
    const server = {}

    applyServerRuntimeDefaults(server)

    expect(server.requestTimeout).toBe(30000)
    expect(server.headersTimeout).toBe(35000)
    expect(server.keepAliveTimeout).toBe(5000)
    expect(server.timeout).toBe(30000)
  })
})
