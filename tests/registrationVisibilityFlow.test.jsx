import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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

const ATHLETE = {
  id: 'a1',
  fullName: 'Mateo Barbieri',
  phone: '1122334455',
  city: 'CABA',
  province: 'Buenos Aires',
  gym: 'PLU',
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

function renderAccountEvents(statuses, event = CATALOG_EVENT) {
  return render(
    <I18nProvider>
      <UpcomingEventsSection
        availableEvents={[event]}
        athleteRegistrations={snapshotRegistrations(statuses)}
        membership={null}
        athlete={ATHLETE}
        onNavigate={() => {}}
        onSelectEvent={() => {}}
      />
    </I18nProvider>,
  )
}

describe('cuenta · Próximos torneos', () => {
  it('muestra la inscripción confirmada y no ofrece inscribirse de nuevo', () => {
    renderAccountEvents(['confirmada'])

    expect(screen.getByText('Inscripción confirmada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ya sos parte de Pitbull Classic' }).disabled).toBe(
      true,
    )
  })

  it('sigue reconociendo la inscripción después de que el staff renombra el meet', () => {
    // El slug es el mismo; solo cambió el título. Antes esta fila volvía a
    // decir "Inscripción abierta / Inscribirme" con el cupo ya pago.
    renderAccountEvents(['confirmada'], { ...CATALOG_EVENT, title: 'Pitbull Classic 2026' })

    expect(screen.getByText('Inscripción confirmada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ya sos parte de Pitbull Classic 2026' }).disabled).toBe(
      true,
    )
  })

  it('no anuncia como confirmada una inscripción sin pago acreditado', () => {
    renderAccountEvents(['pendiente_pago'])

    expect(screen.queryByText('Inscripción confirmada')).toBeNull()
    expect(screen.getByText('Pago pendiente')).toBeTruthy()
    // El botón queda habilitado: es la única salida para cerrar el pago.
    expect(screen.getByRole('button', { name: 'Continuar pago' }).disabled).toBe(false)
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
