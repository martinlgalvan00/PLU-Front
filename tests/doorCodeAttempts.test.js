import { describe, expect, it } from 'vitest'
import { createDoorCodeAttemptGuard } from '../server/lib/doorCodeAttempts.js'

describe('freno del código de puerta', () => {
  it('traba la cuenta después de varios fallos y un acierto la suelta', () => {
    let clock = 1_000
    const guard = createDoorCodeAttemptGuard({
      now: () => clock,
      maxFailures: 3,
      windowMs: 60_000,
      lockMs: 30_000,
    })

    expect(guard.record('puesto', false).ok).toBe(true)
    expect(guard.record('puesto', false).ok).toBe(true)
    expect(guard.record('puesto', false).ok).toBe(false)
    expect(guard.check('puesto').ok).toBe(false)

    clock += 30_000
    expect(guard.check('puesto').ok).toBe(true)

    guard.record('puesto', false)
    guard.record('puesto', true)
    expect(guard.record('puesto', false).ok).toBe(true)
  })
})
