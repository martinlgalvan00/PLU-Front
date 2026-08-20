import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CelebrationBurst from '../src/components/ui/CelebrationBurst.jsx'
import ConfirmationSeal from '../src/components/ui/ConfirmationSeal.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

/**
 * Render real de la ráfaga (jsdom).
 *
 * Lo que se fija acá es lo que no puede romperse por un ajuste de estilo:
 * la ráfaga se monta por portal en `body` —si volviera a ser hija del sello, un
 * ancestro con `transform` de Motion la capturaría y saldría desplazada—, se
 * desmonta sola, no aporta nada al árbol accesible, y bajo
 * `prefers-reduced-motion` no monta un solo nodo.
 *
 * jsdom no implementa IntersectionObserver: el componente cae al camino directo
 * a propósito, porque el festejo nunca puede depender de una API opcional.
 */

function setReducedMotion(reduced) {
  window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })
}

function renderWithMotion(ui) {
  return render(<MotionProvider>{ui}</MotionProvider>)
}

beforeEach(() => {
  window.localStorage.clear()
  setReducedMotion(false)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('CelebrationBurst', () => {
  it('monta el papel en body y no en el árbol del componente', () => {
    const { container } = renderWithMotion(<CelebrationBurst active />)

    const burst = document.body.querySelector('.celebration-burst')
    expect(burst).not.toBeNull()
    expect(burst.parentElement).toBe(document.body)
    expect(container.querySelector('.celebration-burst')).toBeNull()
    expect(burst.querySelectorAll('.celebration-burst__piece').length).toBeGreaterThan(0)
  })

  it('no aporta nada al árbol accesible', () => {
    renderWithMotion(<CelebrationBurst active />)

    const burst = document.body.querySelector('.celebration-burst')
    expect(burst.getAttribute('aria-hidden')).toBe('true')
    expect(burst.querySelector('[aria-label]')).toBeNull()
  })

  // Sin esto quedaban 30 nodos animados en el árbol esperando el próximo render.
  it('se desmonta sola cuando termina el vuelo', () => {
    renderWithMotion(<CelebrationBurst active />)
    expect(document.body.querySelector('.celebration-burst')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(document.body.querySelector('.celebration-burst')).toBeNull()
  })

  it('no monta nada con un hecho todavía sin confirmar', () => {
    renderWithMotion(<CelebrationBurst active={false} />)

    expect(document.body.querySelector('.celebration-burst')).toBeNull()
  })

  it('no monta nada bajo prefers-reduced-motion', () => {
    setReducedMotion(true)
    renderWithMotion(<CelebrationBurst active />)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(document.body.querySelector('.celebration-burst')).toBeNull()
  })

  it('espera el delay de coreografía antes de disparar', () => {
    renderWithMotion(<CelebrationBurst active delayMs={560} />)
    expect(document.body.querySelector('.celebration-burst')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(document.body.querySelector('.celebration-burst')).not.toBeNull()
  })

  it('con clave festeja una sola vez', () => {
    const playKey = 'credential.ath-1.PLU-2026-001'
    const first = renderWithMotion(<CelebrationBurst active playKey={playKey} />)
    expect(document.body.querySelector('.celebration-burst')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    first.unmount()

    renderWithMotion(<CelebrationBurst active playKey={playKey} />)
    expect(document.body.querySelector('.celebration-burst')).toBeNull()
  })
})

describe('ConfirmationSeal con festejo', () => {
  it('mantiene el acuse en texto y suma el papel después del sello', () => {
    renderWithMotion(
      <ConfirmationSeal
        celebrate
        haptic={false}
        eyebrow="Afiliación acreditada"
        title="Ya sos parte de PLU Argentina"
        detail="Vigente hasta 31 ene 2027"
      />,
    )

    // El contenido nunca depende de la ráfaga: primero el status, después el papel.
    expect(screen.getByRole('status').textContent).toContain('Ya sos parte de PLU Argentina')
    expect(document.body.querySelector('.celebration-burst')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(document.body.querySelector('.celebration-burst')).not.toBeNull()
  })

  it('sin celebrate el sello no monta ninguna ráfaga', () => {
    renderWithMotion(<ConfirmationSeal haptic={false} title="Tu lugar está confirmado" />)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(document.body.querySelector('.celebration-burst')).toBeNull()
  })
})
