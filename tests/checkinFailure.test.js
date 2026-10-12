import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/lib/api.js'
import {
  classifyCheckinFailure,
  isAlreadyAdmittedConflict,
  isRetryableCheckinFailure,
} from '../src/services/checkinFailure.js'

const apiError = (status, body = {}) => new ApiError('x', { status, body })

describe('classifyCheckinFailure', () => {
  it('una caída de red envuelta por api.js (status 0) cuenta como red', () => {
    expect(classifyCheckinFailure(apiError(0))).toBe('network')
    expect(classifyCheckinFailure(apiError(408))).toBe('network')
  })

  it('un TypeError crudo de fetch también es red', () => {
    expect(classifyCheckinFailure(new TypeError('Failed to fetch'))).toBe('network')
  })

  it('401 y 403 son sesión, no un QR inválido', () => {
    expect(classifyCheckinFailure(apiError(401))).toBe('auth')
    expect(classifyCheckinFailure(apiError(403))).toBe('auth')
  })

  it('429 y 5xx no son un veredicto sobre el QR', () => {
    expect(classifyCheckinFailure(apiError(429))).toBe('rate_limited')
    expect(classifyCheckinFailure(apiError(500))).toBe('server')
    expect(classifyCheckinFailure(apiError(503))).toBe('server')
  })

  it('404 y 409 son veredictos del servidor', () => {
    expect(classifyCheckinFailure(apiError(404))).toBe('not_found')
    expect(classifyCheckinFailure(apiError(409))).toBe('rejected')
  })

  it('un error cualquiera es other', () => {
    expect(classifyCheckinFailure(new Error('boom'))).toBe('other')
    expect(classifyCheckinFailure(undefined)).toBe('other')
  })
})

describe('isRetryableCheckinFailure', () => {
  it('reintenta red, 429 y 5xx; no 401, 404 ni 409', () => {
    expect(isRetryableCheckinFailure(apiError(0))).toBe(true)
    expect(isRetryableCheckinFailure(apiError(429))).toBe(true)
    expect(isRetryableCheckinFailure(apiError(502))).toBe(true)
    expect(isRetryableCheckinFailure(apiError(401))).toBe(false)
    expect(isRetryableCheckinFailure(apiError(404))).toBe(false)
    expect(isRetryableCheckinFailure(apiError(409))).toBe(false)
  })
})

describe('isAlreadyAdmittedConflict', () => {
  it('sólo PLU06 es "ya ingresó"', () => {
    expect(isAlreadyAdmittedConflict(apiError(409, { code: 'PLU06' }))).toBe(true)
    expect(isAlreadyAdmittedConflict(apiError(409, { code: 'PLU15' }))).toBe(false)
    expect(isAlreadyAdmittedConflict(apiError(409, { code: 'PLU16' }))).toBe(false)
    expect(isAlreadyAdmittedConflict(apiError(409, { code: 'PLU05' }))).toBe(false)
  })

  it('sin código, alreadyUsed mantiene la compatibilidad', () => {
    expect(isAlreadyAdmittedConflict(apiError(409, { alreadyUsed: true }))).toBe(true)
    expect(isAlreadyAdmittedConflict(apiError(409, {}))).toBe(false)
  })
})
