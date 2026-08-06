import { useState } from 'react'
import '../styles/pages/account.css'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { isMembershipCurrent } from '../services/membershipService.js'
import Reveal from '../components/ui/Reveal.jsx'
import EmailVerificationBanner from '../components/ui/EmailVerificationBanner.jsx'
import AccountNav from './profile/AccountNav.jsx'
import ProfileHero from './profile/ProfileHero.jsx'
import QrCredentialSection from './profile/QrCredentialSection.jsx'
import UpcomingEventsSection from './profile/UpcomingEventsSection.jsx'
import HistorySection from './profile/HistorySection.jsx'
import MembershipPurchaseSection from './profile/MembershipPurchaseSection.jsx'
import PersonalDataSection from './profile/PersonalDataSection.jsx'
import SecuritySection from './profile/SecuritySection.jsx'

const DEFAULT_TAB = 'account-qr'

export default function AthleteProfilePage({
  athlete,
  memberships,
  onActivateMembership,
  onCancelMembership,
  onStartMembershipPayment,
  demoMode = false,
  onNavigate,
  onUpdateProfile,
  onUpdatePhoto,
  onRemovePhoto,
  registrations,
  session,
}) {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)

  if (!athlete) return null

  // La afiliación que cubre HOY, no la primera del array. El snapshot llega
  // ordenado por created_at desc, así que apenas el socio arrancaba una
  // renovación (fila nueva en pendiente_pago) `.find()` devolvía esa y el QR
  // desaparecía de la cuenta pese a tener la afiliación anterior vigente.
  const athleteMemberships = memberships.filter((item) => item.athleteId === athlete.id)
  const membership = athleteMemberships.find((item) => isMembershipCurrent(item))
  // Para la sección de pago sí interesa la más reciente: es la que el atleta
  // está por pagar o renovar.
  const storedMembership = membership ?? athleteMemberships[0]
  const athleteRegistrations = registrations.filter((item) => item.athleteId === athlete.id)
  const availableEvents = UPCOMING_EVENTS.filter((event) => event.status !== 'finalizado')
  const nextEvent = availableEvents[0]

  // Un solo tab visible a la vez — ver AccountNav.jsx. `onNavigateSection`
  // reemplaza al viejo scrollIntoView: los links internos ("Editar mis
  // datos", "Afiliarme para generar mi credencial") ahora cambian de tab
  // en vez de scrollear, porque las otras secciones ni siquiera están
  // montadas mientras no son la activa.
  const tabContent = {
    'account-qr': (
      <QrCredentialSection
        athlete={athlete}
        membership={membership}
        registrations={athleteRegistrations}
        onNavigateSection={setActiveTab}
      />
    ),
    'account-events': (
      <UpcomingEventsSection
        availableEvents={availableEvents}
        athleteRegistrations={athleteRegistrations}
        membership={membership}
        onNavigate={onNavigate}
      />
    ),
    'account-history': <HistorySection athleteRegistrations={athleteRegistrations} />,
    'account-membership': (
      <MembershipPurchaseSection
        athlete={athlete}
        membership={storedMembership}
        onActivateMembership={onActivateMembership}
        onCancelMembership={onCancelMembership}
        onStartMembershipPayment={onStartMembershipPayment}
        demoMode={demoMode}
      />
    ),
    'account-personal-data': (
      <PersonalDataSection
        athlete={athlete}
        onUpdateProfile={onUpdateProfile}
        onUpdatePhoto={onUpdatePhoto}
        onRemovePhoto={onRemovePhoto}
      />
    ),
    'account-security': <SecuritySection session={session} />,
  }

  return (
    <main className="page page--design account-page--design">
      <Reveal>
        <ProfileHero
          athlete={athlete}
          membership={membership}
          athleteRegistrations={athleteRegistrations}
          nextEvent={nextEvent}
          onNavigateSection={setActiveTab}
        />
      </Reveal>

      <EmailVerificationBanner athlete={athlete} />

      <AccountNav activeId={activeTab} onChange={setActiveTab} />

      <div className="account-sections">
        <div key={activeTab} className="account-tab-panel">
          {tabContent[activeTab]}
        </div>
      </div>
    </main>
  )
}
