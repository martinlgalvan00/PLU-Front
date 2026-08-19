import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import AdminTourOverlay from '../src/components/admin/AdminTourOverlay.jsx'
import { AdminTourProvider, useAdminTour } from '../src/providers/AdminTourProvider.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

const TARGET_BOX = { top: 12, left: 300, width: 32, height: 32 }

function Harness({ steps }) {
  const { activeTour, replayTour, setTourMode } = useAdminTour()
  return (
    <>
      <button
        type="button"
        data-tour="help"
        data-testid="help"
        onClick={() => screen.getByTestId('menu-state').replaceChildren('abierto')}
      >
        Ayuda
      </button>
      <span data-testid="menu-state">cerrado</span>
      <span data-testid="tour-state">{activeTour ? 'abierto' : 'cerrado'}</span>
      <button type="button" data-testid="start" onClick={() => replayTour('tour-test', steps)}>
        Arrancar
      </button>
      <button type="button" data-testid="never" onClick={() => setTourMode('off')}>
        Nunca
      </button>
    </>
  )
}

function renderTour(steps) {
  return render(
    <I18nProvider>
      <MotionProvider>
        <AdminTourProvider>
          <Harness steps={steps} />
          <AdminTourOverlay />
        </AdminTourProvider>
      </MotionProvider>
    </I18nProvider>,
  )
}

/** Los paneles del fondo se posicionan con estilos inline; jsdom no hace
 * layout, así que se reconstruye la caja de cada uno a mano para comprobar
 * dónde queda el hueco. */
function blockerBox(el) {
  const num = (value) => (value === '' ? null : Number.parseFloat(value))
  const { top, left, right, bottom, width, height } = el.style
  const vw = window.innerWidth
  const vh = window.innerHeight
  const x0 = num(left) ?? vw - (num(right) ?? 0) - (num(width) ?? 0)
  const y0 = num(top) ?? vh - (num(bottom) ?? 0) - (num(height) ?? 0)
  return {
    x0,
    y0,
    x1: num(width) != null ? x0 + num(width) : vw - (num(right) ?? 0),
    y1: num(height) != null ? y0 + num(height) : vh - (num(bottom) ?? 0),
  }
}

function coversPoint(el, x, y) {
  const box = blockerBox(el)
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
}

let originalScrollIntoView

beforeEach(() => {
  originalScrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = function scrollIntoViewStub() {}
  window.localStorage.clear()
})

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView
  cleanup()
})

function startTourOnHelpButton() {
  renderTour([
    { target: '[data-tour="help"]', placement: 'bottom', title: 'Ayuda', body: 'Repetí la guía' },
  ])
  const help = screen.getByTestId('help')
  help.getBoundingClientRect = () => ({
    ...TARGET_BOX,
    right: TARGET_BOX.left + TARGET_BOX.width,
    bottom: TARGET_BOX.top + TARGET_BOX.height,
    x: TARGET_BOX.left,
    y: TARGET_BOX.top,
    toJSON: () => ({}),
  })
  fireEvent.click(screen.getByTestId('start'))
  return help
}

describe('AdminTourOverlay', () => {
  it('deja libre el elemento señalado para que se pueda tocar durante el recorrido', () => {
    const help = startTourOnHelpButton()

    expect(document.querySelector('.admin-tour-spotlight')).not.toBeNull()
    const blockers = [...document.querySelectorAll('.admin-tour-blocker')]
    expect(blockers).toHaveLength(4)

    const centerX = TARGET_BOX.left + TARGET_BOX.width / 2
    const centerY = TARGET_BOX.top + TARGET_BOX.height / 2
    expect(blockers.some((blocker) => coversPoint(blocker, centerX, centerY))).toBe(false)

    // El click llega al botón: el recorrido no se lo come.
    fireEvent.click(help)
    expect(screen.getByTestId('menu-state').textContent).toBe('abierto')
    expect(screen.getByTestId('tour-state').textContent).toBe('abierto')
  })

  it('cancela el recorrido al tocar la zona oscurecida', () => {
    startTourOnHelpButton()
    const blockers = [...document.querySelectorAll('.admin-tour-blocker')]
    const below = blockers.find((blocker) => blockerBox(blocker).y0 > TARGET_BOX.top)
    expect(below).toBeDefined()

    fireEvent.click(below)
    expect(screen.getByTestId('tour-state').textContent).toBe('cerrado')
    expect(document.querySelector('.admin-tour-spotlight')).toBeNull()
  })

  it('sale con Escape aunque el paso todavía no encontró su blanco', () => {
    renderTour([
      { target: '[data-tour="no-existe"]', title: 'Sin blanco', body: 'No hay elemento' },
    ])
    fireEvent.click(screen.getByTestId('start'))

    // Sin blanco no hay tarjeta, pero el fondo ya está tapando el panel.
    expect(document.querySelector('.admin-tour-card')).toBeNull()
    expect(document.querySelectorAll('.admin-tour-blocker')).toHaveLength(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('tour-state').textContent).toBe('cerrado')
    expect(document.querySelector('.admin-tour-blocker')).toBeNull()
  })

  it('elegir "Nunca" corta el recorrido que está en pantalla', () => {
    startTourOnHelpButton()
    expect(screen.getByTestId('tour-state').textContent).toBe('abierto')

    fireEvent.click(screen.getByTestId('never'))
    expect(screen.getByTestId('tour-state').textContent).toBe('cerrado')
    expect(window.localStorage.getItem('plu-tour-mode')).toBe('off')
  })
})
