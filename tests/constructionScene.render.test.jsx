import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ConstructionScene from '../src/components/events/construction/ConstructionScene.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { useI18n } from '../src/i18n/I18nProvider.jsx'
import { INTRO_STEP_MS, MAX_PLATES, STATIC_PLATES } from '../src/lib/eventConstruction.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function Scene({ motion }) {
  const { t } = useI18n()
  return <ConstructionScene motion={motion} t={t} />
}

function SceneAmbient() {
  const { t } = useI18n()
  return <ConstructionScene interactive={false} motion="soft" statusLabel="Armando la página" t={t} />
}

const renderScene = (motion) =>
  render(
    <I18nProvider>
      <Scene motion={motion} />
    </I18nProvider>,
  )

// Cada disco agenda el siguiente al renderizar: hay que avanzar de a un paso.
function advanceSteps(steps) {
  for (let i = 0; i < steps; i += 1) act(() => vi.advanceTimersByTime(INTRO_STEP_MS))
}

const plateCount = (container) => container.querySelectorAll('.construction-scene__plate').length / 2
const caption = () => document.querySelector('.construction-scene__caption strong').textContent

function stubReducedMotion(reduced) {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

describe('ConstructionScene', () => {
  beforeEach(() => stubReducedMotion(false))

  it('se carga sola, un disco por vez, hasta llenar la barra', () => {
    vi.useFakeTimers()
    const { container } = renderScene('soft')
    expect(plateCount(container)).toBe(0)
    expect(caption()).toBe('20 kg')

    act(() => vi.advanceTimersByTime(INTRO_STEP_MS))
    expect(plateCount(container)).toBe(1)

    advanceSteps(MAX_PLATES)
    expect(plateCount(container)).toBe(MAX_PLATES)
    expect(screen.getByRole('button', { name: /sumar discos/i }).disabled).toBe(true)
    expect(screen.getByText(/barra cargada\. volvemos muy pronto/i)).toBeTruthy()
  })

  it('tocar un botón corta la entrada automática y deja manejar la barra', () => {
    vi.useFakeTimers()
    const { container } = renderScene('soft')
    act(() => vi.advanceTimersByTime(INTRO_STEP_MS))
    fireEvent.click(screen.getByRole('button', { name: /sumar discos/i }))
    expect(plateCount(container)).toBe(2)

    act(() => vi.advanceTimersByTime(INTRO_STEP_MS * 4))
    expect(plateCount(container)).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: /sacar discos/i }))
    expect(plateCount(container)).toBe(1)
  })

  it('reiniciar vuelve a cargar desde la barra vacía', () => {
    vi.useFakeTimers()
    const { container } = renderScene('bold')
    advanceSteps(MAX_PLATES)
    fireEvent.click(screen.getByRole('button', { name: /reiniciar/i }))
    expect(plateCount(container)).toBe(0)
    act(() => vi.advanceTimersByTime(INTRO_STEP_MS))
    expect(plateCount(container)).toBe(1)
  })

  it('sin animaciones queda quieta, ya cargada a medias, y sigue siendo manejable', () => {
    vi.useFakeTimers()
    const { container } = renderScene('none')
    expect(plateCount(container)).toBe(STATIC_PLATES)
    act(() => vi.advanceTimersByTime(INTRO_STEP_MS * 10))
    expect(plateCount(container)).toBe(STATIC_PLATES)
    fireEvent.click(screen.getByRole('button', { name: /sumar discos/i }))
    expect(plateCount(container)).toBe(STATIC_PLATES + 1)
  })

  it('con movimiento reducido no se anima aunque el evento pida animación marcada', () => {
    stubReducedMotion(true)
    vi.useFakeTimers()
    const { container } = renderScene('bold')
    expect(plateCount(container)).toBe(STATIC_PLATES)
    act(() => vi.advanceTimersByTime(INTRO_STEP_MS * 10))
    expect(plateCount(container)).toBe(STATIC_PLATES)
  })

  it('sin controles repite la carga y no ofrece manejar la barra', () => {
    vi.useFakeTimers()
    const { container } = render(
      <I18nProvider>
        <SceneAmbient />
      </I18nProvider>,
    )
    expect(screen.queryByRole('button', { name: /sumar discos/i })).toBeNull()
    expect(screen.getByRole('img', { name: 'Armando la página' })).toBeTruthy()
    advanceSteps(MAX_PLATES)
    expect(plateCount(container)).toBe(MAX_PLATES)
    act(() => vi.advanceTimersByTime(INTRO_STEP_MS * 3))
    expect(plateCount(container)).toBe(0)
  })

  it('anuncia el peso cargado y nombra la imagen para lectores de pantalla', () => {
    renderScene('none')
    expect(screen.getByRole('img', { name: /barra olímpica cargada con 130 kg/i })).toBeTruthy()
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
  })
})
