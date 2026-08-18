import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AdminFilterChipGroup from '../src/components/admin/AdminFilterChipGroup.jsx'
import AdminListSection from '../src/components/admin/AdminListSection.jsx'
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
  window.matchMedia ??= (query) => ({
    matches: String(query).includes('max-width: 1100px'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(() => cleanup())

const STATUS_OPTIONS = [
  ['all', 'Todos los estados', 77],
  ['registrado', 'Registrado', 77],
  ['observado', 'Observado', 0],
]

describe('AdminFilterChipGroup — censo en Todos', () => {
  it('no duplica el censo en Todos si hay un solo estado poblado', () => {
    render(
      <AdminFilterChipGroup
        id="status"
        value="all"
        onChange={vi.fn()}
        options={STATUS_OPTIONS}
        omitNeutral
        allLabel="Todos"
        hideEmpty
        compact
        inline
      />,
    )

    const allChip = screen.getByRole('button', { name: /Todos/ })
    expect(allChip.textContent).toBe('Todos')
    expect(screen.getByRole('button', { name: /Registrado/ }).textContent).toContain('77')
    expect(screen.queryByRole('button', { name: /Observado/ })).toBeNull()
  })

  it('muestra el total en Todos cuando hay más de un estado poblado', () => {
    render(
      <AdminFilterChipGroup
        id="status"
        value="all"
        onChange={vi.fn()}
        options={[
          ['all', 'Todos los estados', 80],
          ['registrado', 'Registrado', 77],
          ['afiliado_activo', 'Afiliado activo', 3],
        ]}
        omitNeutral
        allLabel="Todos"
        hideEmpty
        compact
        inline
      />,
    )

    expect(screen.getByRole('button', { name: /Todos/ }).textContent).toContain('80')
    expect(screen.getByRole('button', { name: /Registrado/ }).textContent).toContain('77')
    expect(screen.getByRole('button', { name: /Afiliado activo/ }).textContent).toContain('3')
  })
})

describe('AdminListSection — sin duplicar el censo', () => {
  it('no repite N registros cuando los chips ya traen conteo y no hay búsqueda', () => {
    render(
      <I18nProvider>
        <AdminListSection
          filteredCount={77}
          totalCount={77}
          query=""
          onQueryChange={vi.fn()}
          title="Atletas"
          filters={[
            {
              id: 'status',
              label: 'Estado',
              value: 'all',
              onChange: vi.fn(),
              options: STATUS_OPTIONS,
            },
          ]}
        >
          <p>tabla</p>
        </AdminListSection>
      </I18nProvider>,
    )

    expect(screen.getByRole('button', { name: /Registrado/ }).textContent).toContain('77')
    expect(screen.getByRole('button', { name: /Todos/ }).textContent).toBe('Todos')
    expect(screen.queryByText('77 registros')).toBeNull()
  })

  it('muestra el recorte cuando hay búsqueda activa', () => {
    render(
      <I18nProvider>
        <AdminListSection
          filteredCount={3}
          totalCount={77}
          query="agus"
          onQueryChange={vi.fn()}
          title="Atletas"
          filters={[
            {
              id: 'status',
              label: 'Estado',
              value: 'all',
              onChange: vi.fn(),
              options: STATUS_OPTIONS,
            },
          ]}
        >
          <p>tabla</p>
        </AdminListSection>
      </I18nProvider>,
    )

    expect(screen.getByText('3 de 77 registros')).toBeTruthy()
  })

  it('no renderiza el slot de acciones si viene vacío', () => {
    const { container } = render(
      <I18nProvider>
        <AdminListSection title="Inscripciones" actions={null}>
          <p>tabla</p>
        </AdminListSection>
      </I18nProvider>,
    )

    expect(container.querySelector('.admin-list-section__chrome')).not.toBeNull()
    expect(container.querySelector('.admin-list-shell__actions')).toBeNull()
  })

  it('mueve las acciones del header a la barra de filtros en viewport angosto', () => {
    const { container } = render(
      <I18nProvider>
        <AdminListSection
          variant="registrations"
          title="Inscripciones"
          actions={<button type="button">CSV</button>}
          query=""
          onQueryChange={() => {}}
        >
          <p>tabla</p>
        </AdminListSection>
      </I18nProvider>,
    )

    const csv = screen.getByRole('button', { name: 'CSV' })
    expect(csv.closest('.admin-filters')).toBeTruthy()
    expect(container.querySelector('.admin-list-shell__actions')).toBeNull()
  })
})

describe('Inscripciones — rieles etiquetados', () => {
  function renderRegistrations() {
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
      {
        id: 'reg-2',
        athleteId: 'ath-2',
        athlete: { fullName: 'Bruno Diaz', documentId: '30111333' },
        event: 'Pit Elite 2026',
        eventSlug: 'pit-elite-2026',
        category: 'Raw',
        division: 'Open',
        status: 'pendiente_pago',
      },
    ]

    return render(
      <I18nProvider>
        <RegistrationsSection
          canEdit
          filters={{ event: 'all', status: 'all', query: '' }}
          filteredRegistrations={registrations}
          payments={[]}
          registrations={registrations}
          registrationsCount={registrations.length}
          onExportAdmin={() => {}}
          onExportPluUsa={() => {}}
          onSetFilters={() => {}}
        />
      </I18nProvider>,
    )
  }

  it('etiqueta evento y estado cuando hay más de un riel', () => {
    const { container } = renderRegistrations()

    const labels = [...container.querySelectorAll('.admin-filter-group__label')].map(
      (label) => label.textContent,
    )

    expect(labels).toContain('Evento')
    expect(labels).toContain('Estado')
  })

  it('mantiene el texto de los exports para poder ocultarlo solo por CSS', () => {
    renderRegistrations()

    const csv = screen.getByRole('button', { name: 'Exportar inscripciones' })
    expect(csv.querySelector('.export-btn__label')?.textContent).toBe('CSV')
  })

  it('permite retirar una inscripción del padrón público sin borrarla', () => {
    const onSetPublicVisibility = vi.fn().mockResolvedValue({})
    const registrations = [{
      id: 'reg-visible',
      athleteId: 'ath-1',
      athlete: { fullName: 'Ana Torres', documentId: '30111222' },
      event: 'Pitbull Classic 2026',
      eventSlug: 'pitbull-classic-2026',
      category: 'Raw',
      division: 'Open',
      status: 'confirmada',
      publicVisible: true,
    }]
    render(
      <I18nProvider>
        <RegistrationsSection
          canEdit
          canManageVisibility
          filters={{ event: 'all', status: 'all', query: '' }}
          filteredRegistrations={registrations}
          onExportAdmin={() => {}}
          onExportPluUsa={() => {}}
          onSetFilters={() => {}}
          onSetPublicVisibility={onSetPublicVisibility}
          payments={[]}
          registrations={registrations}
        />
      </I18nProvider>,
    )

    fireEvent.click(screen.getAllByRole('button', { name: /ocultar del padrón público/i })[0])
    expect(onSetPublicVisibility).toHaveBeenCalledWith('reg-visible', false)
  })
})
