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

const AthleteDetailSection = lazy(() => import('./admin/AthleteDetailSection.jsx'))
const AthletesSection = lazy(() => import('./admin/AthletesSection.jsx'))
const AuditSection = lazy(() => import('./admin/AuditSection.jsx'))
const AnalyticsSection = lazy(() => import('./admin/AnalyticsSection.jsx'))
const EventsSection = lazy(() => import('./admin/EventsSection.jsx'))
const MembershipsSection = lazy(() => import('./admin/MembershipsSection.jsx'))
const PlaceholderSection = lazy(() => import('./admin/PlaceholderSection.jsx'))
const PluUsaSection = lazy(() => import('./admin/PluUsaSection.jsx'))
const RegistrationsSection = lazy(() => import('./admin/RegistrationsSection.jsx'))
const ScheduleBoardSection = lazy(() => import('./admin/ScheduleBoardSection.jsx'))
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
  onRefreshAdminEvents,
  onRefreshAthleteData,
  onRefreshPricing,
  onCreateMembershipPlanVersion,
  onDeleteMembershipPlan,
  onSetMembershipPlanActive,
  onSaveEventComboOffer,
  onDeleteEventComboOffer,
  onSetMembershipPlanRetirement,
  onUpsertDiscountCode,
  onSetDiscountCodeState,
  onDeleteDiscountCode,
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
  const [accountOpen, setAccountOpen] = useState(false)
  const preferredSection = isPluUsaPartner ? 'plu-usa' : isCheckinOnly ? 'checkin' : 'dashboard'
  const [section, setSection] = useState(() =>
    allowedSections.includes(preferredSection)
      ? preferredSection
      : (allowedSections[0] ?? preferredSection),
  )
  const [globalSearch, setGlobalSearch] = useState('')
  const [selectedAthleteId, setSelectedAthleteId] = useState(null)
  const [paymentEventScope, setPaymentEventScope] = useState('')
  const [paymentFocusId, setPaymentFocusId] = useState(null)

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
    if (nextSection === 'payments') setPaymentEventScope('')
    setPaymentFocusId(nextSection === 'payments' ? focusId : null)
    setSection(nextSection)
    if (nextSection !== 'athletes') {
      setSelectedAthleteId(null)
    }
  }

  function handleSelectAthlete(athleteId) {
    if (!allowedSections.includes('athletes')) return
    setSelectedAthleteId(athleteId)
    setSection('athletes')
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
    setSection('registrations')
  }

  function handleManageEventRegistrations(event) {
    if (!allowedSections.includes('registrations')) return
    onSetFilters((current) => ({
      ...current,
      event: event.title,
      query: '',
      status: 'all',
    }))
    setSection('registrations')
  }

  function handleManageEventPayments(event) {
    if (!allowedSections.includes('payments')) return
    setPaymentEventScope(event.title)
    setSection('payments')
  }

  function handleManageEventCheckin() {
    if (!allowedSections.includes('checkin')) return
    setSection('checkin')
  }

  function renderSection() {
    const athleteDataSections = ['dashboard', 'athletes', 'memberships', 'registrations', 'plu-usa']
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

    if (section === 'athletes') {
      if (selectedAthleteId) {
        return (
          <AthleteDetailSection
            detail={getAthleteDetail(selectedAthleteId)}
            onBack={() => setSelectedAthleteId(null)}
            canEdit={hasPermission(authorization, 'admin.athletes.write')}
            canRotateCredential={hasPermission(authorization, 'admin.memberships.write')}
            canDelete={canDeleteAthletes && Boolean(onDeleteAthlete)}
            onDelete={async (athleteId) => {
              await onDeleteAthlete?.(athleteId)
              setSelectedAthleteId(null)
            }}
            onApprovePayment={onApprovePayment}
          />
        )
      }

      return (
        <AthletesSection
          athletes={athletes}
          registrations={registrations}
          payments={payments}
          gatePendingIds={gatePendingIds}
          onSelectAthlete={handleSelectAthlete}
        />
      )
    }

    if (section === 'memberships') {
      return (
        <MembershipsSection
          memberships={enrichedMemberships}
          registrations={registrations}
          unreconciledPayments={unreconciledMembershipPayments}
          onSelectAthlete={handleSelectAthlete}
          onSetMembershipStatus={onSetMembershipStatus}
          canManage={hasPermission(authorization, 'admin.memberships.write')}
          canDelete={canDeleteMemberships && Boolean(onDeleteMembership)}
          onDelete={onDeleteMembership}
        />
      )
    }

    if (section === 'registrations') {
      return (
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
          onSetRegistrationStatus={onSetRegistrationStatus}
          canSetStatus={hasPermission(authorization, 'admin.registrations.write')}
          canForceSettle={hasPermission(authorization, 'admin.payments.approve')}
          canDelete={canDeleteRegistrations && Boolean(onDeleteRegistration)}
          onDelete={onDeleteRegistration}
          canManageVisibility={hasPermission(authorization, 'admin.registrations.write')}
          onSetPublicVisibility={onSetRegistrationPublicVisibility}
          onExportAdmin={onExportAdmin}
          onExportPluUsa={onExportPluUsa}
          onGoToEvents={() => setSection('events')}
          onScheduleAssigned={onScheduleAssigned}
          onSelectAthlete={handleSelectAthlete}
          onSetFilters={onSetFilters}
        />
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
          onManageCheckin={allowedSections.includes('checkin') ? handleManageEventCheckin : undefined}
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
          onSaveComboOffer={onSaveEventComboOffer}
          onDeleteComboOffer={onDeleteEventComboOffer}
          onSetPlanActive={onSetMembershipPlanActive}
          onSetPlanRetirement={onSetMembershipPlanRetirement}
          onUpsertDiscountCode={onUpsertDiscountCode}
          onSetDiscountCodeState={onSetDiscountCodeState}
          onDeleteDiscountCode={onDeleteDiscountCode}
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
        key={`${section}-${selectedAthleteId ?? 'list'}`}
      >
        <Suspense fallback={<PageLoadFallback />}>{renderSection()}</Suspense>
      </div>
      <AdminActionToasts />
    </AdminShell>
  )
}
