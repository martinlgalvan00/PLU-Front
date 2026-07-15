import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import NavbarPublic from './components/layout/NavbarPublic.jsx'
import Footer from './components/layout/Footer.jsx'
import PageTransition from './components/layout/PageTransition.jsx'
import PageLoadFallback from './components/ui/PageLoadFallback.jsx'
import { useAppData } from './hooks/useAppData.js'
import { readCredentialParams } from './lib/credentialQr.js'
import { PRICING } from './lib/constants.js'
import { getNextUpcomingEvent } from './lib/eventNavigation.js'
import { UPCOMING_EVENTS } from './lib/events.js'
import { getTransitionDirection } from './lib/navigation.js'
import { canCheckIn, canManageUsers, canViewAdmin, getRoleLabel, isCheckinOnly, isPluUsaPartner } from './lib/roles.js'
import HomePage from './pages/HomePage.jsx'

const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const CheckInAppPage = lazy(() => import('./pages/CheckInAppPage.jsx'))
const AthleteProfilePage = lazy(() => import('./pages/AthleteProfilePage.jsx'))
const CommunityPage = lazy(() => import('./pages/CommunityPage.jsx'))
const CredentialPage = lazy(() => import('./pages/CredentialPage.jsx'))
const ContactPage = lazy(() => import('./pages/ContactPage.jsx'))
const EventsPage = lazy(() => import('./pages/EventsPage.jsx'))
const FAQPage = lazy(() => import('./pages/FAQPage.jsx'))
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'))
const MembersPage = lazy(() => import('./pages/MembersPage.jsx'))
const PitbullPage = lazy(() => import('./pages/PitbullPage.jsx'))
const RecordsPage = lazy(() => import('./pages/RecordsPage.jsx'))
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'))
const ResultsPage = lazy(() => import('./pages/ResultsPage.jsx'))
const RulebookPage = lazy(() => import('./pages/RulebookPage.jsx'))
const TicketsPage = lazy(() => import('./pages/TicketsPage.jsx'))

const PUBLIC_VIEWS = {
  home: HomePage,
  members: MembersPage,
  pitbull: PitbullPage,
  events: EventsPage,
  results: ResultsPage,
  records: RecordsPage,
  rulebook: RulebookPage,
  community: CommunityPage,
  faq: FAQPage,
  contact: ContactPage,
  tickets: TicketsPage,
  register: RegisterPage,
  login: LoginPage,
}

