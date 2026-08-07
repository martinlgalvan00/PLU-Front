import { lazy, Suspense, useEffect, useState } from 'react'
import '../styles/layout/admin-shell.css'
import '../styles/pages/admin.css'
import '../styles/pages/admin-institutional.css'
import '../styles/pages/admin-minimal.css'
import '../styles/pages/admin-dashboard-bento.css'
import '../styles/pages/admin-audit.css'
import AdminShell from '../components/layout/AdminShell.jsx'
import PageLoadFallback from '../components/ui/PageLoadFallback.jsx'
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
const PaymentsOperationsSection = lazy(() => import('./admin/PaymentsOperationsSection.jsx'))
const ShopSection = lazy(() => import('./admin/ShopSection.jsx'))
const UsersSection = lazy(() => import('./admin/UsersSection.jsx'))
const RolesSection = lazy(() => import('./admin/RolesSection.jsx'))

export default function AdminPage({
  accessRoles,
  roleActivity,
  adminEvents,
  adminEventsLoading,
  adminEventsError,
  allowedSections = [],
  authorization,
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
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityAccessLink,
  onDeactivateAllSecurityUsers,
  onListSecurityUsers,
  onUpdateSecurityUserStatus,
  onCreateUser,
  onCreateRole,
  onExportAdmin,
  onExportPluUsa,
  onSaveEvent,
  onSaveShopProduct,
  onScheduleAssigned,
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
  athletes,
  registrations,
  tickets,
  shopProducts,
  users,
  roleLabel,
  isPluUsaPartner = false,
  isCheckinOnly = false,
  onExit,
}) {
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
          canManageUsers={canManageUsers}
          onCreateSecurityUser={onCreateSecurityUser}
          onCreateUser={onCreateUser}
          onNavigateRoles={
            allowedSections.includes('roles') ? () => setSection('roles') : undefined
          }
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
      restrictedNav={isPluUsaPartner ? 'pluUsa' : isCheckinOnly ? 'checkin' : false}
    >
      <div
        className="admin-page admin-section-enter"
        key={`${section}-${selectedAthleteId ?? 'list'}`}
      >
        <Suspense fallback={<PageLoadFallback />}>{renderSection()}</Suspense>
      </div>
    </AdminShell>
  )
}
