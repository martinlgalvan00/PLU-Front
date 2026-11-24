import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Control de venta de inscripciones: un estado, su motivo y las acciones que
 * corresponden, escritas con el mismo parche que usa el resto del panel.
 */

const platform = { current: { checkoutEnabled: true, registrationEnabled: true } }

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPlatformFeatureToggles: vi.fn(async () => platform.current),
}))

const { default: AdminEventSaleControl } = await import(
  '../src/components/admin/AdminEventSaleControl.jsx'
)
const { invalidatePlatformPaymentChannels } = await import(
  '../src/hooks/usePlatformPaymentChannels.js'
)

const DAY = 86_400_000
const future = (days) => new Date(Date.now() + days * DAY).toISOString()

const EVENT = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  status: 'inscripcion_abierta',
  published: true,
  salesIntent: 'charge',
  slots: 100,
  registered: 40,
  endsAt: future(30),
}

beforeEach(() => {
  platform.current = { checkoutEnabled: true, registrationEnabled: true }
  invalidatePlatformPaymentChannels()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderControl(event, { onSetEventState, onFix } = {}) {
  const setState = onSetEventState ?? vi.fn(async () => ({ event, events: [event] }))
  const fix = onFix ?? vi.fn()
  render(
    <I18nProvider>
      <AdminEventSaleControl canEdit event={event} onFix={fix} onSetEventState={setState} />
    </I18nProvider>,
  )
  return { setState, fix, section: screen.getByRole('region', { name: 'Venta de inscripciones' }) }
}

const stateText = (section) => within(section).getByRole('status').textContent

describe('AdminEventSaleControl', () => {
  it('a la venta: dice hasta cuándo y ofrece cerrar', async () => {
    const { setState, section } = renderControl({ ...EVENT, registrationClosesAt: future(10) })
    await waitFor(() => expect(stateText(section)).toBe('A la venta'))
    expect(within(section).getByText(/pueden inscribirse y pagar hasta el/)).toBeTruthy()

    fireEvent.click(within(section).getByRole('button', { name: 'Cerrar inscripciones' }))
    await waitFor(() =>
      expect(setState).toHaveBeenCalledWith('pitbull-classic-2026', { status: 'cerrado' }),
    )
  })

  it('cerrada con la ventana vencida: "Abrir ahora" borra el cierre viejo y publica', async () => {
    const event = { ...EVENT, status: 'cerrado', registrationClosesAt: future(-2) }
    const { setState, section } = renderControl(event)
    await waitFor(() => expect(stateText(section)).toBe('Cerradas'))

    fireEvent.click(within(section).getByRole('button', { name: 'Abrir ahora' }))
    await waitFor(() =>
      expect(setState).toHaveBeenCalledWith('pitbull-classic-2026', {
        status: 'inscripcion_abierta',
        registrationClosesAt: null,
        published: true,
      }),
    )
  })

  it('programar: pide fecha futura y escribe la apertura', async () => {
    const { setState, section } = renderControl({ ...EVENT, status: 'proximamente' })
    await waitFor(() => expect(stateText(section)).toBe('Cerradas'))
    fireEvent.click(within(section).getByRole('button', { name: 'Programar apertura' }))

    const input = within(section).getByLabelText('Abren el')
    fireEvent.change(input, { target: { value: '2030-03-01T10:00' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Programar' }))

    await waitFor(() => expect(setState).toHaveBeenCalledTimes(1))
    expect(setState.mock.calls[0][1]).toEqual({
      status: 'inscripcion_abierta',
      registrationOpensAt: new Date('2030-03-01T10:00').toISOString(),
    })
  })

  it('programada: muestra cuándo abre y se puede abrir ya o cerrar', async () => {
    const { section } = renderControl({ ...EVENT, registrationOpensAt: future(3) })
    await waitFor(() => expect(stateText(section)).toBe('Programadas'))
    expect(within(section).getByText(/Abren solas el/)).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Abrir ahora' })).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Cambiar fecha' })).toBeTruthy()
    expect(within(section).getByRole('button', { name: 'Cerrar inscripciones' })).toBeTruthy()
  })

  it('oculto: "abierta" pero sin poder pagar, con "Publicar" ahí mismo', async () => {
    const { setState, section } = renderControl({ ...EVENT, published: false })
    await waitFor(() => expect(stateText(section)).toBe('Abiertas, sin poder pagar'))
    const issues = within(section).getByRole('list', { name: 'Qué impide vender' })
    expect(within(issues).getByText('El evento está oculto en el sitio.')).toBeTruthy()

    fireEvent.click(within(issues).getByRole('button', { name: 'Publicar' }))
    await waitFor(() =>
      expect(setState).toHaveBeenCalledWith('pitbull-classic-2026', { published: true }),
    )
  })

  it('"Solo anuncio" bloquea y lleva a Cobro', async () => {
    const { fix, section } = renderControl({ ...EVENT, salesIntent: 'announce' })
    await waitFor(() => expect(stateText(section)).toBe('Abiertas, sin poder pagar'))
    fireEvent.click(within(section).getByRole('button', { name: 'Ir a Cobro' }))
    expect(fix).toHaveBeenCalledWith('payment')
  })

  it('inscripciones pausadas en la plataforma: lo dice aunque el evento esté bien', async () => {
    platform.current = { checkoutEnabled: true, registrationEnabled: false }
    invalidatePlatformPaymentChannels()
    const { section } = renderControl(EVENT)
    await waitFor(() =>
      expect(within(section).getByText(/pausadas en toda la plataforma/)).toBeTruthy(),
    )
  })

  it('agotada: ofrece ampliar el cupo', async () => {
    const { fix, section } = renderControl({ ...EVENT, status: 'agotado', registered: 100 })
    await waitFor(() => expect(stateText(section)).toBe('Agotadas'))
    fireEvent.click(within(section).getByRole('button', { name: 'Ampliar cupo' }))
    expect(fix).toHaveBeenCalledWith('cupo')
  })

  it('con el evento ya pasado ofrece marcarlo como finalizado', async () => {
    const { setState, section } = renderControl({ ...EVENT, status: 'cerrado', endsAt: future(-1) })
    await waitFor(() => expect(stateText(section)).toBe('Cerradas'))
    fireEvent.click(within(section).getByRole('button', { name: 'Marcar como finalizado' }))
    await waitFor(() =>
      expect(setState).toHaveBeenCalledWith('pitbull-classic-2026', { status: 'finalizado' }),
    )
  })

  it('habilitar entradas escribe el interruptor público, aparte de las inscripciones', async () => {
    const { setState, section } = renderControl(EVENT)
    fireEvent.click(within(section).getByRole('button', { name: 'Habilitar venta' }))
    await waitFor(() =>
      expect(setState).toHaveBeenCalledWith('pitbull-classic-2026', { ticketsEnabled: true }),
    )
  })

  it('sin permiso de edición se lee pero no ofrece acciones', async () => {
    render(
      <I18nProvider>
        <AdminEventSaleControl event={{ ...EVENT, status: 'cerrado' }} />
      </I18nProvider>,
    )
    const section = screen.getByRole('region', { name: 'Venta de inscripciones' })
    await waitFor(() => expect(stateText(section)).toBe('Cerradas'))
    expect(within(section).queryByRole('button')).toBeNull()
  })
})
