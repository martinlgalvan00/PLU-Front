import { describe, expect, it } from 'vitest'
import { classifyCameraError, isCameraErrorRetryable } from '../src/lib/cameraError.js'

const named = (name) => Object.assign(new Error(name), { name })

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'permission'],
    ['SecurityError', 'permission'],
    ['NotFoundError', 'missing'],
    ['OverconstrainedError', 'missing'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'busy'],
    ['Otra', 'unknown'],
  ])('%s → %s', (name, expected) => {
    expect(classifyCameraError(named(name))).toBe(expected)
  })

  it('sin error devuelve unknown', () => {
    expect(classifyCameraError(undefined)).toBe('unknown')
  })

  it('reintentar sólo sirve si la cámara estaba ocupada o falló sin causa clara', () => {
    expect(isCameraErrorRetryable('busy')).toBe(true)
    expect(isCameraErrorRetryable('unknown')).toBe(true)
    expect(isCameraErrorRetryable('permission')).toBe(false)
    expect(isCameraErrorRetryable('missing')).toBe(false)
  })
})
