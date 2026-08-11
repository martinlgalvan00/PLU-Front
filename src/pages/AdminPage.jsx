import { lazy, Suspense, useEffect, useState } from 'react'
import '../styles/layout/admin-shell.css'
import '../styles/pages/admin.css'
import '../styles/pages/admin-institutional.css'
import '../styles/pages/admin-minimal.css'
import '../styles/pages/admin-dashboard-bento.css'
import '../styles/pages/admin-audit.css'
import '../styles/pages/admin-pricing.css'
import AdminShell from '../components/layout/AdminShell.jsx'
import AccountDialog from '../components/admin/AccountDialog.jsx'
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

const AthleteDetailSection = lazy(() => import('./admin/AthleteDetailSection.jsx'))
const AthletesSection = lazy(() => import('./admin/AthletesSection.jsx'))
const AuditSection = lazy(() => import('./admin/AuditSection.jsx'))
const EventsSection = lazy(() => import('./admin/EventsSection.jsx'))
const MembershipsSection = lazy(() => import('./admin/MembershipsSection.jsx'))
const PlaceholderSection = lazy(() => import('./admin/PlaceholderSection.jsx'))
const PluUsaSection = lazy(() => import('./admin/PluUsaSection.jsx'))
const RegistrationsSection = lazy(() => import('./admin/RegistrationsSection.jsx'))
const ScheduleBoardSection = lazy(() => import('./admin/ScheduleBoardSection.jsx'))
const PaymentsOperationsSection = lazy(() => import('./admin/PaymentsOperationsSection.jsx'))
const PricingSection = lazy(() => import('./admin/PricingSection.jsx'))
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
  athleteDataError = null,
  allowedSections = [],
  authorization,
  canDeleteAthletes,
  canDeleteUsers,
  canManageUsers,
  dashboardOverview,
  filters,
  filteredRegistrations,
  enrichedMemberships,
  pendingActions,
  adminNavBadges,
  getAthleteDetail,
  onApprovePayment,
  onSetMembershipStatus,
  onApproveTicketPurchase,
  onRefreshPendingTicketOrders,
  onRefreshAdminEvents,
  onRefreshAthleteData,
  onRefreshPricing,
  onCreateMembershipPlanVersion,
  onSetMembershipPlanActive,
  onSaveEventComboOffer,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onListSecurityUsers,
  onUpdateSecurityUserStatus,
  onCreateUser,
  onDeleteUser,
  onDeleteAthlete,
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
  permissionCatalog,
  onDeleteShopProduct,
  payments,
  pendingTicketOrders,
  pendingTicketOrdersLoading,
  pendingTicketOrdersError,
  pricingConfiguration,
  pricingLoading,
  pricingError,
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
          onApproveTicketOrder={onApproveTicketPurchase}
          canEdit={hasPermission(authorization, 'admin.payments.approve')}
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

      return <AthletesSection athletes={athletes} onSelectAthlete={handleSelectAthlete} />
    }

    if (section === 'memberships') {
      return (
        <MembershipsSection
          memberships={enrichedMemberships}
          onSelectAthlete={handleSelectAthlete}
          onSetMembershipStatus={onSetMembershipStatus}
          canManage={hasPermission(authorization, 'admin.memberships.write')}
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
          payments={payments}
          registrations={registrations}
          memberships={enrichedMemberships}
          events={adminEvents}
          registrationsCount={registrations.length}
          onApprovePayment={onApprovePayment}
          onExportAdmin={onExportAdmin}
          onExportPluUsa={onExportPluUsa}
          onGoToEvents={() => setSection('events')}
          onScheduleAssigned={onScheduleAssigned}
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
          onRefresh={onRefreshAdminEvents}
          onSaveEvent={onSaveEvent}
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
          onApproveTicketOrder={onApproveTicketPurchase}
          onRefresh={onRefreshPendingTicketOrders}
        />
      )
    }

    if (section === 'pricing') {
      return (
        <PricingSection
          canEdit={hasPermission(authorization, 'admin.pricing.write')}
          configuration={pricingConfiguration}
          error={pricingError}
          isLoading={pricingLoading}
          onCreatePlanVersion={onCreateMembershipPlanVersion}
          onRefresh={onRefreshPricing}
          onSaveComboOffer={onSaveEventComboOffer}
          onSetPlanActive={onSetMembershipPlanActive}
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
      <div
        className="admin-page admin-section-enter"
        key={`${section}-${selectedAthleteId ?? 'list'}`}
      >
        <Suspense fallback={<PageLoadFallback />}>{renderSection()}</Suspense>
      </div>
    </AdminShell>
  )
}
