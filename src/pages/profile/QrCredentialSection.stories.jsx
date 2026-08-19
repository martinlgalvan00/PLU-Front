// `account.css` está acotado a la ruta del perfil (lo importa
// AthleteProfilePage, no el entry global): sin este import la story mostraba la
// sección sin grilla ni estilos de la vista de escaneo, igual que las stories
// hermanas de PersonalData y Security.
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
