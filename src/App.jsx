import { useState, useEffect, useCallback } from 'react'
import NavbarPublic from './components/layout/NavbarPublic.jsx'
import Footer from './components/layout/Footer.jsx'
import PageTransition from './components/layout/PageTransition.jsx'
import { useAppData } from './hooks/useAppData.js'
import { readCredentialParams } from './lib/credentialQr.js'
import { PRICING } from './lib/constants.js'
import { UPCOMING_EVENTS } from './lib/events.js'
import { getTransitionDirection } from './lib/navigation.js'
import { canCheckIn, canManageUsers, canViewAdmin, getRoleLabel } from './lib/roles.js'
import AdminPage from './pages/AdminPage.jsx'
import AthleteProfilePage from './pages/AthleteProfilePage.jsx'
import CommunityPage from './pages/CommunityPage.jsx'
import CredentialPage from './pages/CredentialPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import FAQPage from './pages/FAQPage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import MembersPage from './pages/MembersPage.jsx'
import PitbullPage from './pages/PitbullPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import RulebookPage from './pages/RulebookPage.jsx'

const PUBLIC_VIEWS = {
  home: HomePage,
  members: MembersPage,
  pitbull: PitbullPage,
  events: EventsPage,
  results: ResultsPage,
  rulebook: RulebookPage,
  community: CommunityPage,
  faq: FAQPage,
  contact: ContactPage,
  register: RegisterPage,
  login: LoginPage,
}