export default function App() {
  const [view, setView] = useState('home')
  const [transitionDirection, setTransitionDirection] = useState('forward')
  const [selectedEvent, setSelectedEvent] = useState(UPCOMING_EVENTS[0])
  const app = useAppData()
  const publicEvents = app.adminEvents.filter((event) => event.published !== false)
  const nextEvent = getNextUpcomingEvent(publicEvents) ?? UPCOMING_EVENTS[0]

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [view])

  useEffect(() => {
    if (import.meta.env.DEV) window.__pluNav = setView
  }, [])

  const navigate = useCallback(
    (nextView) => {
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

  const credential = readCredentialParams()
  if (credential) {
    return (
      <Suspense fallback={<PageLoadFallback />}>
        <CredentialPage
          code={credential.code}
          eventSlug={credential.eventSlug}
          type={credential.type}
          onCheckIn={app.checkInTicketAction}
          onCheckInRegistration={app.checkInRegistrationAction}
        />
      </Suspense>
    )
  }

  if (view === 'admin' && canViewAdmin(app.session?.role)) {
    if (isCheckinOnly(app.session?.role)) {
      return (
        <Suspense fallback={<PageLoadFallback />}>
          <CheckInAppPage
            athletes={app.athletes}
            canCheckIn={canCheckIn(app.session?.role)}
            onCheckInRegistration={app.checkInRegistrationAction}
            onCheckInTicket={app.checkInTicketAction}
            onExit={() => navigate('home')}
            onRedeemTicketAddon={app.redeemTicketAddonAction}
            onRefreshTickets={app.refreshTickets}
            registrations={app.registrations}
            roleLabel={getRoleLabel(app.session?.role)}
            tickets={app.tickets}
          />
        </Suspense>
      )
    }

    return (
      <Suspense fallback={<PageLoadFallback />}>
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
          onApproveTicketPurchase={app.approveTicketPurchase}
          onCheckInRegistration={app.checkInRegistrationAction}
          onCheckInTicket={app.checkInTicketAction}
          onRedeemTicketAddon={app.redeemTicketAddonAction}
          onRefreshTickets={app.refreshTickets}
          onRefreshPendingTicketOrders={app.refreshPendingTicketOrders}
          onCreateUser={app.createUserAction}
          onExportAdmin={app.exportAdminCsv}
          onExportPluUsa={app.exportPluUsaCsv}
          onSaveEvent={app.saveAdminEvent}
          onSetFilters={app.setFilters}
          onUpdateUserRole={app.updateUserRoleAction}
          payments={app.payments}
          pendingTicketOrders={app.pendingTicketOrders}
          pendingTicketOrdersLoading={app.pendingTicketOrdersLoading}
          pendingTicketOrdersError={app.pendingTicketOrdersError}
          athletes={app.athletes}
          registrations={app.registrations}
          tickets={app.tickets}
          users={app.users}
          roleLabel={getRoleLabel(app.session?.role)}
          isPluUsaPartner={isPluUsaPartner(app.session?.role)}
          isCheckinOnly={false}
          onExit={() => navigate('home')}
        />
      </Suspense>
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
          ? { onNavigate: navigate, onSelectEvent: selectEvent, events: publicEvents, session: app.session }
          : view === 'home'
            ? { onNavigate: navigate, onSelectEvent: selectEvent }
            : view === 'pitbull'
              ? {
                  onNavigate: navigate,
                  events: publicEvents,
                  tickets: app.tickets,
                  createdOrder: app.createdOrder,
                  onSubmitTicketPurchase: app.submitTicketPurchase,
                  onApproveTicketPurchase: app.approveTicketPurchase,
                  onUploadPaymentProof: app.uploadTicketPaymentProofAction,
                }
              : view === 'results'
                ? { onNavigate: navigate, events: publicEvents }
              : view === 'members'
                ? { memberships: app.memberships, onNavigate: navigate, session: app.session }
                : view === 'tickets'
                  ? {
                      event: nextEvent,
                      events: publicEvents,
                      tickets: app.tickets,
                      createdOrder: app.createdOrder,
                      onNavigate: navigate,
                      onSubmitTicketPurchase: app.submitTicketPurchase,
                      onUploadPaymentProof: app.uploadTicketPaymentProofAction,
                    }
                  : { onNavigate: navigate }

  if (view === 'profile' && app.session?.role === 'athlete_plu') {
    return (
      <PrivateLayout
        app={app}
        view={view}
        navigate={navigate}
        transitionDirection={transitionDirection}
      >
        <Suspense fallback={<PageLoadFallback />}>
          <AthleteProfilePage
            athlete={app.athletes.find((item) => item.id === app.session.athleteId)}
            memberships={app.memberships}
            onActivateMembership={app.activateDemoMembership}
            onCancelMembership={app.cancelDemoMembership}
            onStartMembershipPayment={app.startMembershipPayment}
            demoMode={app.demoMode}
            onNavigate={navigate}
            onUpdateProfile={app.updateAthleteProfileAction}
            onUpdatePhoto={app.updateAthletePhotoAction}
            onRemovePhoto={app.removeAthletePhotoAction}
            registrations={app.registrations}
            session={app.session}
          />
        </Suspense>
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
        <Suspense fallback={<PageLoadFallback />}>
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
        </Suspense>
      </PrivateLayout>
    )
  }

  return (
    <div className="app-shell">
      <NavbarPublic activeView={view} latestEvent={nextEvent} onLogout={app.logout} onNavigate={navigate} session={app.session} />
      <PageTransition viewKey={view} direction={transitionDirection}>
        <Suspense fallback={<PageLoadFallback />}>
          <Page {...pageProps} />
        </Suspense>
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
        latestEvent={getNextUpcomingEvent(app.adminEvents.filter((event) => event.published !== false)) ?? UPCOMING_EVENTS[0]}
        onLogout={() => {
          app.logout()
          navigate('home')
        }}
        onNavigate={navigate}
        session={app.session}
      />
      <PageTransition viewKey={view} direction={transitionDirection}>
        <Suspense fallback={<PageLoadFallback />}>{children}</Suspense>
      </PageTransition>
      <Footer onNavigate={navigate} />
    </div>
  )
}
