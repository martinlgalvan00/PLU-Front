import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import AdminFilterChipGroup from '../src/components/admin/AdminFilterChipGroup.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import EventsSection from '../src/pages/admin/EventsSection.jsx'
import MembershipsSection from '../src/pages/admin/MembershipsSection.jsx'
import RegistrationsSection from '../src/pages/admin/RegistrationsSection.jsx'

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      membershipValidationEnabled: true,
      registrationValidationEnabled: true,
      ticketValidationEnabled: true,
    })),
  }
})

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(cleanup)

function soonDate(days = 12) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('AdminFilterChipGroup — riel', () => {
  const OriginalObserver = globalThis.ResizeObserver

  afterEach(() => {
    globalThis.ResizeObserver = OriginalObserver
  })

  it('marca overflow cuando el track no entra', async () => {
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback
      }

      observe(element) {
        Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 420 })
        Object.defineProperty(element, 'clientWidth', { configurable: true, value: 180 })
        this.callback()
      }

      disconnect() {}
    }

    const { container } = render(
      <AdminFilterChipGroup
        compact
        id="status"
        inline
        omitNeutral
        allLabel="Todos"
        onChange={() => {}}
        options={[
          ['all', 'Todos', 80],
          ['registrado', 'Registrado', 77],
          ['afiliado_activo', 'Afiliado activo', 3],
        ]}
        value="all"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.admin-filter-chips-rail.is-overflowing')).toBeTruthy()
    })
  })
})

describe('Afiliaciones — toggle de vencimiento', () => {
  it('muestra el pill corto con el conteo de las que vencen pronto', () => {
    render(
      <I18nProvider>
        <MembershipsSection
          memberships={[
            {
              id: 'mem-soon',
              athleteId: 'ath-1',
              athlete: { fullName: 'Ana Torres', documentId: '30111222' },
              memberCode: 'PLU-ARG-2026-014',
              year: '2026',
              status: 'activa',
              startDate: '2026-01-01',
              expirationDate: soonDate(10),
            },
          ]}
        />
      </I18nProvider>,
    )

    const toggle = screen.getByRole('group', { name: 'Vencen en 30 días' })
    expect(toggle.textContent).toMatch(/Vencen pronto/)
    expect(toggle.querySelector('.admin-filter-chip__count')?.textContent).toBe('1')
  })

  it('oculta el toggle si no hay afiliaciones por vencer', () => {
    render(
      <I18nProvider>
        <MembershipsSection
          memberships={[
            {
              id: 'mem-cancel',
              athleteId: 'ath-1',
              athlete: { fullName: 'Ana Torres', documentId: '30111222' },
              memberCode: 'PLU-ARG-2026-014',
              year: '2026',
              status: 'cancelada',
              startDate: '2026-01-01',
              expirationDate: '2026-12-31',
            },
          ]}
        />
      </I18nProvider>,
    )

    expect(screen.queryByRole('group', { name: 'Vencen en 30 días' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Vencen pronto/ })).toBeNull()
  })
})

