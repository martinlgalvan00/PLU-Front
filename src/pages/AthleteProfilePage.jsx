import { useState } from 'react'
import { UPCOMING_EVENTS } from '../lib/events.js'
import Reveal from '../components/ui/Reveal.jsx'
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
  onNavigate,
  onUpdateProfile,
  registrations,
  session,
}) {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB)

  if (!athlete) return null

  const storedMembership = memberships.find((item) => item.athleteId === athlete.id)
  const membership = storedMembership?.status === 'activa' ? storedMembership : undefined
  const athleteRegistrations = registrations.filter((item) => item.athleteId === athlete.id)
  const availableEvents = UPCOMING_EVENTS.filter((event) => event.status !== 'finalizado')
  const nextEvent = availableEvents[0]

  // Un solo tab visible a la vez — ver AccountNav.jsx. `onNavigateSection`
  // reemplaza al viejo scrollIntoView: los links internos ("Editar mis
  // datos", "Afiliarme para generar mi credencial") ahora cambian de tab
  // en vez de scrollear, porque las otras secciones ni siquiera están
  // montadas mientras no son la activa.
  const tabContent = {
    'account-qr': <QrCredentialSection athlete={athlete} membership={membership} onNavigateSection={setActiveTab} />,
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
      />
    ),
    'account-personal-data': <PersonalDataSection athlete={athlete} onUpdateProfile={onUpdateProfile} />,
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

      <AccountNav activeId={activeTab} onChange={setActiveTab} />

      <div className="account-sections">
        <div key={activeTab} className="account-tab-panel">
          {tabContent[activeTab]}
        </div>
      </div>
    </main>
  )
}
