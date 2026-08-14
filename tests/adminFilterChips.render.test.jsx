import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AdminFilterChipGroup from '../src/components/admin/AdminFilterChipGroup.jsx'
import AdminListSection from '../src/components/admin/AdminListSection.jsx'

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
})
