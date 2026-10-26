import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventPublishChecklist from '../src/components/admin/event-editor/EventPublishChecklist.jsx'
import { resolveEventPublishReadiness } from '../src/lib/eventPublishReadiness.js'
import { normalizeEventOffering } from '../shared/eventOffering.js'

afterEach(() => cleanup())

const NOW = new Date('2026-06-01T12:00:00')
const complete = {
  title: 'Pitbull Classic',
  description: 'Un meet abierto.',
  venue: 'Club',
  slots: 100,
  status: 'proximamente',
  startsAt: '2026-09-10T09:00',
  endsAt: '2026-09-10T20:00',
  logoUrl: 'https://cdn.example/logo.png',
  salesIntent: 'announce',
}

function renderChecklist(event, { onGoTo } = {}) {
  const readiness = resolveEventPublishReadiness(event, { now: NOW })
  render(
    <I18nProvider>
      <EventPublishChecklist readiness={readiness} onGoTo={onGoTo} />
    </I18nProvider>,
  )
  return readiness
}

describe('EventPublishChecklist', () => {
  it('muestra una fila por ítem, el contador y que está listo', () => {
    const readiness = renderChecklist(complete)
    expect(screen.getAllByRole('listitem')).toHaveLength(readiness.total)
    expect(screen.getByText(`${readiness.total} de ${readiness.total} listos`)).toBeTruthy()
    expect(screen.getByText(/no falta nada esencial/i)).toBeTruthy()
  })

  it('agrupa las filas por sección', () => {
    renderChecklist(complete)
    for (const name of ['Datos del evento', 'Portada', 'Inscripción', 'Cobro']) {
      expect(screen.getByRole('heading', { name })).toBeTruthy()
    }
  })

  it('el estado se lee en texto, no solo en color', () => {
    renderChecklist({ ...complete, title: '' })
    const row = screen.getByText('Título').closest('li')
    expect(row.getAttribute('data-state')).toBe('todo')
    expect(within(row).getByText('Falta')).toBeTruthy()
    expect(screen.getByText(/faltan datos en la ficha pública/i)).toBeTruthy()
    const done = screen.getByText('Fechas').closest('li')
    expect(within(done).getByText('Listo')).toBeTruthy()
  })

  it('el aviso (fecha pasada) se muestra como Revisar', () => {
    renderChecklist({ ...complete, startsAt: '2026-05-01T09:00', endsAt: '2026-05-01T18:00' })
    const row = screen.getByText('Fechas').closest('li')
    expect(row.getAttribute('data-state')).toBe('warning')
    expect(within(row).getByText('Revisar')).toBeTruthy()
  })

  it('dice si se ofrece todo o la oferta es restringida', () => {
    renderChecklist(complete)
    expect(screen.getByText(/se ofrecen todas las categorías/i)).toBeTruthy()
    cleanup()
    renderChecklist({ ...complete, offering: normalizeEventOffering({ categories: ['Raw'] }) })
    expect(screen.getByText(/oferta restringida/i)).toBeTruthy()
  })

  it('sin onGoTo no hay botones', () => {
    renderChecklist({ ...complete, title: '' })
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('con onGoTo, solo las filas pendientes tienen «Ir a» y llaman con la pestaña', () => {
    const onGoTo = vi.fn()
    const readiness = renderChecklist({ ...complete, title: '' }, { onGoTo })
    const pending = readiness.items.filter((item) => item.state !== 'ok')
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(pending.length)
    const titleRow = screen.getByText('Título').closest('li')
    fireEvent.click(within(titleRow).getByRole('button', { name: /título: ir a datos/i }))
    expect(onGoTo).toHaveBeenCalledWith('basics', 'title')
    expect(within(screen.getByText('Fechas').closest('li')).queryByRole('button')).toBeNull()
  })

  it('no renderiza nada sin readiness', () => {
    const { container } = render(
      <I18nProvider>
        <EventPublishChecklist readiness={null} />
      </I18nProvider>,
    )
    expect(container.querySelector('.admin-event-readiness')).toBeNull()
  })
})
