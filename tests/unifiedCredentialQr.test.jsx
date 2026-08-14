import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EventShareCard from '../src/components/ui/EventShareCard.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import QrCredentialSection from '../src/pages/profile/QrCredentialSection.jsx'

vi.mock('../src/lib/credentialQr.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    generateCredentialQr: vi.fn(async () => 'data:image/png;base64,qr-unificado'),
  }
})

vi.mock('../src/lib/credentialMerge.js', () => ({
  hasPlayedCredentialMerge: vi.fn(() => true),
}))

vi.mock('../src/components/ui/CredentialCard.jsx', () => ({
  default: ({ status }) => <div data-testid="credential-status">{status}</div>,
}))

vi.mock('../src/components/ui/CardPreviewModal.jsx', () => ({
  default: ({ cardData }) => <div data-testid="share-card-variant">{cardData?.variant}</div>,
}))

const { buildAthleteCredentialUrl, generateCredentialQr } = await import(
  '../src/lib/credentialQr.js'
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('QR único por atleta', () => {
  it('genera una URL canónica sin afiliación ni evento embebidos', () => {
    const url = new URL(buildAthleteCredentialUrl('credential-token-1'))

    expect(url.searchParams.get('credencial')).toBe('credential-token-1')
    expect(url.searchParams.has('evento')).toBe(false)
    expect(url.searchParams.has('tipo')).toBe(false)
  })

  it('muestra afiliación e inscripción confirmada sobre una sola credencial', async () => {
    render(
      <I18nProvider>
        <QrCredentialSection
          athlete={{
            id: 'athlete-1',
            fullName: 'Ana Torres',
            credentialToken: 'credential-token-1',
          }}
          membership={{
            id: 'membership-1',
            status: 'activa',
            memberCode: 'PLU-ARG-2026-014',
            startDate: '2026-01-01',
            expirationDate: '2099-12-31',
          }}
          registrations={[{
            id: 'registration-1',
            status: 'confirmada',
            event: 'Pitbull Classic 2026',
            eventSlug: 'pitbull-classic-2026',
            requiresMembership: true,
          }]}
          onNavigateSection={vi.fn()}
        />
      </I18nProvider>,
    )

    expect((await screen.findByTestId('credential-status')).textContent).toBe(
      'Afiliación + inscripción activas',
    )
    expect(screen.getByTestId('share-card-variant').textContent).toBe('unified')
    expect(screen.getByText('Afiliación activa')).toBeTruthy()
    expect(screen.getByText('Pitbull Classic 2026 · Inscripción confirmada')).toBeTruthy()

    await waitFor(() => expect(generateCredentialQr).toHaveBeenCalledTimes(1))
    const scannedUrl = new URL(generateCredentialQr.mock.calls[0][0])
    expect(scannedUrl.searchParams.get('credencial')).toBe('credential-token-1')
    expect(scannedUrl.searchParams.has('evento')).toBe(false)
  })

  it('usa el mismo payload en la tarjeta del torneo y reserva el evento para tickets', async () => {
    const athleteCard = render(
      <I18nProvider>
        <EventShareCard
          athleteName="Ana Torres"
          athleteCode="PLU-ARG-2026-014"
          qrCode="credential-token-1"
          eventTitle="Pitbull Classic 2026"
          eventSlug="pitbull-classic-2026"
          variant="event"
        />
      </I18nProvider>,
    )

    await waitFor(() => expect(generateCredentialQr).toHaveBeenCalledTimes(1))
    const athleteUrl = new URL(generateCredentialQr.mock.calls[0][0])
    expect(athleteUrl.searchParams.get('credencial')).toBe('credential-token-1')
    expect(athleteUrl.searchParams.has('evento')).toBe(false)
    expect(athleteUrl.searchParams.has('tipo')).toBe(false)

    athleteCard.unmount()
    vi.clearAllMocks()

    render(
      <I18nProvider>
        <EventShareCard
          athleteName="Público General"
          athleteCode="TICKET-1"
          qrCode="opaque-ticket-token"
          eventTitle="Pitbull Classic 2026"
          eventSlug="pitbull-classic-2026"
          variant="ticket"
        />
      </I18nProvider>,
    )

    await waitFor(() => expect(generateCredentialQr).toHaveBeenCalledTimes(1))
    const ticketUrl = new URL(generateCredentialQr.mock.calls[0][0])
    expect(ticketUrl.searchParams.get('evento')).toBe('pitbull-classic-2026')
    expect(ticketUrl.searchParams.get('tipo')).toBe('ticket')
  })

  it('muestra la placa sin emitir y una sola acción de afiliación', () => {
    render(
      <I18nProvider>
        <QrCredentialSection
          athlete={{ id: 'athlete-1', fullName: 'Ana Torres' }}
          membership={null}
          registrations={[]}
          onNavigateSection={vi.fn()}
          onNavigate={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Mi QR' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Activá tu credencial' })).toBeTruthy()
    expect(
      screen.getByText(
        'Con afiliación activa o una inscripción confirmada generás tu QR de ingreso.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Afiliarme para generar mi credencial' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver calendario de meets' })).toBeTruthy()
    expect(screen.queryByTestId('credential-status')).toBeNull()
  })

  it('en dual muestra una credencial y la banda de conversión, no dos QR', async () => {
    render(
      <I18nProvider>
        <QrCredentialSection
          athlete={{
            id: 'athlete-1',
            fullName: 'Ana Torres',
            credentialToken: 'credential-token-1',
          }}
          membership={null}
          latestMembership={{
            id: 'membership-pending',
            status: 'pendiente_pago',
            memberCode: 'PLU-ARG-2026-014',
          }}
          registrations={[{
            id: 'registration-1',
            status: 'confirmada',
            event: 'Pitbull Classic 2026',
            eventSlug: 'pitbull-classic-2026',
            requiresMembership: true,
          }]}
          onNavigateSection={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(await screen.findByTestId('credential-status')).toBeTruthy()
    expect(screen.getByText('Pendiente de activación')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pagar afiliación' })).toBeTruthy()
    expect(screen.queryByTestId('share-card-variant')).toBeNull()
  })
})
