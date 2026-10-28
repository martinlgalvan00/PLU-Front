// `account.css` está acotado a la ruta del perfil (lo importa
// AthleteProfilePage, no el entry global): sin este import la story mostraba la
// sección sin grilla ni estilos de la vista de escaneo, igual que las stories
// hermanas de PersonalData y Security.
import { expect, fn, userEvent, within } from 'storybook/test'
import '../../styles/pages/account.css'
import QrCredentialSection from './QrCredentialSection.jsx'

/**
 * La credencial del atleta en su cuenta: el objeto que se escanea en la puerta.
 *
 * La primera vez que la persona entra con el QR ya emitido, la sección abre con
 * el acuse de emisión y la ráfaga de papel laminado. El acuse se muestra una
 * sola vez —la clave vive en `localStorage`, por atleta y por código—, así que
 * para volver a verlo hay que limpiar el storage del preview y recargar.
 */
export default {
  title: 'Cuenta/QrCredentialSection',
  component: QrCredentialSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    athlete: {
      id: 'ath-story-1',
      fullName: 'Martina Rivas',
      credentialToken: 'PLU-ARG-2026-001',
      photoUrl: null,
    },
    membership: {
      id: 'mem-story-1',
      memberCode: 'PLU-ARG-2026-001',
      status: 'activa',
      year: 2026,
      startDate: '2026-01-15',
      expirationDate: '2027-01-31',
      qrToken: 'PLU-ARG-2026-001',
    },
    latestMembership: null,
    registrations: [],
    onNavigateSection: () => {},
    onNavigate: () => {},
  },
  decorators: [
    // Misma cadena de ancestros que AthleteProfilePage: las columnas de la
    // credencial y la vista de escaneo salen de `.account-main`, así que sin
    // este envoltorio la story mostraba la sección apilada como en mobile y no
    // servía para validar el layout de desktop.
    (Story) => (
      <main className="page page--design account-page--design">
        <div className="account-main">
          <div className="account-sections">
            <div className="account-tab-panel">
              <Story />
            </div>
          </div>
        </div>
      </main>
    ),
  ],
}

/** Afiliación activa y credencial recién emitida: el momento con festejo. */
export const CredencialEmitida = {}

/**
 * Afiliación activa e inscripción confirmada, con el acuse ya visto en una
 * visita anterior: la sección se lee sin ceremonia, que es lo correcto a partir
 * de la segunda vez.
 */
export const CredencialConMeet = {
  args: {
    registrations: [
      {
        id: 'reg-story-1',
        event: 'Pitbull Classic 2026',
        eventSlug: 'pitbull-classic-2026',
        status: 'confirmada',
        requiresMembership: true,
      },
    ],
  },
}

/** Sin afiliación ni inscripción: la placa bloqueada, sin festejo posible. */
export const SinCredencial = {
  args: {
    athlete: { id: 'ath-story-2', fullName: 'Bruno Sosa', credentialToken: null, photoUrl: null },
    membership: null,
  },
}

// Fechas relativas: la story no "vence" cuando el evento queda en el pasado.
const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString()

const PASS_EVENTS = [
  {
    slug: 'pitbull-classic-2026',
    venue: 'La Troupé multieventos',
    location: 'Banfield, Buenos Aires',
  },
  { slug: 'barbell-submission-2027', venue: 'Virtus Fitness', location: 'Berazategui' },
]

/**
 * Tus accesos: el mismo QR, un veredicto por evento. Uno listo para entrar
 * (con "Cómo llegar"), otro con el pago pendiente y un tercero ya usado.
 */
export const AccesosPorEvento = {
  args: {
    athlete: {
      id: 'ath-story-3',
      fullName: 'Martina Rivas',
      credentialToken: 'PLU-ARG-2026-001',
      photoUrl: null,
    },
    events: PASS_EVENTS,
    registrations: [
      {
        id: 'reg-ready',
        event: 'Pitbull Classic',
        eventSlug: 'pitbull-classic-2026',
        eventStartsAt: inDays(40),
        status: 'confirmada',
        requiresMembership: false,
      },
      {
        id: 'reg-pending',
        event: 'Barbell Submission',
        eventSlug: 'barbell-submission-2027',
        eventStartsAt: inDays(120),
        status: 'pendiente_pago',
        requiresMembership: false,
      },
      {
        id: 'reg-used',
        event: 'Copa Apertura',
        eventSlug: 'copa-apertura',
        eventStartsAt: inDays(-30),
        status: 'confirmada',
        checkedInAt: inDays(-30),
      },
    ],
  },
}

/**
 * Solo una inscripción con pago pendiente: antes caía en "Activá tu
 * credencial" con un botón a la afiliación. Ahora dice que el QR se habilita
 * al acreditarse el pago y lleva a Pagos.
 */
export const PagoPendiente = {
  args: {
    athlete: {
      id: 'ath-story-4',
      fullName: 'Bruno Sosa',
      credentialToken: 'tok-4',
      photoUrl: null,
    },
    membership: null,
    events: PASS_EVENTS,
    registrations: [
      {
        id: 'reg-pending-only',
        event: 'Pitbull Classic',
        eventSlug: 'pitbull-classic-2026',
        eventStartsAt: inDays(40),
        status: 'pendiente_pago',
        requiresMembership: false,
      },
    ],
    onNavigateSection: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Pago pendiente')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /ver mis pagos/i }))
    await expect(args.onNavigateSection).toHaveBeenCalledWith('account-payments')
  },
}
