import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import HelpLayer from '../src/components/ui/HelpLayer.jsx'
import HelpPanel from '../src/components/ui/HelpPanel.jsx'
import StickyMobileCta from '../src/components/ui/StickyMobileCta.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { HelpProvider } from '../src/providers/HelpProvider.jsx'
import { AssistProvider } from '../src/providers/AssistProvider.jsx'
import { isJourneyActionRedundant, resolveAthleteJourney } from '../src/lib/athleteJourney.js'
import { getPublicTour, hasPublicTour } from '../src/lib/publicTourSteps.js'
import { hasSeenHomeGuide } from '../src/lib/homeGuideStorage.js'
import { ASSIST_STORAGE_KEY } from '../src/lib/assistMode.js'

const STORAGE_KEY = 'plu-home-guide-seen'
const NOW = new Date('2026-08-20T12:00:00')

const EVENT = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  status: 'inscripcion_abierta',
  requiresMembership: true,
}

const ATHLETE_SESSION = { role: 'athlete_plu', athleteId: 'ath-1' }
const CURRENT_MEMBERSHIP = {
  athleteId: 'ath-1',
  status: 'activa',
  startDate: '2026-01-01',
  expirationDate: '2026-12-31',
}
const PAID_REGISTRATION = { athleteId: 'ath-1', eventSlug: EVENT.slug, status: 'pagada' }

vi.mock('../src/services/eventRegistrationApi.js', () => ({
  fetchEventRegistrationSummary: () =>
    Promise.resolve({ capacity: 80, registered: 0, remaining: 80, recent: [] }),
}))

const HomePage = (await import('../src/pages/HomePage.jsx')).default

