import { describe, expect, it } from 'vitest'
import { LIVE_REGISTRATION_POLL_MS } from '../src/hooks/useEventRegistrationCapacity.js'

describe('useEventRegistrationCapacity', () => {
  it('refresca cupos públicos con una cadencia de cinco segundos', () => {
    expect(LIVE_REGISTRATION_POLL_MS).toBe(5_000)
  })
})
