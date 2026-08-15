import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/lib/api.js'

/**
 * Render real (jsdom) de la página de verificación — la que abre seguridad
 * escaneando el QR con la cámara.
 *
 * El caso que ordena este archivo: cuando el backend no responde, la pantalla
 * NO puede decir "Credencial no válida". Ese falso negativo hace que la puerta
 * rebote a un atleta que pagó, y desde afuera se ve idéntico a un rechazo
 * legítimo.
 */

vi.mock('../src/services/athleteApi.js', () => ({
  getMembershipByCodeOrToken: vi.fn(),
}))

vi.mock('../src/services/ticketApi.js', () => ({
  verifyTicketByQrToken: vi.fn(),
}))

// IndexedDB no existe en jsdom: el caché se controla desde el test.
vi.mock('../src/services/credentialCache.js', () => ({
  rememberCredential: vi.fn(async () => {}),
  recallCredential: vi.fn(async () => null),
  formatCacheAge: (ms) => `hace ${Math.floor(ms / 60_000)} min`,
  MAX_AGE_MS: 86_400_000,
}))

const { getMembershipByCodeOrToken } = await import('../src/services/athleteApi.js')
const { recallCredential } = await import('../src/services/credentialCache.js')
const CredentialPage = (await import('../src/pages/CredentialPage.jsx')).default

const CODE = 'a4f1c0de-0000-4000-8000-000000000001'
const EVENT = 'pitbull-classic-2026'

function credential(overrides = {}) {
  return {
    athlete: {
      id: 'ath-1',
      fullName: 'Ana Torres',
      documentId: '30111222',
      birthDate: '1995-01-01',
      photoUrl: null,
    },
    membership: {
      id: 'mem-1',
      status: 'activa',
      year: 2026,
      memberCode: 'PLU-ARG-2026-014',
      startDate: '2026-01-01',
      expirationDate: '2026-12-31',
    },
    registration: {
      id: 'reg-1',
      status: 'confirmada',
      category: 'Raw',
      division: 'Open',
      event: 'Pitbull Classic 2026',
      checkedInAt: null,
      schedule: {
        dayId: 'day-2',
        dayIndex: 1,
        dayLabel: 'Día 2',
        dayDate: '2026-11-14',
        sessionId: 'ses-b',
        sessionName: 'Tanda B',
      },
    },
    registrations: [],
    ...overrides,
  }
}

