import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import ObservationsThread from '../src/components/admin/ObservationsThread.jsx'

/**
 * El hilo de observaciones.
 *
 * Los dos límites que resuelve, y que este archivo fija:
 *
 *   1. Anotar no cuesta un cambio de estado. Antes el único lugar donde
 *      escribir era el motivo del diálogo de corrección, que exige elegir un
 *      estado distinto al vigente: dejar dicho "el pago llegó a nombre del
 *      padre" sobre una inscripción confirmada obligaba a sacarla de
 *      confirmada.
 *   2. Nada se pisa. `manual_override_reason` guardaba una sola frase, así que
 *      un caso que pasa por tres manos terminaba con la última línea y sin
 *      rastro de las anteriores.
 */

vi.mock('../src/services/athleteApi.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listObservations: vi.fn(),
    addObservation: vi.fn(),
    deleteObservation: vi.fn(),
  }
})

const { addObservation, deleteObservation, listObservations } = await import(
  '../src/services/athleteApi.js'
)

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const ENTITY_ID = '428a53ac-184d-43a0-8d6c-e7e35ffdeccf'

function observation(overrides = {}) {
  return {
    id: 'obs-1',
    entityType: 'registration',
    entityId: ENTITY_ID,
    body: 'EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ',
    statusChange: 'observada',
    author: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
    createdAt: '2026-08-27T00:59:23.511675+00:00',
    ...overrides,
  }
}

function renderThread(props = {}) {
  return render(
    <I18nProvider>
      <ObservationsThread entityId={ENTITY_ID} entityType="registration" {...props} />
    </I18nProvider>,
  )
}

describe('hilo de observaciones', () => {
  it('muestra el hilo con autor, fecha y el estado que acompañó cada entrada', async () => {
    listObservations.mockResolvedValue([
      observation(),
      observation({
        id: 'obs-0',
        body: 'Se le escribió por Instagram, sin respuesta.',
        statusChange: null,
        createdAt: '2026-08-26T14:00:00.000Z',
      }),
    ])

    renderThread()

    expect(await screen.findByText('EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ')).toBeTruthy()
    expect(screen.getByText('Se le escribió por Instagram, sin respuesta.')).toBeTruthy()
    // El mail, no el id interno.
    expect(screen.getAllByText('maximalstrengthcorp@gmail.com').length).toBe(2)
    // La entrada que acompañó un cambio de estado lo dice; la suelta no.
    expect(screen.getAllByText('Observada').length).toBe(1)
  })

  it('anota sin pedir ni tocar el estado', async () => {
    listObservations.mockResolvedValue([])
    addObservation.mockResolvedValue({
      observation: observation({ id: 'obs-nueva', body: 'Mandó el comprobante por mail.', statusChange: null }),
    })

    renderThread({ canWrite: true })

    await screen.findByText('Todavía no hay observaciones.')
    fireEvent.change(screen.getByLabelText('Nueva observación'), {
      target: { value: 'Mandó el comprobante por mail.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Anotar' }))

    await waitFor(() =>
      expect(addObservation).toHaveBeenCalledWith(
        'registration',
        ENTITY_ID,
        'Mandó el comprobante por mail.',
      ),
    )
    expect(await screen.findByText('Mandó el comprobante por mail.')).toBeTruthy()
  })

  it('no deja anotar en blanco ni con una palabra suelta', async () => {
    listObservations.mockResolvedValue([])
    renderThread({ canWrite: true })
    await screen.findByText('Todavía no hay observaciones.')

    const submit = () => screen.getByRole('button', { name: 'Anotar' })
    expect(submit().disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Nueva observación'), { target: { value: 'ok' } })
    expect(submit().disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Nueva observación'), { target: { value: 'pagó' } })
    expect(submit().disabled).toBe(false)
  })

  it('sin permiso de escritura es sólo lectura', async () => {
    listObservations.mockResolvedValue([observation()])
    renderThread({ canWrite: false })

    await screen.findByText('EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ')
    expect(screen.queryByRole('button', { name: 'Anotar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Borrar observación' })).toBeNull()
  })

  it('borra una entrada del hilo', async () => {
    listObservations.mockResolvedValue([observation()])
    deleteObservation.mockResolvedValue({ deleted: true })

    renderThread({ canWrite: true })
    await screen.findByText('EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ')

    fireEvent.click(screen.getByRole('button', { name: 'Borrar observación' }))

    await waitFor(() => expect(deleteObservation).toHaveBeenCalledWith('obs-1'))
    await waitFor(() =>
      expect(screen.queryByText('EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ')).toBeNull(),
    )
  })

  it('un fallo de lectura se dice, no se muestra un hilo vacío', async () => {
    // Un hilo vacío y un hilo que no se pudo leer son cosas distintas: la
    // primera invita a anotar, la segunda a reintentar.
    listObservations.mockRejectedValue(new Error('La base no responde.'))

    renderThread({ canWrite: true })

    expect((await screen.findByRole('alert')).textContent).toContain('La base no responde.')
    expect(screen.queryByText('Todavía no hay observaciones.')).toBeNull()
  })
})
