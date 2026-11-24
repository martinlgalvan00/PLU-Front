import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'
import { invalidatePlatformPaymentChannels } from '../src/hooks/usePlatformPaymentChannels.js'

/**
 * El alta, la lista y la publicación leen la matriz de plataforma para dibujar
 * qué medios tiene abiertos cada evento. Se entrega la política de lanzamiento:
 * Mercado Pago en inscripción, y en entradas también transferencia.
 */
vi.mock('../src/services/paymentProfileService.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchPaymentProfiles: vi.fn(async () => ({
    profiles: [
      {
        id: '7d9f0c9e-3a2b-4c1d-8e5f-0a1b2c3d4e5f',
        name: 'Cuenta del club',
        kind: 'bank_transfer',
        config: { alias: 'club.pesas' },
      },
    ],
    secretsKeyConfigured: true,
  })),
}))

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      checkoutEnabled: true,
      environmentHolds: [],
      paymentChannels: {
        membership: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
        registration: { mercado_pago: true, bank_transfer: false, cash_pitbull: false, wise_transfer: false },
        ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: false, wise_transfer: false },
      },
    })),
  }
})

/**
 * Cargar varios meets seguidos y publicarlos juntos: logo en el alta, «Crear y
 * cargar otro», duplicar y la selección en lote. Es el flujo que antes costaba
 * una ida y vuelta a la consola por cada evento.
 */

const BASE = {
  description: '',
  date: '15 ago',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  status: 'proximamente',
  featured: false,
  requiresMembership: true,
  slots: 80,
  registered: 0,
  pricing: { registration: 75000, membership: 75000, combo: 120000, ticketAddons: [] },
  eventDays: [],
  ticketTypes: [],
}

const PUBLISHED = {
  ...BASE,
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  dateISO: '2026-08-15',
  published: true,
}
const HIDDEN_A = {
  ...BASE,
  id: 'evt-2',
  slug: 'copa-otono-2026',
  title: 'Copa Otoño',
  dateISO: '2026-09-10',
  published: false,
}
const HIDDEN_B = {
  ...BASE,
  id: 'evt-3',
  slug: 'copa-invierno-2026',
  title: 'Copa Invierno',
  dateISO: '2026-10-10',
  published: false,
  requiresMembership: false,
  slots: 120,
  logoUrl: null,
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  invalidatePlatformPaymentChannels()
  vi.restoreAllMocks()
})