export default function App() {
  const [view, setView] = useState('home')
  const [transitionDirection, setTransitionDirection] = useState('forward')
  const [selectedEvent, setSelectedEvent] = useState(UPCOMING_EVENTS[0])
  const app = useAppData()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [view])

  useEffect(() => {
    if (import.meta.env.DEV) window.__pluNav = setView
  }, [])

  const navigate = useCallback(
    (nextView) => {
      // Lee la sesión vía ref (app.getSession()), no app.session: justo después de un
      // login, setSession todavía no se aplicó al render en curso y app.session
      // seguiría viendo el valor viejo dentro de este mismo handler síncrono.
      const currentRole = app.getSession()?.role
      const adminRequired = nextView === 'admin'
      const athleteRequired = ['profile', 'membership', 'competition'].includes(nextView)
      const blocked =
        (adminRequired && !canViewAdmin(currentRole)) ||
        (athleteRequired && currentRole !== 'athlete_plu')
      const resolvedView = blocked ? 'login' : nextView

      setTransitionDirection(getTransitionDirection(view, resolvedView))
      setView(resolvedView)
    },
    [app.getSession, view],
  )

  function selectEvent(event) {
    setSelectedEvent(event)
    navigate('competition')
  }

  // El QR de la card de inscripción/afiliación apunta a la home con este query
  // param — se resuelve antes que cualquier otra vista, sin necesitar login.
  const credential = readCredentialParams()
  if (credential) {
    return (
      <CredentialPage
        code={credential.code}
        eventSlug={credential.eventSlug}
        type={credential.type}
        athletes={app.athletes}
        memberships={app.memberships}
        registrations={app.registrations}
        onCheckIn={app.checkInTicketAction}
      />
    )
  }

  if (view === 'admin' && canViewAdmin(app.session?.role)) {
    return (
      <AdminPage
        canCheckIn={canCheckIn(app.session?.role)}
        canEdit={app.userCanEdit}
        canManageUsers={canManageUsers(app.session?.role)}
        dashboardOverview={app.dashboardOverview}
        adminEvents={app.adminEvents}
        filters={app.filters}
        filteredRegistrations={app.filteredRegistrations}
        enrichedMemberships={app.enrichedMemberships}
        pendingActions={app.pendingActions}
        adminNavBadges={app.adminNavBadges}
        recentActivity={app.recentActivity}
        getAthleteDetail={app.getAthleteDetail}
        onApprovePayment={app.handleApprovePayment}
        onCheckInRegistration={app.checkInRegistrationAction}
        onCheckInTicket={app.checkInTicketAction}
        onRefreshTickets={app.refreshTickets}
        onCreateUser={app.createUserAction}
        onExportAdmin={app.exportAdminCsv}
        onExportPluUsa={app.exportPluUsaCsv}
        onSaveEvent={app.saveAdminEvent}
        onSetFilters={app.setFilters}
        onUpdateUserRole={app.updateUserRoleAction}
        payments={app.payments}
        athletes={app.athletes}
        registrations={app.registrations}
        tickets={app.tickets}
        users={app.users}
        roleLabel={getRoleLabel(app.session?.role)}
        onExit={() => navigate('home')}
      />
    )
  }

  const Page = PUBLIC_VIEWS[view] || HomePage

  const pageProps =
    view === 'register'
      ? {
          createdOrder: app.createdOrder,
          form: app.form,
          onApprovePayment: app.handleApprovePayment,
          flow: 'profile',
          onNavigate: navigate,
          onSubmit: app.registerAthlete,
          onUpdateForm: app.updateForm,
          total: 0,
        }
      : view === 'login'
        ? { onNavigate: navigate, onLogin: app.login }
        : view === 'events'
          ? { onNavigate: navigate, onSelectEvent: selectEvent, events: app.adminEvents }
        : view === 'home'
          ? { onNavigate: navigate, onSelectEvent: selectEvent }
        : view === 'pitbull'
          ? {
              onNavigate: navigate,
              events: app.adminEvents,
              tickets: app.tickets,
              createdOrder: app.createdOrder,
              onSubmitTicketPurchase: app.submitTicketPurchase,
              onApproveTicketPurchase: app.approveTicketPurchase,
            }
        : view === 'results'
          ? { onNavigate: navigate, events: app.adminEvents }
        : view === 'members'
          ? { onNavigate: navigate, session: app.session }
        : { onNavigate: navigate }

  if (view === 'profile' && app.session?.role === 'athlete_plu') {
    return (
      <PrivateLayout
        app={app}
        view={view}
        navigate={navigate}
        transitionDirection={transitionDirection}
      >
        <AthleteProfilePage
          athlete={app.athletes.find((item) => item.id === app.session.athleteId)}
          memberships={app.memberships}
          onNavigate={navigate}
          onUpdateProfile={app.updateAthleteProfileAction}
          registrations={app.registrations}
          session={app.session}
        />
      </PrivateLayout>
    )
  }

  if (['membership', 'competition'].includes(view) && app.session?.role === 'athlete_plu') {
    const athlete = app.athletes.find((item) => item.id === app.session.athleteId)
    const flow = view
    return (
      <PrivateLayout
        app={app}
        view={view}
        navigate={navigate}
        transitionDirection={transitionDirection}
      >
        <RegisterPage
          athlete={athlete}
          createdOrder={app.createdOrder}
          event={selectedEvent}
          flow={flow}
          form={app.form}
          memberships={app.memberships}
          onApprovePayment={app.handleApprovePayment}
          onSubmit={flow === 'membership' ? app.submitMembership : app.submitCompetition}
          onUpdateForm={app.updateForm}
          total={flow === 'membership' ? PRICING.membership : PRICING.event}
        />
      </PrivateLayout>
    )
  }

  return (
    <div className="app-shell">
      <NavbarPublic activeView={view} onLogout={app.logout} onNavigate={navigate} session={app.session} />
      <PageTransition viewKey={view} direction={transitionDirection}>
        <Page {...pageProps} />
      </PageTransition>
      {view !== 'login' && <Footer onNavigate={navigate} />}
    </div>
  )
}

function PrivateLayout({ app, children, navigate, view, transitionDirection }) {
  return (
    <div className="app-shell">
      <NavbarPublic
        activeView={view}
        onLogout={() => {
          app.logout()
          navigate('home')
        }}
        onNavigate={navigate}
        session={app.session}
      />
      <PageTransition viewKey={view} direction={transitionDirection}>
        {children}
      </PageTransition>
      <Footer onNavigate={navigate} />
    </div>
  )
}
