import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import {
  hasRemovableBackground,
  removeImageBackground,
} from '../src/lib/removeImageBackground.js'
import EventsSection from '../src/pages/admin/EventsSection.jsx'

/**
 * El fondo del logo se quita solo, sin ajustes: el resultado se ve (alta) o se
 * avisa con una salida (ficha), y la acción sobre un logo ya subido aparece
 * únicamente cuando hay un fondo liso que quitar.
 *
 * jsdom no rasteriza, así que el motor se simula para probar el flujo que lo
 * rodea; su algoritmo se prueba aparte, en removeImageBackground.test.js.
 */
vi.mock('../src/lib/removeImageBackground.js', async (importOriginal) => ({
  ...(await importOriginal()),
  hasRemovableBackground: vi.fn(async () => false),
  removeImageBackground: vi.fn(async (file) => ({ file, applied: false, reason: 'unsupported' })),
}))

const PUBLISHED = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  description: '',
  date: '15 ago',
  dateISO: '2026-08-15',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  status: 'proximamente',
  published: true,
  featured: false,
  requiresMembership: true,
  slots: 80,
  registered: 0,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
}
const WITH_LOGO = { ...PUBLISHED, logoUrl: 'https://cdn.test/logo.png' }

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  hasRemovableBackground.mockReset().mockResolvedValue(false)
  removeImageBackground.mockReset().mockImplementation(async (file) => ({
    file,
    applied: false,
    reason: 'unsupported',
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const png = (name = 'logo.png') => new File([new Uint8Array(2048)], name, { type: 'image/png' })
const cutout = () => ({ file: png('sin-fondo.webp'), applied: true, reason: 'applied' })

function renderEvents(overrides = {}) {
  const handlers = {
    onSaveEvent: vi.fn(async (draft) => ({ event: { ...PUBLISHED, ...draft, id: 'evt-new' } })),
    onSetEventLogo: vi.fn(async () => ({ events: [], backgroundRemoved: false })),
    onSetEventState: vi.fn(async () => ({ events: [] })),
    ...overrides,
  }
  render(
    <I18nProvider>
      <EventsSection
        adminEvents={[PUBLISHED]}
        canEdit
        canDeleteEvents={false}
        canManageUsers={false}
        tickets={[]}
        {...handlers}
      />
    </I18nProvider>,
  )
  return handlers
}

function openPanel() {
  fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
  return screen.getByRole('region', { name: 'Evento seleccionado' })
}

function collectToasts() {
  const toasts = []
  const listener = (event) => toasts.push(event.detail)
  window.addEventListener('plu:admin-toast', listener)
  return { toasts, stop: () => window.removeEventListener('plu:admin-toast', listener) }
}

function stubLogoFetch() {
  const blob = new Blob([new Uint8Array(512)], { type: 'image/png' })
  const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => blob }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ficha del evento', () => {
  it('no ofrece un interruptor que adivinar ni una acción sin logo', () => {
    renderEvents()
    const panel = openPanel()
    expect(within(panel).queryByRole('switch')).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Quitar fondo' })).toBeNull()
  })

  it('al subir, el fondo se quita solo y el aviso permite restaurarlo', async () => {
    const { stop, toasts } = collectToasts()
    removeImageBackground.mockResolvedValueOnce(cutout())
    const onSetEventLogo = vi.fn(async (_slug, _file, options) => ({
      events: [],
      backgroundRemoved: options.removeBackground,
    }))
    renderEvents({ onSetEventLogo })
    const panel = openPanel()

    const original = png()
    fireEvent.change(panel.querySelector('.admin-event-logo--field input[type="file"]'), {
      target: { files: [original] },
    })

    await waitFor(() =>
      expect(onSetEventLogo).toHaveBeenCalledWith('pitbull-classic-2026', original, {
        removeBackground: true,
      }),
    )
    await waitFor(() => expect(toasts.at(-1)?.message).toBe('Logo actualizado, sin fondo.'))
    expect(toasts.at(-1).action.label).toBe('Restaurar fondo')

    toasts.at(-1).action.onClick()

    // Restaurar vuelve a subir el original, sin tocarle el fondo.
    await waitFor(() =>
      expect(onSetEventLogo).toHaveBeenLastCalledWith('pitbull-classic-2026', original, {
        removeBackground: false,
      }),
    )
    await waitFor(() => expect(toasts.at(-1)?.message).toBe('Logo actualizado.'))
    stop()
  })

  it('con una foto sube tal cual y no promete un fondo quitado', async () => {
    const { stop, toasts } = collectToasts()
    renderEvents()
    const panel = openPanel()

    fireEvent.change(panel.querySelector('.admin-event-logo--field input[type="file"]'), {
      target: { files: [png()] },
    })

    await waitFor(() => expect(toasts.at(-1)?.message).toBe('Logo actualizado.'))
    expect(toasts.at(-1).action).toBeUndefined()
    stop()
  })

  it('sobre un logo ya subido con fondo liso, ofrece quitarlo con un toque', async () => {
    hasRemovableBackground.mockResolvedValue(true)
    stubLogoFetch()
    const onSetEventLogo = vi.fn(async () => ({ events: [], backgroundRemoved: true }))
    renderEvents({ adminEvents: [WITH_LOGO], onSetEventLogo })
    const panel = openPanel()

    fireEvent.click(await within(panel).findByRole('button', { name: 'Quitar fondo' }))

    await waitFor(() => expect(onSetEventLogo).toHaveBeenCalledTimes(1))
    const [slug, file, options] = onSetEventLogo.mock.calls[0]
    expect(slug).toBe('pitbull-classic-2026')
    expect(file).toBeInstanceOf(File)
    expect(options).toEqual({ removeBackground: true })
  })

  it('si el logo no tiene fondo que quitar, la acción no aparece', async () => {
    const fetchMock = stubLogoFetch()
    renderEvents({ adminEvents: [WITH_LOGO] })
    const panel = openPanel()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(hasRemovableBackground).toHaveBeenCalled())
    expect(within(panel).queryByRole('button', { name: 'Quitar fondo' })).toBeNull()
  })

  it('sin poder leer el archivo no ofrece una acción que fallaría', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('cors')
    })
    vi.stubGlobal('fetch', fetchMock)
    renderEvents({ adminEvents: [WITH_LOGO] })
    const panel = openPanel()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(within(panel).queryByRole('button', { name: 'Quitar fondo' })).toBeNull()
  })

  it('llama «Eliminar» a borrar la imagen para no confundirla con quitar el fondo', async () => {
    stubLogoFetch()
    renderEvents({ adminEvents: [WITH_LOGO] })
    const panel = openPanel()

    expect(within(panel).getByRole('button', { name: 'Eliminar' })).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Quitar' })).toBeNull()
  })
})

