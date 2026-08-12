import { describe, expect, it } from 'vitest'
import { isCanonicalPathname, resolvePathnamePublicView } from '../src/lib/canonicalPaths.js'

describe('canonicalPaths', () => {
  it('reconoce la home y deep links de evento', () => {
    expect(isCanonicalPathname('/')).toBe(true)
    expect(isCanonicalPathname('/evento/entradas')).toBe(true)
    expect(isCanonicalPathname('/evento/pitbull-classic')).toBe(true)
    expect(isCanonicalPathname('/evento/pitbull-classic/seguridad')).toBe(true)
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
    expect(resolvePathnamePublicView('/no-existe')).toBe('notFound')
  })
})
