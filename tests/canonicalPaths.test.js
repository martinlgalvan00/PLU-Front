import { describe, expect, it } from 'vitest'
import { isCanonicalPathname, resolvePathnamePublicView } from '../src/lib/canonicalPaths.js'
import { buildPublicViewPath, matchPublicViewPath } from '../src/lib/publicViewPaths.js'

describe('canonicalPaths', () => {
  it('reconoce la home y deep links de evento', () => {
    expect(isCanonicalPathname('/')).toBe(true)
    expect(isCanonicalPathname('/evento/entradas')).toBe(true)
    expect(isCanonicalPathname('/evento/pitbull-classic')).toBe(true)
    expect(isCanonicalPathname('/evento/pitbull-classic/seguridad')).toBe(true)
  })

  it('reconoce deep links publicos de vistas', () => {
    expect(isCanonicalPathname('/afiliacion')).toBe(true)
    expect(isCanonicalPathname('/calendario')).toBe(true)
    expect(isCanonicalPathname('/reglamento')).toBe(true)
    expect(isCanonicalPathname('/resultados')).toBe(true)
    expect(isCanonicalPathname('/records')).toBe(true)
    expect(isCanonicalPathname('/pitbull')).toBe(true)
    expect(isCanonicalPathname('/tienda')).toBe(true)
    expect(isCanonicalPathname('/comunidad')).toBe(true)
    expect(isCanonicalPathname('/faq')).toBe(true)
    expect(isCanonicalPathname('/contacto')).toBe(true)
    expect(isCanonicalPathname('/recursos')).toBe(true)
    expect(isCanonicalPathname('/nosotros')).toBe(true)
    expect(isCanonicalPathname('/sponsors')).toBe(true)
    expect(isCanonicalPathname('/estandares')).toBe(true)
  })

  it('marca paths desconocidos como no canonicos', () => {
    expect(isCanonicalPathname('/ruta-inventada')).toBe(false)
    expect(isCanonicalPathname('/admin')).toBe(false)
    expect(isCanonicalPathname('/members')).toBe(false)
  })

  it('resuelve la vista publica inicial', () => {
    expect(resolvePathnamePublicView('/')).toBe('home')
    expect(resolvePathnamePublicView('/evento/entradas')).toBe('tickets')
    expect(resolvePathnamePublicView('/evento/pitbull-classic')).toBe('events')
    expect(resolvePathnamePublicView('/afiliacion')).toBe('members')
    expect(resolvePathnamePublicView('/calendario')).toBe('events')
    expect(resolvePathnamePublicView('/reglamento')).toBe('rulebook')
    expect(resolvePathnamePublicView('/resultados')).toBe('results')
    expect(resolvePathnamePublicView('/records')).toBe('records')
    expect(resolvePathnamePublicView('/pitbull')).toBe('pitbull')
    expect(resolvePathnamePublicView('/tienda')).toBe('shop')
    expect(resolvePathnamePublicView('/nosotros')).toBe('team')
    expect(resolvePathnamePublicView('/sponsors')).toBe('sponsors')
    expect(resolvePathnamePublicView('/estandares')).toBe('standards')
    expect(resolvePathnamePublicView('/no-existe')).toBe('notFound')
  })
})

describe('publicViewPaths', () => {
  it('mapea vistas a paths canonicos', () => {
    expect(buildPublicViewPath('members')).toBe('/afiliacion')
    expect(buildPublicViewPath('events')).toBe('/calendario')
    expect(buildPublicViewPath('pitbull')).toBe('/pitbull')
    expect(buildPublicViewPath('team')).toBe('/nosotros')
    expect(buildPublicViewPath('sponsors')).toBe('/sponsors')
    expect(buildPublicViewPath('standards')).toBe('/estandares')
    expect(matchPublicViewPath('/afiliacion')).toBe('members')
    expect(matchPublicViewPath('/calendario/')).toBe('events')
    expect(matchPublicViewPath('/otro')).toBe(null)
  })
})
