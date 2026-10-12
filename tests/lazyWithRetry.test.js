import { describe, expect, it, vi } from 'vitest'
import { isChunkLoadError } from '../src/lib/lazyWithRetry.js'

describe('isChunkLoadError', () => {
  it('reconoce los mensajes de carga de módulo de Chrome, Firefox y Webpack', () => {
    expect(
      isChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: http://localhost:5173/x.jsx'),
      ),
    ).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true)
  })

  it('no confunde errores de render con errores de carga', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})
