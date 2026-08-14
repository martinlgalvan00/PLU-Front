import { describe, expect, it } from 'vitest'
import es from '../src/i18n/locales/es.js'
import { translate } from '../src/i18n/translate.js'
import { translateFilterOptions } from '../src/i18n/adminHelpers.js'
import { REGISTRATION_FILTER_STATUSES } from '../src/lib/constants.js'

describe('i18n translate', () => {
  it('resuelve claves anidadas', () => {
    expect(translate(es, 'nav.home')).toBe('Inicio')
    expect(translate(es, 'hero.ctaRegister')).toBe('Registrarme')
  })

  it('devuelve la clave si no existe', () => {
    expect(translate(es, 'missing.key')).toBe('missing.key')
  })
})

describe('translateFilterOptions', () => {
  it('traduce gatePending sin caer a status.gate_pending', () => {
    const t = (key) => translate(es, key)
    const options = translateFilterOptions(REGISTRATION_FILTER_STATUSES, t)
    const gatePending = options.find(([value]) => value === 'gate_pending')

    expect(gatePending?.[1]).toBe('Confirmada sin afiliación')
    expect(gatePending?.[1]).not.toContain('status.gate_pending')
  })
})
