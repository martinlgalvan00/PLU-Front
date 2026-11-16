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

  it('destaca el torneo que se pidió ver y reusa el mismo QR', async () => {
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
            status: 'vencida',
            memberCode: 'PLU-1',
            expirationDate: '2020-01-01',
          }}
          registrations={[
            {
              id: 'registration-a',
              status: 'confirmada',
              event: 'Meet A',
              eventSlug: 'meet-a',
              requiresMembership: false,
            },
            {
              id: 'registration-b',
              status: 'confirmada',
              event: 'Meet B',
              eventSlug: 'meet-b',
              requiresMembership: true,
            },
          ]}
          focusEventSlug="meet-b"
          onNavigateSection={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'Meet B' })).toBeTruthy()
    expect(screen.getByTestId('credential-status').textContent).toBe('Cupo reservado')
    await waitFor(() => expect(generateCredentialQr).toHaveBeenCalledTimes(1))
  })

  it('con financiamiento pendiente, la credencial suma el cartel del plazo', async () => {
    // La credencial ya sale habilitada (afiliación 'activa', inscripción
    // 'confirmada' — 20260909100000): el cartel es lo único que dice que ese
    // derecho sigue provisorio mientras Finanzas no acredite.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
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
            pendingFinancedPayment={{ financedPaymentDueAt: '2026-08-27T12:00:00.000Z' }}
            onNavigateSection={vi.fn()}
          />
        </I18nProvider>,
      )

      expect(await screen.findByText(/Te quedan 7 días/i)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin financiamiento pendiente, no hay cartel de plazo', async () => {
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
          registrations={[]}
          onNavigateSection={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(await screen.findByTestId('credential-status')).toBeTruthy()
    expect(screen.queryByText(/Te quedan/i)).toBeNull()
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
    expect(screen.getByRole('heading', { name: 'Tu ficha ya está' })).toBeTruthy()
    expect(
      screen.getByText(
        'El QR se activa cuando te afiliás o cuando se confirma una inscripción.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Afiliarme para generar mi credencial' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver calendario de meets' })).toBeTruthy()
    expect(screen.queryByTestId('credential-status')).toBeNull()
  })

  it('con un pago pendiente mantiene el aviso de credencial en camino', () => {
    render(
      <I18nProvider>
        <QrCredentialSection
          athlete={{ id: 'athlete-1', fullName: 'Ana Torres' }}
          membership={null}
          registrations={[
            { id: 'reg-1', status: 'pendiente_pago', event: 'Meet', eventSlug: 'meet' },
          ]}
          onNavigateSection={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Tu credencial está en camino' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Tu ficha ya está' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ver mis pagos' })).toBeTruthy()
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
    expect(
      screen.getByText('La inscripción está. La afiliación se activa cuando se acredite el pago.'),
    ).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pitbull Classic 2026' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pagar afiliación' })).toBeTruthy()
    expect(screen.queryByTestId('share-card-variant')).toBeNull()
  })
})
