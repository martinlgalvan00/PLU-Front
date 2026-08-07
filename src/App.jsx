import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import NavbarPublic from './components/layout/NavbarPublic.jsx'
import Footer from './components/layout/Footer.jsx'
import PageTransition from './components/layout/PageTransition.jsx'
import PageLoadFallback from './components/ui/PageLoadFallback.jsx'
import { useAppData } from './hooks/useAppData.js'
import { readCredentialParams } from './lib/credentialQr.js'
import {
  clearEventPageRoute,
  matchEventPageRoute,
  pushEventPageRoute,
} from './lib/eventPageRoute.js'
import { readPasswordResetToken } from './lib/passwordResetRoute.js'
import { matchSecurityGateRoute } from './lib/securityGateRoute.js'
import EmailVerificationNotice from './components/ui/EmailVerificationNotice.jsx'
import {
  clearTicketsRoute,
  getTicketsRouteEventSlug,
  matchTicketsRoute,
  pushTicketsRoute,
} from './lib/ticketsRoute.js'
import { PRICING } from './lib/constants.js'
import { getNextUpcomingEvent } from './lib/eventNavigation.js'
import { UPCOMING_EVENTS } from './lib/events.js'
import { getTransitionDirection } from './lib/navigation.js'
import {
  canCheckIn,
  canManageUsers,
  canViewAdmin,
  getRoleLabel,
  isCheckinOnly,
  isPluUsaPartner,
} from './lib/roles.js'
import { getAllowedAdminSections } from './lib/permissions.js'
import HomePage from './pages/HomePage.jsx'

const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const CheckInAppPage = lazy(() => import('./pages/CheckInAppPage.jsx'))
const SecurityGatePage = lazy(() => import('./pages/SecurityGatePage.jsx'))
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
const ResourcesPage = lazy(() => import('./pages/ResourcesPage.jsx'))
const ResultsPage = lazy(() => import('./pages/ResultsPage.jsx'))
const RulebookPage = lazy(() => import('./pages/RulebookPage.jsx'))
const ShopPage = lazy(() => import('./pages/ShopPage.jsx'))
const TicketsPage = lazy(() => import('./pages/TicketsPage.jsx'))

const PUBLIC_VIEWS = {
  home: HomePage,
  members: MembersPage,
  pitbull: PitbullPage,
  events: EventsPage,
  results: ResultsPage,
  records: RecordsPage,
  resources: ResourcesPage,
  rulebook: RulebookPage,
  community: CommunityPage,
  faq: FAQPage,
  contact: ContactPage,
  shop: ShopPage,
  tickets: TicketsPage,
  register: RegisterPage,
  login: LoginPage,
}

