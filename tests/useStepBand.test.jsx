import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStepBand } from '../src/motion/useStepBand.ts'

let observer

class FakeObserver {
  constructor(callback) {
    this.callback = callback
    this.nodes = []
    observer = this
  }

  observe(node) {
    this.nodes.push(node)
  }

  disconnect() {}
}

/** Simula lo que reporta el observador para cada paso: dónde está respecto de la franja. */
function report(positions) {
  const entries = observer.nodes.map((target, index) => {
    const position = positions[index]
    return {
      target,
      isIntersecting: position === 'in',
      boundingClientRect: { top: position === 'below' ? 900 : position === 'above' ? -200 : 400 },
      rootBounds: { top: 0, height: 800 },
    }
  })
  act(() => observer.callback(entries))
}

function Steps({ count = 3, enabled = true }) {
  const { activeIndex, bind } = useStepBand(count, { enabled })
  return (
    <ol data-active={activeIndex}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} ref={bind(index)} />
      ))}
    </ol>
  )
}

beforeEach(() => {
  observer = undefined
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const active = (container) => Number(container.querySelector('ol').dataset.active)

describe('useStepBand', () => {
  it('enciende el paso que cruza la franja', () => {
    const { container } = render(<Steps />)

    report(['in', 'below', 'below'])
    expect(active(container)).toBe(0)

    report(['above', 'in', 'below'])
    expect(active(container)).toBe(1)
  })

  it('al pasar de largo deja encendido el último paso, no el que se vio al frenar', () => {
    const { container } = render(<Steps />)

    report(['above', 'above', 'above'])
    expect(active(container)).toBe(2)
  })

  it('al volver arriba de todo devuelve el primero', () => {
    const { container } = render(<Steps />)

    report(['above', 'above', 'in'])
    expect(active(container)).toBe(2)

    report(['below', 'below', 'below'])
    expect(active(container)).toBe(0)
  })

  it('no observa nada cuando está deshabilitado', () => {
    render(<Steps enabled={false} />)

    expect(observer).toBeUndefined()
  })
})
