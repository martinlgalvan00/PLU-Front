import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import EditorialLedger from '../src/components/ui/EditorialLedger.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

const ITEMS = [
  { id: 'a', title: 'Nos contás', desc: 'Marca y alcance.' },
  { id: 'b', title: 'Definimos el nivel', desc: 'Respondemos en 24–48 h.' },
]

function mockMatchMedia(matchesQuery) {
  window.matchMedia = (query) => ({
    matches: matchesQuery(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {}
    },
  )
})

beforeEach(() => mockMatchMedia(() => false))
afterEach(cleanup)

const renderLedger = (props) =>
  render(
    <MotionProvider>
      <EditorialLedger items={ITEMS} ariaLabel="Proceso" {...props} />
    </MotionProvider>,
  )

describe('EditorialLedger', () => {
  it('numera las filas y muestra título y explicación de cada una', () => {
    const { container } = renderLedger()

    expect(screen.getByRole('list', { name: 'Proceso' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Definimos el nivel' })).toBeTruthy()
    expect(screen.getByText('Marca y alcance.')).toBeTruthy()
    expect(container.querySelectorAll('.editorial-ledger__row')).toHaveLength(2)
    expect(container.querySelector('.editorial-ledger__index')?.textContent).toBe('01')
  })

  it('con rail suma la línea de progreso y un marcador por fila', () => {
    const { container } = renderLedger({ rail: true })

    expect(container.querySelector('.scroll-rail')).toBeTruthy()
    expect(container.querySelectorAll('.editorial-ledger__dot')).toHaveLength(2)
  })

  it('con reduced motion queda estática y con todos los pasos hechos', () => {
    mockMatchMedia((query) => String(query).includes('prefers-reduced-motion'))
    const { container } = renderLedger({ rail: true })

    const rows = [...container.querySelectorAll('.editorial-ledger__row')]
    expect(rows.every((row) => row.getAttribute('data-state') === 'done')).toBe(true)
    expect(rows.some((row) => row.hasAttribute('data-active'))).toBe(false)
  })
})
