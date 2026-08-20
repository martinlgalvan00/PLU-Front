import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import HelpLayer from '../src/components/ui/HelpLayer.jsx'
import HelpPanel from '../src/components/ui/HelpPanel.jsx'
import StickyMobileCta from '../src/components/ui/StickyMobileCta.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { HelpProvider } from '../src/providers/HelpProvider.jsx'
import { AssistProvider } from '../src/providers/AssistProvider.jsx'
import { AdminTourProvider, useAdminTour } from '../src/providers/AdminTourProvider.jsx'
import { isJourneyActionRedundant, resolveAthleteJourney } from '../src/lib/athleteJourney.js'
import { getOrientationTour, getPublicTour, hasFieldCoach } from '../src/lib/publicTourSteps.js'
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
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-assist')
})

/** Sonda del motor de recorridos: jsdom no da layout, así que el overlay no
 *  puede enganchar ningún blanco. Lo observable es qué recorrido quedó activo. */
function ActiveTourProbe() {
  const { activeTour, stepIndex } = useAdminTour()
  if (!activeTour) return null
  return (
    <output data-testid="active-tour">{`${activeTour.id}:${activeTour.mode}:${stepIndex}`}</output>
  )
}

function renderLayerWithTours(props = {}) {
  render(
    <I18nProvider>
      <AssistProvider>
        <AdminTourProvider>
          <HelpProvider>
            <HelpLayer
              view="home"
              event={EVENT}
              onNavigate={() => {}}
              onSelectEvent={() => {}}
              {...props}
            />
            <ActiveTourProbe />
          </HelpProvider>
        </AdminTourProvider>
      </AssistProvider>
    </I18nProvider>,
  )
}

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
    onLogin: () => {},
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
    renderPanel(journey, { onStartTour: () => {}, tourKind: 'orientation' })
    expect(screen.getByRole('button', { name: /enseñame a moverme por el sitio/i })).toBeTruthy()

    cleanup()
    renderPanel(journey, { onStartTour: () => {}, tourKind: 'coach' })
    expect(screen.getByRole('button', { name: /guiame campo por campo/i })).toBeTruthy()
  })

  it('si ya estamos en la pantalla del próximo paso, el recorrido pasa a ser la acción principal', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    const onStartTour = vi.fn()
    const onRunNext = vi.fn()
    renderPanel(journey, { atDestination: true, tourKind: 'coach', onStartTour, onRunNext })

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

  it('dice en qué pantalla estás', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey, { view: 'register' })

    expect(screen.getByText(/estás en/i)).toBeTruthy()
    expect(screen.getByText('Crear tu cuenta', { selector: 'strong' })).toBeTruthy()
  })

  it('no inventa un nombre para las pantallas que no sabe nombrar', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey, { view: 'records' })

    expect(screen.queryByText(/estás en/i)).toBeNull()
  })

  it('ofrece entrar con una cuenta existente, no sólo crear una nueva', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    const onLogin = vi.fn()
    const onClose = vi.fn()
    renderPanel(journey, { onLogin, onClose })

    fireEvent.click(screen.getByRole('button', { name: /entrar con mi correo/i }))
    expect(onLogin).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('con cuenta ya creada no ofrece la puerta de entrada', () => {
    const journey = resolveAthleteJourney({
      session: ATHLETE_SESSION,
      memberships: [],
      event: EVENT,
      now: NOW,
    })
    renderPanel(journey, { onLogin: () => {} })

    expect(screen.queryByRole('button', { name: /entrar con mi correo/i })).toBeNull()
  })

  it('un tutorial a medias se ofrece como retomar, diciendo por dónde iba', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey, {
      view: 'register',
      tourKind: 'coach',
      onStartTour: () => {},
      resume: { step: 4, total: 13 },
    })

    expect(screen.getByRole('button', { name: /seguir donde lo dejaste/i })).toBeTruthy()
    expect(screen.getByText('Ibas por el paso 5 de 13.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /guiame campo por campo/i })).toBeNull()
  })

  it('expone el modo simple como interruptor accesible', () => {
    const journey = resolveAthleteJourney({ session: null, event: EVENT, now: NOW })
    renderPanel(journey)

    const toggle = screen.getByRole('switch', { name: /modo simple/i })
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

  it('en modo simple el botón flotante se reemplaza por la barra recortada', () => {
    renderLayer()

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('switch', { name: /modo simple/i }))

    const bar = screen.getByRole('navigation', { name: /navegación simple/i })
    expect(bar).toBeTruthy()
    // Cuatro destinos y ni uno más: en eso consiste el recorte.
    expect(bar.querySelectorAll('.assist-nav__item')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /abrir la ayuda paso a paso/i })).toBeNull()
  })

  it('la barra simple nombra el próximo paso real y lo ejecuta', () => {
    const onSelectEvent = vi.fn()
    renderLayer({
      session: ATHLETE_SESSION,
      memberships: [CURRENT_MEMBERSHIP],
      onSelectEvent,
    })

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('switch', { name: /modo simple/i }))

    fireEvent.click(screen.getByRole('button', { name: /^inscribirme$/i }))
    expect(onSelectEvent).toHaveBeenCalledWith(EVENT)
  })
})