export default function App() {
  const [view, setView] = useState(() => {
    if (readPasswordResetToken()) return 'login'
    if (matchTicketsRoute()) return 'tickets'
    if (matchEventPageRoute()) return 'events'
    return 'home'
  })
  const [transitionDirection, setTransitionDirection] = useState('forward')
  const [selectedEvent, setSelectedEvent] = useState(UPCOMING_EVENTS[0])
  const [ticketEventSlug, setTicketEventSlug] = useState(() =>
    matchTicketsRoute() ? getTicketsRouteEventSlug() : null,
  )
  const [eventPageSlug, setEventPageSlug] = useState(() =>
    matchTicketsRoute() ? null : (matchEventPageRoute()?.eventSlug ?? null),
  )
  const app = useAppData()
  const publicEvents = app.adminEvents.filter((event) => event.published !== false)
  const nextEvent = getNextUpcomingEvent(publicEvents) ?? UPCOMING_EVENTS[0]

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [view])

  useEffect(() => {
    if (import.meta.env.DEV) window.__pluNav = setView
  }, [])

  useEffect(() => {
    function onPopState() {
      if (matchTicketsRoute()) {
        setTicketEventSlug(getTicketsRouteEventSlug())
        setView('tickets')
        return
      }
      const eventPageMatch = matchEventPageRoute()
      if (eventPageMatch) {
        setEventPageSlug(eventPageMatch.eventSlug)
        setView('events')
        return
      }
      setView((current) => {
        if (current === 'tickets') return 'pitbull'
        if (current === 'events') return 'home'
        return current
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback(
    (nextView, options = {}) => {
      const currentSession = app.getSession()
      const currentRole = currentSession?.role
      const adminRequired = nextView === 'admin'
      const athleteRequired = ['profile', 'membership', 'competition'].includes(nextView)
      const blocked =
        (adminRequired && !canViewAdmin(currentSession)) ||
        (athleteRequired && currentRole !== 'athlete_plu')
      const resolvedView = blocked ? 'login' : nextView

      if (resolvedView === 'tickets') {
        pushTicketsRoute(options.eventSlug)
        setTicketEventSlug(options.eventSlug ?? null)
      } else if (view === 'tickets') {
        clearTicketsRoute()
      }

      if (resolvedView === 'events' && options.eventSlug) {
        pushEventPageRoute(options.eventSlug)
        setEventPageSlug(options.eventSlug)
      } else if (view === 'events' && resolvedView !== 'events') {
        clearEventPageRoute()
        setEventPageSlug(null)
      }

      // openTickets en pitbull: ir a la página completa de entradas
      if (resolvedView === 'pitbull' && options.openTickets) {
        pushTicketsRoute(options.eventSlug)
        setTicketEventSlug(options.eventSlug ?? null)
        setTransitionDirection(getTransitionDirection(view, 'tickets'))
        setView('tickets')
        return
      }

      setTransitionDirection(getTransitionDirection(view, resolvedView))
      setView(resolvedView)
    },
    [app.getSession, view],
  )

  function selectEvent(event) {
    setSelectedEvent(event)
    navigate('competition')
  }

  async function exitSecurityRoute() {
    window.history.pushState({}, '', '/')

    if (app.session?.eventId || app.session?.eventSlug) {
      await app.logout()
      setView('home')
      return
    }

    setView(canViewAdmin(app.session) ? 'admin' : 'home')
  }

  const securityRoute = matchSecurityGateRoute()
  if (securityRoute) {
    return (
      <Suspense fallback={<PageLoadFallback />}>
        <SecurityGatePage
          adminEvents={app.adminEvents}
          athletes={app.athletes}
          eventSlug={securityRoute.eventSlug}
          onCheckInRegistration={app.checkInRegistrationAction}
          onCheckInTicket={app.checkInTicketAction}
          onExit={exitSecurityRoute}
          onLogin={app.login}
          onLoginWithToken={app.loginWithGateToken}
          onRedeemTicketAddon={app.redeemTicketAddonAction}
          onRefreshTickets={app.refreshTickets}
          registrations={app.registrations}
          session={app.session}
          tickets={app.tickets}
        />
      </Suspense>
    )
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

  if (view === 'admin' && canViewAdmin(app.session)) {
    if (isCheckinOnly(app.session)) {
      return (
        <Suspense fallback={<PageLoadFallback />}>
          <CheckInAppPage
            athletes={app.athletes}
            canCheckIn={canCheckIn(app.session)}
            onCheckInRegistration={app.checkInRegistrationAction}
            onCheckInTicket={app.checkInTicketAction}
            onExit={() => navigate('home')}
            onRedeemTicketAddon={app.redeemTicketAddonAction}
            onRefreshTickets={app.refreshTickets}
            registrations={app.registrations}
            roleLabel={getRoleLabel(app.session)}
            tickets={app.tickets}
          />
        </Suspense>
      )
    }

    return (
      <Suspense fallback={<PageLoadFallback />}>
        <AdminPage
          canCheckIn={canCheckIn(app.session)}
          authorization={app.session}
          allowedSections={getAllowedAdminSections(app.session)}
          canManageUsers={canManageUsers(app.session)}
          dashboardOverview={app.dashboardOverview}
          adminEvents={app.adminEvents}
          adminEventsLoading={app.adminEventsLoading}
          adminEventsError={app.adminEventsError}
          filters={app.filters}
          filteredRegistrations={app.filteredRegistrations}
          enrichedMemberships={app.enrichedMemberships}
          pendingActions={app.pendingActions}
          adminNavBadges={app.adminNavBadges}
          getAthleteDetail={app.getAthleteDetail}
          onApprovePayment={app.handleApprovePayment}
          onSetMembershipStatus={app.setMembershipStatusAction}
          onApproveTicketPurchase={app.approveTicketPurchase}
          onCheckInRegistration={app.checkInRegistrationAction}
          onCheckInTicket={app.checkInTicketAction}
          onRedeemTicketAddon={app.redeemTicketAddonAction}
          onRefreshTickets={app.refreshTickets}
          onRefreshPendingTicketOrders={app.refreshPendingTicketOrders}
          onRefreshAdminEvents={app.refreshAdminEvents}
          onCreateSecurityUser={app.createSecurityUserAction}
          onCreateSecurityUsersBulk={app.createSecurityUsersBulkAction}
          onCreateSecurityAccessLink={app.createSecurityAccessLinkAction}
          onDeactivateAllSecurityUsers={app.deactivateAllSecurityUsersAction}
          onListSecurityUsers={app.listSecurityUsersForEventAction}
          onUpdateSecurityUserStatus={app.updateSecurityUserStatusAction}
          onCreateUser={app.createUserAction}
          onCreateRole={app.createAccessRoleAction}
          onDeleteShopProduct={app.deleteShopProductAction}
          onExportAdmin={app.exportAdminCsv}
          onExportPluUsa={app.exportPluUsaCsv}
          onSaveEvent={app.saveAdminEvent}
          onSetEventState={app.setAdminEventState}
          onSaveShopProduct={app.saveShopProduct}
          onScheduleAssigned={app.handleScheduleAssigned}
          onSetFilters={app.setFilters}
          onUpdateUserRole={app.updateUserRoleAction}
          onUpdateUserStatus={app.updateUserStatusAction}
          onUpdateRolePermissions={app.updateAccessRolePermissionsAction}
          payments={app.payments}
          pendingTicketOrders={app.pendingTicketOrders}
          pendingTicketOrdersLoading={app.pendingTicketOrdersLoading}
          pendingTicketOrdersError={app.pendingTicketOrdersError}
          athletes={app.athletes}
          registrations={app.registrations}
          shopProducts={app.shopProducts}
          tickets={app.tickets}
          users={app.users}
          accessRoles={app.accessRoles}
          roleActivity={app.roleActivity}
          permissionCatalog={app.permissionCatalog}
          roleLabel={getRoleLabel(app.session)}
          isPluUsaPartner={isPluUsaPartner(app.session)}
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
          ? {
              onNavigate: navigate,
              onSelectEvent: selectEvent,
              events: publicEvents,
              initialEventSlug: eventPageSlug,
              session: app.session,
            }
          : view === 'home'
            ? {
                onNavigate: navigate,
                onSelectEvent: selectEvent,
                events: publicEvents,
                session: app.session,
                memberships: app.memberships,
              }
            : view === 'pitbull'
              ? {
                  onNavigate: navigate,
                  events: publicEvents,
                }
              : view === 'shop'
                ? { onNavigate: navigate, events: publicEvents, products: app.shopProducts }
                : view === 'tickets'
                  ? {
                      onNavigate: navigate,
                      event: nextEvent,
                      events: publicEvents,
                      initialEventSlug: ticketEventSlug,
                      tickets: app.tickets,
                      createdOrder: app.createdOrder,
                      onSubmitTicketPurchase: app.submitTicketPurchase,
                      onUploadPaymentProof: app.uploadTicketPaymentProofAction,
                    }
                  : view === 'results'
                    ? { onNavigate: navigate, events: publicEvents }
                    : view === 'members'
                      ? { memberships: app.memberships, onNavigate: navigate, session: app.session }
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
            // Faltaban los dos. Sin `onNavigate`, la confirmación de afiliación
            // se quedaba sin su CTA ("Ir a mi perfil") y sin la barra para
            // volver a planes: el atleta terminaba de pagar y la pantalla no
            // ofrecía a dónde seguir. Sin `registrations`, la credencial del
            // torneo no podía saber si la inscripción ya habilita el ingreso.
            onNavigate={navigate}
            onSubmit={flow === 'membership' ? app.submitMembership : app.submitCompetition}
            onUpdateForm={app.updateForm}
            registrations={app.registrations}
            // El precio de la inscripción sale del evento: la RPC cobra
            // `events.price`, así que la constante fija mostraba un total que no
            // era el que se iba a cobrar apenas el panel tocaba el precio.
            total={flow === 'membership' ? PRICING.membership : (selectedEvent?.price ?? PRICING.event)}
          />
        </Suspense>
      </PrivateLayout>
    )
  }

  return (
    <div className="app-shell">
      {/* Resuelve el deep link /?verificar=<token> del email de confirmación.
          Se monta acá, fuera de PageTransition, para que el aviso no se pierda
          al cambiar de vista. */}
      <EmailVerificationNotice />
      <NavbarPublic
        activeView={view}
        latestEvent={nextEvent}
        onLogout={app.logout}
        onNavigate={navigate}
        session={app.session}
      />
      <PageTransition
        viewKey={view}
        direction={transitionDirection}
        id="main-content"
        tabIndex={-1}
      >
        <Suspense fallback={<PageLoadFallback />}>
          <Page {...pageProps} />
        </Suspense>
      </PageTransition>
      {!['login', 'register'].includes(view) && <Footer onNavigate={navigate} />}
    </div>
  )
}

function PrivateLayout({ app, children, navigate, view, transitionDirection }) {
  return (
    <div className="app-shell">
      <NavbarPublic
        activeView={view}
        latestEvent={
          getNextUpcomingEvent(app.adminEvents.filter((event) => event.published !== false)) ??
          UPCOMING_EVENTS[0]
        }
        onLogout={() => {
          app.logout()
          navigate('home')
        }}
        onNavigate={navigate}
        session={app.session}
      />
      <PageTransition
        viewKey={view}
        direction={transitionDirection}
        id="main-content"
        tabIndex={-1}
      >
        <Suspense fallback={<PageLoadFallback />}>{children}</Suspense>
      </PageTransition>
      <Footer onNavigate={navigate} />
    </div>
  )
}
