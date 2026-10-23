import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import useRevealOnScroll from '../src/hooks/useRevealOnScroll.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

let observers
beforeEach(() => {
  observers = []
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback) {
        this.callback = callback
        this.watched = new Set()
        observers.push(this)
      }
      observe(node) {
        this.watched.add(node)
      }
      unobserve(node) {
        this.watched.delete(node)
      }
      disconnect() {
        this.watched.clear()
      }
    },
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  window.innerHeight = 800
})

function Page({ motion = 'soft', tops = [0, 1200, 1800] }) {
  const ref = useRef(null)
  useRevealOnScroll(ref, motion, tops)
  return (
    <main ref={ref}>
      {tops.map((top, index) => (
        <section
          key={top}
          className="lb-block"
          data-testid={`b${index}`}
          ref={(node) => {
            if (node) node.getBoundingClientRect = () => ({ top })
          }}
        />
      ))}
    </main>
  )
}

describe('useRevealOnScroll', () => {
  it('oculta solo lo que está debajo del primer pantallazo y lo muestra al entrar', () => {
    const { getByTestId } = render(<Page />)
    expect(getByTestId('b0').dataset.reveal).toBeUndefined()
    expect(getByTestId('b1').dataset.reveal).toBe('hidden')
    expect(getByTestId('b2').dataset.reveal).toBe('hidden')

    const [observer] = observers
    observer.callback([{ isIntersecting: true, target: getByTestId('b1') }])
    expect(getByTestId('b1').dataset.reveal).toBe('shown')
    expect(getByTestId('b2').dataset.reveal).toBe('hidden')
  })

  it('no toca nada con animaciones apagadas', () => {
    const { getByTestId } = render(<Page motion="none" />)
    expect(getByTestId('b1').dataset.reveal).toBeUndefined()
    expect(observers).toHaveLength(0)
  })

  it('no toca nada con movimiento reducido', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { getByTestId } = render(<Page />)
    expect(getByTestId('b1').dataset.reveal).toBeUndefined()
  })

  it('sin IntersectionObserver el contenido queda visible', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { getByTestId } = render(<Page />)
    expect(getByTestId('b1').dataset.reveal).toBeUndefined()
  })

  it('al desmontar limpia las marcas', () => {
    const { getByTestId, unmount } = render(<Page />)
    const node = getByTestId('b1')
    unmount()
    expect(node.dataset.reveal).toBeUndefined()
  })
})