describe('HelpLayer + motor de recorridos', () => {
  it('al activar el modo simple arranca sola la orientación de la barra nueva', () => {
    renderLayerWithTours()

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('switch', { name: /modo simple/i }))

    // El panel se cierra para dejar ver la barra que el recorrido va a explicar.
    expect(screen.queryByRole('dialog', { name: /qué tengo que hacer/i })).toBeNull()
    expect(screen.getByTestId('active-tour').textContent).toBe('public-orientation-simple:modal:0')
  })

  it('no vuelve a insistir con esa orientación una vez vista', () => {
    renderLayerWithTours()
    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('switch', { name: /modo simple/i }))
    expect(screen.getByTestId('active-tour')).toBeTruthy()

    cleanup()
    // Apagar y volver a encender: el recorrido ya fue visto.
    window.localStorage.removeItem(ASSIST_STORAGE_KEY)
    renderLayerWithTours()
    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('switch', { name: /modo simple/i }))
    expect(screen.queryByTestId('active-tour')).toBeNull()
  })

  it('el tutorial arranca en el paso guardado cuando quedó a medias', () => {
    window.localStorage.setItem('plu-tour-progress:public-register', '4')
    renderLayerWithTours({ view: 'register' })

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('button', { name: /seguir donde lo dejaste/i }))

    expect(screen.getByTestId('active-tour').textContent).toBe('public-register:coach:4')
  })

  it('sin progreso guardado el tutorial arranca del principio', () => {
    renderLayerWithTours({ view: 'register' })

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    fireEvent.click(screen.getByRole('button', { name: /guiame campo por campo/i }))

    expect(screen.getByTestId('active-tour').textContent).toBe('public-register:coach:0')
  })

  it('un progreso que ya no existe en el recorrido se ignora', () => {
    // El recorrido de login tiene cinco pasos: un progreso en el 9 es de una
    // versión anterior y mandaría a alguien a un paso que no existe.
    window.localStorage.setItem('plu-tour-progress:public-login', '9')
    renderLayerWithTours({ view: 'login' })

    fireEvent.click(screen.getByRole('button', { name: /abrir la ayuda/i }))
    expect(screen.queryByRole('button', { name: /seguir donde lo dejaste/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /guiame campo por campo/i }))
    expect(screen.getByTestId('active-tour').textContent).toBe('public-login:coach:0')
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

  it('las tres pantallas con formulario se guían campo por campo', () => {
    for (const view of ['login', 'register', 'competition']) {
      expect(hasFieldCoach(view)).toBe(true)
      const tour = getPublicTour(view, t)
      expect(tour.id).toBe(`public-${view}`)
      expect(tour.mode).toBe('coach')
      expect(tour.kind).toBe('coach')
    }
  })

  it('entrar con una cuenta que ya existe tiene su propio tutorial', () => {
    const tour = getPublicTour('login', t)

    expect(tour.steps.map((step) => step.target)).toEqual([
      '[name="email"]',
      '[name="password"]',
      '.login-field__forgot',
      '.login-submit',
      '.login-join__link',
    ])
    // Los dos campos iluminan su bloque completo (etiqueta + control + error).
    expect(tour.steps[0].frame).toBe('.login-field')
    expect(tour.steps[1].frame).toBe('.login-field')
  })

  it('el alta de cuenta cubre los dos tramos del formulario', () => {
    const tour = getPublicTour('register', t)

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
    const fieldSteps = tour.steps.filter((step) => step.target.startsWith('[name='))
    expect(fieldSteps.every((step) => step.frame === '.field')).toBe(true)
  })

  it('la inscripción guía división, categoría, peso, medio de pago y cierre', () => {
    expect(getPublicTour('competition', t).steps.map((step) => step.target)).toEqual([
      '[name="division"]',
      '[name="category"]',
      '[name="estimatedWeight"]',
      '.plu-checkout__methods',
      '.register-card__submit',
    ])
  })

  it('las pantallas sin formulario enseñan a moverse por el sitio', () => {
    const tour = getPublicTour('members', t)

    expect(hasFieldCoach('members')).toBe(false)
    expect(tour.kind).toBe('orientation')
    expect(tour.mode).toBe('modal')
    expect(tour.id).toBe('public-orientation')
    const targets = tour.steps.map((step) => step.target)
    // El recorrido explica la navegación y recién después aterriza en la
    // acción de esta pantalla y en el pie.
    expect(targets[0]).toContain('plu-global-nav__brand')
    expect(targets).toContain('.members-plu-hero__cta-row')
    expect(targets).toContain('.site-footer')
  })

  it('cada pantalla aterriza en su propia acción', () => {
    const actionByView = {
      home: '.hero__cta--primary',
      members: '.members-plu-hero__cta-row',
      events: '.events-detail__actions',
      pitbull: '.pitbull-inscription__cta--primary',
      profile: '.account-nav',
    }
    for (const [view, target] of Object.entries(actionByView)) {
      expect(getPublicTour(view, t).steps.map((step) => step.target)).toContain(target)
    }
  })

  it('la orientación existe para cualquier pantalla, aunque no tenga acción propia', () => {
    const tour = getPublicTour('records', t)

    expect(tour.kind).toBe('orientation')
    expect(tour.steps.length).toBeGreaterThan(0)
  })

  it('el pie no se señala donde App no lo monta', () => {
    // `login` y `register` se sirven sin footer: un paso apuntándolo no tendría
    // blanco y quedaría como un salto sin explicación.
    for (const view of ['login', 'register']) {
      const tour = getOrientationTour(t, { view })
      expect(tour.steps.map((step) => step.target)).not.toContain('.site-footer')
    }
    expect(getOrientationTour(t, { view: 'home' }).steps.map((step) => step.target)).toContain(
      '.site-footer',
    )
  })

  it('en modo simple la orientación explica la barra de cuatro botones', () => {
    const tour = getOrientationTour(t, { assist: true, view: 'home' })

    expect(tour.id).toBe('public-orientation-simple')
    const targets = tour.steps.map((step) => step.target)
    expect(targets.slice(0, 4)).toEqual([
      '[data-tour~="assist-nav-home"]',
      '[data-tour~="assist-nav-action"]',
      '[data-tour~="assist-nav-account"]',
      '[data-tour~="assist-nav-help"]',
    ])
    // No explica el navbar completo: en modo simple la persona no lo está viendo.
    expect(targets.some((target) => target.includes('plu-global-nav'))).toBe(false)
  })

  it('el blanco de la ayuda usa coincidencia por palabra', () => {
    // La barra simple lleva dos valores en el mismo `data-tour`; con igualdad
    // exacta el paso no encontraría su blanco.
    const targets = getOrientationTour(t, { view: 'home' }).steps.map((step) => step.target)
    expect(targets).toContain('[data-tour~="help-dock"]')
  })
})