beforeAll(() => {
  window.matchMedia = (query) => ({
    matches: String(query).includes('max-width: 640px'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

beforeEach(() => {
  window.localStorage.removeItem(STORAGE_KEY)
  window.localStorage.removeItem(ASSIST_STORAGE_KEY)
  document.documentElement.removeAttribute('data-assist')
})

afterEach(cleanup)

/** Geometría en la que la barra fija de la portada se considera visible. */
function scrolledIntoStickyRange() {
  Object.defineProperty(window, 'scrollY', { value: 600, writable: true, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: 3000,
    writable: true,
    configurable: true,
  })
}

function renderPanel(journey, overrides = {}) {
  const props = {
    journey,
    onClose: () => {},
    onNavigate: () => {},
    onRunNext: () => {},
    onStartTour: null,
    ...overrides,
  }
  render(
    <I18nProvider>
      <AssistProvider>
        <HelpPanel {...props} />
      </AssistProvider>
    </I18nProvider>,
  )
  return props
}

function renderLayer(props = {}) {
  render(
    <I18nProvider>
      <AssistProvider>
        <HelpProvider>
          <HelpLayer
            view="home"
            event={EVENT}
            onNavigate={() => {}}
            onSelectEvent={() => {}}
            {...props}
          />
        </HelpProvider>
      </AssistProvider>
    </I18nProvider>,
  )
}

describe('resolveAthleteJourney', () => {
  it('para alguien sin sesión, el primer paso es crear la cuenta y los otros dos quedan bloqueados', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })

    expect(journey.steps.map((step) => step.state)).toEqual(['todo', 'blocked', 'blocked'])
    expect(journey.next).toMatchObject({ step: 'account', view: 'register', actionKey: 'account' })
    expect(journey.complete).toBe(false)
  })

  it('con cuenta pero sin afiliación, empuja la afiliación y explica que la inscripción depende de ella', () => {
    const journey = resolveAthleteJourney({
      session: ATHLETE_SESSION,
      memberships: [],
      event: EVENT,
      now: NOW,
    })

    expect(journey.steps.map((step) => step.state)).toEqual(['done', 'todo', 'blocked'])
    expect(journey.next).toMatchObject({ step: 'membership', view: 'membership' })
  })

  it('con afiliación vigente, el próximo paso es la inscripción y expone la fecha de vencimiento', () => {
    const journey = resolveAthleteJourney({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      event: EVENT,
      now: NOW,
    })

    expect(journey.steps.map((step) => step.state)).toEqual(['done', 'done', 'todo'])
    expect(journey.next).toMatchObject({ step: 'registration', intent: 'event' })
    expect(journey.membershipExpiresAt).toBe('2026-12-31')
  })

  it('con la inscripción pagada, el trámite queda completo y la acción pasa a la credencial', () => {
    const journey = resolveAthleteJourney({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      registrations: [PAID_REGISTRATION],
      event: EVENT,
      now: NOW,
    })

    expect(journey.complete).toBe(true)
    expect(journey.next).toMatchObject({ step: null, actionKey: 'credential' })
  })

  it('sin evento con inscripción abierta no inventa un tercer paso accionable', () => {
    const journey = resolveAthleteJourney({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      event: null,
      now: NOW,
    })

    expect(journey.steps[2].state).toBe('unavailable')
    expect(journey.next.step).toBeNull()
  })
})

describe('isJourneyActionRedundant', () => {
  it('detecta el botón que no cambiaría nada en el alta de cuenta', () => {
    const next = { step: 'account', intent: 'view', view: 'register' }
    expect(isJourneyActionRedundant(next, 'register')).toBe(true)
    expect(isJourneyActionRedundant(next, 'members')).toBe(false)
  })

  it('la afiliación y la credencial siguen siendo accionables desde la cuenta', () => {
    expect(isJourneyActionRedundant({ intent: 'view', view: 'membership' }, 'profile')).toBe(false)
    expect(
      isJourneyActionRedundant(
        { intent: 'view', view: 'profile', options: { tab: 'account-qr' } },
        'profile',
      ),
    ).toBe(false)
  })

  it('la inscripción es redundante sólo dentro del propio checkout', () => {
    expect(isJourneyActionRedundant({ intent: 'event' }, 'competition')).toBe(true)
    expect(isJourneyActionRedundant({ intent: 'event' }, 'pitbull')).toBe(false)
  })
})

describe('HelpPanel', () => {
  it('muestra los tres pasos con su estado escrito, no sólo en color', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey)

    expect(screen.getByRole('dialog', { name: /qué tengo que hacer/i })).toBeTruthy()
    expect(screen.getByText('Crear tu cuenta')).toBeTruthy()
    expect(screen.getByText('Afiliarte a PLU')).toBeTruthy()
    expect(screen.getByText('Inscribirte a Pitbull Classic')).toBeTruthy()
    expect(screen.getByText('Te toca ahora')).toBeTruthy()
    expect(screen.getAllByText('Todavía no')).toHaveLength(2)
  })

  it('dice POR QUÉ un paso está bloqueado, sin repetir la misma razón', () => {
    const journey = resolveAthleteJourney({
      session: ATHLETE_SESSION,
      memberships: [],
      event: EVENT,
      now: NOW,
    })
    renderPanel(journey)

    expect(screen.getByText('Antes necesitás la afiliación del paso 2.')).toBeTruthy()
  })

  it('ofrece una sola acción y delega su ejecución en la capa', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    const onRunNext = vi.fn()
    const onClose = vi.fn()
    renderPanel(journey, { onRunNext, onClose })

    fireEvent.click(screen.getByRole('button', { name: /crear mi cuenta/i }))

    expect(onRunNext).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('nombra el recorrido por lo que hace: presentación o tutorial campo por campo', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey, { onStartTour: () => {}, tourMode: 'modal' })
    expect(screen.getByRole('button', { name: /guiame en esta pantalla/i })).toBeTruthy()

    cleanup()
    renderPanel(journey, { onStartTour: () => {}, tourMode: 'coach' })
    expect(screen.getByRole('button', { name: /guiame campo por campo/i })).toBeTruthy()
  })

  it('si ya estamos en la pantalla del próximo paso, el recorrido pasa a ser la acción principal', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    const onStartTour = vi.fn()
    const onRunNext = vi.fn()
    renderPanel(journey, { atDestination: true, tourMode: 'coach', onStartTour, onRunNext })

    expect(screen.getByText('Estás en el paso que te toca')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /crear mi cuenta/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /guiame campo por campo/i }))
    expect(onStartTour).toHaveBeenCalledTimes(1)
    expect(onRunNext).not.toHaveBeenCalled()
  })

  it('sin recorrido en esa pantalla, la navegación sigue siendo la acción principal', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey, { atDestination: true, onStartTour: null })

    expect(screen.getByRole('button', { name: /crear mi cuenta/i })).toBeTruthy()
  })

  it('cuando el trámite está completo cambia el título y la acción', () => {
    const journey = resolveAthleteJourney({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      registrations: [PAID_REGISTRATION],
      event: EVENT,
      now: NOW,
    })
    renderPanel(journey)

    expect(screen.getByRole('dialog', { name: /ya tenés todo listo/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /ver mi credencial/i })).toBeTruthy()
  })

  it('expone el modo asistido como interruptor accesible', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey)

    const toggle = screen.getByRole('switch', { name: /modo asistido/i })
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(document.documentElement.getAttribute('data-assist')).toBe('on')
    expect(window.localStorage.getItem(ASSIST_STORAGE_KEY)).toBe('on')
  })
})

