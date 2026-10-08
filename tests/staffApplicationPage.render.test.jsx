import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * Pedido explícito: la página se ve siempre, logeado o no. Solo cambia el
 * botón de enviar — reemplazado por un aviso de login/registro sin sesión de
 * atleta. El borrador en localStorage asegura no perder lo tipeado al volver.
 */

vi.mock('../src/services/staffApplicationService.js', () => ({
  submitStaffApplication: vi.fn(async () => ({})),
  uploadStaffApplicationFile: vi.fn(async () => ({ storagePath: 'mock/path' })),
  validateStaffApplicationFile: vi.fn(() => ({ ok: true })),
}))

const StaffApplicationPage = (await import('../src/pages/StaffApplicationPage.jsx')).default

const ATHLETE = {
  id: 'ath-1',
  fullName: 'Agustina Pérez',
  documentId: '30111222',
  birthDate: '1998-04-10',
  city: 'Quilmes',
  province: 'Buenos Aires',
  email: 'agustina@example.com',
  phone: '1155551234',
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(cleanup)

function renderPage({ session = null, athletes = [] } = {}) {
  return render(
    <I18nProvider>
      <StaffApplicationPage athletes={athletes} onNavigate={vi.fn()} session={session} />
    </I18nProvider>,
  )
}

describe('StaffApplicationPage', () => {
  it('se ve completa sin sesión, con el formulario editable', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /sumate al cuerpo de staff/i })).toBeTruthy()
    expect(screen.getByLabelText(/^nombre$/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /enviar postulación/i })).toBeNull()
  })

  it('sin sesión, muestra el aviso de login en vez del botón de enviar', () => {
    renderPage()
    expect(screen.getByText(/tu progreso queda guardado en este dispositivo/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeTruthy()
  })

  it('con sesión de atleta, precarga el perfil y habilita el botón de enviar', () => {
    renderPage({ session: { role: 'athlete_plu', athleteId: ATHLETE.id }, athletes: [ATHLETE] })
    expect(screen.getByRole('button', { name: /enviar postulación/i })).toBeTruthy()
    expect(screen.getByLabelText(/^dni$/i).value).toBe('30111222')
    expect(screen.getByLabelText(/^email$/i).value).toBe('agustina@example.com')
  })

  it('guarda un borrador en localStorage mientras se escribe', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: 'Pablo' } })
    const draft = JSON.parse(window.localStorage.getItem('plu-staff-application-draft'))
    expect(draft.firstName).toBe('Pablo')
  })

  it('el campo de capacitación PDCA solo aparece para el cuerpo técnico', () => {
    renderPage({ session: { role: 'athlete_plu', athleteId: ATHLETE.id }, athletes: [ATHLETE] })
    expect(screen.queryByLabelText(/capacitación técnica/i)).toBeNull()
    fireEvent.change(screen.getByLabelText(/de qué cuerpo de staff/i), {
      target: { value: 'tecnico' },
    })
    expect(screen.getByLabelText(/capacitación técnica/i)).toBeTruthy()
  })
})
