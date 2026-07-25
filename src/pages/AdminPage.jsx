import { useEffect, useState } from 'react'
import AdminShell from '../components/layout/AdminShell.jsx'
import AthleteDetailSection from './admin/AthleteDetailSection.jsx'
import AthletesSection from './admin/AthletesSection.jsx'
import DashboardSection from './admin/DashboardSection.jsx'
import EventsSection from './admin/EventsSection.jsx'
import MembershipsSection from './admin/MembershipsSection.jsx'
import PlaceholderSection from './admin/PlaceholderSection.jsx'
import PluUsaSection from './admin/PluUsaSection.jsx'
import RegistrationsSection from './admin/RegistrationsSection.jsx'
import PaymentsOperationsSection from './admin/PaymentsOperationsSection.jsx'
import ShopSection from './admin/ShopSection.jsx'
import UsersSection from './admin/UsersSection.jsx'
import RolesSection from './admin/RolesSection.jsx'
import { hasAnyPermission, hasPermission } from '../lib/permissions.js'

export default function AdminPage({
  accessRoles,
  adminEvents,
  allowedSections = [],
  authorization,
  canManageUsers,
  dashboardOverview,
  filters,
  filteredRegistrations,
  enrichedMemberships,
  pendingActions,
  adminNavBadges,
  recentActivity,
  getAthleteDetail,
  onApprovePayment,
  onApproveTicketPurchase,
  onRefreshPendingTicketOrders,
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
  onSetFilters,
  onUpdateUserRole,
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
    allowedSections.includes(preferredSection) ? preferredSection : allowedSections[0] ?? preferredSection,
  )
  const [globalSearch, setGlobalSearch] = useState('')
  const [selectedAthleteId, setSelectedAthleteId] = useState(null)

  const pendingPayments = payments.filter(
    (payment) => payment.status === 'pendiente' || payment.status === 'validacion_manual',
  ).length

  useEffect(() => {
    if (allowedSections.length > 0 && !allowedSections.includes(section)) {
      setSection(allowedSections[0])
      setSelectedAthleteId(null)
    }
  }, [allowedSections, section])

  function handleSectionChange(nextSection) {
    if (!allowedSections.includes(nextSection)) return
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

  function renderSection() {
    if (section === 'dashboard') {
      return (
        <DashboardSection
          dashboardOverview={dashboardOverview}
          pendingActions={pendingActions}
          pendingPayments={pendingPayments}
          recentActivity={recentActivity}
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
        />
      )
    }

    if (section === 'registrations') {
      return (
        <RegistrationsSection
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
          onSetFilters={onSetFilters}
        />
      )
    }

    if (section === 'events') {
      return (
        <EventsSection
          adminEvents={adminEvents}
          canEdit={hasPermission(authorization, 'admin.events.write')}
          canManageUsers={canManageUsers}
          onCreateSecurityUser={onCreateSecurityUser}
          onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
          onCreateSecurityAccessLink={onCreateSecurityAccessLink}
          onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
          onListSecurityUsers={onListSecurityUsers}
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
          onUpdateRole={onUpdateUserRole}
          users={users}
        />
      )
    }

    if (section === 'roles') {
      return (
        <RolesSection
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
          pendingTicketOrders={pendingTicketOrders}
          isLoading={pendingTicketOrdersLoading}
          loadError={pendingTicketOrdersError}
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

    if (['results', 'exports', 'audit'].includes(section)) {
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
        {renderSection()}
      </div>
    </AdminShell>
  )
}
