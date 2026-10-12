import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PitbullGearScene from '../src/components/ui/PitbullGearScene.jsx'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

const ROWS = ['Raw', 'Raw con vendas', 'Single ply', 'Multi ply', 'Sin límite']

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

// Reduced motion: las piezas se montan ya dibujadas, sin esperar transiciones.
beforeEach(() => mockMatchMedia((query) => String(query).includes('prefers-reduced-motion')))
afterEach(cleanup)

function Scene({ rowIndex }) {
  const { t } = useI18n()
  return <PitbullGearScene rows={ROWS} rowIndex={rowIndex} t={t} />
}

function renderScene(rowIndex) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <Scene rowIndex={rowIndex} />
      </MotionProvider>
    </I18nProvider>,
  )
}

describe('PitbullGearScene — equipamiento', () => {
  it('Raw: rodilleras, muñequeras y cinturón', () => {
    renderScene(0)

    expect(screen.getByText('Rodilleras')).toBeTruthy()
    expect(screen.getByText('Muñequeras')).toBeTruthy()
    expect(screen.getByText('Cinturón')).toBeTruthy()
    expect(screen.queryByText('Vendas')).toBeNull()
  })

  it('Raw con vendas: vendas en lugar de rodilleras, mismo resto', () => {
    renderScene(1)

    expect(screen.getByText('Vendas')).toBeTruthy()
    expect(screen.getByText('Muñequeras')).toBeTruthy()
    expect(screen.getByText('Cinturón')).toBeTruthy()
    expect(screen.queryByText('Rodilleras')).toBeNull()
  })

  it('equipo de apoyo: una capa, varias capas y sin restricción', () => {
    const { container, unmount } = renderScene(2)
    expect(screen.getByText('Una capa')).toBeTruthy()
    expect(container.querySelectorAll('.film-gear__ply')).toHaveLength(1)
    unmount()

    const multi = renderScene(3)
    expect(screen.getByText('Varias capas')).toBeTruthy()
    expect(multi.container.querySelectorAll('.film-gear__ply')).toHaveLength(3)
    multi.unmount()

    const open = renderScene(4)
    expect(screen.getByText('Sin restricción')).toBeTruthy()
    expect(open.container.querySelectorAll('.film-gear__ply')).toHaveLength(5)
  })
})