function renderPage(props = {}) {
  return render(<CredentialPage code={CODE} eventSlug={EVENT} {...props} />)
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('verificación de credencial en la puerta', () => {
  it('muestra el veredicto y el día de competencia con datos frescos', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(credential())
    renderPage()

    expect(await screen.findByText('Credencial válida')).toBeTruthy()
    expect(screen.getByText('Ana Torres')).toBeTruthy()
    expect(screen.getByText('Verificación QR')).toBeTruthy()
    expect(screen.getAllByText('Pitbull Classic 2026').length).toBeGreaterThan(0)
    expect(screen.getByText('Día 2 · sáb 14 nov · Tanda B')).toBeTruthy()
  })

  it('etiqueta documento, nacimiento y socio para cotejar en la puerta', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(credential())
    renderPage()

    expect(await screen.findByText('Ana Torres')).toBeTruthy()
    // El label del documento anticipa el tipo físico que hay que cotejar:
    // DNI para el padrón argentino, ID / Pasaporte para el resto.
    expect(screen.getByText('DNI')).toBeTruthy()
    expect(screen.getByText('30111222')).toBeTruthy()
    expect(screen.getByText('Nacimiento')).toBeTruthy()
    expect(screen.getByText(/01 de ene de 1995/i)).toBeTruthy()
    expect(screen.getByText(/\d+ años/)).toBeTruthy()
    expect(screen.getByText('Nº de socio')).toBeTruthy()
    expect(screen.getByText('PLU-ARG-2026-014')).toBeTruthy()
    expect(screen.getByText(/Período 2026/)).toBeTruthy()
    expect(screen.getByText(/Desde/)).toBeTruthy()
    expect(screen.getByText(/Hasta/)).toBeTruthy()
    // Sin foto: iniciales del nombre en el retrato.
    expect(screen.getByText('AT')).toBeTruthy()
  })

  it('etiqueta el documento de un extranjero como ID / Pasaporte', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(
      credential({
        athlete: {
          id: 'ath-2',
          fullName: 'John Smith',
          documentId: 'X1234567',
          birthDate: '1990-06-15',
          photoUrl: null,
        },
      }),
    )
    renderPage()

    expect(await screen.findByText('John Smith')).toBeTruthy()
    expect(screen.getByText('ID / Pasaporte')).toBeTruthy()
    expect(screen.getByText('X1234567')).toBeTruthy()
  })

  it('muestra la foto del atleta cuando la verificación la trae', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(
      credential({
        athlete: {
          id: 'ath-1',
          fullName: 'Ana Torres',
          documentId: '30111222',
          birthDate: '1995-01-01',
          photoUrl: 'https://example.test/ana.jpg',
        },
      }),
    )
    renderPage()

    expect(await screen.findByText('Ana Torres')).toBeTruthy()
    const photo = document.querySelector('.credential-page__photo img')
    expect(photo).toBeTruthy()
    expect(photo.getAttribute('src')).toBe('https://example.test/ana.jpg')
    expect(screen.queryByText('AT')).toBeNull()
  })

  it('sin documento ni nacimiento (member_code) igual muestra el socio', async () => {
    // La proyección pública solo manda PII cuando el QR era un token.
    getMembershipByCodeOrToken.mockResolvedValue(
      credential({
        athlete: { id: 'ath-1', fullName: 'Ana Torres' },
      }),
    )
    renderPage()

    expect(await screen.findByText('Ana Torres')).toBeTruthy()
    expect(screen.getByText('Nº de socio')).toBeTruthy()
    expect(screen.getByText('PLU-ARG-2026-014')).toBeTruthy()
    expect(screen.queryByText('Documento')).toBeNull()
    expect(screen.queryByText('Nacimiento')).toBeNull()
  })

  it('sin conexión NO dice que la credencial es inválida', async () => {
    // Regresión: el `.catch()` colapsaba todo error en not_found, así que una
    // caída de red pintaba la X roja de "Credencial no válida".
    getMembershipByCodeOrToken.mockRejectedValue(new ApiError('sin red', { status: 0 }))
    recallCredential.mockResolvedValue(null)

    renderPage()

    expect(await screen.findByText('No se pudo verificar', {}, { timeout: 6000 })).toBeTruthy()
    expect(screen.queryByText('Credencial no válida')).toBeNull()
    // Y deja el código a la vista para cotejarlo contra la planilla.
    expect(screen.getByText(CODE)).toBeTruthy()
  })

  it('un 404 real sí es una credencial inválida', async () => {
    getMembershipByCodeOrToken.mockRejectedValue(new ApiError('no existe', { status: 404 }))
    renderPage()

    expect(await screen.findByText('Credencial no válida')).toBeTruthy()
    expect(screen.queryByText('No se pudo verificar')).toBeNull()
  })

  it('sin conexión pero con verificación previa, muestra el dato marcado', async () => {
    getMembershipByCodeOrToken.mockRejectedValue(new ApiError('sin red', { status: 0 }))
    recallCredential.mockResolvedValue({
      data: credential(),
      verifiedAt: new Date().toISOString(),
      ageMs: 5 * 60_000,
    })

    renderPage()

    expect(await screen.findByText('Sin conexión con PLU ARG', {}, { timeout: 6000 })).toBeTruthy()
    expect(screen.getByText('Ana Torres')).toBeTruthy()
    expect(screen.getByText('Día 2 · sáb 14 nov · Tanda B')).toBeTruthy()
    // La antigüedad tiene que estar a la vista para poder juzgar el dato.
    expect(screen.getByText(/hace 5 min/)).toBeTruthy()
  })

  it('con datos diferidos no ofrece marcar ingreso', async () => {
    // Marcar ingreso escribe en el backend: aceptar el toque y perderlo es
    // peor que decir que ahora no se puede.
    getMembershipByCodeOrToken.mockRejectedValue(new ApiError('sin red', { status: 0 }))
    recallCredential.mockResolvedValue({
      data: credential(),
      verifiedAt: new Date().toISOString(),
      ageMs: 60_000,
    })

    renderPage({ onCheckInRegistration: vi.fn() })

    await screen.findByText('Sin conexión con PLU ARG', {}, { timeout: 6000 })
    expect(screen.queryByRole('button', { name: /marcar ingreso/i })).toBeNull()
  })

  it('con datos frescos sí ofrece marcar ingreso', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(credential())
    renderPage({ onCheckInRegistration: vi.fn() })

    expect(await screen.findByRole('button', { name: /marcar ingreso/i })).toBeTruthy()
  })

  it('reintenta los fallos de transporte antes de rendirse', async () => {
    getMembershipByCodeOrToken
      .mockRejectedValueOnce(new ApiError('sin red', { status: 0 }))
      .mockResolvedValueOnce(credential())

    renderPage()

    expect(await screen.findByText('Credencial válida')).toBeTruthy()
    await waitFor(() => expect(getMembershipByCodeOrToken).toHaveBeenCalledTimes(2))
  })

  it('avisa cuando el ingreso no se pudo confirmar', async () => {
    getMembershipByCodeOrToken.mockResolvedValue(credential())
    const onCheckInRegistration = vi.fn().mockRejectedValue(new ApiError('sin red', { status: 0 }))

    renderPage({ onCheckInRegistration })

    const button = await screen.findByRole('button', { name: /marcar ingreso/i })
    button.click()

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('No se pudo confirmar el ingreso'),
    )
  })
})
