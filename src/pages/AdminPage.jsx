import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import '../styles/layout/admin-shell.css'
import '../styles/pages/admin.css'
import '../styles/pages/admin-institutional.css'
import '../styles/pages/admin-minimal.css'
import '../styles/pages/admin-dashboard-bento.css'
import '../styles/pages/admin-audit.css'
import '../styles/pages/admin-analytics.css'
import '../styles/pages/admin-pricing.css'
import '../styles/pages/admin-event-console.css'
import '../styles/pages/admin-modals.css'
import AdminShell from '../components/layout/AdminShell.jsx'
import AccountDialog from '../components/admin/AccountDialog.jsx'
import AdminActionToasts from '../components/admin/AdminActionToasts.jsx'
import AdminLiveSyncBadge from '../components/admin/AdminLiveSyncBadge.jsx'
import PageLoadFallback from '../components/ui/PageLoadFallback.jsx'
import LoadingState from '../components/ui/LoadingState.jsx'
import ErrorState from '../components/ui/ErrorState.jsx'
// `DashboardSection` es la vista de entrada para casi todos los roles, así
// que queda eager -- lazy-cargarla solo agregaría un flash de Suspense sin
// bajar bytes reales. El resto de las secciones se cargan bajo demanda: un
// operador que solo usa Atletas y Pagos no tiene por qué bajar el código de
// Roles, Auditoría, Tienda o PLU USA.
import DashboardSection from './admin/DashboardSection.jsx'
import { hasAnyPermission, hasPermission } from '../lib/permissions.js'
import { findUnreconciledApprovedPayments } from '../services/paymentReconciliationService.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

const AthleteDetailSection = lazy(() => import('./admin/AthleteDetailSection.jsx'))
const AthletesSection = lazy(() => import('./admin/AthletesSection.jsx'))
const PeopleSection = lazy(() => import('./admin/PeopleSection.jsx'))
const AuditSection = lazy(() => import('./admin/AuditSection.jsx'))
const AnalyticsSection = lazy(() => import('./admin/AnalyticsSection.jsx'))
const EventsSection = lazy(() => import('./admin/EventsSection.jsx'))
const MembershipsSection = lazy(() => import('./admin/MembershipsSection.jsx'))
const PlaceholderSection = lazy(() => import('./admin/PlaceholderSection.jsx'))
const PluUsaSection = lazy(() => import('./admin/PluUsaSection.jsx'))
const RegistrationsSection = lazy(() => import('./admin/RegistrationsSection.jsx'))
const ScheduleBoardSection = lazy(() => import('./admin/ScheduleBoardSection.jsx'))
const CheckInSection = lazy(() => import('./admin/CheckInSection.jsx'))
const PaymentsOperationsSection = lazy(() => import('./admin/PaymentsOperationsSection.jsx'))
const FinanceSection = lazy(() => import('./admin/FinanceSection.jsx'))
const PricingSection = lazy(() => import('./admin/PricingSection.jsx'))
const RegistrationAccessSection = lazy(() => import('./admin/RegistrationAccessSection.jsx'))
const ShopSection = lazy(() => import('./admin/ShopSection.jsx'))
const UsersSection = lazy(() => import('./admin/UsersSection.jsx'))
const RolesSection = lazy(() => import('./admin/RolesSection.jsx'))

