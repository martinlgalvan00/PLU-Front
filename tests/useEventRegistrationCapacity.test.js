import { describe, expect, it } from 'vitest'
import { LIVE_REGISTRATION_POLL_MS } from '../src/hooks/useEventRegistrationCapacity.js'

describe('useEventRegistrationCapacity', () => {
  it('usa polling de respaldo cada treinta segundos', () => {
    expect(LIVE_REGISTRATION_POLL_MS).toBe(30_000)
  })
})
