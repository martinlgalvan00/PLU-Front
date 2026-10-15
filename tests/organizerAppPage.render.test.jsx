import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import OrganizerAppPage from '../src/pages/OrganizerAppPage.jsx'
import { ThemeProvider } from '../src/providers/ThemeProvider.jsx'

const pushAdminEventRoute = vi.hoisted(() => vi.fn())
const clearAdminEventRoute = vi.hoisted(() => vi.fn())

vi.mock('../src/lib/adminEventRoute.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    pushAdminEventRoute,
    clearAdminEventRoute,
  }
})

vi.mock('../src/pages/admin/EventsSection.jsx', () => ({
  default: function EventsSectionStub({
    adminEventWorkspaceSlug,
    canSetRegistrationStatus,
    onSetRegistrationStatus,
    registrations,
    showRegistrations,
  }) {
    return (
      <div
        data-testid="events-workspace"
        data-show-registrations={String(showRegistrations)}
        data-regs={String(registrations?.length ?? 0)}
        data-can-set-status={String(Boolean(canSetRegistrationStatus && onSetRegistrationStatus))}
      >
        workspace:{adminEventWorkspaceSlug}
      </div>
    )
  },
}))

const EVENT_A = {
  id: 'evt-a',
  slug: 'torneo-a-2026',
  title: 'Torneo A',
  dateISO: '2026-08-15',
  venue: 'Maximal',
  location: 'CABA',
  status: 'inscripcion_abierta',
}

const EVENT_B = {
  id: 'evt-b',
  slug: 'torneo-b-2026',
  title: 'Torneo B',
  dateISO: '2026-09-20',
  venue: 'Club Norte',
  location: 'Rosario',
  status: 'publicado',
}

const AUTH = {
  name: 'Olga Organizadora',
  roleKey: 'organizador_evento',
  eventScoped: true,
  permissions: [
    'admin.events.read',
    'admin.events.write',
    'admin.registrations.read',
    'admin.payments.read',
    'admin.payments.approve',
    'admin.event_team.write',
  ],
  eventAccess: [{ eventId: 'evt-a', eventSlug: 'torneo-a-2026' }],
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

beforeEach(() => {
  pushAdminEventRoute.mockClear()
  clearAdminEventRoute.mockClear()
})

afterEach(() => cleanup())

function renderPage(overrides = {}) {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <OrganizerAppPage
          adminEvents={[]}
          authorization={AUTH}
          roleLabel="Organizador"
          onExit={vi.fn()}
          {...overrides}
        />
      </I18nProvider>
    </ThemeProvider>,
  )
}

describe('OrganizerAppPage', () => {
  it('0 eventos: muestra estado pendiente de autorización', () => {
    renderPage({ adminEvents: [] })
    expect(screen.getByRole('heading', { name: /todavía no tenés eventos autorizados/i })).toBeTruthy()
    expect(screen.queryByTestId('events-workspace')).toBeNull()
    expect(pushAdminEventRoute).not.toHaveBeenCalled()
  })

  it('1 evento: entra directo al workspace', async () => {
    renderPage({ adminEvents: [EVENT_A] })
    await waitFor(() => {
      expect(pushAdminEventRoute).toHaveBeenCalledWith('torneo-a-2026')
    })
  })

  it('N eventos: home con tarjetas y al elegir uno abre el workspace', () => {
    renderPage({ adminEvents: [EVENT_A, EVENT_B] })
    expect(screen.getByRole('heading', { name: /tus eventos/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /torneo a/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /torneo b/i })).toBeTruthy()
    expect(pushAdminEventRoute).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /torneo b/i }))
    expect(pushAdminEventRoute).toHaveBeenCalledWith('torneo-b-2026')
  })

  it('con slug de workspace muestra el control del evento', () => {
    renderPage({
      adminEvents: [EVENT_A, EVENT_B],
      adminEventWorkspaceSlug: 'torneo-a-2026',
    })
    expect(screen.getByTestId('events-workspace').textContent).toContain('torneo-a-2026')
    expect(screen.getByRole('button', { name: /mis eventos/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /mis eventos/i }))
    expect(clearAdminEventRoute).toHaveBeenCalled()
  })

  it('pasa el padrón de inscripciones al workspace cuando tiene permiso de lectura', () => {
    const registrations = [
      { id: 'reg-1', eventSlug: 'torneo-a-2026', event: 'Torneo A', status: 'confirmada' },
    ]
    renderPage({
      adminEvents: [EVENT_A],
      adminEventWorkspaceSlug: 'torneo-a-2026',
      registrations,
    })
    const workspace = screen.getByTestId('events-workspace')
    expect(workspace.getAttribute('data-show-registrations')).toBe('true')
    expect(workspace.getAttribute('data-regs')).toBe('1')
  })

  it('habilita corrección de estado solo con admin.registrations.write', () => {
    const onSetRegistrationStatus = vi.fn()
    renderPage({
      adminEvents: [EVENT_A],
      adminEventWorkspaceSlug: 'torneo-a-2026',
      onSetRegistrationStatus,
    })
    expect(screen.getByTestId('events-workspace').getAttribute('data-can-set-status')).toBe(
      'false',
    )

    const writeAuth = {
      ...AUTH,
      permissions: [...AUTH.permissions, 'admin.registrations.write'],
    }
    cleanup()
    renderPage({
      adminEvents: [EVENT_A],
      adminEventWorkspaceSlug: 'torneo-a-2026',
      authorization: writeAuth,
      onSetRegistrationStatus,
    })
    expect(screen.getByTestId('events-workspace').getAttribute('data-can-set-status')).toBe('true')
  })
})
