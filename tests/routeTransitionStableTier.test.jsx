import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * El tier de movimiento se mide en vivo los primeros segundos y puede bajar a
 * 'low' con la página ya abierta (equipos lentos, runners de CI). RouteTransition
 * devolvía otro árbol para 'low' y React remontaba la página entera: se perdía
 * lo cargado. Este test baja el tier a mitad de camino y exige que la página
 * siga siendo la misma instancia.
 */

let reportTier = null

vi.mock('../src/motion/deviceTier', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getDeviceTier: () => 'high',
    observeRuntimeMotionTier: (callback) => {
      reportTier = callback
      return () => {
        reportTier = null
      }
    },
  }
})

const { default: MotionProvider } = await import('../src/motion/MotionProvider.tsx')
const { default: RouteTransition } = await import('../src/motion/RouteTransition.tsx')

afterEach(cleanup)

let mounts = 0

function StatefulPage() {
  const [code, setCode] = useState('')
  useEffect(() => {
    mounts += 1
  }, [])
  return <input aria-label="Código" value={code} onChange={(event) => setCode(event.target.value)} />
}

describe('RouteTransition con el tier cambiando en vivo', () => {
  it('bajar a "low" con la página abierta no la remonta ni pierde lo cargado', () => {
    mounts = 0
    render(
      <MotionProvider>
        <RouteTransition viewKey="competition">
          <StatefulPage />
        </RouteTransition>
      </MotionProvider>,
    )
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'PLU2026' } })
    expect(mounts).toBe(1)

    act(() => reportTier?.('low'))

    expect(document.documentElement.getAttribute('data-motion-tier')).toBe('low')
    expect(mounts).toBe(1)
    expect(screen.getByLabelText('Código').value).toBe('PLU2026')
    // Sin movimiento la página queda quieta, con la clase de reposo.
    expect(document.querySelector('.page-transition--idle')).toBeTruthy()
  })
})
