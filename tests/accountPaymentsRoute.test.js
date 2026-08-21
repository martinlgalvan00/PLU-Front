import { describe, expect, it } from 'vitest'
import {
  buildPublicViewPath,
  matchPublicViewPath,
} from '../src/lib/publicViewPaths.js'
import { isCanonicalPathname, resolvePathnamePublicView } from '../src/lib/canonicalPaths.js'
import {
  ACCOUNT_MEMBERSHIP_TAB,
  ACCOUNT_PAYMENTS_TAB,
  ACCOUNT_TAB_IDS,
  accountTabFromSectionParam,
} from '../src/lib/navigation.js'

/**
 * Los emails transaccionales linkean `/mi-cuenta?section=payments` desde que
 * existen (`payment_pending`, `payment_rejected`, `affiliation_cancelled`, el
 * aviso de renovación). Nunca fue una ruta de la app —el perfil vive en
 * `/perfil`— así que "revisá el estado de tu pago" caía en la pantalla de 404, y
 * el parámetro `section` no lo leía nadie.
 */
describe('la ruta que mandan los emails de pago', () => {
  it('/mi-cuenta resuelve al perfil en vez de caer en 404', () => {
    expect(matchPublicViewPath('/mi-cuenta')).toBe('profile')
    expect(isCanonicalPathname('/mi-cuenta')).toBe(true)
    expect(resolvePathnamePublicView('/mi-cuenta')).toBe('profile')
  })

  it('la ruta canónica del perfil sigue siendo /perfil', () => {
    // El alias se reconoce al entrar; no se propaga a la navegación interna.
    expect(buildPublicViewPath('profile')).toBe('/perfil')
    expect(matchPublicViewPath('/perfil')).toBe('profile')
  })

  it('?section=payments abre la ficha de pagos', () => {
    expect(accountTabFromSectionParam('?section=payments')).toBe(ACCOUNT_PAYMENTS_TAB)
    expect(accountTabFromSectionParam('?section=membership')).toBe(ACCOUNT_MEMBERSHIP_TAB)
  })

  it('ignora sin romper un section desconocido o ausente', () => {
    expect(accountTabFromSectionParam('?section=loquesea')).toBeNull()
    expect(accountTabFromSectionParam('?otra=cosa')).toBeNull()
    expect(accountTabFromSectionParam('')).toBeNull()
  })

  it('la ficha de pagos existe en el orden de la cuenta', () => {
    expect(ACCOUNT_TAB_IDS).toContain(ACCOUNT_PAYMENTS_TAB)
  })
})
