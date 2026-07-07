import { useState } from 'react'
import AdminShell from '../components/layout/AdminShell.jsx'
import AthleteDetailSection from './admin/AthleteDetailSection.jsx'
import AthletesSection from './admin/AthletesSection.jsx'
import CheckInSection from './admin/CheckInSection.jsx'
import DashboardSection from './admin/DashboardSection.jsx'
import EventsSection from './admin/EventsSection.jsx'
import MembershipsSection from './admin/MembershipsSection.jsx'
import PlaceholderSection from './admin/PlaceholderSection.jsx'
import RegistrationsSection from './admin/RegistrationsSection.jsx'
import TicketOrdersSection from './admin/TicketOrdersSection.jsx'
import UsersSection from './admin/UsersSection.jsx'

export default function AdminPage({
  adminEvents,
  canCheckIn,
  canEdit,
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
  onCheckInRegistration,
  onCheckInTicket,
  onRedeemTicketAddon,
  onRefreshTickets,
  onRefreshPendingTicketOrders,
  onCreateUser,
  onExportAdmin,
  onExportPluUsa,
  onSaveEvent,
  onSetFilters,
  onUpdateUserRole,
  payments,
  pendingTicketOrders,
  athletes,
  registrations,
  tickets,
  users,
  roleLabel,
  onExit,
}) {
  const [section, setSection] = useState('dashboard')
  const [globalSearch, setGlobalSearch] = useState('')
  const [selectedAthleteId, setSelectedAthleteId] = useState(null)

  const pendingPayments = payments.filter(
    (payment) => payment.status === 'pendiente' || payment.status === 'validacion_manual',
  ).length

  function handleSectionChange(nextSection) {
    setSection(nextSection)
    if (nextSection !== 'athletes') {
      setSelectedAthleteId(null)
    }
  }

  function handleSelectAthlete(athleteId) {
    setSelectedAthleteId(athleteId)
    setSection('athletes')
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
          canEdit={canEdit}
          globalSearch={globalSearch}
          onGlobalSearchChange={setGlobalSearch}
        />
      )
    }

    if (section === 'athletes') {
      if (selectedAthleteId) {
        return (
          <AthleteDetailSection
            detail={getAthleteDetail(selectedAthleteId)}
            onBack={() => setSelectedAthleteId(null)}
            canEdit={canEdit}
            onApprovePayment={onApprovePayment}
          />
        )
      }

      return <AthletesSection athletes={athletes} onSelectAthlete={handleSelectAthlete} />
    }

    if (section === 'memberships') {
      return (
        <MembershipsSection memberships={enrichedMemberships} onSelectAthlete={handleSelectAthlete} />
      )
    }

    if (section === 'registrations') {
      return (
        <RegistrationsSection
          canEdit={canEdit}
          filters={filters}
          filteredRegistrations={filteredRegistrations}
          payments={payments}
          registrations={registrations}
          registrationsCount={registrations.length}
          onApprovePayment={onApprovePayment}
          onExportAdmin={onExportAdmin}
          onExportPluUsa={onExportPluUsa}
          onSetFilters={onSetFilters}
        />
      )
    }

    if (section === 'events') {
      return (
        <EventsSection adminEvents={adminEvents} canEdit={canEdit} onSaveEvent={onSaveEvent} tickets={tickets} />
      )
    }

    if (section === 'checkin') {
      return (
        <CheckInSection
          athletes={athletes}
          canCheckIn={canCheckIn}
          memberships={enrichedMemberships}
          onCheckInRegistration={onCheckInRegistration}
          onCheckInTicket={onCheckInTicket}
          onRedeemTicketAddon={onRedeemTicketAddon}
          onRefreshTickets={onRefreshTickets}
          registrations={registrations}
          tickets={tickets}
        />
      )
    }

    if (section === 'users') {
      return (
        <UsersSection
          canManageUsers={canManageUsers}
          onCreateUser={onCreateUser}
          onUpdateRole={onUpdateUserRole}
          users={users}
        />
      )
    }

    if (section === 'payments') {
      return (
        <TicketOrdersSection
          canEdit={canEdit}
          pendingTicketOrders={pendingTicketOrders}
          onApproveTicketOrder={onApproveTicketPurchase}
          onRefresh={onRefreshPendingTicketOrders}
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
    >
      <div className="admin-page admin-section-enter" key={`${section}-${selectedAthleteId ?? 'list'}`}>
        {renderSection()}
      </div>
    </AdminShell>
  )
}
