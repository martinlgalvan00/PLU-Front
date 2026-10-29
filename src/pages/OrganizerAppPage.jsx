import { useEffect, useMemo } from 'react'
import { ArrowRight, CalendarDays, LogOut } from 'lucide-react'
import BrandLogo from '../components/ui/BrandLogo.jsx'
import LanguageToggle from '../components/ui/LanguageToggle.jsx'
import ThemeToggle from '../components/ui/ThemeToggle.jsx'
import EventsSection from './admin/EventsSection.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  clearAdminEventRoute,
  pushAdminEventRoute,
} from '../lib/adminEventRoute.js'
import { formatDayMonth } from '../lib/format.js'
import { canManageEventTeam } from '../lib/roles.js'
import { getStatusMeta } from '../lib/status.js'
import { hasPermission } from '../lib/permissions.js'
import '../styles/layout/admin-shell.css'
import '../styles/pages/admin.css'
import '../styles/pages/organizer-home.css'

/**
 * Shell exclusivo del organizador (cuenta por evento).
 *
 * Sin menú global del admin: solo sus eventos. 0 → estado pendiente; 1 → entra
 * al workspace; N → home con tarjetas. La operación vive en EventsSection /
 * AdminEventWorkspace con `eventScoped`.
 */
export default function OrganizerAppPage({
  adminEvents = [],
  adminEventsError = null,
  adminEventsLoading = false,
  adminEventWorkspaceSlug = null,
  athletes = [],
  authorization,
  gatePendingIds,
  onApprovePayment,
  onApproveTicketOrder,
  onAssignSecurityZone,
  onClearEventPriceSchedule,
  onCreateSecurityAccessLink,
  onCreateSecurityUser,
  onCreateSecurityUsersBulk,
  onCreateSecurityZone,
  onDeactivateAllSecurityUsers,
  onDeleteSecurityZone,
  onExit,
  onGetEventScanReport,
  onListSecurityUsers,
  onListSecurityZones,
  onManageCheckin,
  onPresetSecurityZones,
  onRefreshAdminEvents,
  onRefreshPayments,
  onRejectPayment,
  onRejectTicketOrder,
  onSaveEvent,
  onSetEventLogo,
  onSetEventRegistrationPrice,
  onSetRegistrationStatus,
  onSetTicketAccessOverride,
  onUpdateSecurityUserStatus,
  onUpdateSecurityZone,
  payments = [],
  pendingTicketOrders = [],
  registrations = [],
  roleLabel,
  tickets = [],
}) {
  const { locale, t } = useI18n()
  const sessionName = authorization?.name ?? ''
  const isSecurityCoordinator = authorization?.roleKey === 'coordinador_seguridad'
  const canEdit = hasPermission(authorization, 'admin.events.write')
  const teamAccess = canManageEventTeam(authorization)
  const canValidatePayments = hasPermission(authorization, 'admin.payments.approve')
  const canReadRegistrations = hasPermission(authorization, 'admin.registrations.read')
  const canSetRegistrationStatus = hasPermission(authorization, 'admin.registrations.write')
  const canCheckIn = hasPermission(authorization, 'admin.checkin.execute')
  const workspaceOpen = Boolean(adminEventWorkspaceSlug)
  const singleEventSlug =
    !workspaceOpen && !adminEventsLoading && !adminEventsError && adminEvents.length === 1
      ? (adminEvents[0]?.slug ?? null)
      : null

  // Un solo evento autorizado: ir directo al control, sin pasar por el home.
  useEffect(() => {
    if (!singleEventSlug) return
    pushAdminEventRoute(singleEventSlug)
  }, [singleEventSlug])

  const homeEvents = useMemo(
    () =>
      [...adminEvents].sort((a, b) => {
        const aDate = a.dateISO || a.startsAt || ''
        const bDate = b.dateISO || b.startsAt || ''
        return String(aDate).localeCompare(String(bDate))
      }),
    [adminEvents],
  )

  function openEvent(event) {
    if (!event?.slug) return
    pushAdminEventRoute(event.slug)
  }

  function handleBackHome() {
    clearAdminEventRoute()
  }

  return (
    <div className="organizer-app">
      <header className="organizer-app__top">
        <div className="organizer-app__brand">
          <BrandLogo variant="argentina" height={28} />
          <div className="organizer-app__brand-copy">
            <span className="organizer-app__eyebrow">
              {t(
                isSecurityCoordinator
                  ? 'admin.organizer.coordinatorEyebrow'
                  : 'admin.organizer.eyebrow',
              )}
            </span>
            <strong>
              {sessionName ||
                t(
                  isSecurityCoordinator
                    ? 'admin.organizer.coordinatorTitle'
                    : 'admin.organizer.title',
                )}
            </strong>
            <span>
              {roleLabel ||
                t(
                  isSecurityCoordinator
                    ? 'admin.organizer.coordinatorRoleFallback'
                    : 'admin.organizer.roleFallback',
                )}
            </span>
          </div>
        </div>
        <div className="organizer-app__top-actions">
          {workspaceOpen ? (
            <button type="button" className="organizer-app__nav-link" onClick={handleBackHome}>
              {t('admin.organizer.myEvents')}
            </button>
          ) : null}
          <LanguageToggle />
          <ThemeToggle />
          <button type="button" className="organizer-app__exit" onClick={onExit}>
            <LogOut size={15} aria-hidden />
            <span>{t('admin.organizer.exit')}</span>
          </button>
        </div>
      </header>

      <main className="organizer-app__main">
        {workspaceOpen ? (
          <div className="admin-shell organizer-app__workspace">
            <EventsSection
              adminEvents={adminEvents}
              adminEventWorkspaceSlug={adminEventWorkspaceSlug}
              athletes={athletes}
              canDeleteEvents={false}
              canEdit={canEdit}
              canManageEventTeam={teamAccess}
              canManageUsers={false}
              canValidatePayments={canValidatePayments}
              canSetRegistrationStatus={canSetRegistrationStatus}
              canViewScanReport={false}
              eventScoped
              gatePendingIds={canReadRegistrations ? gatePendingIds : undefined}
              isLoading={adminEventsLoading}
              loadError={adminEventsError}
              onApprovePayment={onApprovePayment}
              onApproveTicketOrder={onApproveTicketOrder}
              onSetRegistrationStatus={
                canSetRegistrationStatus ? onSetRegistrationStatus : undefined
              }
              onAssignSecurityZone={onAssignSecurityZone}
              onClearEventPriceSchedule={onClearEventPriceSchedule}
              onCreateSecurityAccessLink={onCreateSecurityAccessLink}
              onCreateSecurityUser={onCreateSecurityUser}
              onCreateSecurityUsersBulk={onCreateSecurityUsersBulk}
              onCreateSecurityZone={onCreateSecurityZone}
              onDeactivateAllSecurityUsers={onDeactivateAllSecurityUsers}
              onDeleteSecurityZone={onDeleteSecurityZone}
              onGetEventScanReport={onGetEventScanReport}
              onListSecurityUsers={onListSecurityUsers}
              onListSecurityZones={onListSecurityZones}
              onManageCheckin={canCheckIn ? onManageCheckin : undefined}
              onPresetSecurityZones={onPresetSecurityZones}
              onRefresh={onRefreshAdminEvents}
              onRefreshPayments={onRefreshPayments}
              onRejectPayment={onRejectPayment}
              onRejectTicketOrder={onRejectTicketOrder}
              onSaveEvent={onSaveEvent}
              onSetEventLogo={onSetEventLogo}
              onSetEventRegistrationPrice={onSetEventRegistrationPrice}
              onSetTicketAccessOverride={onSetTicketAccessOverride}
              onUpdateSecurityUserStatus={onUpdateSecurityUserStatus}
              onUpdateSecurityZone={onUpdateSecurityZone}
              payments={payments}
              pendingTicketOrders={pendingTicketOrders}
              registrations={canReadRegistrations ? registrations : []}
              showRegistrations={canReadRegistrations}
              tickets={tickets}
            />
          </div>
        ) : (adminEventsLoading && adminEvents.length === 0) || singleEventSlug ? (
          <div className="organizer-home__loading" role="status">
            <span className="plu-spinner plu-spinner--lg" aria-hidden="true" />
            <p>{t('admin.organizer.loading')}</p>
          </div>
        ) : adminEventsError ? (
          <div className="organizer-home__empty" role="alert">
            <CalendarDays size={22} strokeWidth={1.5} aria-hidden />
            <h1>{t('admin.organizer.loadErrorTitle')}</h1>
            <p>{adminEventsError}</p>
            {onRefreshAdminEvents ? (
              <button type="button" className="organizer-home__retry" onClick={onRefreshAdminEvents}>
                {t('admin.organizer.retry')}
              </button>
            ) : null}
          </div>
        ) : homeEvents.length === 0 ? (
          <div className="organizer-home__empty">
            <CalendarDays size={22} strokeWidth={1.5} aria-hidden />
            <h1>{t('admin.organizer.emptyTitle')}</h1>
            <p>{t('admin.organizer.emptyLead')}</p>
          </div>
        ) : (
          <section className="organizer-home" aria-labelledby="organizer-home-title">
            <header className="organizer-home__head">
              <h1 id="organizer-home-title">
                {t(
                  isSecurityCoordinator
                    ? 'admin.organizer.coordinatorHomeTitle'
                    : 'admin.organizer.homeTitle',
                )}
              </h1>
              <p>
                {t(
                  isSecurityCoordinator
                    ? 'admin.organizer.coordinatorHomeLead'
                    : 'admin.organizer.homeLead',
                )}
              </p>
            </header>
            <ul className="organizer-home__list">
              {homeEvents.map((event) => {
                const status = getStatusMeta(event.status, t)
                const dateLabel = event.dateISO
                  ? formatDayMonth(event.dateISO, locale)
                  : (event.date ?? '')
                const venue = [event.venue, event.location].filter(Boolean).join(' · ')
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="organizer-home__card"
                      onClick={() => openEvent(event)}
                    >
                      <span className="organizer-home__card-copy">
                        <strong>{event.title}</strong>
                        <span className="organizer-home__meta">
                          {[dateLabel, venue].filter(Boolean).join(' · ')}
                        </span>
                        {status?.label ? (
                          <span className="organizer-home__status">{status.label}</span>
                        ) : null}
                      </span>
                      <span className="organizer-home__card-go" aria-hidden>
                        <ArrowRight size={18} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  )
}