describe('Eventos — CTA fuera de los filtros', () => {
  const event = {
    id: 'evt-1',
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    date: '15 ago',
    dateISO: '2026-08-15',
    venue: 'Maximal Strength Club',
    location: 'Buenos Aires',
    status: 'inscripcion_abierta',
    published: true,
    featured: false,
    slots: 80,
    registered: 48,
    eventDays: [],
    ticketTypes: [],
  }

  it('deja Nuevo evento en el header y no en la barra de estados', () => {
    render(
      <I18nProvider>
        <EventsSection adminEvents={[event]} canEdit tickets={[]} />
      </I18nProvider>,
    )

    const create = screen.getByRole('button', { name: 'Nuevo evento' })
    expect(create.closest('.admin-filters')).toBeNull()
    expect(create.closest('.admin-list-shell__actions')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Eventos' })).toBeTruthy()
  })

  it('pone el censo en los chips y oculta estados vacíos', () => {
    const { container } = render(
      <I18nProvider>
        <EventsSection
          adminEvents={[
            event,
            {
              ...event,
              id: 'evt-2',
              slug: 'open-buenos-aires-2026',
              title: 'Open Buenos Aires',
              status: 'proximamente',
            },
          ]}
          canEdit
          tickets={[]}
        />
      </I18nProvider>,
    )

    const chipText = [...container.querySelectorAll('.admin-filter-chip')].map(
      (chip) => chip.textContent,
    )

    expect(chipText.some((text) => text.includes('Todos') && text.includes('2'))).toBe(true)
    expect(chipText.some((text) => text.includes('Inscripción abierta') && text.includes('1'))).toBe(
      true,
    )
    expect(chipText.some((text) => text.includes('Próximamente') && text.includes('1'))).toBe(true)
    expect(chipText.some((text) => text.includes('Cupos limitados'))).toBe(false)
    expect(chipText.some((text) => text.includes('Cupo lleno'))).toBe(false)
    expect(chipText.some((text) => text.includes('Cerrado'))).toBe(false)
    expect(chipText.some((text) => text.includes('Finalizado'))).toBe(false)
    expect(screen.queryByText('2 registros')).toBeNull()
  })
})

describe('Inscripciones — exportaciones con etiqueta', () => {
  it('muestra foto y gimnasio, y abre la ficha del atleta al seleccionar una inscripción', () => {
    const onSelectAthlete = vi.fn()
    const registrations = [
      {
        id: 'reg-portrait',
        athleteId: 'ath-portrait',
        athlete: {
          fullName: 'Ana Torres',
          documentId: '30111222',
          gym: 'Fuerza Sur',
          photoUrl: 'https://example.test/ana.jpg',
        },
        event: 'Pitbull Classic 2026',
        eventSlug: 'pitbull-classic-2026',
        category: 'Raw',
        division: 'Open',
        status: 'confirmada',
      },
    ]

    const { container } = render(
      <I18nProvider>
        <RegistrationsSection
          filters={{ event: 'all', status: 'all', query: '' }}
          filteredRegistrations={registrations}
          payments={[]}
          registrations={registrations}
          registrationsCount={1}
          onExportAdmin={() => {}}
          onExportPluUsa={() => {}}
          onSelectAthlete={onSelectAthlete}
          onSetFilters={() => {}}
        />
      </I18nProvider>,
    )

    const photo = container.querySelector('.data-table__avatar-photo')
    expect(photo?.getAttribute('src')).toBe('https://example.test/ana.jpg')
    expect(screen.getAllByText('Fuerza Sur').length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByText('Ana Torres')[0])
    expect(onSelectAthlete).toHaveBeenCalledWith('ath-portrait')
  })

  it('muestra CSV y PLU USA en vez de iconos mudos', () => {
    const registrations = [
      {
        id: 'reg-1',
        athleteId: 'ath-1',
        athlete: { fullName: 'Ana Torres', documentId: '30111222' },
        event: 'Pitbull Classic 2026',
        eventSlug: 'pitbull-classic-2026',
        category: 'Raw',
        division: 'Open',
        status: 'confirmada',
      },
    ]

    render(
      <I18nProvider>
        <RegistrationsSection
          canEdit
          filters={{ event: 'all', status: 'all', query: '' }}
          filteredRegistrations={registrations}
          payments={[]}
          registrations={registrations}
          registrationsCount={1}
          onExportAdmin={() => {}}
          onExportPluUsa={() => {}}
          onSetFilters={() => {}}
        />
      </I18nProvider>,
    )

    const csv = screen.getByRole('button', { name: 'Exportar inscripciones' })
    const pluUsa = screen.getByRole('button', { name: 'Descargar reporte PLU USA' })
    expect(csv.textContent).toMatch(/CSV/)
    expect(pluUsa.textContent).toMatch(/PLU USA/)
    expect(csv.className).not.toMatch(/icon-only/)
    expect(pluUsa.className).not.toMatch(/icon-only/)
  })

  it('traduce el chip de confirmadas sin afiliación', () => {
    const registrations = [
      {
        id: 'reg-1',
        athleteId: 'ath-1',
        athlete: { fullName: 'Ana Torres', documentId: '30111222' },
        event: 'Pitbull Classic 2026',
        eventSlug: 'pitbull-classic-2026',
        category: 'Raw',
        division: 'Open',
        status: 'confirmada',
      },
    ]

    render(
      <I18nProvider>
        <RegistrationsSection
          canEdit
          filters={{ event: 'all', status: 'all', query: '' }}
          filteredRegistrations={registrations}
          gatePendingIds={new Set(['reg-1'])}
          payments={[]}
          registrations={registrations}
          registrationsCount={1}
          onExportAdmin={() => {}}
          onExportPluUsa={() => {}}
          onSetFilters={() => {}}
        />
      </I18nProvider>,
    )

    expect(screen.queryByText('status.gate_pending')).toBeNull()
    expect(screen.getByRole('button', { name: /Confirmada sin afiliación/ })).toBeTruthy()
  })
})
