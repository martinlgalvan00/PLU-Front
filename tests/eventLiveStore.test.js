import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Capa que sincroniza los datos live del evento entre la landing, el dossier
 * de Pitbull y las pantallas de entradas. Lo que se verifica acá es el
 * contrato que hace que el contador de inscriptos y el aviso de cupo no
 * queden viejos ni se pidan de más:
 *  - un solo request por clave aunque haya varios lectores,
 *  - TTL para no repreguntar en cada montaje,
 *  - invalidación después de inscribirse o comprar,
 *  - el último dato bueno sobrevive a un error de red.
 */

const registrationFetch = vi.fn()
const availabilityFetch = vi.fn()

vi.mock('../src/services/eventRegistrationApi.js', () => ({
  fetchEventRegistrationSummary: (slug) => registrationFetch(slug),
}))

vi.mock('../src/services/ticketApi.js', () => ({
  fetchTicketAvailability: (slug) => availabilityFetch(slug),
}))

let store

beforeEach(async () => {
  vi.resetModules()
  registrationFetch.mockReset()
  availabilityFetch.mockReset()
  vi.useFakeTimers()
  store = await import('../src/services/eventLiveStore.js')
})

afterEach(() => {
  vi.useRealTimers()
})

const summary = (registered) => ({
  capacity: 80,
  registered,
  remaining: 80 - registered,
  recent: [],
})

describe('registrationSummaryStore', () => {
  it('comparte un solo request entre lectores simultáneos del mismo evento', async () => {
    registrationFetch.mockResolvedValue(summary(12))

    const [a, b, c] = await Promise.all([
      store.registrationSummaryStore.load('pitbull-classic-2026'),
      store.registrationSummaryStore.load('pitbull-classic-2026'),
      store.registrationSummaryStore.load('pitbull-classic-2026'),
    ])

    expect(registrationFetch).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a.registered).toBe(12)
  })

  it('no repregunta mientras el dato está fresco y sí cuando vence el TTL', async () => {
    registrationFetch.mockResolvedValue(summary(12))
    await store.registrationSummaryStore.load('pitbull-classic-2026')

    vi.setSystemTime(Date.now() + 5_000)
    await store.registrationSummaryStore.load('pitbull-classic-2026')
    expect(registrationFetch).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 20_000)
    await store.registrationSummaryStore.load('pitbull-classic-2026')
    expect(registrationFetch).toHaveBeenCalledTimes(2)
  })

  it('mantiene separados los eventos distintos', async () => {
    registrationFetch.mockImplementation((slug) =>
      Promise.resolve(summary(slug === 'pitbull-classic-2026' ? 12 : 3)),
    )

    await store.registrationSummaryStore.load('pitbull-classic-2026')
    await store.registrationSummaryStore.load('otro-evento')

    expect(registrationFetch).toHaveBeenCalledTimes(2)
    expect(store.registrationSummaryStore.read('pitbull-classic-2026').data.registered).toBe(12)
    expect(store.registrationSummaryStore.read('otro-evento').data.registered).toBe(3)
  })

  it('al invalidar tras una inscripción avisa a los suscriptores con el número nuevo', async () => {
    registrationFetch.mockResolvedValueOnce(summary(12)).mockResolvedValueOnce(summary(13))

    const seen = []
    const unsubscribe = store.registrationSummaryStore.subscribe('pitbull-classic-2026', (snap) => {
      if (snap.data) seen.push(snap.data.registered)
    })
    await store.registrationSummaryStore.load('pitbull-classic-2026')

    store.invalidateEventRegistrationSummary('pitbull-classic-2026')
    // Se espera el valor emitido, no la llamada: el mock queda "llamado" antes
    // de que resuelva la promesa y el suscriptor recién ve el dato al resolver.
    await vi.waitFor(() => expect(seen.at(-1)).toBe(13))

    expect(registrationFetch).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('sin suscriptores la invalidación no dispara red, pero el próximo lector trae dato nuevo', async () => {
    registrationFetch.mockResolvedValueOnce(summary(12)).mockResolvedValueOnce(summary(20))
    await store.registrationSummaryStore.load('pitbull-classic-2026')

    store.invalidateEventRegistrationSummary('pitbull-classic-2026')
    expect(registrationFetch).toHaveBeenCalledTimes(1)

    const next = await store.registrationSummaryStore.load('pitbull-classic-2026')
    expect(registrationFetch).toHaveBeenCalledTimes(2)
    expect(next.registered).toBe(20)
  })

  it('un error de red no borra el último cupo conocido', async () => {
    registrationFetch
      .mockResolvedValueOnce(summary(12))
      .mockRejectedValueOnce(new Error('sin red'))

    await store.registrationSummaryStore.load('pitbull-classic-2026')
    await expect(
      store.registrationSummaryStore.load('pitbull-classic-2026', { force: true }),
    ).rejects.toThrow('sin red')

    const snapshot = store.registrationSummaryStore.read('pitbull-classic-2026')
    expect(snapshot.data.registered).toBe(12)
    expect(snapshot.failed).toBe(true)
  })
})

describe('ticketAvailabilityStore', () => {
  const availability = (remaining) => ({
    event: { limit: 80, remaining },
    ticketTypes: [{ ticketTypeId: 'general', limit: 8, remaining: 8 }],
  })

  it('la lista de tienda, su drawer y la página de entradas comparten un request', async () => {
    availabilityFetch.mockResolvedValue(availability(57))

    await Promise.all([
      store.ticketAvailabilityStore.load('pitbull-classic-2026'),
      store.ticketAvailabilityStore.load('pitbull-classic-2026'),
      store.ticketAvailabilityStore.load('pitbull-classic-2026'),
      store.ticketAvailabilityStore.load('pitbull-classic-2026'),
    ])

    expect(availabilityFetch).toHaveBeenCalledTimes(1)
  })

  it('después de una compra el remaining se vuelve a pedir', async () => {
    availabilityFetch
      .mockResolvedValueOnce(availability(57))
      .mockResolvedValueOnce(availability(55))

    const seen = []
    const unsubscribe = store.ticketAvailabilityStore.subscribe('pitbull-classic-2026', (snap) => {
      if (snap.data) seen.push(snap.data.event.remaining)
    })
    await store.ticketAvailabilityStore.load('pitbull-classic-2026')

    store.invalidateTicketAvailability('pitbull-classic-2026')
    await vi.waitFor(() => expect(seen.at(-1)).toBe(55))

    expect(availabilityFetch).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('un cambio de estado de pago vence las dos caches a la vez', async () => {
    registrationFetch.mockResolvedValue(summary(12))
    availabilityFetch.mockResolvedValue(availability(57))
    await store.registrationSummaryStore.load('pitbull-classic-2026')
    await store.ticketAvailabilityStore.load('pitbull-classic-2026')
    expect(registrationFetch).toHaveBeenCalledTimes(1)
    expect(availabilityFetch).toHaveBeenCalledTimes(1)

    store.invalidateEventLiveData()

    await store.registrationSummaryStore.load('pitbull-classic-2026')
    await store.ticketAvailabilityStore.load('pitbull-classic-2026')
    expect(registrationFetch).toHaveBeenCalledTimes(2)
    expect(availabilityFetch).toHaveBeenCalledTimes(2)
  })
})
