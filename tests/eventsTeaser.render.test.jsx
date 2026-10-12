import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import EventsTeaser from '../src/components/ui/EventsTeaser.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(cleanup)

function renderTeaser() {
  return render(
    <I18nProvider>
      <EventsTeaser />
    </I18nProvider>,
  )
}

describe('EventsTeaser', () => {
  it('dice "Pronto habrá novedades" como un titular accesible', () => {
    renderTeaser()
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Pronto habrá novedades')
    expect(screen.getByRole('region', { name: 'Pronto habrá novedades' })).toBeTruthy()
  })

  it('deja la decoración fuera del árbol de accesibilidad', () => {
    const { container } = renderTeaser()
    const decorative = [
      '.events-teaser__sky',
      '.events-teaser__ghost',
      '.events-teaser__signal',
      '.events-teaser__letterbox--top',
      '.events-teaser__letterbox--bottom',
      '.events-teaser__haze',
    ].map((selector) => container.querySelector(selector))

    for (const node of decorative) expect(node?.getAttribute('aria-hidden')).toBe('true')
  })

  it('la card fantasma son formas: no contiene texto que se pueda leer ni filtrar', () => {
    const { container } = renderTeaser()
    const ghost = container.querySelector('.events-teaser__ghost')
    expect(ghost.textContent).toBe('')
  })

  it('se muestra completo aunque el navegador no tenga IntersectionObserver', () => {
    const { container } = renderTeaser()
    expect(container.querySelector('.events-teaser').classList.contains('is-entered')).toBe(true)
  })

  it('el expediente dice lo que no se sabe: localidad desconocida, sede clasificada', () => {
    const { container } = renderTeaser()
    expect(container.querySelector('dl')?.getAttribute('aria-label')).toBe(
      'Lo que sabemos por ahora',
    )
    expect(screen.getByText('Desconocida')).toBeTruthy()
    expect(screen.getByText('Clasificada')).toBeTruthy()
    expect(screen.getByText('Sin anunciar')).toBeTruthy()
  })

  it('lo que se ve descifrándose es decoración: el texto real queda para los lectores', () => {
    const { container } = renderTeaser()
    const visible = container.querySelectorAll('.events-teaser__value')
    expect(visible).toHaveLength(4)
    for (const node of visible) expect(node.getAttribute('aria-hidden')).toBe('true')
  })
})
