import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react'
import NavbarPublic from './components/layout/NavbarPublic.jsx'
import Footer from './components/layout/Footer.jsx'
import AnalyticsTracker from './components/layout/AnalyticsTracker.jsx'
import DocumentMetaSync from './components/layout/DocumentMetaSync.jsx'
import PageTransition from './components/layout/PageTransition.jsx'
import PageErrorBoundary from './components/layout/PageErrorBoundary.jsx'
import PageLoadFallback from './components/ui/PageLoadFallback.jsx'
import HelpLayer from './components/ui/HelpLayer.jsx'
import { useAppData } from './hooks/useAppData.js'
import { readCredentialParams } from './lib/credentialQr.js'
import {
  clearEventPageRoute,
  matchEventPageRoute,
  pushEventPageRoute,
} from './lib/eventPageRoute.js'
import { isCanonicalPathname, resolvePathnamePublicView } from './lib/canonicalPaths.js'
import {
  buildPublicViewPath,
  clearPublicViewPath,
  matchPublicViewPath,
  pushPublicViewPath,
} from './lib/publicViewPaths.js'
import { readPasswordResetToken } from './lib/passwordResetRoute.js'
import { matchSecurityGateRoute } from './lib/securityGateRoute.js'
import {
  clearStaffEmailChangeToken,
  readStaffEmailChangeToken,
} from './lib/staffEmailChangeRoute.js'
import { clearStaffInvitationToken, readStaffInvitationToken } from './lib/staffInvitationRoute.js'
import EmailVerificationNotice from './components/ui/EmailVerificationNotice.jsx'
import SessionNotice from './components/ui/SessionNotice.jsx'
import PaymentsMockBanner from './components/ui/PaymentsMockBanner.jsx'
import {
  clearTicketsRoute,
  getTicketsRouteEventSlug,
  matchTicketsRoute,
  pushTicketsRoute,
} from './lib/ticketsRoute.js'
import { resolveEventPricing } from './lib/eventPricing.js'
import {
  getFeaturedEvent,
  getNextUpcomingEvent,
  getPublicCatalogEvents,
} from './lib/eventNavigation.js'
import { UPCOMING_EVENTS } from './lib/events.js'
import { reconcileMercadoPagoReturn } from './services/paymentService.js'
import {
  ACCOUNT_EVENTS_TAB,
  ACCOUNT_MEMBERSHIP_TAB,
  DEFAULT_ACCOUNT_TAB,
  getTransitionDirection,
  resolveAfterLoginDestination,
  resolveMembershipCheckout,
} from './lib/navigation.js'
import {
  canCheckIn,
  canDeleteAthletes,
  canDeleteEvents,
  canDeleteMemberships,
  canDeleteRegistrations,
  canDeleteUsers,
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
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'))
const PitbullPage = lazy(() => import('./pages/PitbullPage.jsx'))
const RecordsPage = lazy(() => import('./pages/RecordsPage.jsx'))
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'))
const ResourcesPage = lazy(() => import('./pages/ResourcesPage.jsx'))
const ResultsPage = lazy(() => import('./pages/ResultsPage.jsx'))
const RulebookPage = lazy(() => import('./pages/RulebookPage.jsx'))
const ShopPage = lazy(() => import('./pages/ShopPage.jsx'))
const SponsorsPage = lazy(() => import('./pages/SponsorsPage.jsx'))
const StaffEmailChangePage = lazy(() => import('./pages/StaffEmailChangePage.jsx'))
const StaffInvitationPage = lazy(() => import('./pages/StaffInvitationPage.jsx'))
const StaffPasswordChangePage = lazy(() => import('./pages/StaffPasswordChangePage.jsx'))
const StandardsPage = lazy(() => import('./pages/StandardsPage.jsx'))
const TeamPage = lazy(() => import('./pages/TeamPage.jsx'))
const TicketsPage = lazy(() => import('./pages/TicketsPage.jsx'))

const PUBLIC_VIEWS = {
  home: HomePage,
  notFound: NotFoundPage,
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
  team: TeamPage,
  sponsors: SponsorsPage,
  standards: StandardsPage,
  register: RegisterPage,
  login: LoginPage,
}

export default function App() {
  const [view, setView] = useState(() => {
    if (readPasswordResetToken()) return 'login'
    return resolvePathnamePublicView()
  })
  const [transitionDirection, setTransitionDirection] = useState('forward')
  const [selectedEvent, setSelectedEvent] = useState(UPCOMING_EVENTS[0])
  const [pendingAthleteDestination, setPendingAthleteDestination] = useState(null)
  const [profileTab, setProfileTab] = useState(DEFAULT_ACCOUNT_TAB)
  const [profileTabNonce, setProfileTabNonce] = useState(0)
  const [ticketEventSlug, setTicketEventSlug] = useState(() =>
    matchTicketsRoute() ? getTicketsRouteEventSlug() : null,
  )
  const [eventPageSlug, setEventPageSlug] = useState(() =>
    matchTicketsRoute() ? null : (matchEventPageRoute()?.eventSlug ?? null),
  )
  const paymentReturnInFlightRef = useRef(null)
  const app = useAppData()
  const getSession = app.getSession
  const publicEvents = getPublicCatalogEvents(
    app.adminEvents.filter((event) => event.published !== false),
    { includeDevelopmentStubs: false },
  )
  const nextEvent = getNextUpcomingEvent(publicEvents) ?? UPCOMING_EVENTS[0]
  const featuredEvent = getFeaturedEvent(publicEvents) ?? UPCOMING_EVENTS[0]

  useEffect(() => {
    setSelectedEvent((current) => {
      const canonical = app.adminEvents.find((event) => event.slug === current?.slug)
      return canonical && canonical !== current ? canonical : current
    })
  }, [app.adminEvents])

  useEffect(() => {
    // Sin behavior explícito: hereda `scroll-behavior` de CSS, que ya
    // respeta prefers-reduced-motion.
    window.scrollTo({ top: 0 })
  }, [view])

  useEffect(() => {
    if (import.meta.env.DEV) window.__pluNav = setView
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paymentReturn = params.get('payment')
    if (!['success', 'pending'].includes(paymentReturn ?? '')) return

    const orderId = params.get('order') || params.get('external_reference')
    if (!orderId) return

    const paymentId =
      params.get('payment_id') || params.get('collection_id') || params.get('data.id')
    const preferenceId = params.get('preference_id')
    const status = params.get('status') || params.get('collection_status') || paymentReturn
    const key = [orderId, paymentId, status].filter(Boolean).join(':')
    if (!key || paymentReturnInFlightRef.current === key) return
    if (window.sessionStorage?.getItem(`plu:mp-return:${key}`)) return

    paymentReturnInFlightRef.current = key
    const createdOrderMatches =
      app.createdOrder?.paymentId === orderId ||
      app.createdOrder?.orderId === orderId ||
      app.createdOrder?.id === orderId

    void reconcileMercadoPagoReturn({
      paymentOrderId: orderId,
      orderAccessToken: createdOrderMatches ? app.createdOrder?.orderAccessToken : undefined,
      paymentId,
      collectionId: params.get('collection_id'),
      preferenceId,
      status,
    })
      .then((result) => {
        if (result?.reconciled) {
          const orderConcept = result.order?.concept ?? result.order?.payment_order?.concept ?? null
          const targetProfileTab = ['registration', 'combo'].includes(orderConcept)
            ? ACCOUNT_EVENTS_TAB
            : DEFAULT_ACCOUNT_TAB
          window.dispatchEvent(
            new CustomEvent('plu:payment-updated', {
              detail: {
                orderId,
                status: result.order?.status ?? result.payment?.status ?? status,
              },
            }),
          )
          window.history.replaceState({ view: 'profile' }, '', '/perfil')
          setProfileTab(targetProfileTab)
          setProfileTabNonce((current) => current + 1)
          setTransitionDirection(getTransitionDirection(view, 'profile'))
          setView('profile')
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.info('[mp-return] conciliacion pendiente', error)
      })
      .finally(() => {
        window.sessionStorage?.setItem(`plu:mp-return:${key}`, '1')
        paymentReturnInFlightRef.current = null
      })
  }, [app.createdOrder, view])

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
      if (!isCanonicalPathname()) {
        setView('notFound')
        return
      }
      const publicView = matchPublicViewPath()
      if (publicView) {
        setEventPageSlug(null)
        setView(publicView)
        return
      }
      setView((current) => {
        if (current === 'tickets') return 'pitbull'
        if (current === 'events') return 'home'
        if (current === 'notFound') return 'home'
        if (matchPublicViewPath() == null && buildPublicViewPath(current)) return 'home'
        return current
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback(
    (nextView, options = {}) => {
      const currentSession = getSession()
      const currentRole = currentSession?.role
      const afterLogin = resolveAfterLoginDestination(
        nextView,
        currentRole,
        pendingAthleteDestination,
      )
      const requestedView = afterLogin.view
      const requestedOptions = afterLogin.view === nextView ? options : afterLogin.options
      const resumedAthleteDestination = requestedView !== nextView
      const adminRequired = requestedView === 'admin'
      const athleteRequired = ['profile', 'membership', 'competition'].includes(requestedView)
      const blocked =
        (adminRequired && !canViewAdmin(currentSession)) ||
        (athleteRequired && currentRole !== 'athlete_plu')
      // El pending de login sigue siendo `membership` para no perder la
      // intención. Recién acá se traduce al tab de la cuenta: un solo cobro,
      // el de `listMembershipPlans`, sin un checkout paralelo.
      const membershipCheckout = !blocked
        ? resolveMembershipCheckout(requestedView, requestedOptions)
        : { view: requestedView, options: requestedOptions }
      const resolvedView = blocked ? 'login' : membershipCheckout.view
      const resolvedOptions = blocked ? requestedOptions : membershipCheckout.options

      if (blocked && athleteRequired) {
        setPendingAthleteDestination({ view: requestedView, options: requestedOptions })
      } else if (resumedAthleteDestination || (view === 'login' && resolvedView !== 'login')) {
        setPendingAthleteDestination(null)
      }

      if (resolvedView === 'tickets') {
        pushTicketsRoute(resolvedOptions.eventSlug)
        setTicketEventSlug(resolvedOptions.eventSlug ?? null)
      } else if (view === 'tickets') {
        clearTicketsRoute()
      }

      if (resolvedView === 'events' && resolvedOptions.eventSlug) {
        pushEventPageRoute(resolvedOptions.eventSlug)
        setEventPageSlug(resolvedOptions.eventSlug)
      } else if (resolvedView === 'events') {
        clearEventPageRoute()
        setEventPageSlug(null)
        pushPublicViewPath('events')
      } else if (view === 'events' && resolvedView !== 'events') {
        clearEventPageRoute()
        setEventPageSlug(null)
      }

      if (buildPublicViewPath(resolvedView) && !(resolvedView === 'events')) {
        pushPublicViewPath(resolvedView)
      } else if (matchPublicViewPath() && resolvedView !== 'tickets' && resolvedView !== 'events') {
        clearPublicViewPath()
      }

      if (view === 'notFound' && resolvedView !== 'notFound') {
        if (typeof window !== 'undefined' && !isCanonicalPathname()) {
          const nextPath = buildPublicViewPath(resolvedView) ?? '/'
          window.history.pushState({ view: resolvedView }, '', nextPath)
        }
      }

      // openTickets en pitbull: ir a la página completa de entradas
      if (resolvedView === 'pitbull' && resolvedOptions.openTickets) {
        pushTicketsRoute(resolvedOptions.eventSlug)
        setTicketEventSlug(resolvedOptions.eventSlug ?? null)
        setTransitionDirection(getTransitionDirection(view, 'tickets'))
        setView('tickets')
        return
      }

      if (resolvedView === 'profile') {
        setProfileTab(resolvedOptions.tab || DEFAULT_ACCOUNT_TAB)
        setProfileTabNonce((current) => current + 1)
      }

      setTransitionDirection(getTransitionDirection(view, resolvedView))
      setView(resolvedView)
    },
    [getSession, pendingAthleteDestination, view],
  )

  function selectEvent(event) {
    setSelectedEvent(event)
    if (app.checkoutAvailability?.registrationEnabled === false) {
      navigate('events', event?.slug ? { eventSlug: event.slug } : {})
      return
    }
    if (getSession()?.role !== 'athlete_plu') {
      // Conserva el evento elegido mientras la persona crea su ficha. Al
      // terminar el alta, `navigate('profile')` retoma automáticamente la
      // inscripción en vez de mandarla a empezar de nuevo desde el calendario.
      setPendingAthleteDestination({ view: 'competition', options: {} })
      navigate('register')
      return
    }
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

  // Confirmación de cambio de email de staff. Va antes que todo lo demás: el
  // link se abre desde la casilla nueva, que puede no tener sesión.
  const emailChangeToken = readStaffEmailChangeToken()
  if (emailChangeToken) {
    return (
      <Suspense fallback={<PageLoadFallback />}>
        <StaffEmailChangePage
          token={emailChangeToken}
          onDone={async () => {
            clearStaffEmailChangeToken()
            await app.logout({ notify: false })
            setView('login')
          }}
        />
      </Suspense>
    )
  }

  const staffInvitationToken = readStaffInvitationToken()
  if (staffInvitationToken) {
    return (
      <Suspense fallback={<PageLoadFallback />}>
        <StaffInvitationPage
          token={staffInvitationToken}
          onAccept={async (payload) => {
            await app.acceptStaffInvitationAction(payload)
            clearStaffInvitationToken()
            setView('admin')
          }}
          onCancel={() => {
            clearStaffInvitationToken()
            setView('login')
          }}
        />
      </Suspense>
    )
  }

  // Cuenta con contraseña temporal: no puede operar hasta elegir una propia.
  // Espeja el corte que `requireAuth` ya hace del lado del servidor.
  if (app.session?.mustChangePassword) {
    return (
      <Suspense fallback={<PageLoadFallback />}>
        <StaffPasswordChangePage
          session={app.session}
          onChangePassword={app.changeOwnPasswordAction}
          onLogout={async () => {
            await app.logout()
            setView('home')
          }}
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
          canDeleteUsers={canDeleteUsers(app.session)}
          canDeleteAthletes={canDeleteAthletes(app.session)}
          canDeleteEvents={canDeleteEvents(app.session)}
          canDeleteMemberships={canDeleteMemberships(app.session)}
          canDeleteRegistrations={canDeleteRegistrations(app.session)}
          dashboardOverview={app.dashboardOverview}
          adminEvents={app.adminEvents}
          adminEventsLoading={app.adminEventsLoading}
          adminEventsError={app.adminEventsError}
          athleteDataLoading={app.athleteDataLoading}
          athleteDataRefreshing={app.athleteDataRefreshing}
          athleteDataSyncedAt={app.athleteDataSyncedAt}
          athleteDataError={app.athleteDataError}
          filters={app.filters}
          filteredRegistrations={app.filteredRegistrations}
          gatePendingIds={app.gatePendingIds}
          enrichedMemberships={app.enrichedMemberships}
          pendingActions={app.pendingActions}
          dismissedQueueItemsLoading={app.dismissedQueueItemsLoading}
          onDismissQueueItem={app.dismissQueueItem}
          onUndismissQueueItem={app.undismissQueueItem}
          adminNavBadges={app.adminNavBadges}
          getAthleteDetail={app.getAthleteDetail}
          onApprovePayment={app.handleApprovePayment}
          onForceSettlePayment={app.handleForceSettlePayment}
          onRejectPayment={app.handleRejectPayment}
          onSetMembershipStatus={app.setMembershipStatusAction}
          onSetRegistrationStatus={app.setRegistrationStatusAction}
          onApproveTicketPurchase={app.approveTicketPurchase}
          onRejectTicketOrder={app.rejectTicketPurchase}
          onCheckInRegistration={app.checkInRegistrationAction}
          onCheckInTicket={app.checkInTicketAction}
          onRedeemTicketAddon={app.redeemTicketAddonAction}
          onRefreshTickets={app.refreshTickets}
          onRefreshPendingTicketOrders={app.refreshPendingTicketOrders}
          onRefreshAdminEvents={app.refreshAdminEvents}
          onRefreshAthleteData={app.refreshAthleteData}
          pricingConfiguration={app.pricingConfiguration}
          pricingLoading={app.pricingLoading}
          pricingError={app.pricingError}
          registrationAccessConfiguration={app.registrationAccessConfiguration}
          registrationAccessLoading={app.registrationAccessLoading}
          registrationAccessError={app.registrationAccessError}
          onRefreshRegistrationAccess={app.refreshRegistrationAccessConfiguration}
          onSaveRegistrationAccessGate={app.saveRegistrationAccessGate}
          onDeleteRegistrationAccessGate={app.deleteRegistrationAccessGate}
          onRefreshCheckoutAvailability={app.refreshCheckoutAvailability}
          onRefreshPricing={app.refreshPricingConfiguration}
          onCreateMembershipPlanVersion={app.createMembershipPlanVersion}
          onDeleteMembershipPlan={app.deleteMembershipPlan}
          onSetMembershipPlanActive={app.setMembershipPlanActive}
          onSaveEventComboOffer={app.saveEventComboOffer}
          onDeleteEventComboOffer={app.deleteEventComboOffer}
          onSetMembershipPlanRetirement={app.setMembershipPlanRetirement}
          onUpsertDiscountCode={app.upsertDiscountCode}
          onSetDiscountCodeState={app.setDiscountCodeState}
          onDeleteDiscountCode={app.deleteDiscountCode}
          billingSubscriptions={app.billingSubscriptions}
          billingSubscriptionsLoading={app.billingSubscriptionsLoading}
          billingSubscriptionsError={app.billingSubscriptionsError}
          onRefreshBillingSubscriptions={app.refreshBillingSubscriptions}
          onCancelBillingSubscription={app.cancelBillingSubscription}
          onCreateSecurityUser={app.createSecurityUserAction}
          onCreateSecurityUsersBulk={app.createSecurityUsersBulkAction}
          onCreateSecurityAccessLink={app.createSecurityAccessLinkAction}
          onDeactivateAllSecurityUsers={app.deactivateAllSecurityUsersAction}
          onListSecurityUsers={app.listSecurityUsersForEventAction}
          onUpdateSecurityUserStatus={app.updateSecurityUserStatusAction}
          onListSecurityZones={app.listSecurityZonesAction}
          onCreateSecurityZone={app.createSecurityZoneAction}
          onUpdateSecurityZone={app.updateSecurityZoneAction}
          onDeleteSecurityZone={app.deleteSecurityZoneAction}
          onPresetSecurityZones={app.presetSecurityZonesAction}
          onAssignSecurityZone={app.assignSecurityZoneAction}
          onCreateUser={app.createUserAction}
          onDeleteUser={app.deleteUserAction}
          onRequestEmailChange={app.requestEmailChangeAction}
          onResetStaffPassword={app.resetStaffPasswordAction}
          onDeleteAthlete={app.deleteAthleteAction}
          onBulkUpdateAthletes={app.bulkUpdateAthletesAction}
          onUpdateAthlete={app.updateAthleteAction}
          onDeleteMembership={app.deleteMembershipAction}
          onDeleteRegistration={app.deleteRegistrationAction}
          onSetRegistrationPublicVisibility={app.setRegistrationPublicVisibilityAction}
          onCreateRole={app.createAccessRoleAction}
          onDeleteShopProduct={app.deleteShopProductAction}
          onExportAdmin={app.exportAdminCsv}
          onExportPluUsa={app.exportPluUsaCsv}
          onSaveEvent={app.saveAdminEvent}
          onDeleteEvent={app.deleteAdminEvent}
          onFetchEventDeleteImpact={app.fetchAdminEventDeleteImpact}
          onSetEventState={app.setAdminEventState}
          onSaveShopProduct={app.saveShopProduct}
          onScheduleAssigned={app.handleScheduleAssigned}
          onSetFilters={app.setFilters}
          onUpdateUserRole={app.updateUserRoleAction}
          onUpdateUserStatus={app.updateUserStatusAction}
          onUpdateRolePermissions={app.updateAccessRolePermissionsAction}
          onUpdateRoleStatus={app.updateAccessRoleStatusAction}
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

  const Page = PUBLIC_VIEWS[view] || NotFoundPage

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
          checkoutAvailability: app.checkoutAvailability,
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
              memberships: app.memberships,
              registrations: app.registrations,
              checkoutAvailability: app.checkoutAvailability,
            }
          : view === 'home'
            ? {
                onNavigate: navigate,
                onSelectEvent: selectEvent,
                events: publicEvents,
                session: app.session,
                memberships: app.memberships,
                registrations: app.registrations,
                checkoutAvailability: app.checkoutAvailability,
              }
            : view === 'pitbull'
              ? {
                  onNavigate: navigate,
                  onSelectEvent: selectEvent,
                  events: publicEvents,
                  session: app.session,
                  memberships: app.memberships,
                  // Sin esto la página del meet no podía saber que quien la
                  // mira ya está inscripto: ofrecía "Inscribirme" a alguien
                  // que había pagado, mientras su perfil decía lo contrario.
                  registrations: app.registrations,
                  checkoutAvailability: app.checkoutAvailability,
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
                      ? {
                          memberships: app.memberships,
                          onNavigate: navigate,
                          onSelectEvent: selectEvent,
                          session: app.session,
                          events: publicEvents,
                          checkoutAvailability: app.checkoutAvailability,
                        }
                      : { onNavigate: navigate }

  const showAthleteAccount =
    app.session?.role === 'athlete_plu' && (view === 'profile' || view === 'membership')

  if (showAthleteAccount) {
    return (
      <PrivateLayout
        app={app}
        view="profile"
        navigate={navigate}
        transitionDirection={transitionDirection}
        helpEvent={featuredEvent}
        onSelectEvent={selectEvent}
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
            onSelectEvent={selectEvent}
            onUpdateProfile={app.updateAthleteProfileAction}
            onUpdatePhoto={app.updateAthletePhotoAction}
            onRemovePhoto={app.removeAthletePhotoAction}
            registrations={app.registrations}
            session={app.session}
            events={publicEvents}
            initialTab={view === 'membership' ? ACCOUNT_MEMBERSHIP_TAB : profileTab}
            tabNonce={profileTabNonce}
            checkoutAvailability={app.checkoutAvailability}
          />
        </Suspense>
      </PrivateLayout>
    )
  }

  if (view === 'competition' && app.session?.role === 'athlete_plu') {
    const athlete = app.athletes.find((item) => item.id === app.session.athleteId)
    const competitionEvent =
      publicEvents.find((event) => event.slug === selectedEvent?.slug) ??
      featuredEvent ??
      selectedEvent
    return (
      <PrivateLayout
        app={app}
        view={view}
        navigate={navigate}
        transitionDirection={transitionDirection}
        helpEvent={competitionEvent}
        onSelectEvent={selectEvent}
      >
        <Suspense fallback={<PageLoadFallback />}>
          <RegisterPage
            athlete={athlete}
            createdOrder={app.createdOrder}
            event={competitionEvent}
            flow="competition"
            form={app.form}
            memberships={app.memberships}
            onApprovePayment={app.handleApprovePayment}
            onNavigate={navigate}
            onSubmit={app.submitCompetition}
            onUpdateForm={app.updateForm}
            registrations={app.registrations}
            checkoutAvailability={app.checkoutAvailability}
            // El precio de la inscripción sale del evento: la RPC cobra
            // `events.price`, así que la constante fija mostraba un total que no
            // era el que se iba a cobrar apenas el panel tocaba el precio.
            total={resolveEventPricing(competitionEvent).registration}
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
      <SessionNotice onNavigate={navigate} />
      <PaymentsMockBanner />
      <DocumentMetaSync
        view={view}
        eventSlug={view === 'events' ? eventPageSlug : null}
        eventTitle={
          view === 'events' && eventPageSlug
            ? publicEvents.find((event) => event.slug === eventPageSlug)?.title
            : null
        }
      />
      <AnalyticsTracker view={view} />
      <NavbarPublic
        activeEventSlug={eventPageSlug}
        activeView={view}
        latestEvent={featuredEvent}
        memberships={app.memberships}
        onLogout={app.logout}
        onNavigate={navigate}
        session={app.session}
        sessionPending={app.sessionPending}
      />
      <PageTransition
        viewKey={view}
        direction={transitionDirection}
        id="main-content"
        tabIndex={-1}
      >
        <PageErrorBoundary onGoHome={() => navigate('home')} resetKey={view}>
          <Suspense fallback={<PageLoadFallback />}>
            <Page {...pageProps} />
          </Suspense>
        </PageErrorBoundary>
      </PageTransition>
      {!['login', 'register'].includes(view) && <Footer onNavigate={navigate} />}
      {/* Fuera de PageTransition: el botón de ayuda no se desmonta al cambiar
          de pantalla, así que sigue estando donde la persona lo dejó. */}
      <HelpLayer
        event={featuredEvent}
        memberships={app.memberships}
        onNavigate={navigate}
        onSelectEvent={selectEvent}
        registrations={app.registrations}
        session={app.session}
        view={view}
      />
    </div>
  )
}

function PrivateLayout({
  app,
  children,
  navigate,
  view,
  transitionDirection,
  helpEvent = null,
  onSelectEvent,
}) {
  return (
    <div className="app-shell">
      <EmailVerificationNotice />
      <SessionNotice onNavigate={navigate} />
      <PaymentsMockBanner />
      <DocumentMetaSync view={view} />
      <AnalyticsTracker view={view} />
      <NavbarPublic
        activeView={view}
        latestEvent={
          getFeaturedEvent(app.adminEvents.filter((event) => event.published !== false)) ??
          UPCOMING_EVENTS[0]
        }
        memberships={app.memberships}
        onLogout={async () => {
          await app.logout()
          navigate('home')
        }}
        onNavigate={navigate}
        sessionPending={app.sessionPending}
        session={app.session}
      />
      <PageTransition
        viewKey={view}
        direction={transitionDirection}
        id="main-content"
        tabIndex={-1}
      >
        <PageErrorBoundary onGoHome={() => navigate('home')} resetKey={view}>
          <Suspense fallback={<PageLoadFallback />}>{children}</Suspense>
        </PageErrorBoundary>
      </PageTransition>
      <Footer onNavigate={navigate} />
      <HelpLayer
        event={helpEvent}
        memberships={app.memberships}
        onNavigate={navigate}
        onSelectEvent={onSelectEvent}
        registrations={app.registrations}
        session={app.session}
        view={view}
      />
    </div>
  )
}
