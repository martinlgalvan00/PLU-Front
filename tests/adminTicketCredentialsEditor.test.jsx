import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import AdminTicketCredentialsEditor from '../src/components/admin/AdminTicketCredentialsEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { defaultTicketCredential } from '../src/lib/ticketCredentials.js'

afterEach(() => cleanup())

function Harness({ initial = [defaultTicketCredential()] } = {}) {
  const [credentials, setCredentials] = useState(initial)
  return (
    <I18nProvider>
      <AdminTicketCredentialsEditor
        canEdit
        credentials={credentials}
        fieldPrefix="ticketTypes.0"
        quota={200}
        onChange={setCredentials}
      />
    </I18nProvider>
  )
}

describe('AdminTicketCredentialsEditor', () => {
  it('deja claro el acceso de público y no ofrece zonas que una entrada no abre', () => {
    render(<Harness />)

    expect(screen.getByText(/para una entrada de público general/i)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /puerta general/i }).checked).toBe(true)
    expect(screen.getByText(/^público$/i)).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /entrada en calor/i }).checked).toBe(false)
    expect(screen.queryByRole('checkbox', { name: /staff técnico/i })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /zona de atletas/i })).toBeNull()
  })

  it('una credencial nueva ya abre la puerta, para no dejar el acceso vacío', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /agregar credencial/i }))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[1]).getByRole('checkbox', { name: /puerta general/i }).checked).toBe(true)
    expect(within(items[1]).queryByRole('alert')).toBeNull()
  })

  it('permite personalizar el nombre y el acceso de una credencial extra', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: /agregar credencial/i }))
    const extra = screen.getAllByRole('listitem')[1]
    const name = within(extra).getByPlaceholderText(/entrenador/i)

    fireEvent.change(name, { target: { value: 'ENTRENADOR' } })
    fireEvent.click(within(extra).getByRole('checkbox', { name: /entrada en calor/i }))
    fireEvent.click(within(extra).getByRole('checkbox', { name: /puerta general/i }))

    expect(name.value).toBe('ENTRENADOR')
    expect(within(extra).getByRole('checkbox', { name: /entrada en calor/i }).checked).toBe(true)
    expect(within(extra).getByRole('checkbox', { name: /puerta general/i }).checked).toBe(false)
  })
})