function renderEvents(overrides = {}, { events = [PUBLISHED, HIDDEN_A, HIDDEN_B] } = {}) {
  const handlers = {
    onSaveEvent: vi.fn(async (draft) => ({ event: { ...BASE, ...draft, id: 'evt-new' } })),
    onSetEventLogo: vi.fn(async () => ({ events: [] })),
    onSetEventState: vi.fn(async () => ({ events: [] })),
    ...overrides,
  }
  render(
    <I18nProvider>
      <EventsSection
        adminEvents={events}
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

function fillRequired({ title = 'Copa Primavera', start = '2026-11-12T10:00' } = {}) {
  fireEvent.change(screen.getByLabelText('Título público'), { target: { value: title } })
  fireEvent.change(document.getElementById('quick-event-starts-at'), { target: { value: start } })
  fireEvent.change(document.getElementById('quick-event-ends-at'), {
    target: { value: start.replace('10:00', '18:00') },
  })
  fireEvent.change(document.getElementById('quick-event-venue'), {
    target: { value: 'Club Central' },
  })
  fireEvent.change(document.getElementById('quick-event-location'), {
    target: { value: 'Rosario' },
  })
}

/** El alta es guiada: avanza un paso (Evento → Venta → Página). */
function nextStep() {
  const opens = document.getElementById('quick-event-registration-opens')
  if (opens && !opens.value) {
    fireEvent.change(opens, { target: { value: '2026-06-01T10:00' } })
    fireEvent.change(document.getElementById('quick-event-registration-closes'), {
      target: { value: '2026-12-01T18:00' },
    })
  }
  fireEvent.click(screen.getByRole('button', { name: /^Siguiente/ }))
}

/** Hasta el último paso, donde están "Crear evento" y "Crear y cargar otro". */
function toLastStep() {
  while (screen.queryByRole('button', { name: /^Siguiente/ })) nextStep()
}

describe('alta en tanda', () => {
  it('«Crear y cargar otro» guarda, se queda y deja lo que se repite', async () => {
    const { onSaveEvent } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    toLastStep()

    fireEvent.click(screen.getByRole('button', { name: 'Crear y cargar otro' }))

    await waitFor(() => expect(onSaveEvent).toHaveBeenCalledTimes(1))
    // Sigue en el alta, con sede y ciudad cargadas y el título vacío.
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/«Copa Primavera» creado/))
    expect(screen.getByLabelText('Título público').value).toBe('')
    expect(document.getElementById('quick-event-venue').value).toBe('Club Central')
    expect(document.getElementById('quick-event-location').value).toBe('Rosario')
    expect(document.getElementById('quick-event-starts-at').value).toBe('')
    // Ya hubo un alta: salir ya no es "cancelar", es terminar la tanda.
    expect(screen.getByRole('button', { name: 'Listo' })).toBeTruthy()
  })

  it('"Listo" vuelve al listado sin preguntar por lo que ya se guardó', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    toLastStep()
    fireEvent.click(screen.getByRole('button', { name: 'Crear y cargar otro' }))
    await screen.findByText(/«Copa Primavera» creado/)

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('list', { name: 'Evento' })).toBeTruthy()
  })

  it('sube el logo elegido apenas el evento existe', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:logo')
    URL.revokeObjectURL = vi.fn()
    const { onSaveEvent, onSetEventLogo } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()

    const file = new File([new Uint8Array(2048)], 'logo.png', { type: 'image/png' })
    const input = document.querySelector('.admin-event-logo--stage input[type="file"]')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(document.querySelector('.admin-event-logo__tile img')).toBeTruthy())

    toLastStep()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(onSetEventLogo).toHaveBeenCalledTimes(1))
    const [slug, uploaded, options] = onSetEventLogo.mock.calls[0]
    expect(slug).toBe('copa-primavera-2026')
    expect(uploaded).toBeInstanceOf(File)
    // Ya viene preparado desde el alta: no se vuelve a procesar al subir.
    expect(options).toEqual({ prepared: true })
    expect(onSaveEvent.mock.invocationCallOrder[0]).toBeLessThan(
      onSetEventLogo.mock.invocationCallOrder[0],
    )
  })

  it('si el logo falla, el evento igual queda creado', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:logo')
    URL.revokeObjectURL = vi.fn()
    const toasts = []
    window.addEventListener('plu:admin-toast', (event) => toasts.push(event.detail))
    const { onSaveEvent } = renderEvents({
      onSetEventLogo: vi.fn(async () => ({ error: 'sin storage' })),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    const file = new File([new Uint8Array(2048)], 'logo.png', { type: 'image/png' })
    fireEvent.change(document.querySelector('.admin-event-logo--stage input[type="file"]'), {
      target: { files: [file] },
    })
    await waitFor(() => expect(document.querySelector('.admin-event-logo__tile img')).toBeTruthy())

    toLastStep()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(toasts.some((toast) => /no se pudo subir el logo/.test(toast.message))).toBe(true))
    expect(onSaveEvent).toHaveBeenCalledTimes(1)
  })

  it('rechaza un logo que no es JPG, PNG ni WebP', async () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    const gif = new File([new Uint8Array(64)], 'logo.gif', { type: 'image/gif' })

    fireEvent.change(document.querySelector('.admin-event-logo--stage input[type="file"]'), {
      target: { files: [gif] },
    })

    expect((await screen.findByRole('alert')).textContent).toMatch(/JPG, PNG o WEBP/)
    expect(document.querySelector('.admin-event-logo__tile img')).toBeNull()
  })
})

describe('duplicar un evento', () => {
  it('abre el alta con sede, ciudad, cupo y acceso del original, sin fechas', () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar Copa Invierno' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Crear meet' })).toBeTruthy()
    expect(screen.getByLabelText('Título público').value).toBe('Copa Invierno')
    expect(document.getElementById('quick-event-venue').value).toBe('Maximal Strength Club')
    expect(document.getElementById('quick-event-slots').value).toBe('120')
    expect(document.getElementById('quick-event-starts-at').value).toBe('')
    expect(document.body.textContent).toMatch(/Copia de «Copa Invierno»/)
  })

  it('un alta nueva después de duplicar no arrastra los datos copiados', () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar Copa Invierno' }))
    fireEvent.click(screen.getByRole('button', { name: /Volver a eventos/ }))
    // El título copiado cuenta como dato cargado: se confirma el descarte.
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))

    expect(screen.getByLabelText('Título público').value).toBe('')
    expect(document.body.textContent).not.toMatch(/Copia de/)
  })
})

