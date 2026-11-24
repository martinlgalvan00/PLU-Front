import { createElement } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { registerAdminMessages } from '../src/i18n/adminMessages.js'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'
import es from '../src/i18n/locales/esFull.js'
import adminEs from '../src/i18n/locales/admin.es.js'
import { translate } from '../src/i18n/translate.js'
import { translateFilterOptions } from '../src/i18n/adminHelpers.js'
import { REGISTRATION_FILTER_STATUSES } from '../src/lib/constants.js'

function AdminBrandTag() {
  const { t } = useI18n()
  return createElement('p', null, t('admin.shell.brandTag'))
}

describe('i18n translate', () => {
  it('resuelve claves anidadas', () => {
    expect(translate(es, 'nav.home')).toBe('Inicio')
    expect(translate(es, 'hero.ctaRegister')).toBe('Registrarme')
  })

  it('devuelve la clave si no existe', () => {
    expect(translate(es, 'missing.key')).toBe('missing.key')
  })
})

describe('I18nProvider y textos del panel', () => {
  afterEach(() => {
    registerAdminMessages('es', adminEs)
  })

  it('reemplaza la clave cuando los textos del panel llegan después del primer render', () => {
    render(createElement(I18nProvider, null, createElement(AdminBrandTag)))

    act(() => {
      registerAdminMessages('es', {})
    })
    expect(screen.getByText('admin.shell.brandTag')).toBeTruthy()

    act(() => {
      registerAdminMessages('es', adminEs)
    })
    expect(screen.getByText('Operativo')).toBeTruthy()
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
