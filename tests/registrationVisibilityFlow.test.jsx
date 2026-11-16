import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import UpcomingEventsSection from '../src/pages/profile/UpcomingEventsSection.jsx'
import { mapAthleteData } from '../src/services/athleteApi.js'
import {
  findAthleteEventRegistration,
  resolveAthleteEventStatus,
} from '../src/lib/athleteEventStatus.js'

/**
 * El mismo atleta tiene que verse igual en todas las pantallas. Estos casos
 * cubren los cuatro desfasajes que había entre el perfil y el resto del sitio:
 * match por título, canceladas contadas como vigentes, pendientes de pago
 * anunciadas como confirmadas y el derecho tapado por el estado del meet.
 */

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
})

afterEach(cleanup)

const EVENT_ROW = {
  id: 'ev1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  status: 'inscripcion_abierta',
  published: true,
  requires_membership: false,
}

const CATALOG_EVENT = {
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  status: 'inscripcion_abierta',
  dateISO: '2026-12-12',
  date: '12 DIC',
  venue: 'Club',
  location: 'CABA',
  requiresMembership: false,
  price: 60000,
}

const CREDENTIAL_TOKEN = '11111111-1111-4111-8111-111111111111'

const ATHLETE = {
  id: 'a1',
  fullName: 'Mateo Barbieri',
  phone: '1122334455',
  city: 'CABA',
  province: 'Buenos Aires',
  gym: 'PLU',
  credentialToken: CREDENTIAL_TOKEN,
}

/** Inscripciones tal como salen de `get_athlete_snapshot`, no a mano. */
function snapshotRegistrations(statuses) {
  return mapAthleteData({
    athlete: { id: 'a1', full_name: 'Mateo Barbieri', email: 'm@plu.ar' },
    memberships: [],
    registrations: statuses.map((status, index) => ({
      registration: {
        id: `r${index}`,
        athlete_id: 'a1',
        status,
        division: 'RAW',
        category: 'Open',
        payment_order_id: `o${index}`,
      },
      event: EVENT_ROW,
      checkIn: null,
      schedule: null,
    })),
    paymentOrders: [],
  }).registrations
}

function renderAccountEvents(statuses, event = CATALOG_EVENT, extras = {}) {
  return render(
    <I18nProvider>
      <UpcomingEventsSection
        availableEvents={[event]}
        athleteRegistrations={snapshotRegistrations(statuses)}
        membership={extras.membership ?? null}
        athlete={extras.athlete ?? ATHLETE}
        onNavigate={() => {}}
        onSelectEvent={() => {}}
        latestMembership={extras.latestMembership ?? null}
        onNavigateSection={extras.onNavigateSection}
        onViewCredential={extras.onViewCredential}
      />
    </I18nProvider>,
  )
}