describe('publicar en lote', () => {
  it('avisa cuántos eventos siguen sin publicar y los deja elegidos', () => {
    renderEvents()
    expect(screen.getByText('2 eventos sin publicar')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Revisar y publicar' }))

    expect(screen.getByText('2 seleccionados')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Copa Otoño' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Copa Invierno' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Pitbull Classic' }).checked).toBe(false)
  })

  it('publica todos los elegidos con un solo botón', async () => {
    const { onSetEventState } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y publicar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Publicar 2' }))

    await waitFor(() => expect(onSetEventState).toHaveBeenCalledTimes(2))
    expect(onSetEventState).toHaveBeenCalledWith('copa-otono-2026', { published: true })
    expect(onSetEventState).toHaveBeenCalledWith('copa-invierno-2026', { published: true })
    // Terminado, se sale del modo selección.
    await waitFor(() => expect(screen.queryByRole('group', { name: /visibilidad/i })).toBeNull())
  })

  it('ofrece deshacer lo publicado', async () => {
    const toasts = []
    window.addEventListener('plu:admin-toast', (event) => toasts.push(event.detail))
    const { onSetEventState } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y publicar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar 2' }))
    await waitFor(() => expect(toasts.length).toBeGreaterThan(0))

    expect(toasts.at(-1).message).toBe('2 eventos publicados.')
    toasts.at(-1).action.onClick()

    await waitFor(() => expect(onSetEventState).toHaveBeenCalledTimes(4))
    expect(onSetEventState).toHaveBeenLastCalledWith('copa-invierno-2026', { published: false })
  })

  it('con un fallo, informa cuál y no sale del modo selección', async () => {
    const onSetEventState = vi.fn(async (slug) =>
      slug === 'copa-invierno-2026' ? { error: 'Sin permisos.' } : { events: [] },
    )
    renderEvents({ onSetEventState })
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y publicar' }))

    fireEvent.click(screen.getByRole('button', { name: 'Publicar 2' }))

    await waitFor(() =>
      expect(document.body.textContent).toMatch(
        /Se cambiaron 1 de 2\. Falló «Copa Invierno»: Sin permisos\./,
      ),
    )
    expect(screen.getByRole('button', { name: /Publicar/ })).toBeTruthy()
  })

  it('no toca un evento que ya está publicado', async () => {
    const { onSetEventState } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Pitbull Classic' }))

    fireEvent.click(screen.getByRole('button', { name: 'Publicar 1' }))

    await screen.findByText('Los eventos elegidos ya estaban así.')
    expect(onSetEventState).not.toHaveBeenCalled()
  })

  it('en modo selección, tocar la fila elige y no abre el evento', () => {
    renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))

    fireEvent.click(screen.getByTitle(/Copa Otoño · copa-otono-2026/))

    expect(screen.getByRole('checkbox', { name: 'Seleccionar Copa Otoño' }).checked).toBe(true)
    expect(screen.queryByRole('region', { name: 'Evento seleccionado' })).toBeNull()
  })

  it('sin permiso de escritura no ofrece selección ni duplicar', () => {
    renderEvents({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Duplicar/ })).toBeNull()
    expect(screen.queryByText(/sin publicar/)).toBeNull()
  })
})

describe('quitar fondo en la ficha del evento', () => {
  it('no hay un interruptor que adivinar: la ficha no lo ofrece', () => {
    renderEvents()
    fireEvent.click(screen.getByTitle(/Pitbull Classic · pitbull-classic-2026/))
    const panel = screen.getByRole('region', { name: 'Evento seleccionado' })
    expect(within(panel).queryByRole('switch')).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Quitar fondo' })).toBeNull()
  })
})

describe('crear un evento de otro año', () => {
  it('no esconde el resto del calendario con el filtro de año', async () => {
    const OLD = { ...PUBLISHED, id: 'evt-0', slug: 'copa-2025', title: 'Copa 2025', dateISO: '2025-08-15' }
    const onSaveEvent = vi.fn(async (draft) => ({
      event: { ...BASE, ...draft, id: 'evt-new', dateISO: '2002-05-15', title: 'aaa', published: false },
    }))
    renderEvents({ onSaveEvent }, { events: [OLD, PUBLISHED, HIDDEN_A] })
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired({ title: 'aaa', start: '2002-05-15T10:00' })
    toLastStep()

    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }))

    await waitFor(() => expect(onSaveEvent).toHaveBeenCalledTimes(1))
    // De la pantalla «Listo» a la lista (se espera a que aparezca: el botón del
    // formulario se llama igual).
    await screen.findByRole('heading', { name: 'aaa' })
    fireEvent.click(screen.getByRole('button', { name: 'Volver a eventos' }))
    // Vuelve al listado con todos los años: los eventos existentes siguen ahí.
    // El evento destacado también aparece en la vista previa de la navegación.
    expect((await screen.findAllByText('Pitbull Classic')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Copa 2025').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Copa Otoño').length).toBeGreaterThan(0)
  })
})