export default function AdminPage({
  accessRoles,
  roleActivity,
  adminEvents,
  adminEventsLoading,
  adminEventsError,
  athleteDataLoading = false,
  athleteDataRefreshing = false,
  athleteDataSyncedAt = null,
  athleteDataError = null,
  allowedSections = [],
  authorization,
  canDeleteAthletes,
  canDeleteEvents,
  canDeleteMemberships,
  canDeleteRegistrations,
  canDeleteUsers,
  canManageUsers,
  dashboardOverview,
  filters,
  filteredRegistrations,
  gatePendingIds,
  enrichedMemberships,
  pendingActions,
  dismissedQueueItemsLoading,
  onDismissQueueItem,
  onUndismissQueueItem,
  adminNavBadges,
  getAthleteDetail,
  onApprovePayment,
  onForceSettlePayment,
  onRejectPayment,
  onSetMembershipStatus,
  onSetRegistrationStatus,
  onApproveTicketPurchase,
  onRejectTicketOrder,
  onRefreshPendingTicketOrders,
  canCheckIn = false,
  onCheckInRegistration,
  onCheckInTicket,
  onRedeemTicketAddon,
  onRefreshTickets,
  onRefreshAdminEvents,
  onRefreshAthleteData,
  onRefreshPricing,
  onCreateMembershipPlanVersion,
  onDeleteMembershipPlan,
  onSetMembershipPlanActive,
  onSetMembershipPlanRetirement,
  onUpsertDiscountCode,
  onSetDiscountCodeState,
  onDeleteDiscountCode,
  onSimulatePromotionCode,
  onFetchDiscountCodeRedemptions,
  billingSubscriptions,
  billingSubscriptionsLoading,
  billingSubscriptionsError,
  onRefreshBillingSubscriptions,
  onCancelBillingSubscription,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onListSecurityUsers,
  onUpdateSecurityUserStatus,
  onListSecurityZones,
  onCreateSecurityZone,
  onUpdateSecurityZone,
  onDeleteSecurityZone,
  onPresetSecurityZones,
  onAssignSecurityZone,
  onCreateUser,
  onDeleteUser,
  onDeleteAthlete,
  onBulkUpdateAthletes,
  onUpdateAthlete,
  onDeleteMembership,
  onDeleteRegistration,
  onSetRegistrationPublicVisibility,
  onDeleteEvent,
  onFetchEventDeleteImpact,
  onCreateRole,
  onExportAdmin,
  onExportPluUsa,
  onSaveEvent,
  onSaveShopProduct,
  onScheduleAssigned,
  onSetEventState,
  onSetFilters,
  onUpdateUserRole,
  onUpdateUserStatus,
  onUpdateRolePermissions,
  onUpdateRoleStatus,
  permissionCatalog,
  onDeleteShopProduct,
  payments,
  pendingTicketOrders,
  pendingTicketOrdersLoading,
  pendingTicketOrdersError,
  pricingConfiguration,
  pricingLoading,
  pricingError,
  registrationAccessConfiguration,
  registrationAccessLoading,
  registrationAccessError,
  onRefreshRegistrationAccess,
  onSaveRegistrationAccessGate,
  onDeleteRegistrationAccessGate,
  onRefreshCheckoutAvailability,
  athletes,
  registrations,
  tickets,
  shopProducts,
  users,
  roleLabel,
  isPluUsaPartner = false,
  isCheckinOnly = false,
  onRequestEmailChange,
  onResetStaffPassword,
  onExit,
}) {
  const { t } = useI18n()
  const [accountOpen, setAccountOpen] = useState(false)
  const preferredSection = isPluUsaPartner ? 'plu-usa' : isCheckinOnly ? 'checkin' : 'dashboard'
  const [section, setSection] = useState(() =>
    allowedSections.includes(preferredSection)
      ? preferredSection
      : (allowedSections[0] ?? preferredSection),
  )
  const [globalSearch, setGlobalSearch] = useState('')
  const [selectedAthleteId, setSelectedAthleteId] = useState(null)
  // "Personas" (nav.people) reemplaza los antiguos ítems de menú Atletas /
  // Afiliaciones / Inscripciones por uno solo con pestañas internas. Todo
  // código que todavía navega con esas tres claves (Dashboard, EventsSection,
  // el buscador del resumen) sigue funcionando sin tocarlo: handleSectionChange
  // las normaliza a section='people' + la pestaña correspondiente.
  const PEOPLE_TABS = ['athletes', 'memberships', 'registrations']
  const [peopleTab, setPeopleTab] = useState('athletes')
  const [paymentEventScope, setPaymentEventScope] = useState('')
  const [paymentFocusId, setPaymentFocusId] = useState(null)
  // Evento cuya puerta se está operando. Se fija al entrar desde la consola de
  // Eventos; sin eso, el primero que todavía no terminó.
  const [checkinEventSlug, setCheckinEventSlug] = useState(null)

  const pendingPayments = payments.filter(
    (payment) => payment.status === 'pendiente' || payment.status === 'validacion_manual',
  ).length

  // Pagos aprobados (plata cobrada) sin la afiliación/inscripción que
  // deberían haber activado -- ver paymentReconciliationService. Se calcula
  // acá porque memberships/registrations/payments/athletes ya están todos
  // cargados en el snapshot admin; las secciones solo filtran su mitad.
  const unreconciledPayments = useMemo(
    () =>
      findUnreconciledApprovedPayments({
        memberships: enrichedMemberships,
        registrations,
        payments,
        athletes,
      }),
    [enrichedMemberships, registrations, payments, athletes],
  )
  // Puerta activa: la elegida desde Eventos, o el primer evento que todavía no
  // terminó. Sin resolverlo, la sección tomaba el slug por defecto y podía
  // estar acreditando gente de otro evento.
  const checkinEvent = useMemo(() => {
    if (!adminEvents?.length) return null
    if (checkinEventSlug) {
      const chosen = adminEvents.find((event) => event.slug === checkinEventSlug)
      if (chosen) return chosen
    }
    const open = [...adminEvents]
      .filter((event) => !['finalizado', 'cerrado'].includes(event.status))
      .sort((left, right) => String(left.startsAt ?? '').localeCompare(String(right.startsAt ?? '')))
    return open[0] ?? adminEvents[0] ?? null
  }, [adminEvents, checkinEventSlug])

  const unreconciledMembershipPayments = useMemo(
    () => unreconciledPayments.filter((entry) => entry.missingMembership),
    [unreconciledPayments],
  )
  const unreconciledRegistrationPayments = useMemo(
    () => unreconciledPayments.filter((entry) => entry.missingRegistration),
    [unreconciledPayments],
  )

  useEffect(() => {
    if (allowedSections.length > 0 && !allowedSections.includes(section)) {
      setSection(allowedSections[0])
      setSelectedAthleteId(null)
    }
  }, [allowedSections, section])

  function handleSectionChange(nextSection, focusId = null) {
    if (!allowedSections.includes(nextSection)) return
    // Deep links viejos (Dashboard, EventsSection) todavía piden 'athletes' /
    // 'memberships' / 'registrations' directamente -- se resuelven a la
    // pestaña correspondiente de 'people' en vez de tocar cada llamador.
    const isPeopleTab = PEOPLE_TABS.includes(nextSection)
    const targetSection = isPeopleTab ? 'people' : nextSection
    if (isPeopleTab) setPeopleTab(nextSection)
    if (nextSection === 'payments') setPaymentEventScope('')
    setPaymentFocusId(nextSection === 'payments' ? focusId : null)
    setSection(targetSection)
    if (targetSection !== 'people') {
      setSelectedAthleteId(null)
    }
  }

  function handleSelectAthlete(athleteId) {
    if (!allowedSections.includes('athletes')) return
    setSelectedAthleteId(athleteId)
    // Igual que antes de unificar el menú: cerrar la ficha siempre vuelve al
    // listado de Atletas, sin importar desde qué pestaña se abrió.
    setPeopleTab('athletes')
    setSection('people')
  }

  function handleDashboardSearchSubmit(query) {
    const normalizedQuery = query.trim()
    if (!normalizedQuery || !allowedSections.includes('registrations')) return

    onSetFilters((current) => ({
      ...current,
      event: 'all',
      query: normalizedQuery,
      status: 'all',
    }))
    setPeopleTab('registrations')
    setSection('people')
  }

  function handleManageEventRegistrations(event) {
    if (!allowedSections.includes('registrations')) return
    onSetFilters((current) => ({
      ...current,
      event: event.title,
      query: '',
      status: 'all',
    }))
    setPeopleTab('registrations')
    setSection('people')
  }

  function handleManageEventPayments(event) {
    if (!allowedSections.includes('payments')) return
    setPaymentEventScope(event.title)
    setSection('payments')
  }

  function handleManageEventCheckin(event) {
    if (!allowedSections.includes('checkin')) return
    setCheckinEventSlug(event?.slug ?? null)
    setSection('checkin')
  }

  function renderSection() {
    const athleteDataSections = ['dashboard', 'people', 'plu-usa']
    if (athleteDataSections.includes(section)) {
      if (athleteDataLoading) return <LoadingState />
      if (athleteDataError) {
        return <ErrorState message={athleteDataError} onRetry={onRefreshAthleteData} />
      }
    }

    if (section === 'dashboard') {
      return (
        <DashboardSection
          dashboardOverview={dashboardOverview}
          pendingActions={pendingActions}
          pendingPayments={pendingPayments}
          onNavigate={handleSectionChange}
          onApprovePayment={onApprovePayment}
          onRejectPayment={onRejectPayment}
          onApproveTicketOrder={onApproveTicketPurchase}
          onRejectTicketOrder={onRejectTicketOrder}
          canEdit={hasPermission(authorization, 'admin.payments.approve')}
          canDismissQueueItems={hasPermission(authorization, 'admin.dashboard.write')}
          onDismissItem={onDismissQueueItem}
          onUndismissItem={onUndismissQueueItem}
          dismissedQueueItemsLoading={dismissedQueueItemsLoading}
          canDeleteAthletes={canDeleteAthletes}
          onDeleteAthlete={onDeleteAthlete}
          onSelectAthlete={handleSelectAthlete}
          getAthleteDetail={getAthleteDetail}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
          onGlobalSearchSubmit={handleDashboardSearchSubmit}
        />
      )
    }

    if (section === 'people') {
      if (selectedAthleteId) {
        return (
          <AthleteDetailSection
            detail={getAthleteDetail(selectedAthleteId)}
            onBack={() => setSelectedAthleteId(null)}
            canEdit={hasPermission(authorization, 'admin.athletes.write')}
            canRotateCredential={hasPermission(authorization, 'admin.memberships.write')}
            canDelete={canDeleteAthletes && Boolean(onDeleteAthlete)}
            // Acreditar no es editar la ficha: la validación tiene su propio
            // permiso y hasta ahora el botón salía habilitado con el de atletas.
            canValidatePayments={hasPermission(authorization, 'admin.payments.approve')}
            onDelete={async (athleteId) => {
              await onDeleteAthlete?.(athleteId)
              setSelectedAthleteId(null)
            }}
            onUpdate={onUpdateAthlete}
            onApprovePayment={onApprovePayment}
            onRejectPayment={onRejectPayment}
          />
        )
      }

      const peopleTabs = [
        allowedSections.includes('athletes') && { id: 'athletes', label: t('admin.nav.athletes') },
        allowedSections.includes('memberships') && {
          id: 'memberships',
          label: t('admin.nav.memberships'),
        },
        allowedSections.includes('registrations') && {
          id: 'registrations',
          label: t('admin.nav.registrations'),
        },
      ].filter(Boolean)
      const activePeopleTab = peopleTabs.some((tab) => tab.id === peopleTab)
        ? peopleTab
        : (peopleTabs[0]?.id ?? 'athletes')

      return (
        <PeopleSection activeTab={activePeopleTab} onTabChange={setPeopleTab} tabs={peopleTabs}>
          {activePeopleTab === 'athletes' && (
            <AthletesSection
              athletes={athletes}
              registrations={registrations}
              payments={payments}
              gatePendingIds={gatePendingIds}
              onSelectAthlete={handleSelectAthlete}
              canEdit={hasPermission(authorization, 'admin.athletes.write')}
              onBulkUpdate={onBulkUpdateAthletes}
            />
          )}
          {activePeopleTab === 'memberships' && (
            <MembershipsSection
              memberships={enrichedMemberships}
              payments={payments}
              registrations={registrations}
              unreconciledPayments={unreconciledMembershipPayments}
              onSelectAthlete={handleSelectAthlete}
              onSetMembershipStatus={onSetMembershipStatus}
              onForceSettlePayment={onForceSettlePayment}
              onRefreshAthleteData={onRefreshAthleteData}
              canForceSettle={hasPermission(authorization, 'admin.payments.approve')}
              canManage={hasPermission(authorization, 'admin.memberships.write')}
              canDelete={canDeleteMemberships && Boolean(onDeleteMembership)}
              onDelete={onDeleteMembership}
            />
          )}
          {activePeopleTab === 'registrations' && (
            <RegistrationsSection
              canAssignSchedule={hasPermission(authorization, 'admin.registrations.write')}
              canEdit={hasAnyPermission(authorization, [
                'admin.registrations.write',
                'admin.payments.approve',
              ])}
              filters={filters}
              filteredRegistrations={filteredRegistrations}
              gatePendingIds={gatePendingIds}
              payments={payments}
              registrations={registrations}
              registrationsCount={registrations.length}
              unreconciledPayments={unreconciledRegistrationPayments}
              onApprovePayment={onApprovePayment}
              onForceSettlePayment={onForceSettlePayment}
              onRejectPayment={onRejectPayment}
              onSetRegistrationStatus={onSetRegistrationStatus}
              canSetStatus={hasPermission(authorization, 'admin.registrations.write')}
              canValidatePayments={hasPermission(authorization, 'admin.payments.approve')}
              canForceSettle={hasPermission(authorization, 'admin.payments.approve')}
              canDelete={canDeleteRegistrations && Boolean(onDeleteRegistration)}
              onDelete={onDeleteRegistration}
              canManageVisibility={hasPermission(authorization, 'admin.registrations.write')}
              onSetPublicVisibility={onSetRegistrationPublicVisibility}
              onExportAdmin={onExportAdmin}
              onExportPluUsa={onExportPluUsa}
              onGoToEvents={() => setSection('events')}
              onRefreshAthleteData={onRefreshAthleteData}
              onScheduleAssigned={onScheduleAssigned}
              onSelectAthlete={handleSelectAthlete}
              onSetFilters={onSetFilters}
            />
          )}
        </PeopleSection>
      )
    }

    if (section === 'grid') {
      return (
        <ScheduleBoardSection
          adminEvents={adminEvents}
          canEdit={hasPermission(authorization, 'admin.registrations.write')}
          onGoToEvents={() => setSection('events')}
        />
      )
    }

    if (section === 'events') {
      return (
        <EventsSection
          adminEvents={adminEvents}
          isLoading={adminEventsLoading}
          loadError={adminEventsError}
          canEdit={hasPermission(authorization, 'admin.events.write')}
          canManageUsers={canManageUsers}
          onCreateSecurityUser={onCreateSecurityUser}
          onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
          onCreateSecurityAccessLink={onCreateSecurityAccessLink}
          onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
          onListSecurityUsers={onListSecurityUsers}
          onManagePayments={
            allowedSections.includes('payments') ? handleManageEventPayments : undefined
          }
          onManageRegistrations={
            allowedSections.includes('registrations') ? handleManageEventRegistrations : undefined
          }
          onManageCheckin={
            allowedSections.includes('checkin') ? handleManageEventCheckin : undefined
          }
          onListSecurityZones={onListSecurityZones}
          onCreateSecurityZone={onCreateSecurityZone}
          onUpdateSecurityZone={onUpdateSecurityZone}
          onDeleteSecurityZone={onDeleteSecurityZone}
          onPresetSecurityZones={onPresetSecurityZones}
          onAssignSecurityZone={onAssignSecurityZone}
          onRefresh={onRefreshAdminEvents}
          onSaveEvent={onSaveEvent}
          canDeleteEvents={canDeleteEvents}
          onDeleteEvent={onDeleteEvent}
          onFetchDeleteImpact={onFetchEventDeleteImpact}
          onSetEventState={onSetEventState}
          onUpdateSecurityUserStatus={onUpdateSecurityUserStatus}
          tickets={tickets}
        />
      )
    }

    if (section === 'users') {
      return (
        <UsersSection
          accessRoles={accessRoles}
          adminEvents={adminEvents}
          canDeleteUsers={canDeleteUsers}
          canManageUsers={canManageUsers}
          onCreateSecurityUser={onCreateSecurityUser}
          onCreateUser={onCreateUser}
          onDeleteUser={onDeleteUser}
          onNavigateRoles={
            allowedSections.includes('roles') ? () => setSection('roles') : undefined
          }
          onResetPassword={onResetStaffPassword}
          onUpdateRole={onUpdateUserRole}
          onUpdateStatus={onUpdateUserStatus}
          users={users}
        />
      )
    }

    if (section === 'roles') {
      return (
        <RolesSection
          activity={roleActivity}
          authorization={authorization}
          onCreateRole={onCreateRole}
          onUpdatePermissions={onUpdateRolePermissions}
          onUpdateStatus={onUpdateRoleStatus}
          permissionCatalog={permissionCatalog}
          roles={accessRoles}
        />
      )
    }

    if (section === 'payments') {
      return (
        <PaymentsOperationsSection
          canEdit={hasPermission(authorization, 'admin.payments.approve')}
          highlightOrderId={paymentFocusId}
          ticketOrderEventScope={paymentEventScope}
          pendingTicketOrders={pendingTicketOrders}
          isLoading={pendingTicketOrdersLoading}
          loadError={pendingTicketOrdersError}
          onApprovePayment={onApprovePayment}
          onForceSettlePayment={onForceSettlePayment}
          onRejectPayment={onRejectPayment}
          onApproveTicketOrder={onApproveTicketPurchase}
          onRejectTicketOrder={onRejectTicketOrder}
          onRefresh={onRefreshPendingTicketOrders}
        />
      )
    }
    if (section === 'finance')
      return <FinanceSection canEdit={hasPermission(authorization, 'admin.payments.approve')} />

    if (section === 'pricing') {
      return (
        <PricingSection
          canEdit={hasPermission(authorization, 'admin.pricing.write')}
          canEditSubscriptions={hasPermission(authorization, 'admin.payments.approve')}
          configuration={pricingConfiguration}
          error={pricingError}
          isLoading={pricingLoading}
          onCreatePlanVersion={onCreateMembershipPlanVersion}
          onDeletePlan={onDeleteMembershipPlan}
          onRefresh={onRefreshPricing}
          onSetPlanActive={onSetMembershipPlanActive}
          onSetPlanRetirement={onSetMembershipPlanRetirement}
          onUpsertDiscountCode={onUpsertDiscountCode}
          onSetDiscountCodeState={onSetDiscountCodeState}
          onDeleteDiscountCode={onDeleteDiscountCode}
          onSimulatePromotionCode={onSimulatePromotionCode}
          onFetchDiscountCodeRedemptions={onFetchDiscountCodeRedemptions}
          subscriptions={billingSubscriptions}
          subscriptionsLoading={billingSubscriptionsLoading}
          subscriptionsError={billingSubscriptionsError}
          onRefreshSubscriptions={onRefreshBillingSubscriptions}
          onCancelSubscription={onCancelBillingSubscription}
        />
      )
    }

    if (section === 'access-gates') {
      return (
        <RegistrationAccessSection
          adminEvents={adminEvents}
          canEdit={hasPermission(authorization, 'admin.registration_access.write')}
          configuration={registrationAccessConfiguration}
          error={registrationAccessError}
          isLoading={registrationAccessLoading}
          onRefresh={onRefreshRegistrationAccess}
          onSave={onSaveRegistrationAccessGate}
          onDelete={onDeleteRegistrationAccessGate}
          onToggleSaved={onRefreshCheckoutAvailability}
        />
      )
    }

    if (section === 'shop') {
      return (
        <ShopSection
          canEdit={hasPermission(authorization, 'admin.shop.write')}
          products={shopProducts}
          onDeleteProduct={onDeleteShopProduct}
          onSaveProduct={onSaveShopProduct}
        />
      )
    }

    if (section === 'plu-usa') {
      return (
        <PluUsaSection
          athletes={athletes}
          memberships={enrichedMemberships}
          registrations={registrations}
          onExportPluUsa={onExportPluUsa}
        />
      )
    }

    if (section === 'audit') {
      return <AuditSection />
    }

    if (section === 'analytics') {
      // `athletes` habilita el recorrido identificado: el buscador necesita la
      // lista para resolver un nombre a su id. El acceso real lo decide el
      // backend con `admin.analytics.identity`; la prop solo evita ofrecer un
      // panel que iba a responder 403.
      return (
        <AnalyticsSection
          athletes={athletes}
          canViewIdentity={hasPermission(authorization, 'admin.analytics.identity')}
          canViewPaymentFailures={hasPermission(authorization, 'admin.payments.read')}
          onNavigate={handleSectionChange}
        />
      )
    }

    if (section === 'checkin') {
      return (
        <CheckInSection
          athletes={athletes}
          canCheckIn={canCheckIn}
          // Mismo permiso que Finanzas: la puerta no gana la facultad de
          // acreditar por estar operando el evento.
          canValidatePayments={hasPermission(authorization, 'admin.payments.approve')}
          eventDays={checkinEvent?.eventDays ?? []}
          eventSlug={checkinEvent?.slug ?? undefined}
          eventTitle={checkinEvent?.title ?? null}
          memberships={enrichedMemberships}
          onApprovePayment={onApprovePayment}
          onCheckInRegistration={onCheckInRegistration}
          onCheckInTicket={onCheckInTicket}
          onRedeemTicketAddon={onRedeemTicketAddon}
          onRefreshTickets={onRefreshTickets}
          onRejectPayment={onRejectPayment}
          payments={payments}
          registrations={registrations}
          ticketTypes={checkinEvent?.ticketTypes ?? []}
          tickets={tickets}
        />
      )
    }

    if (['results', 'exports'].includes(section)) {
      return <PlaceholderSection section={section} />
    }

    return null
  }

  return (
    <AdminShell
      activeSection={section}
      onSectionChange={handleSectionChange}
      onExit={onExit}
      navBadges={adminNavBadges}
      roleLabel={roleLabel}
      allowedSections={allowedSections}
      onOpenAccount={onRequestEmailChange ? () => setAccountOpen(true) : undefined}
      restrictedNav={isPluUsaPartner ? 'pluUsa' : isCheckinOnly ? 'checkin' : false}
      athletes={athletes}
      onSelectAthlete={handleSelectAthlete}
    >
      {accountOpen ? (
        <AccountDialog
          session={authorization}
          onRequestEmailChange={onRequestEmailChange}
          onClose={() => setAccountOpen(false)}
        />
      ) : null}
      <AdminLiveSyncBadge refreshing={athleteDataRefreshing} syncedAt={athleteDataSyncedAt} />
      <div
        className="admin-page admin-section-enter"
        key={`${section}-${section === 'people' ? peopleTab : ''}-${selectedAthleteId ?? 'list'}`}
      >
        <Suspense fallback={<PageLoadFallback />}>{renderSection()}</Suspense>
      </div>
      <AdminActionToasts />
    </AdminShell>
  )
}
