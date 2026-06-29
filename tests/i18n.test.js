import { describe, expect, it } from 'vitest'
import es from '../src/i18n/locales/es.js'
import { translate } from '../src/i18n/translate.js'

describe('i18n translate', () => {
  it('resuelve claves anidadas', () => {
    expect(translate(es, 'nav.home')).toBe('Inicio')
    expect(translate(es, 'hero.ctaRegister')).toBe('Afiliarme')
  })

  it('devuelve la clave si no existe', () => {
    expect(translate(es, 'missing.key')).toBe('missing.key')
  })
})