describe('HelpLayer', () => {
  it('expone un botón con la palabra Ayuda y avisa por texto que hay un paso pendiente', () => {
    renderLayer()

    const trigger = screen.getByRole('button', { name: /tenés un paso pendiente/i })
    expect(trigger.textContent).toContain('Ayuda')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('sin pasos pendientes el nombre accesible no menciona nada pendiente', () => {
    renderLayer({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      registrations: [PAID_REGISTRATION],
    })

    expect(screen.getByRole('button', { name: /^abrir la ayuda paso a paso$/i })).toBeTruthy()
  })

  it('abre y cierra el panel, y recuerda que la ayuda ya se mostró', () => {
    renderLayer()
    expect(hasSeenHomeGuide()).toBe(false)

    const trigger = screen.getByRole('button', { name: /tenés un paso pendiente/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: /qué tengo que hacer/i })).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(hasSeenHomeGuide()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /^cerrar la ayuda$/i }))
    expect(screen.queryByRole('dialog', { name: /qué tengo que hacer/i })).toBeNull()
  })

  it('la acción del panel usa selectEvent para inscribirse, el mismo camino que el CTA del meet', () => {
    const onSelectEvent = vi.fn()
    renderLayer({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      onSelectEvent,
    })

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('button', { name: /inscribirme al torneo/i }))

    expect(onSelectEvent).toHaveBeenCalledWith(EVENT)
  })

  it('en modo asistido el botón flotante se reemplaza por la barra recortada', () => {
    renderLayer()

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('switch', { name: /modo asistido/i }))

    const bar = screen.getByRole('navigation', { name: /navegación asistida/i })
    expect(bar).toBeTruthy()
    // Cuatro destinos y ni uno más: en eso consiste el recorte.
    expect(bar.querySelectorAll('.assist-nav__item')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /abrir la ayuda paso a paso/i })).toBeNull()
  })

  it('la barra asistida nombra el próximo paso real y lo ejecuta', () => {
    const onSelectEvent = vi.fn()
    renderLayer({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      onSelectEvent,
    })

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('switch', { name: /modo asistido/i }))

    fireEvent.click(screen.getByRole('button', { name: /^inscribirme$/i }))
    expect(onSelectEvent).toHaveBeenCalledWith(EVENT)
  })
})

describe('portada', () => {
  it('la barra fija queda con una sola acción: la ayuda vive en su propio botón', () => {
    render(
      <I18nProvider>
        <StickyMobileCta onNavigate={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: /afiliarme/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /cómo funciona/i })).toBeNull()
  })

  function renderHomeWithHelp() {
    render(
      <I18nProvider>
        <AssistProvider>
          <HelpProvider>
            <HomePage events={[]} onNavigate={() => {}} onSelectEvent={() => {}} />
            <HelpLayer view="home" onNavigate={() => {}} onSelectEvent={() => {}} />
          </HelpProvider>
        </AssistProvider>
      </I18nProvider>,
    )
  }

  it('en la primera visita mobile ofrece la ayuda sola, y después no insiste', () => {
    // La barra fija se muestra pasados 520px de scroll y lejos del footer: con
    // esa geometría el primer `tick()` ya la marca visible y dispara el aviso.
    scrolledIntoStickyRange()

    renderHomeWithHelp()
    expect(screen.getByRole('dialog', { name: /qué tengo que hacer/i })).toBeTruthy()

    cleanup()
    renderHomeWithHelp()
    expect(screen.queryByRole('dialog', { name: /qué tengo que hacer/i })).toBeNull()
  })
})

describe('publicTourSteps', () => {
  const t = (key) => key

  it('cubre las pantallas del trámite y no inventa recorridos', () => {
    for (const view of ['home', 'members', 'register', 'competition', 'profile', 'events']) {
      expect(hasPublicTour(view)).toBe(true)
      const tour = getPublicTour(view, t)
      expect(tour.id).toBe(`public-${view}`)
      expect(tour.steps.length).toBeGreaterThan(0)
      for (const step of tour.steps) expect(step.target).toBeTruthy()
    }

    expect(hasPublicTour('records')).toBe(false)
    expect(getPublicTour('records', t)).toBeNull()
  })

  it('el alta de cuenta es un tutorial campo por campo que cubre los dos tramos', () => {
    const tour = getPublicTour('register', t)

    expect(tour.mode).toBe('coach')
    // Siete datos personales, el botón que pasa de tramo, cuatro de ubicación y
    // el cierre: si el tutorial se recorta, la persona queda a mitad de camino.
    expect(tour.steps).toHaveLength(13)
    const targets = tour.steps.map((step) => step.target)
    for (const field of [
      'fullName',
      'country',
      'documentId',
      'birthDate',
      'email',
      'phone',
      'password',
      'province',
      'city',
      'gym',
      'sex',
    ]) {
      expect(targets).toContain(`[name="${field}"]`)
    }
    // Los pasos de campo iluminan el bloque completo (etiqueta + control + error).
    const fieldSteps = tour.steps.filter((step) => step.target.startsWith('[name='))
    expect(fieldSteps.every((step) => step.frame === '.field')).toBe(true)
  })

  it('la inscripción guía división, categoría, peso, medio de pago y cierre', () => {
    const tour = getPublicTour('competition', t)

    expect(tour.mode).toBe('coach')
    expect(tour.steps.map((step) => step.target)).toEqual([
      '[name="division"]',
      '[name="category"]',
      '[name="estimatedWeight"]',
      '.plu-checkout__methods',
      '.register-card__submit',
    ])
  })

  it('las presentaciones siguen en modo modal', () => {
    expect(getPublicTour('home', t).mode).toBe('modal')
    expect(getPublicTour('members', t).mode).toBe('modal')
  })
})
