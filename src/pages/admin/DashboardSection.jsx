import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  MapPin,
  Send,
  Shield,
  Trash2,
  Users,
} from 'lucide-react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
import AdminActionDrawer from '../../components/admin/AdminActionDrawer.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import ActionQueue from '../../components/admin/ActionQueue.jsx'
import { useAdminModal } from '../../components/admin/useAdminModal.js'
import Button from '../../components/ui/Button.jsx'
import { getLaunchInterestSummary, notifyLaunchInterestSource } from '../../services/launchInterestService.js'
import { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import CollectionDonut from '../../components/admin/CollectionDonut.jsx'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { METRIC_LABEL_KEYS } from '../../i18n/adminHelpers.js'
import { getStatusMeta } from '../../lib/status.js'
import { formatDayMonth, formatShortMemberCode, initials, money } from '../../lib/format.js'

const QUEUE_PREVIEW_LIMIT = 6

const METRIC_TONES = {
  users: 'celeste',
  badge: 'gold',
  clipboard: 'default',
  shield: 'alert',
  success: 'celeste',
  warning: 'alert',
  celeste: 'celeste',
  gold: 'gold',
  alert: 'alert',
  default: 'default',
}

const METRIC_ICONS = {
  users: Users,
  badge: BadgeCheck,
  clipboard: ClipboardList,
  shield: Shield,
}

const QUICK_ACTIONS = [
  { section: 'registrations', labelKey: 'admin.nav.registrations' },
  { section: 'payments', labelKey: 'admin.nav.payments' },
  { section: 'athletes', labelKey: 'admin.nav.athletes' },
  { section: 'events', labelKey: 'admin.nav.events' },
  { section: 'memberships', labelKey: 'admin.nav.memberships' },
]

const LAUNCH_SOURCE_LABEL_KEYS = {
  pitbull_page: 'admin.dashboard.launchInterest.sources.pitbullPage',
  launch_teaser: 'admin.dashboard.launchInterest.sources.launchTeaser',
}

function humanizeLaunchSource(source, t) {
  const labelKey = LAUNCH_SOURCE_LABEL_KEYS[source]
  if (labelKey) return t(labelKey)
  const words = String(source ?? '').trim().replace(/[_-]+/g, ' ')
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : t('admin.dashboard.launchInterest.unknownSource')
}

function mapMetrics(items, t, locale) {
  return items.map((item) => {
    let hint = null
    if (item.hintKey === 'expiringSoon' && item.hintValue > 0) {
      hint = t('admin.dashboard.kpiHintExpiring', { count: item.hintValue })
    } else if (item.hintKey === 'gatePending' && item.hintValue > 0) {
      hint = t('admin.dashboard.kpiHintGatePending', { count: item.hintValue })
    } else if (item.hintKey === 'observed' && item.hintValue > 0) {
      hint = t('admin.dashboard.kpiHintObserved', { count: item.hintValue })
    } else if (item.hintKey === 'pendingAmount' && item.hintValue > 0) {
      hint = t('admin.dashboard.kpiHintPendingAmount', {
        amount: money(item.hintValue, locale),
      })
    } else if (item.hintKey === 'newThisWeek' && item.hintValue > 0) {
      hint = t('admin.dashboard.kpiHintNewThisWeek', { count: item.hintValue })
    }

    return {
      ...item,
      label: t(METRIC_LABEL_KEYS[item.labelKey] ?? item.labelKey),
      tone: METRIC_TONES[item.tone ?? item.icon] ?? item.tone ?? 'default',
      hint,
    }
  })
}

function DashboardKpiTile({ icon, label, value, hint, tone, onClick }) {
  const Icon = METRIC_ICONS[icon] ?? Users

  return (
    <button
      type="button"
      className={`admin-ops__kpi admin-ops__kpi--${tone}`}
      onClick={onClick}
    >
      <span className="admin-ops__kpi-icon" aria-hidden>
        <Icon size={15} strokeWidth={1.7} />
      </span>
      <span className="admin-ops__kpi-body">
        {typeof value === 'number' ? (
          <AnimatedNumber className="admin-ops__kpi-value" value={value} />
        ) : (
          <span className="admin-ops__kpi-value">{value}</span>
        )}
        <span className="admin-ops__kpi-label">{label}</span>
        {hint ? <span className="admin-ops__kpi-hint">{hint}</span> : null}
      </span>
    </button>
  )
}

function StackedBarChart({ title, total, items, section, onNavigate, getLabel, t }) {
  const activeItems = items.filter((item) => item.value > 0)
  const isEmpty = activeItems.length === 0
  const chartTotal = Math.max(
    total,
    activeItems.reduce((sum, item) => sum + item.value, 0),
    1,
  )
  const totalLabel = t('admin.dashboard.chartTotal', { count: total })
  const segmentSummary = !isEmpty
    ? activeItems
        .map((item) => {
          const percent = Math.round((item.value / chartTotal) * 100)
          return `${getLabel(item)} ${item.value} (${percent}%)`
        })
        .join(', ')
    : t('admin.dashboard.breakdownEmpty')
  const stackLabel = `${title}: ${totalLabel}. ${segmentSummary}`

  return (
    <section className={`admin-ops__chart${isEmpty ? ' admin-ops__chart--empty' : ''}`}>
      <header className="admin-ops__chart-head">
        <div className="admin-ops__chart-copy">
          <div className="admin-ops__chart-title-row">
            <h3>{title}</h3>
            <strong className="admin-ops__chart-total" aria-label={totalLabel}>
              {total}
            </strong>
          </div>
        </div>
        <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.(section)}>
          {t('admin.actions.view')}
          <ArrowRight size={12} aria-hidden />
        </button>
      </header>

      <div className="admin-ops__stack" role="img" aria-label={stackLabel}>
        {!isEmpty ? (
          activeItems.map((item) => (
            <span
              key={item.status}
              className={`admin-ops__stack-seg admin-ops__stack-seg--${item.tone}`}
              style={{ width: `${Math.max((item.value / chartTotal) * 100, 2)}%` }}
              title={`${getLabel(item)}: ${item.value}`}
            />
          ))
        ) : (
          <span className="admin-ops__stack-seg admin-ops__stack-seg--empty" />
        )}
      </div>

      {!isEmpty ? (
        <ul className="admin-ops__chart-legend">
          {activeItems.map((item) => {
            const percent = Math.round((item.value / chartTotal) * 100)
            return (
              <li
                key={item.status}
                className={`admin-ops__chart-legend-item admin-ops__chart-legend-item--${item.tone}`}
              >
                <span>{getLabel(item)}</span>
                <strong>{item.value}</strong>
                <em>{percent}%</em>
                {typeof item.amount === 'number' && item.amount > 0 ? (
                  <small>{money(item.amount)}</small>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="admin-ops__chart-empty">{t('admin.dashboard.breakdownEmpty')}</p>
      )}
    </section>
  )
}

function SpotlightInline({ event, locale, onNavigate, t }) {
  if (!event) return null

  const { label: statusLabel, tone } = getStatusMeta(event.status, t)
  const fillPercent = event.slots > 0 ? Math.round((event.registered / event.slots) * 100) : 0
  const closesAt = event.registrationClosesAt
    ? formatDayMonth(event.registrationClosesAt.slice(0, 10), locale)
    : null

  return (
    <aside className="admin-ops__spotlight">
      <div className="admin-ops__spotlight-copy">
        <span className="admin-ops__eyebrow">{t('admin.dashboard.spotlightTitle')}</span>
        <strong>{event.title}</strong>
        <p>
          <CalendarDays size={12} aria-hidden />
          {event.date}
          <MapPin size={12} aria-hidden />
          {event.venue}
          {closesAt ? ` · ${t('admin.dashboard.registrationCloses')} ${closesAt}` : ''}
        </p>
      </div>
      <div className="admin-ops__spotlight-meter" aria-label={t('admin.dashboard.slots')}>
        <div className="admin-ops__spotlight-bar">
          <span style={{ width: `${fillPercent}%` }} />
        </div>
        <span>
          {event.registered}/{event.slots} · {fillPercent}%
        </span>
        <span className={`admin-ops__spotlight-status admin-ops__spotlight-status--${tone}`}>
          {statusLabel}
        </span>
      </div>
      <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('events')}>
        {t('admin.actions.manage')}
        <ArrowRight size={12} aria-hidden />
      </button>
    </aside>
  )
}

function RecentAthletesCard({ athletes, locale, onNavigate, onSelectAthlete, t }) {
  if (!athletes?.items?.length) return null

  return (
    <section className="admin-ops__recent" aria-label={t('admin.dashboard.recentAthletesTitle')}>
      <header className="admin-ops__chart-head">
        <div>
          <p className="admin-ops__eyebrow">{t('admin.dashboard.recentAthletesEyebrow')}</p>
          <h3>{t('admin.dashboard.recentAthletesTitle')}</h3>
          <p>{t('admin.dashboard.recentAthletesSubtitle')}</p>
        </div>
        <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('athletes')}>
          {t('admin.actions.view')}
          <ArrowRight size={12} aria-hidden />
        </button>
      </header>

      <ul className="admin-ops__recent-list">
        {athletes.items.map((athlete) => (
          <li key={athlete.id} className="admin-ops__recent-item">
            <button
              type="button"
              className="admin-ops__recent-open"
              onClick={() => onSelectAthlete?.(athlete.id)}
            >
              <span className="admin-ops__recent-avatar" aria-hidden>
                {athlete.photoUrl ? (
                  <img
                    className="admin-ops__recent-avatar-photo"
                    src={athlete.photoUrl}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
                ) : null}
                <span>{initials(athlete.fullName)}</span>
              </span>
              <span className="admin-ops__recent-body">
                <strong>{athlete.fullName}</strong>
                <span>{athlete.gym || t('admin.dashboard.recentAthletesNoGym')}</span>
              </span>
              <span className="admin-ops__recent-date">
                {formatDayMonth(athlete.createdAt.slice(0, 10), locale)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Afiliaciones recientes. Separada de `RecentAthletesCard` a propósito: esa
 * lista son altas de cuenta, y registrarse no afilia a nadie. Acá se ve quién
 * quedó cubierto, con qué código y desde cuándo.
 *
 * La fila abre el detalle del atleta; el botón de peligro (solo Super Admin)
 * elimina al atleta con toda su cascada, reusando el mismo dialog y endpoint
 * que la zona de peligro del detalle.
 */
function RecentMembershipsCard({
  memberships,
  locale,
  onNavigate,
  onSelectAthlete,
  canDeleteAthlete = false,
  onDeleteAthlete,
  getAthleteDetail,
  t,
}) {
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  if (!memberships?.items?.length) return null

  const pendingDetail =
    pendingDelete && getAthleteDetail ? getAthleteDetail(pendingDelete.athleteId) : null

  function closeDeleteDialog() {
    if (deleteBusy) return
    setPendingDelete(null)
    setDeleteError('')
  }

  async function handleDelete() {
    if (!pendingDelete || !onDeleteAthlete) return
    setDeleteError('')
    setDeleteBusy(true)
    try {
      await onDeleteAthlete(pendingDelete.athleteId)
      setPendingDelete(null)
    } catch (error) {
      setDeleteError(error?.message ?? t('admin.athleteDetail.delete.error'))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <section className="admin-ops__recent" aria-label={t('admin.dashboard.recentMembershipsTitle')}>
      <header className="admin-ops__chart-head">
        <div>
          <p className="admin-ops__eyebrow">{t('admin.dashboard.recentMembershipsEyebrow')}</p>
          <h3>{t('admin.dashboard.recentMembershipsTitle')}</h3>
          <p>{t('admin.dashboard.recentMembershipsSubtitle')}</p>
        </div>
        <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('memberships')}>
          {t('admin.actions.view')}
          <ArrowRight size={12} aria-hidden />
        </button>
      </header>

      <ul className="admin-ops__recent-list">
        {memberships.items.map((membership) => (
          <li key={membership.id} className="admin-ops__recent-item admin-ops__recent-item--actionable">
            <button
              type="button"
              className="admin-ops__recent-open"
              onClick={() => onSelectAthlete?.(membership.athleteId)}
            >
              <span className="admin-ops__recent-avatar" aria-hidden>
                {membership.photoUrl ? (
                  <img
                    className="admin-ops__recent-avatar-photo"
                    src={membership.photoUrl}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
                ) : null}
                <span>{initials(membership.fullName)}</span>
              </span>
              <span className="admin-ops__recent-body">
                <strong>{membership.fullName}</strong>
                <span className="data-table__mono" title={membership.memberCode ?? undefined}>
                  {formatShortMemberCode(membership.memberCode) || '—'}
                </span>
              </span>
              <span className="admin-ops__recent-date">
                <StatusBadge value={membership.status} />
                {membership.startDate ? (
                  <time dateTime={membership.startDate.slice(0, 10)}>
                    {formatDayMonth(membership.startDate.slice(0, 10), locale)}
                  </time>
                ) : null}
              </span>
            </button>
            {canDeleteAthlete && onDeleteAthlete ? (
              <AdminIconButton
                icon={Trash2}
                label={t('admin.dashboard.recentMembershipsDelete', { name: membership.fullName })}
                onClick={() => setPendingDelete(membership)}
                variant="danger"
              />
            ) : null}
          </li>
        ))}
      </ul>

      {pendingDelete ? (
        <AdminDeleteConfirmDialog
          busy={deleteBusy}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void handleDelete()}
          title={t('admin.athleteDetail.delete.confirmTitle')}
          description={t('admin.athleteDetail.delete.confirmDescription', {
            name: pendingDetail?.athlete?.fullName ?? pendingDelete.fullName,
            documentId: pendingDetail?.athlete?.documentId ?? '—',
            memberships: pendingDetail?.memberships?.length ?? 0,
            registrations: pendingDetail?.registrations?.length ?? 0,
            payments: pendingDetail?.payments?.length ?? 0,
          })}
          warning={t('admin.athleteDetail.delete.warning')}
          cancelLabel={t('admin.athleteDetail.delete.cancel')}
          confirmLabel={t('admin.athleteDetail.delete.confirm')}
          busyLabel={t('admin.athleteDetail.delete.deleting')}
        />
      ) : null}
    </section>
  )
}

function RecentRegistrationsCard({ registrations, locale, onNavigate, onSelectAthlete, t }) {
  if (!registrations?.items?.length) return null

  return (
    <section className="admin-ops__recent" aria-label={t('admin.dashboard.recentRegistrationsTitle')}>
      <header className="admin-ops__chart-head">
        <div>
          <p className="admin-ops__eyebrow">{t('admin.dashboard.recentRegistrationsEyebrow')}</p>
          <h3>{t('admin.dashboard.recentRegistrationsTitle')}</h3>
          <p>{t('admin.dashboard.recentRegistrationsSubtitle')}</p>
        </div>
        <button type="button" className="admin-dashboard-link" onClick={() => onNavigate?.('registrations')}>
          {t('admin.actions.view')}
          <ArrowRight size={12} aria-hidden />
        </button>
      </header>

      <ul className="admin-ops__recent-list">
        {registrations.items.map((registration) => (
          <li key={registration.id} className="admin-ops__recent-item">
            <button
              type="button"
              className="admin-ops__recent-open"
              onClick={() => onSelectAthlete?.(registration.athleteId)}
            >
              <span className="admin-ops__recent-avatar" aria-hidden>
                {registration.photoUrl ? (
                  <img
                    className="admin-ops__recent-avatar-photo"
                    src={registration.photoUrl}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />
                ) : null}
                <span>{initials(registration.fullName)}</span>
              </span>
              <span className="admin-ops__recent-body">
                <strong>{registration.fullName}</strong>
                <span>
                  {[registration.event, registration.category, registration.division]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="admin-ops__recent-date">
                <StatusBadge value={registration.status} />
                <time dateTime={registration.createdAt.slice(0, 10)}>
                  {formatDayMonth(registration.createdAt.slice(0, 10), locale)}
                </time>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function LeaderboardCard({
  eyebrow,
  title,
  subtitle,
  items,
  navigateSection,
  onNavigate,
  t,
  renderItem,
  featured = false,
}) {
  if (!items?.length) return null

  return (
    <section
      className={`admin-ops__leaderboard${featured ? ' admin-ops__leaderboard--featured' : ''}`}
      aria-label={title}
    >
      <header className="admin-ops__leaderboard-head">
        <div className="admin-ops__leaderboard-copy">
          <p className="admin-ops__eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          {subtitle ? <p className="admin-ops__leaderboard-sub">{subtitle}</p> : null}
        </div>
        {navigateSection ? (
          <button
            type="button"
            className="admin-dashboard-link"
            onClick={() => onNavigate?.(navigateSection)}
          >
            {t('admin.actions.view')}
            <ArrowRight size={12} aria-hidden />
          </button>
        ) : null}
      </header>
      <ul className="admin-ops__leaderboard-list">{items.map(renderItem)}</ul>
    </section>
  )
}

function LaunchInterestWidget() {
  const { t } = useI18n()
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [notifying, setNotifying] = useState(null)
  const [confirmSource, setConfirmSource] = useState(null)
  const [notifyError, setNotifyError] = useState('')

  async function loadSummary() {
    try {
      setLoading(true)
      const res = await getLaunchInterestSummary()
      if (res?.summary) {
        setSummary(res.summary)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [])

  async function confirmNotify() {
    const source = confirmSource
    if (!source) return
    setNotifyError('')
    try {
      setNotifying(source)
      await notifyLaunchInterestSource(source)
      await loadSummary()
      setConfirmSource(null)
    } catch (err) {
      setNotifyError(err.message || 'Error al notificar')
    } finally {
      setNotifying(null)
    }
  }

  if (loading || summary.length === 0) return null

  return (
    <section className="admin-ops__recent" aria-label="Lanzamientos">
      <header className="admin-ops__chart-head">
        <div>
          <p className="admin-ops__eyebrow">{t('admin.dashboard.launchInterest.eyebrow')}</p>
          <h3>{t('admin.dashboard.launchInterest.title')}</h3>
          <p>{t('admin.dashboard.launchInterest.subtitle')}</p>
        </div>
      </header>
      <ul className="admin-ops__recent-list">
        {summary.map((item) => {
          const sourceLabel = humanizeLaunchSource(item.source, t)
          return (
            <li key={item.source} className="admin-ops__recent-item admin-ops__recent-item--actionable">
              <div className="admin-ops__recent-open admin-ops__recent-open--static">
                <span className="admin-ops__recent-avatar" aria-hidden>
                  {sourceLabel.charAt(0).toUpperCase()}
                </span>
                <span className="admin-ops__recent-body">
                  <strong>{sourceLabel}</strong>
                  <span>{t('admin.dashboard.launchInterest.total', { count: item.total })}</span>
                </span>
                <span className="admin-ops__recent-date">
                  <StatusBadge value={item.pending > 0 ? 'pendiente' : 'aprobado'} />
                  <span>{t('admin.dashboard.launchInterest.pending', { count: item.pending })}</span>
                </span>
              </div>
              {item.pending > 0 ? (
                <AdminIconButton
                  icon={Send}
                  label={t('admin.dashboard.launchInterest.notify', {
                    count: item.pending,
                    source: sourceLabel,
                  })}
                  onClick={() => {
                    setNotifyError('')
                    setConfirmSource(item.source)
                  }}
                  disabled={notifying === item.source}
                  variant="primary"
                />
              ) : null}
            </li>
          )
        })}
      </ul>

      {confirmSource ? (
        <LaunchInterestConfirmDialog
          sourceLabel={humanizeLaunchSource(confirmSource, t)}
          pending={summary.find((item) => item.source === confirmSource)?.pending ?? 0}
          busy={notifying === confirmSource}
          error={notifyError}
          onCancel={() => setConfirmSource(null)}
          onConfirm={confirmNotify}
        />
      ) : null}
    </section>
  )
}

function LaunchInterestConfirmDialog({ sourceLabel, pending, busy, error, onCancel, onConfirm }) {
  const panelRef = useAdminModal(onCancel)

  return createPortal(
    <div className="admin-user-delete-dialog">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label="Cancelar"
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-user-delete-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-interest-confirm-title"
      >
        <span className="admin-user-delete-dialog__icon" aria-hidden>
          <Send size={19} />
        </span>
        <div className="admin-user-delete-dialog__copy">
          <h2 id="launch-interest-confirm-title">Enviar aviso de lanzamiento</h2>
          <p>{`¿Enviar aviso a los ${pending} pendientes de "${sourceLabel}"?`}</p>
          {error ? (
            <p className="admin-user-delete-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="admin-user-delete-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Enviando…' : 'Enviar aviso'}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export default function DashboardSection({
  dashboardOverview,
  pendingActions,
  pendingPayments,
  onNavigate,
  onApprovePayment,
  onRejectPayment,
  onApproveTicketOrder,
  onRejectTicketOrder,
  canEdit,
  canDeleteAthletes = false,
  onDeleteAthlete,
  onSelectAthlete,
  getAthleteDetail,
  globalSearch,
  onGlobalSearchChange,
  onGlobalSearchSubmit,
}) {
  const { locale, t } = useI18n()
  const [alertsOpen, setAlertsOpen] = useState(false)

  const {
    breakdowns,
    eventLeaderboard,
    finance,
    primary,
    recentAthletes,
    recentMemberships,
    recentRegistrations,
    spotlightEvent,
    topGyms,
  } = dashboardOverview

  const primaryMetrics = useMemo(
    () => mapMetrics(primary, t, locale),
    [primary, t, locale],
  )

  const queuePreview = useMemo(
    () => pendingActions.slice(0, QUEUE_PREVIEW_LIMIT),
    [pendingActions],
  )

  const hasMoreQueue = pendingActions.length > QUEUE_PREVIEW_LIMIT
  const hasWork = pendingActions.length > 0 || finance.pendingItems.length > 0
  const workSubtitle = !hasWork
    ? t('admin.dashboard.noUrgency')
    : pendingActions.length > 0
      ? t('admin.dashboard.workSubtitle', { count: pendingActions.length })
      : t('admin.dashboard.workSubtitlePayments', { count: finance.pendingCount })

  function breakdownLabel(item) {
    if (item.status === 'expiringSoon') return t('admin.metrics.expiringSoon')
    if (item.status === 'pendiente') return t('admin.dashboard.financePending')
    if (item.status === 'otros') return t('admin.dashboard.breakdownOther')
    return t(`status.${item.status}`)
  }

  return (
    <div className="admin-dashboard admin-dashboard--compact admin-dashboard--ops">
      <AdminTopBar
        title={t('admin.dashboard.title')}
        subtitle={t('admin.dashboard.subtitle')}
        searchValue={globalSearch}
        onSearchChange={onGlobalSearchChange}
        onSearchSubmit={onGlobalSearchSubmit}
        alertCount={pendingActions.length > 0 ? pendingActions.length : pendingPayments}
        alertsOpen={alertsOpen}
        onAlertClick={() => setAlertsOpen(true)}
      />

      <AdminActionDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        items={pendingActions}
        onNavigate={onNavigate}
        onApprovePayment={onApprovePayment}
        onRejectPayment={onRejectPayment}
        onApproveTicketOrder={onApproveTicketOrder}
        onRejectTicketOrder={onRejectTicketOrder}
        canEdit={canEdit}
      />

      <div className="admin-ops" aria-label={t('admin.dashboard.metricsAria')}>
        <section className="admin-ops__kpis" aria-label={t('admin.dashboard.metricsAria')}>
          {primaryMetrics.map((item) => (
            <DashboardKpiTile
              key={item.labelKey}
              icon={item.icon}
              label={item.label}
              tone={item.tone}
              value={item.value}
              hint={item.hint}
              onClick={() => onNavigate?.(item.section)}
            />
          ))}
        </section>

        <section className="admin-ops__board" aria-label={t('admin.dashboard.analyticsAria')}>
          <header className="admin-ops__board-head">
            <div className="admin-ops__board-intro">
              <h2>{t('admin.dashboard.analyticsTitle')}</h2>
              <ul
                className="admin-ops__board-stats"
                aria-label={t('admin.dashboard.financeSubtitleLive', {
                  pending: finance.pendingCount,
                  events: finance.openEvents,
                })}
              >
                <li
                  className={`admin-ops__board-stat${
                    finance.pendingCount > 0 ? ' admin-ops__board-stat--alert' : ''
                  }`}
                >
                  <strong>{finance.pendingCount}</strong>
                  <span>{t('admin.dashboard.boardStatPending')}</span>
                </li>
                <li className="admin-ops__board-stat">
                  <strong>{finance.openEvents}</strong>
                  <span>{t('admin.dashboard.boardStatEvents')}</span>
                </li>
              </ul>
            </div>
            <nav className="admin-ops__links" aria-label={t('admin.dashboard.quickTitle')}>
              <div className="admin-ops__links-track">
                {QUICK_ACTIONS.map(({ section, labelKey }) => (
                  <button
                    key={section}
                    type="button"
                    className="admin-ops__link"
                    onClick={() => onNavigate?.(section)}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </nav>
          </header>

          <div className="admin-ops__charts">
            <section className="admin-ops__chart admin-ops__chart--finance">
              <header className="admin-ops__chart-head">
                <div className="admin-ops__chart-copy">
                  <p className="admin-ops__eyebrow">{t('admin.dashboard.financeSubtitle')}</p>
                  <h3>{t('admin.dashboard.financeTitle')}</h3>
                </div>
                <button
                  type="button"
                  className="admin-dashboard-link"
                  onClick={() => onNavigate?.('payments')}
                >
                  {t('admin.actions.payments')}
                  <ArrowRight size={12} aria-hidden />
                </button>
              </header>

              <div className="admin-ops__finance-visual">
                <CollectionDonut
                  collected={finance.collectedAmount}
                  pending={finance.pendingAmount}
                  rate={finance.collectionRate}
                  label={t('admin.dashboard.financeRate')}
                />
                <dl className="admin-ops__finance-metrics">
                  <div className="admin-ops__finance-metric admin-ops__finance-metric--collected">
                    <dt>{t('admin.dashboard.financeCollected')}</dt>
                    <dd>{money(finance.collectedAmount)}</dd>
                  </div>
                  <div className="admin-ops__finance-metric admin-ops__finance-metric--pending">
                    <dt>{t('admin.dashboard.financePending')}</dt>
                    <dd>{money(finance.pendingAmount)}</dd>
                  </div>
                  <div className="admin-ops__finance-metric admin-ops__finance-metric--operated">
                    <dt>{t('admin.dashboard.financeOperated')}</dt>
                    <dd>{money(finance.totalAmount)}</dd>
                  </div>
                </dl>
              </div>
            </section>

            <div className="admin-ops__breakdowns">
              <StackedBarChart
                title={t('admin.dashboard.breakdownRegistrations')}
                total={breakdowns.registrations.total}
                items={breakdowns.registrations.items}
                section={breakdowns.registrations.section}
                onNavigate={onNavigate}
                getLabel={breakdownLabel}
                t={t}
              />
              <StackedBarChart
                title={t('admin.dashboard.breakdownMemberships')}
                total={breakdowns.memberships.total}
                items={breakdowns.memberships.items}
                section={breakdowns.memberships.section}
                onNavigate={onNavigate}
                getLabel={breakdownLabel}
                t={t}
              />
              <StackedBarChart
                title={t('admin.dashboard.breakdownPayments')}
                total={breakdowns.payments.total}
                items={breakdowns.payments.items}
                section={breakdowns.payments.section}
                onNavigate={onNavigate}
                getLabel={breakdownLabel}
                t={t}
              />
              <StackedBarChart
                title={t('admin.dashboard.breakdownEvents')}
                total={breakdowns.events.total}
                items={breakdowns.events.items}
                section={breakdowns.events.section}
                onNavigate={onNavigate}
                getLabel={breakdownLabel}
                t={t}
              />
            </div>
          </div>

          <div className="admin-ops__work">
            <header className="admin-ops__work-head">
              <div className="admin-ops__work-copy">
                <span className="admin-ops__eyebrow">{t('admin.dashboard.queueTitle')}</span>
                <h3>{workSubtitle}</h3>
              </div>
              {hasWork ? (
                <button
                  type="button"
                  className="admin-ops__work-cta"
                  onClick={() => setAlertsOpen(true)}
                >
                  {hasMoreQueue
                    ? t('admin.dashboard.queueSeeAll', { count: pendingActions.length })
                    : t('admin.dashboard.priorityReview')}
                  <ArrowRight size={13} aria-hidden />
                </button>
              ) : null}
            </header>

            {pendingActions.length > 0 ? (
              <ActionQueue
                compact
                embedded
                showGroupHeads={false}
                showHeader={false}
                items={queuePreview}
                onNavigate={onNavigate}
                onApprovePayment={onApprovePayment}
                onRejectPayment={onRejectPayment}
                onApproveTicketOrder={onApproveTicketOrder}
                onRejectTicketOrder={onRejectTicketOrder}
                canEdit={canEdit}
              />
            ) : null}

            {finance.pendingItems.length > 0 && pendingActions.length === 0 ? (
              <ul className="admin-ops__pending-list">
                {finance.pendingItems.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.athlete}</strong>
                      <p>{item.concept}</p>
                    </div>
                    <span>{money(item.amount)}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        className="admin-ops__pending-action"
                        onClick={() => onApprovePayment?.(item.id)}
                      >
                        {t('admin.actions.validate')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {!hasWork ? (
              <div className="admin-ops__work-idle">
                <p className="admin-ops__work-idle-copy">{t('admin.dashboard.workEmpty')}</p>
                <div className="admin-ops__work-idle-links">
                  {QUICK_ACTIONS.slice(0, 3).map(({ section, labelKey }) => (
                    <button
                      key={section}
                      type="button"
                      className="admin-ops__work-idle-link"
                      onClick={() => onNavigate?.(section)}
                    >
                      {t(labelKey)}
                      <ArrowRight size={13} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <LaunchInterestWidget />

          {recentAthletes?.items?.length ||
          recentMemberships?.items?.length ||
          recentRegistrations?.items?.length ? (
            <div className="admin-ops__recents">
              <RecentAthletesCard
                athletes={recentAthletes}
                locale={locale}
                onNavigate={onNavigate}
                onSelectAthlete={onSelectAthlete}
                t={t}
              />

              <RecentMembershipsCard
                memberships={recentMemberships}
                locale={locale}
                onNavigate={onNavigate}
                onSelectAthlete={onSelectAthlete}
                canDeleteAthlete={canDeleteAthletes}
                onDeleteAthlete={onDeleteAthlete}
                getAthleteDetail={getAthleteDetail}
                t={t}
              />

              <RecentRegistrationsCard
                registrations={recentRegistrations}
                locale={locale}
                onNavigate={onNavigate}
                onSelectAthlete={onSelectAthlete}
                t={t}
              />
            </div>
          ) : null}

          <div className="admin-ops__stats-row">
            <LeaderboardCard
              featured
              eyebrow={t('admin.dashboard.eventLeaderboardEyebrow')}
              title={t('admin.dashboard.eventLeaderboardTitle')}
              items={eventLeaderboard.items}
              navigateSection="events"
              onNavigate={onNavigate}
              t={t}
              renderItem={(event) => (
                <li key={event.id} className="admin-ops__leaderboard-item">
                  <div className="admin-ops__leaderboard-main">
                    <span className="admin-ops__leaderboard-title">{event.title}</span>
                    <span className="admin-ops__leaderboard-value">
                      {event.registered}/{event.slots}
                      <span className="admin-ops__leaderboard-pct">{event.fillPercent}%</span>
                    </span>
                  </div>
                  <span className="admin-ops__leaderboard-bar" aria-hidden>
                    <span style={{ width: `${event.fillPercent}%` }} />
                  </span>
                </li>
              )}
            />
            <LeaderboardCard
              eyebrow={t('admin.dashboard.topGymsEyebrow')}
              title={t('admin.dashboard.topGymsTitle')}
              items={topGyms.items}
              navigateSection="athletes"
              onNavigate={onNavigate}
              t={t}
              renderItem={(gym, index) => {
                const peak = Math.max(topGyms.items[0]?.count ?? 1, 1)
                const share = Math.round((gym.count / peak) * 100)
                return (
                  <li
                    key={gym.gym}
                    className="admin-ops__leaderboard-item admin-ops__leaderboard-item--rank"
                  >
                    <span className="admin-ops__leaderboard-rank">{index + 1}</span>
                    <div className="admin-ops__leaderboard-main">
                      <span className="admin-ops__leaderboard-title">{gym.gym}</span>
                      <span className="admin-ops__leaderboard-value">{gym.count}</span>
                    </div>
                    <span className="admin-ops__leaderboard-bar" aria-hidden>
                      <span style={{ width: `${share}%` }} />
                    </span>
                  </li>
                )
              }}
            />
          </div>

          <SpotlightInline
            event={spotlightEvent}
            locale={locale}
            onNavigate={onNavigate}
            t={t}
          />
        </section>
      </div>
    </div>
  )
}