describe('alta de evento', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:logo')
    URL.revokeObjectURL = vi.fn()
  })

  async function pickLogo() {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fireEvent.change(document.querySelector('.admin-event-logo--stage input[type="file"]'), {
      target: { files: [png()] },
    })
    await waitFor(() => expect(document.querySelector('.admin-event-logo__tile img')).toBeTruthy())
  }

  it('lo quita solo y deja una única acción para restaurarlo y volver a quitarlo', async () => {
    removeImageBackground.mockResolvedValueOnce(cutout())
    await pickLogo()

    expect(screen.getByText('Fondo quitado.')).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar fondo' }))
    expect(await screen.findByText('Con el fondo original.')).toBeTruthy()

    removeImageBackground.mockResolvedValueOnce(cutout())
    fireEvent.click(screen.getByRole('button', { name: 'Quitar fondo' }))
    expect(await screen.findByText('Fondo quitado.')).toBeTruthy()
  })

  it('entrega para subir el archivo que se está viendo', async () => {
    removeImageBackground.mockResolvedValueOnce(cutout())
    const { onSaveEvent, onSetEventLogo } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fireEvent.change(screen.getByLabelText('Título público'), { target: { value: 'Copa Otoño' } })
    fireEvent.change(document.getElementById('quick-event-starts-at'), {
      target: { value: '2026-11-12T10:00' },
    })
    fireEvent.change(document.getElementById('quick-event-ends-at'), {
      target: { value: '2026-11-12T18:00' },
    })
    fireEvent.change(document.getElementById('quick-event-venue'), { target: { value: 'Club' } })
    fireEvent.change(document.getElementById('quick-event-location'), { target: { value: 'Rosario' } })
    fireEvent.change(document.querySelector('.admin-event-logo--stage input[type="file"]'), {
      target: { files: [png()] },
    })
    await screen.findByText('Fondo quitado.')

    // El alta es guiada: "Crear evento" está en el último paso.
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(onSetEventLogo).toHaveBeenCalledTimes(1))
    expect(onSaveEvent).toHaveBeenCalledTimes(1)
    const [, uploaded, options] = onSetEventLogo.mock.calls[0]
    expect(uploaded.name).toBe('sin-fondo.webp')
    expect(options).toEqual({ prepared: true })
  })

  it('con una foto lo avisa y no ofrece una acción que no aplica', async () => {
    removeImageBackground.mockResolvedValueOnce({
      file: png(),
      applied: false,
      reason: 'no-flat-background',
    })
    await pickLogo()

    expect(screen.getByText('No tiene un fondo liso para quitar.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /fondo/ })).toBeNull()
  })

  it('con un logo ya transparente, no hay nada que alternar', async () => {
    removeImageBackground.mockResolvedValueOnce({
      file: png(),
      applied: false,
      reason: 'already-transparent',
    })
    await pickLogo()

    expect(screen.getByText('Ya tiene fondo transparente.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /fondo/ })).toBeNull()
  })
})
