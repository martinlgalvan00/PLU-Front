import { afterEach, describe, expect, it, vi } from 'vitest'
import { supportsCredential3D } from '../src/components/ui/credential3d/supportsCredential3D.js'

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = originalMatchMedia
  delete document.documentElement.dataset.motionTier
  vi.restoreAllMocks()
})

function stubWebGl(available) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() =>
    available ? {} : null,
  )
}

describe('supportsCredential3D', () => {
  it('con "reducir movimiento" no ofrece la vista 3D', () => {
    stubWebGl(true)
    window.matchMedia = (query) => ({ matches: query.includes('reduce') })
    expect(supportsCredential3D()).toBe(false)
  })

  it('en equipos de gama baja tampoco', () => {
    stubWebGl(true)
    window.matchMedia = () => ({ matches: false })
    document.documentElement.dataset.motionTier = 'low'
    expect(supportsCredential3D()).toBe(false)
  })

  it('sin WebGL no la ofrece', () => {
    stubWebGl(false)
    window.matchMedia = () => ({ matches: false })
    expect(supportsCredential3D()).toBe(false)
  })

  it('con WebGL y movimiento permitido, sí', () => {
    stubWebGl(true)
    window.matchMedia = () => ({ matches: false })
    expect(supportsCredential3D()).toBe(true)
  })
})
