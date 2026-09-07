import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAdminEventPath,
  clearAdminEventRoute,
  matchAdminEventRoute,
  pushAdminEventRoute,
} from '../src/lib/adminEventRoute.js'
import { isCanonicalPathname } from '../src/lib/canonicalPaths.js'

afterEach(() => {
  window.history.pushState(null, '', '/')
})

describe('ruta de administración de un evento', () => {
  it('reconoce /admin/eventos/:slug y devuelve el slug decodificado', () => {
    expect(matchAdminEventRoute('/admin/eventos/pitbull-classic-2026')).toEqual({
      eventSlug: 'pitbull-classic-2026',
    })
    expect(matchAdminEventRoute('/admin/eventos/pitbull-classic-2026/')).toEqual({
      eventSlug: 'pitbull-classic-2026',
    })
    expect(matchAdminEventRoute('/admin/eventos/copa%20norte')).toEqual({
      eventSlug: 'copa norte',
    })
  })

  it('no reconoce nada que no sea un evento puntual del panel', () => {
    expect(matchAdminEventRoute('/admin')).toBeNull()
    expect(matchAdminEventRoute('/admin/eventos')).toBeNull()
    expect(matchAdminEventRoute('/admin/eventos/a/b')).toBeNull()
    expect(matchAdminEventRoute('/eventos/pitbull-classic-2026')).toBeNull()
    expect(matchAdminEventRoute('/')).toBeNull()
  })

  it('construye el path escapando el slug', () => {
    expect(buildAdminEventPath('pitbull-classic-2026')).toBe('/admin/eventos/pitbull-classic-2026')
    expect(buildAdminEventPath('copa norte')).toBe('/admin/eventos/copa%20norte')
  })

  it('entra al workspace dejando el path en la ruta del evento', () => {
    pushAdminEventRoute('pitbull-classic-2026')
    expect(window.location.pathname).toBe('/admin/eventos/pitbull-classic-2026')
    expect(matchAdminEventRoute()).toEqual({ eventSlug: 'pitbull-classic-2026' })
  })

  /**
   * La regresión que este archivo existe para evitar: `clearAdminEventRoute`
   * navegaba a `/admin`, que NO es canónico, y el handler de `popstate` de
   * `App` manda a `notFound` cualquier path no canónico. El botón Volver del
   * workspace tiraba toda la SPA a 404.
   */
  it('sale del workspace a un path canónico, no a /admin', () => {
    pushAdminEventRoute('pitbull-classic-2026')
    clearAdminEventRoute()

    expect(matchAdminEventRoute()).toBeNull()
    expect(isCanonicalPathname(window.location.pathname)).toBe(true)
    expect(window.location.pathname).not.toBe('/admin')
  })

  it('deja la ruta del evento como path canónico, y /admin como no canónico', () => {
    expect(isCanonicalPathname('/admin/eventos/pitbull-classic-2026')).toBe(true)
    expect(isCanonicalPathname('/admin')).toBe(false)
  })
})