describe('medios de cobro en el alta, la lista y la publicación', () => {
  it('la lista dice si se puede vender y, si sí, con qué cobra', async () => {
    const open = { ...PUBLISHED, status: 'inscripcion_abierta' }
    const withCash = {
      ...HIDDEN_A,
      published: true,
      status: 'inscripcion_abierta',
      paymentChannelOverrides: { registration: { cash_pitbull: 'open' } },
    }
    const hidden = { ...HIDDEN_B, status: 'inscripcion_abierta' }
    renderEvents({}, { events: [open, withCash, hidden] })

    await waitFor(() => {
      const cells = [...document.querySelectorAll('.admin-event-row__sale')].map(
        (node) => node.textContent,
      )
      // Pitbull Classic hereda la plataforma: solo Mercado Pago.
      expect(cells).toContain('A la ventaMercado Pago')
      // Copa Otoño abre además efectivo para la inscripción.
      expect(cells).toContain('A la ventaMercado Pago · Efectivo')
      // Abierta pero oculta: no se puede pagar, y se dice por qué.
      expect(cells).toContain('Sin poder pagarEvento oculto')
    })
    // El estado guardado ya no tiene columna propia: lo dice la venta.
    expect(document.querySelector('.admin-event-row .status-pill')).toBeNull()
  })

  it('el alta ofrece los medios de pago y los guarda como override del evento', async () => {
    const { onSaveEvent } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    nextStep()
    const matrix = screen.getByRole('group', { name: /medios de pago por concepto/i })
    await waitFor(() => expect(matrix.getAttribute('aria-busy')).toBeNull())

    // La transferencia está cerrada en inscripción: abrirla es una decisión del evento.
    fireEvent.click(within(matrix).getByRole('checkbox', { name: /transferencia · inscripción/i }))
    // Y como queda abierta pide un destino de cobro.
    expect(document.getElementById('quick-event-bank-profile')).toBeTruthy()

    toLastStep()
    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(onSaveEvent).toHaveBeenCalledTimes(1))
    expect(onSaveEvent.mock.calls[0][0].paymentChannelOverrides).toEqual({
      registration: { bank_transfer: 'open' },
    })
  })

  it('un alta que no toca la matriz hereda la plataforma', async () => {
    const { onSaveEvent } = renderEvents()
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo evento' }))
    fillRequired()
    toLastStep()

    fireEvent.click(screen.getByRole('button', { name: /Crear evento/ }))

    await waitFor(() => expect(onSaveEvent).toHaveBeenCalledTimes(1))
    expect(onSaveEvent.mock.calls[0][0].paymentChannelOverrides ?? null).toBeNull()
  })

  it('duplicar copia los medios de cobro del original', async () => {
    const source = {
      ...HIDDEN_B,
      paymentChannelOverrides: { registration: { bank_transfer: 'open' } },
      bankTransferProfileId: '7d9f0c9e-3a2b-4c1d-8e5f-0a1b2c3d4e5f',
    }
    renderEvents({}, { events: [PUBLISHED, source] })

    fireEvent.click(screen.getByRole('button', { name: 'Duplicar Copa Invierno' }))
    // Los medios de cobro están en el paso Venta; para llegar, las fechas (que
    // no se copian) tienen que estar.
    fillRequired({ title: 'Copa Invierno 2' })
    nextStep()

    // El perfil llega con la lectura del catálogo: recién ahí el select puede
    // mostrar la opción elegida.
    await waitFor(() =>
      expect(document.getElementById('quick-event-bank-profile').value).toBe(
        '7d9f0c9e-3a2b-4c1d-8e5f-0a1b2c3d4e5f',
      ),
    )
  })

  it('publicar en lote avisa de un evento sin ningún medio de inscripción', async () => {
    const noChannel = {
      ...HIDDEN_A,
      paymentChannelOverrides: { registration: { mercado_pago: false } },
    }
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onSetEventState } = renderEvents({}, { events: [PUBLISHED, noChannel, HIDDEN_B] })
    // La matriz de plataforma tiene que estar leída para que el aviso sea fiable.
    await waitFor(() => expect(document.querySelectorAll('.admin-event-row__pay').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'Revisar y publicar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar 2' }))

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatch(/Copa Otoño/)
    expect(confirm.mock.calls[0][0]).toMatch(/ningún medio de pago abierto/)
    expect(confirm.mock.calls[0][0]).not.toMatch(/Copa Invierno/)
    // Es un aviso, no un bloqueo: si se rechaza, no se publica nada.
    expect(onSetEventState).not.toHaveBeenCalled()
  })

  it('si se acepta el aviso, publica igual', async () => {
    const noChannel = {
      ...HIDDEN_A,
      paymentChannelOverrides: { registration: { mercado_pago: false } },
    }
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onSetEventState } = renderEvents({}, { events: [PUBLISHED, noChannel, HIDDEN_B] })
    await waitFor(() => expect(document.querySelectorAll('.admin-event-row__pay').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'Revisar y publicar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publicar 2' }))

    await waitFor(() => expect(onSetEventState).toHaveBeenCalledTimes(2))
  })
})
