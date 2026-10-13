import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminSiteTeaserControl from '../src/components/admin/AdminSiteTeaserControl.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function ui(props) {
  return (
    <I18nProvider>
      <AdminSiteTeaserControl canEdit {...props} />
    </I18nProvider>
  )
}

const root = (container) => container.querySelector('.admin-site-teaser')

describe('AdminSiteTeaserControl', () => {
  it('apagado: el interruptor lo dice y no hay enlace para verlo en vivo', () => {
    const { container } = render(ui({ enabled: false }))
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('link')).toBeNull()
    expect(root(container).dataset.state).toBe('off')
  })

  it('al aire: el interruptor lo dice y el enlace lleva a la página pública de Eventos', () => {
    const { container } = render(ui({ enabled: true }))
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    const link = screen.getByRole('link', { name: /verlo en vivo/i })
    expect(link.getAttribute('href')).toBe('/calendario')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(root(container).dataset.state).toBe('on')
  })

  it('el monitor es decoración: queda fuera del árbol de accesibilidad', () => {
    const { container } = render(ui({ enabled: true }))
    expect(container.querySelector('.admin-site-teaser__monitor').getAttribute('aria-hidden')).toBe(
      'true',
    )
    expect(container.querySelector('.admin-site-teaser__status').getAttribute('aria-hidden')).toBe(
      'true',
    )
  })

  it('sin leer el estado, el interruptor no se puede tocar', () => {
    const { container } = render(ui({ enabled: null }))
    expect(screen.getByRole('switch').disabled).toBe(true)
    expect(root(container).dataset.state).toBe('unknown')
  })

  it('sin permiso de escritura, el interruptor queda deshabilitado', () => {
    render(ui({ enabled: true, canEdit: false }))
    expect(screen.getByRole('switch').disabled).toBe(true)
  })

  it('tocar el interruptor pide el estado contrario', () => {
    const onToggle = vi.fn()
    const { rerender } = render(ui({ enabled: false, onToggle }))
    fireEvent.click(screen.getByRole('switch'))
    expect(onToggle).toHaveBeenLastCalledWith(true)

    rerender(ui({ enabled: true, onToggle }))
    fireEvent.click(screen.getByRole('switch'))
    expect(onToggle).toHaveBeenLastCalledWith(false)
  })

  it('con la lectura caída ofrece reintentar en vez del interruptor', () => {
    const onRetry = vi.fn()
    render(ui({ enabled: null, loadFailed: true, onRetry }))
    expect(screen.queryByRole('switch')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('la secuencia de encendido corre sólo al pasar de apagado a prendido, y termina sola', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(ui({ enabled: false }))
    expect(root(container).classList.contains('is-launching')).toBe(false)

    rerender(ui({ enabled: true }))
    expect(root(container).classList.contains('is-launching')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(root(container).classList.contains('is-launching')).toBe(false)
    expect(root(container).classList.contains('is-on')).toBe(true)
  })

  it('abrir la pantalla con el anuncio ya al aire no dispara la secuencia', () => {
    const { container, rerender } = render(ui({ enabled: null }))
    rerender(ui({ enabled: true }))
    expect(root(container).classList.contains('is-launching')).toBe(false)
  })

  it('apagarlo no dispara la secuencia', () => {
    const { container, rerender } = render(ui({ enabled: true }))
    rerender(ui({ enabled: false }))
    expect(root(container).classList.contains('is-launching')).toBe(false)
  })
})
