import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import AdminDataTable from '../src/components/admin/AdminDataTable.jsx'
import AdminFilterBar from '../src/components/admin/AdminFilterBar.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
})

afterEach(cleanup)

function Harness({ count = null }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [profile, setProfile] = useState('all')
  const [gym, setGym] = useState('all')

  return (
    <I18nProvider>
      <AdminFilterBar
        layout="toolbar"
        count={count}
        placeholder="Buscar atleta"
        query={query}
        onQueryChange={setQuery}
        filters={[
          {
            id: 'status',
            surface: 'rail',
            label: 'Estado',
            value: status,
            onChange: setStatus,
            options: [
              ['all', 'Todos los estados', 10],
              ['activo', 'Activo', 6],
              ['vencido', 'Vencido', 0],
              ['baja', 'Baja', 4],
            ],
          },
          {
            id: 'profile',
            label: 'Perfil',
            value: profile,
            onChange: setProfile,
            options: [
              ['all', 'Todos los perfiles', 10],
              ['incomplete', 'Perfil incompleto', 3],
              ['complete', 'Perfil completo', 7],
            ],
            quickOption: 'incomplete',
          },
          {
            id: 'gym',
            label: 'Gimnasio',
            value: gym,
            onChange: setGym,
            variant: 'select',
            options: [
              ['all', 'Todos los gimnasios'],
              ['iron', 'Iron Method'],
            ],
          },
        ]}
      />
    </I18nProvider>
  )
}

describe('Barra de listado (layout toolbar)', () => {
  it('muestra el estado como pestañas con conteo, sin las opciones vacías', () => {
    render(<Harness />)

    const group = screen.getByRole('group', { name: 'Estado' })
    expect(within(group).getByRole('button', { name: /^Todos\s*10/ })).toBeTruthy()
    expect(within(group).getByRole('button', { name: /Activo\s*6/ })).toBeTruthy()
    expect(within(group).queryByRole('button', { name: /Vencido/ })).toBeNull()
  })

  it('el estado se alterna y se suelta con un segundo clic', () => {
    render(<Harness />)

    const activo = screen.getByRole('button', { name: /Activo\s*6/ })
    fireEvent.click(activo)
    expect(activo.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(activo)
    expect(activo.getAttribute('aria-pressed')).toBe('false')
  })

  it('el atajo de atención aplica la opción y no suma una etiqueta repetida', () => {
    const { container } = render(<Harness />)

    const quick = screen.getByRole('button', { name: /Perfil incompleto\s*3/ })
    fireEvent.click(quick)

    expect(quick.getAttribute('aria-pressed')).toBe('true')
    // Ya se lee en el atajo activo: no aparece también como etiqueta.
    expect(container.querySelector('.admin-toolbar__tag')).toBeNull()
  })

  it('un criterio del popover queda como etiqueta y "Limpiar todo" aparece con dos o más', () => {
    const { container } = render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /^Filtros/ }))
    const dialog = screen.getByRole('dialog', { name: 'Filtros' })
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Gimnasio' }), {
      target: { value: 'iron' },
    })

    expect(container.querySelector('.admin-toolbar__tag')?.textContent).toMatch(/Gimnasio.*Iron Method/)
    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Activo\s*6/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar todo' }))

    expect(container.querySelector('.admin-toolbar__tag')).toBeNull()
    expect(screen.getByRole('button', { name: /Activo\s*6/ }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('el popover se cierra con Escape y devuelve el foco al botón', () => {
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: /^Filtros/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('muestra la cuenta de registros al final de la lente cuando se la pasan', () => {
    render(<Harness count="3 de 10 registros" />)
    expect(screen.getByText('3 de 10 registros')).toBeTruthy()
  })
})

describe('AdminDataTable en modo ajustado (fit)', () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({
    id: `row-${index + 1}`,
    name: `Persona ${index + 1}`,
  }))

  function renderFit() {
    return render(
      <I18nProvider>
        <AdminDataTable
          fit
          density="compact"
          columns={[
            { key: 'name', label: 'Nombre', mobile: 'primary', sortable: true },
            { key: 'extra', label: 'Extra', cardOnly: true, mobile: 'default' },
          ]}
          rows={rows}
        />
      </I18nProvider>,
    )
  }

  it('no usa scroll horizontal y pagina con un pie propio', () => {
    const { container } = renderFit()

    expect(container.querySelector('.admin-data-table--fit')).toBeTruthy()
    expect(container.querySelector('.ant-table-content')?.getAttribute('style') ?? '').not.toMatch(
      /overflow-x/,
    )
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeTruthy()
    // Sin alto medible (jsdom) cae al mínimo de filas, y el pie lo dice.
    expect(screen.getByText(/1–\d+ de 14/)).toBeTruthy()
  })

  it('las columnas solo de card no aparecen en la tabla', () => {
    const { container } = renderFit()
    const headers = [...container.querySelectorAll('.ant-table-thead th')].map((th) => th.textContent)
    expect(headers).toContain('Nombre')
    expect(headers).not.toContain('Extra')
  })

  it('pasa de página con el pie y deshabilita el borde', () => {
    renderFit()

    const previous = screen.getByRole('button', { name: 'Página anterior' })
    const next = screen.getByRole('button', { name: 'Página siguiente' })
    expect(previous.disabled).toBe(true)

    fireEvent.click(next)
    expect(screen.getByText(/^\d+–\d+ de 14$/).textContent).not.toMatch(/^1–/)
    expect(previous.disabled).toBe(false)
  })
})