describe('cuenta · Próximos torneos', () => {
  it('aunque ya esté afiliado, el aviso de documentos abre Afiliación', () => {
    const onNavigateSection = vi.fn()
    renderAccountEvents([], CATALOG_EVENT, {
      onNavigateSection,
      membership: {
        athleteId: 'a1',
        status: 'activa',
        startDate: '2026-01-01',
        expirationDate: '2027-06-01',
      },
      athlete: {
        ...ATHLETE,
        birthDate: '1994-04-12',
        category: 'Open',
        estimatedWeight: 83,
        documents: [],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Inscribirme' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subir documentos' }))

    expect(onNavigateSection).toHaveBeenCalledWith('account-membership')
    expect(onNavigateSection).not.toHaveBeenCalledWith('account-personal-data')
  })

  it('muestra la inscripción confirmada y no ofrece inscribirse de nuevo', () => {
    renderAccountEvents(['confirmada'])

    expect(screen.getByText('Inscripción confirmada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver credencial de Pitbull Classic' }).disabled).toBe(
      false,
    )
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).toBeNull()
  })

  it('abre la credencial de ese torneo', () => {
    const onViewCredential = vi.fn()
    renderAccountEvents(['confirmada'], CATALOG_EVENT, { onViewCredential })

    fireEvent.click(screen.getByRole('button', { name: 'Ver credencial de Pitbull Classic' }))

    expect(onViewCredential).toHaveBeenCalledTimes(1)
    expect(onViewCredential.mock.calls[0][0].slug).toBe(CATALOG_EVENT.slug)
  })

  it('sigue abriendo Mi QR si la página todavía no pasa el foco del torneo', () => {
    const onNavigateSection = vi.fn()
    renderAccountEvents(['confirmada'], CATALOG_EVENT, { onNavigateSection })

    fireEvent.click(screen.getByRole('button', { name: 'Ver credencial de Pitbull Classic' }))

    expect(onNavigateSection).toHaveBeenCalledWith('account-qr')
  })

  it('no abre una credencial vacía si la persona no tiene código', () => {
    renderAccountEvents(['confirmada'], CATALOG_EVENT, {
      athlete: { ...ATHLETE, credentialToken: null },
    })

    expect(screen.queryByRole('button', { name: /Ver credencial/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ya sos parte de Pitbull Classic' }).disabled).toBe(
      true,
    )
  })

  it('abre la credencial si el código vive en la última afiliación', () => {
    const onViewCredential = vi.fn()
    renderAccountEvents(['confirmada'], CATALOG_EVENT, {
      athlete: { ...ATHLETE, credentialToken: null },
      latestMembership: { memberCode: 'PLU-1', status: 'vencida', expirationDate: '2020-01-01' },
      onViewCredential,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Ver credencial de Pitbull Classic' }))

    expect(onViewCredential).toHaveBeenCalledTimes(1)
  })

  it('sigue reconociendo la inscripción después de que el staff renombra el meet', () => {
    // El slug es el mismo; solo cambió el título. Antes esta fila volvía a
    // decir "Inscripción abierta / Inscribirme" con el cupo ya pago.
    renderAccountEvents(['confirmada'], { ...CATALOG_EVENT, title: 'Pitbull Classic 2026' })

    expect(screen.getByText('Inscripción confirmada')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Ver credencial de Pitbull Classic 2026' }).disabled,
    ).toBe(false)
    expect(screen.queryByRole('button', { name: 'Inscribirme' })).toBeNull()
  })

  it('no anuncia como confirmada una inscripción sin pago acreditado', () => {
    renderAccountEvents(['pendiente_pago'])

    expect(screen.queryByText('Inscripción confirmada')).toBeNull()
    expect(screen.getByText('Pago pendiente')).toBeTruthy()
    // El botón queda habilitado: es la única salida para cerrar el pago.
    expect(screen.getByRole('button', { name: 'Continuar pago' }).disabled).toBe(false)
    // Y el arrepentimiento de medio queda a un toque, sin ir a Pagos primero.
    expect(screen.getByRole('button', { name: 'Elegir otro medio' })).toBeTruthy()
  })

  it('deja volver a inscribirse a quien canceló', () => {
    renderAccountEvents(['cancelada'])

    expect(screen.queryByText('Inscripción confirmada')).toBeNull()
    expect(screen.getByRole('button', { name: 'Inscribirme' }).disabled).toBe(false)
  })

  it('prioriza la confirmada cuando hay una cancelada previa del mismo meet', () => {
    renderAccountEvents(['cancelada', 'confirmada'])

    expect(screen.getByText('Inscripción confirmada')).toBeTruthy()
  })
})

describe('resolveAthleteEventStatus', () => {
  const session = { role: 'athlete_plu', athleteId: 'a1' }
  const event = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic', status: 'inscripcion_abierta' }

  it('conserva el estado del inscripto cuando el meet se agota o cierra', () => {
    for (const status of ['agotado', 'cerrado']) {
      expect(
        resolveAthleteEventStatus({
          event: { ...event, status },
          session,
          registrations: [
            { athleteId: 'a1', eventSlug: 'pitbull-classic-2026', status: 'confirmada' },
          ],
        }),
      ).toBe('registered')
    }
  })

  it('sigue informando cerrado a quien no está inscripto', () => {
    expect(
      resolveAthleteEventStatus({ event: { ...event, status: 'cerrado' }, session })
    ).toBe('closed')
  })

  it('ignora las canceladas y rechazadas', () => {
    expect(
      resolveAthleteEventStatus({
        event,
        session,
        registrations: [
          { athleteId: 'a1', eventSlug: 'pitbull-classic-2026', status: 'cancelada' },
          { athleteId: 'a1', eventSlug: 'pitbull-classic-2026', status: 'rechazado' },
        ],
      }),
    ).toBe('can_register')
  })

  it('no cruza inscripciones de otro atleta ni de otro meet', () => {
    expect(
      findAthleteEventRegistration(
        [
          { athleteId: 'a2', eventSlug: 'pitbull-classic-2026', status: 'confirmada' },
          { athleteId: 'a1', eventSlug: 'otro-meet-2026', status: 'confirmada' },
        ],
        { athleteId: 'a1', event },
      ),
    ).toBeNull()
  })

  it('matchea por título solo si la fila vieja no tiene slug', () => {
    expect(
      findAthleteEventRegistration(
        [{ athleteId: 'a1', event: 'Pitbull Classic', status: 'confirmada' }],
        { athleteId: 'a1', event },
      ),
    ).not.toBeNull()
    // Con slug propio distinto, el título homónimo no alcanza.
    expect(
      findAthleteEventRegistration(
        [
          {
            athleteId: 'a1',
            eventSlug: 'pitbull-classic-2025',
            event: 'Pitbull Classic',
            status: 'confirmada',
          },
        ],
        { athleteId: 'a1', event },
      ),
    ).toBeNull()
  })
})
