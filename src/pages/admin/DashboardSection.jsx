import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, CalendarDays, MapPin, Send, Trash2 } from 'lucide-react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
import AdminActionDrawer from '../../components/admin/AdminActionDrawer.jsx'
import { LazyPhoto } from '../../components/ui/LazyPhoto.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminPriorityBoard from '../../components/admin/AdminPriorityBoard.jsx'
import ActionQueue from '../../components/admin/ActionQueue.jsx'
import DashboardTrafficCard from '../../components/admin/DashboardTrafficCard.jsx'
import { useAdminModal } from '../../components/admin/useAdminModal.js'
import Button from '../../components/ui/Button.jsx'
import {
  getLaunchInterestSummary,
  notifyLaunchInterestSource,
} from '../../services/launchInterestService.js'
import { previewQueueByType } from '../../services/adminService.js'
import { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getAdminIntroTourSteps } from '../../lib/adminTourSteps.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { METRIC_LABEL_KEYS } from '../../i18n/adminHelpers.js'
import { getStatusMeta } from '../../lib/status.js'
import { formatDayMonth, formatShortMemberCode, initials, money } from '../../lib/format.js'

const QUEUE_PREVIEW_LIMIT = 6

const QUEUE_MIX_TYPES = [
  'payment',
  'registration',
  'registration_gate',
  'membership',
  'ticket_order',
]

function formatQueueMix(items, t) {
  const counts = items.reduce((acc, item) => {
    const type = item?.type
    if (!type) return acc
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  return QUEUE_MIX_TYPES.filter((type) => counts[type] > 0)
    .map((type) => {
      const count = counts[type]
      const key =
        count === 1 ? `admin.dashboard.queueMix.${type}` : `admin.dashboard.queueMix.${type}Many`
      return t(key, { count })
    })
    .join(' · ')
}

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
  const words = String(source ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
  return words
    ? `${words.charAt(0).toUpperCase()}${words.slice(1)}`
    : t('admin.dashboard.launchInterest.unknownSource')
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

function DashboardKpiTile({ label, value, hint, tone, onClick }) {
  return (
    <button type="button" className={`admin-ops__kpi admin-ops__kpi--${tone}`} onClick={onClick}>
      <span className="admin-ops__kpi-label">{label}</span>
      {typeof value === 'number' ? (
        <AnimatedNumber className="admin-ops__kpi-value" value={value} />
      ) : (
        <span className="admin-ops__kpi-value">{value}</span>
      )}
      {hint ? <span className="admin-ops__kpi-hint">{hint}</span> : null}
    </button>
  )
}

const BREAKDOWN_ROWS = [
  { key: 'registrations', titleKey: 'admin.dashboard.breakdownRegistrations' },
  { key: 'memberships', titleKey: 'admin.dashboard.breakdownMemberships' },
  { key: 'payments', titleKey: 'admin.dashboard.breakdownPayments' },
  { key: 'events', titleKey: 'admin.dashboard.breakdownEvents' },
]

function BreakdownPanel({ breakdowns, onNavigate, getLabel, t }) {
  return (
    <section className="admin-ops__mix" aria-labelledby="admin-ops-mix-title">
      <header className="admin-ops__section-head">
        <div className="admin-ops__chart-copy">
          <p className="admin-ops__eyebrow">{t('admin.dashboard.breakdownTitle')}</p>
          <h3 id="admin-ops-mix-title">{t('admin.dashboard.breakdownPanelTitle')}</h3>
        </div>
      </header>
      <ul className="admin-ops__mix-list">
        {BREAKDOWN_ROWS.map(({ key, titleKey }) => {
          const data = breakdowns[key]
          if (!data) return null
          return (
            <BreakdownRow
              key={key}
              title={t(titleKey)}
              total={data.total}
              items={data.items}
              section={data.section}
              onNavigate={onNavigate}
              getLabel={getLabel}
              t={t}
            />
          )
        })}
      </ul>
    </section>
  )
}

function BreakdownRow({ title, total, items, section, onNavigate, getLabel, t }) {
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
    <li className={`admin-ops__mix-row${isEmpty ? ' admin-ops__mix-row--empty' : ''}`}>
      <div className="admin-ops__mix-head">
        <h4>{title}</h4>
        <strong className="admin-ops__mix-total" aria-label={totalLabel}>
          {total}
        </strong>
        <button
          type="button"
          className="admin-ops__mix-open"
          aria-label={`${t('admin.actions.view')} ${title}`}
          onClick={() => onNavigate?.(section)}
        >
          <ArrowRight size={15} aria-hidden />
        </button>
      </div>

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
        <ul className="admin-ops__legend">
          {activeItems.map((item) => {
            const percent = Math.round((item.value / chartTotal) * 100)
            return (
              <li
                key={item.status}
                className={`admin-ops__legend-item admin-ops__legend-item--${item.tone}`}
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
    </li>
  )
}

function SpotlightInline({ event, locale, onNavigate, t }) {
  if (!event) return null

  const { label: statusLabel, tone } = getStatusMeta(event.status, t)
  const fillPercent = event.slots > 0 ? Math.round((event.registered / event.slots) * 100) : 0
  const closesAt = event.registrationClosesAt
    ? formatDayMonth(event.registrationClosesAt.slice(0, 10), locale)
    : null
  // Countdown del cierre: sólo cuando la fecha está a la vista (≤14 días)
  // para que el dato invite a actuar y no sea una fecha más del bloque.
  let closesInLabel = null
  if (event.registrationClosesAt) {
    const closesAtDate = new Date(event.registrationClosesAt)
    if (!Number.isNaN(closesAtDate.getTime())) {
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const startOfCloses = new Date(
        closesAtDate.getFullYear(),
        closesAtDate.getMonth(),
        closesAtDate.getDate(),
      )
      const daysLeft = Math.round((startOfCloses - startOfToday) / 24 / 60 / 60 / 1000)
      if (daysLeft === 0) closesInLabel = t('admin.dashboard.spotlightClosesToday')
      else if (daysLeft > 0 && daysLeft <= 14)
        closesInLabel = t('admin.dashboard.spotlightClosesIn', { count: daysLeft })
    }
  }

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
        {closesInLabel ? (
          <p className="admin-ops__spotlight-countdown">{closesInLabel}</p>
        ) : null}
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

const RECENT_TABS = [
  {
    id: 'athletes',
    section: 'athletes',
    tabKey: 'admin.nav.athletes',
    titleKey: 'admin.dashboard.recentAthletesTitle',
    subtitleKey: 'admin.dashboard.recentAthletesSubtitle',
  },
  {
    id: 'memberships',
    section: 'memberships',
    tabKey: 'admin.nav.memberships',
    titleKey: 'admin.dashboard.recentMembershipsTitle',
    subtitleKey: 'admin.dashboard.recentMembershipsSubtitle',
  },
  {
    id: 'registrations',
    section: 'registrations',
    tabKey: 'admin.nav.registrations',
    titleKey: 'admin.dashboard.recentRegistrationsTitle',
    subtitleKey: 'admin.dashboard.recentRegistrationsSubtitle',
  },
]

const TAB_KEY_OFFSETS = { ArrowRight: 1, ArrowLeft: -1 }

/**
 * Actividad reciente en un solo bloque: altas, afiliaciones e inscripciones
 * comparten el mismo formato de fila, así que se leen de a una pestaña en vez
 * de tres columnas que compiten entre sí. Solo aparecen las que tienen datos.
 */
function RecentActivityTabs({
  recentAthletes,
  recentMemberships,
  recentRegistrations,
  locale,
  onNavigate,
  onSelectAthlete,
  canDeleteAthlete,
  onDeleteAthlete,
  getAthleteDetail,
  t,
}) {
  const baseId = useId()
  const [activeId, setActiveId] = useState(null)
  const tabRefs = useRef({})

  const sources = {
    athletes: recentAthletes,
    memberships: recentMemberships,
    registrations: recentRegistrations,
  }
  const tabs = RECENT_TABS.filter((tab) => sources[tab.id]?.items?.length)
  if (tabs.length === 0) return null

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
  const tabId = (id) => `${baseId}-tab-${id}`
  const panelId = `${baseId}-panel`

  function handleKeyDown(event) {
    const index = tabs.findIndex((tab) => tab.id === active.id)
    let nextIndex = null
    if (event.key in TAB_KEY_OFFSETS) {
      nextIndex = (index + TAB_KEY_OFFSETS[event.key] + tabs.length) % tabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    const next = tabs[nextIndex]
    setActiveId(next.id)
    tabRefs.current[next.id]?.focus()
  }

  return (
    <section className="admin-ops__activity" aria-labelledby={`${baseId}-title`}>
      <header className="admin-ops__section-head">
        <div className="admin-ops__chart-copy">
          <p className="admin-ops__eyebrow">{t('admin.dashboard.activityEyebrow')}</p>
          <h3 id={`${baseId}-title`}>{t('admin.dashboard.activityTitle')}</h3>
        </div>
        <button
          type="button"
          className="admin-dashboard-link"
          aria-label={`${t('admin.actions.view')} ${t(active.titleKey)}`}
          onClick={() => onNavigate?.(active.section)}
        >
          {t('admin.actions.view')}
          <ArrowRight size={12} aria-hidden />
        </button>
      </header>

      <div
        className="admin-ops__tabs"
        role="tablist"
        aria-label={t('admin.dashboard.activityTabsAria')}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active.id
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node
              }}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              className="admin-ops__tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(tab.id)}
            >
              {t(tab.tabKey)}
            </button>
          )
        })}
      </div>

      <div
        className="admin-ops__activity-panel"
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(active.id)}
      >
        <p className="admin-ops__activity-sub">{t(active.subtitleKey)}</p>
        {active.id === 'athletes' ? (
          <RecentAthletesList
            athletes={recentAthletes}
            locale={locale}
            onSelectAthlete={onSelectAthlete}
            t={t}
          />
        ) : null}
        {active.id === 'memberships' ? (
          <RecentMembershipsList
            memberships={recentMemberships}
            locale={locale}
            onSelectAthlete={onSelectAthlete}
            canDeleteAthlete={canDeleteAthlete}
            onDeleteAthlete={onDeleteAthlete}
            getAthleteDetail={getAthleteDetail}
            t={t}
          />
        ) : null}
        {active.id === 'registrations' ? (
          <RecentRegistrationsList
            registrations={recentRegistrations}
            locale={locale}
            onSelectAthlete={onSelectAthlete}
          />
        ) : null}
      </div>
    </section>
  )
}

function RecentAvatar({ fullName, photoUrl }) {
  return (
    <span className="admin-ops__recent-avatar" aria-hidden>
      {photoUrl ? (
        <LazyPhoto
          className="admin-ops__recent-avatar-photo"
          src={photoUrl}
          alt=""
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      ) : null}
      <span>{initials(fullName)}</span>
    </span>
  )
}

function RecentAthletesList({ athletes, locale, onSelectAthlete, t }) {
  return (
    <ul className="admin-ops__recent-list">
      {athletes.items.map((athlete) => (
        <li key={athlete.id} className="admin-ops__recent-item">
          <button
            type="button"
            className="admin-ops__recent-open"
            onClick={() => onSelectAthlete?.(athlete.id)}
          >
            <RecentAvatar fullName={athlete.fullName} photoUrl={athlete.photoUrl} />
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
  )
}

/**
 * Afiliaciones recientes. Separada de `RecentAthletesList` a propósito: esa
 * lista son altas de cuenta, y registrarse no afilia a nadie. Acá se ve quién
 * quedó cubierto, con qué código y desde cuándo.
 *
 * La fila abre el detalle del atleta; el botón de peligro (solo Super Admin)
 * elimina al atleta con toda su cascada, reusando el mismo dialog y endpoint
 * que la zona de peligro del detalle.
 */
function RecentMembershipsList({
  memberships,
  locale,
  onSelectAthlete,
  canDeleteAthlete = false,
  onDeleteAthlete,
  getAthleteDetail,
  t,
}) {
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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
    <>
      <ul className="admin-ops__recent-list">
        {memberships.items.map((membership) => (
          <li
            key={membership.id}
            className="admin-ops__recent-item admin-ops__recent-item--actionable"
          >
            <button
              type="button"
              className="admin-ops__recent-open"
              onClick={() => onSelectAthlete?.(membership.athleteId)}
            >
              <RecentAvatar fullName={membership.fullName} photoUrl={membership.photoUrl} />
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
    </>
  )
}

function RecentRegistrationsList({ registrations, locale, onSelectAthlete }) {
  return (
    <ul className="admin-ops__recent-list">
      {registrations.items.map((registration) => (
        <li key={registration.id} className="admin-ops__recent-item">
          <button
            type="button"
            className="admin-ops__recent-open"
            onClick={() => onSelectAthlete?.(registration.athleteId)}
          >
            <RecentAvatar fullName={registration.fullName} photoUrl={registration.photoUrl} />
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
      setNotifyError(err.message || t('admin.dashboard.launchInterest.confirmError'))
    } finally {
      setNotifying(null)
    }
  }

  const pendingTotal = summary.reduce((sum, item) => sum + (item.pending ?? 0), 0)

  if (loading || summary.length === 0) return null

  return (
    <section className="admin-ops__launch" aria-label={t('admin.dashboard.launchInterest.title')}>
      <header className="admin-ops__launch-head">
        <div className="admin-ops__launch-copy">
          <div className="admin-ops__launch-title-row">
            <h3>{t('admin.dashboard.launchInterest.title')}</h3>
            {pendingTotal > 0 ? (
              <span className="admin-ops__launch-count">{pendingTotal}</span>
            ) : null}
          </div>
          <p>
            {pendingTotal > 0
              ? t('admin.dashboard.launchInterest.pendingLead', { count: pendingTotal })
              : t('admin.dashboard.launchInterest.allNotified')}
          </p>
        </div>
      </header>
      <ul className="admin-ops__launch-list">
        {summary.map((item) => {
          const sourceLabel = humanizeLaunchSource(item.source, t)
          return (
            <li key={item.source} className="admin-ops__launch-item">
              <div className="admin-ops__launch-body">
                <strong>{sourceLabel}</strong>
                <span>
                  {t('admin.dashboard.launchInterest.total', { count: item.total })}
                  {' · '}
                  {item.pending > 0
                    ? t('admin.dashboard.launchInterest.pending', { count: item.pending })
                    : t('admin.dashboard.launchInterest.notified')}
                </span>
              </div>
              {item.pending > 0 ? (
                <button
                  type="button"
                  className="admin-ops__launch-notify"
                  aria-label={t('admin.dashboard.launchInterest.notify', {
                    count: item.pending,
                    source: sourceLabel,
                  })}
                  disabled={notifying === item.source}
                  onClick={() => {
                    setNotifyError('')
                    setConfirmSource(item.source)
                  }}
                >
                  <Send size={13} aria-hidden />
                  {t('admin.dashboard.launchInterest.notifyAction')}
                </button>
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
  const { t } = useI18n()
  const panelRef = useAdminModal(onCancel)

  return createPortal(
    <div className="admin-user-delete-dialog">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label={t('admin.dashboard.launchInterest.confirmCancel')}
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
          <h2 id="launch-interest-confirm-title">
            {t('admin.dashboard.launchInterest.confirmTitle')}
          </h2>
          <p>
            {t('admin.dashboard.launchInterest.confirmDescription', {
              count: pending,
              source: sourceLabel,
            })}
          </p>
          {error ? (
            <p className="admin-user-delete-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="admin-user-delete-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.dashboard.launchInterest.confirmCancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy
              ? t('admin.dashboard.launchInterest.confirmBusy')
              : t('admin.dashboard.launchInterest.confirmSubmit')}
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
  canDismissQueueItems = false,
  onDismissItem,
  onUndismissItem,
  canDeleteAthletes = false,
  onDeleteAthlete,
  onSelectAthlete,
  getAthleteDetail,
  canViewAnalytics = false,
}) {
  const { locale, t } = useI18n()
  const [alertsOpen, setAlertsOpen] = useState(false)
  const { startTour } = useAdminTour()

  // Arranca solo la primera vez que el navegador ve este panel (el provider
  // chequea `localStorage`) -- el Dashboard es la primera pantalla que ve
  // cualquier rol, así que es el punto de entrada natural del recorrido.
  useEffect(() => {
    startTour('admin-intro', getAdminIntroTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  // Validación rápida desde la lista de pendientes de cobros: sin esto el
  // botón disparaba la acción sin esperarse ni avisar el resultado.
  async function handleQuickValidate(paymentId) {
    try {
      const result = await onApprovePayment?.(paymentId)
      if (result?.error) notifyError(result.error)
      else notifySuccess(t('admin.toasts.paymentApproved'))
    } catch (error) {
      notifyError(error?.message ?? t('admin.toasts.actionError'))
    }
  }

  // Descartar es reversible: el toast de éxito ofrece "Deshacer" por si el
  // click fue un error, sin obligar a ir a buscar el ítem de vuelta.
  async function handleDismiss(itemKey, itemType) {
    try {
      const result = await onDismissItem?.(itemKey, itemType)
      if (result?.error) {
        notifyError(result.error)
        return
      }
      notifySuccess(t('admin.actionQueue.dismissed'), {
        label: t('admin.actionQueue.undo'),
        onClick: () => {
          void onUndismissItem?.(itemKey).then((undoResult) => {
            if (undoResult?.error) notifyError(undoResult.error)
          })
        },
      })
    } catch (error) {
      notifyError(error?.message ?? t('admin.actionQueue.dismissError'))
    }
  }

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

  const primaryMetrics = useMemo(() => mapMetrics(primary, t, locale), [primary, t, locale])

  const queuePreview = useMemo(
    () => previewQueueByType(pendingActions, QUEUE_PREVIEW_LIMIT),
    [pendingActions],
  )
  const queueMix = useMemo(() => formatQueueMix(pendingActions, t), [pendingActions, t])

  const hasWork = pendingActions.length > 0 || finance.pendingItems.length > 0
  const hasQueue = pendingActions.length > 0
  const workCount = hasQueue ? pendingActions.length : finance.pendingCount
  const workFigureLabel = hasQueue
    ? t(workCount === 1 ? 'admin.dashboard.queueFigureOne' : 'admin.dashboard.queueFigure')
    : t(workCount === 1 ? 'admin.dashboard.queueFigurePaymentOne' : 'admin.dashboard.queueFigurePayments')
  const collectedShare =
    finance.totalAmount > 0 ? (finance.collectedAmount / finance.totalAmount) * 100 : 0
  const pendingShare =
    finance.totalAmount > 0 ? (finance.pendingAmount / finance.totalAmount) * 100 : 0

  function breakdownLabel(item) {
    if (item.status === 'expiringSoon') return t('admin.metrics.expiringSoon')
    if (item.status === 'pendiente') return t('admin.dashboard.financePending')
    if (item.status === 'otros') return t('admin.dashboard.breakdownOther')
    return t(`status.${item.status}`)
  }

  return (
    <div className="admin-dashboard admin-dashboard--compact admin-dashboard--ops">
      <AdminTopBar
        eyebrow={t('admin.dashboard.eyebrow')}
        title={t('admin.dashboard.title')}
        subtitle={t('admin.dashboard.subtitle')}
        showSearch={false}
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
        canDismiss={canDismissQueueItems}
        onDismissItem={handleDismiss}
      />

      <div className="admin-ops">
        <section className="admin-ops__summary" aria-label={t('admin.dashboard.metricsAria')}>
          <div className="admin-ops__kpis" data-tour="dashboard-kpis">
            {primaryMetrics.map((item) => (
              <DashboardKpiTile
                key={item.labelKey}
                label={item.label}
                tone={item.tone}
                value={item.value}
                hint={item.hint}
                onClick={() => onNavigate?.(item.section)}
              />
            ))}
          </div>
          <nav
            className="admin-ops__links"
            aria-label={t('admin.dashboard.quickTitle')}
            data-tour="dashboard-quicklinks"
          >
            <span className="admin-ops__links-label" aria-hidden>
              {t('admin.dashboard.quickTitle')}
            </span>
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
        </section>

        <div className="admin-ops__attention">
          <AdminPriorityBoard reminders={dashboardOverview.reminders} onNavigate={onNavigate} />

          <div className="admin-ops__work" data-tour="dashboard-queue">
            <header className="admin-ops__work-head">
              <div className="admin-ops__work-copy">
                <h3 className="admin-ops__eyebrow">{t('admin.dashboard.queueTitle')}</h3>
                {hasWork ? (
                  <p className="admin-ops__work-summary">
                    <strong className="admin-ops__work-figure">{workCount}</strong>
                    <span className="admin-ops__work-figure-copy">
                      <span className="admin-ops__work-figure-label">{workFigureLabel}</span>
                      {hasQueue && queueMix ? (
                        <span className="admin-ops__work-mix">{queueMix}</span>
                      ) : null}
                    </span>
                  </p>
                ) : (
                  <p className="admin-ops__work-sub">{t('admin.dashboard.noUrgency')}</p>
                )}
              </div>
              {hasQueue ? (
                <button
                  type="button"
                  className="admin-ops__work-cta"
                  onClick={() => setAlertsOpen(true)}
                >
                  {t('admin.dashboard.queueOpen')}
                  <ArrowRight size={14} aria-hidden />
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
                canDismiss={canDismissQueueItems}
                onDismissItem={handleDismiss}
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
                        onClick={() => void handleQuickValidate(item.id)}
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
        </div>

        <section className="admin-ops__board" aria-labelledby="admin-ops-board-title">
          <header className="admin-ops__board-head">
            <h2 id="admin-ops-board-title">{t('admin.dashboard.analyticsTitle')}</h2>
          </header>

          <div className="admin-ops__period">
            <section className="admin-ops__finance" aria-labelledby="admin-ops-finance-title">
              <header className="admin-ops__section-head">
                <div className="admin-ops__chart-copy">
                  <p className="admin-ops__eyebrow">{t('admin.dashboard.financeEyebrow')}</p>
                  <h3 id="admin-ops-finance-title">{t('admin.dashboard.financeTitle')}</h3>
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

              <div className="admin-ops__finance-hero">
                <span className="admin-ops__finance-hero-label">
                  {t('admin.dashboard.financeCollected')}
                </span>
                <strong className="admin-ops__finance-hero-value">
                  {money(finance.collectedAmount)}
                </strong>
              </div>

              <div className="admin-ops__finance-rate">
                <div
                  className="admin-ops__finance-rail"
                  role="img"
                  aria-label={`${t('admin.dashboard.financeRate')}: ${finance.collectionRate}%`}
                >
                  <span
                    className="admin-ops__finance-rail-seg admin-ops__finance-rail-seg--collected"
                    style={{ width: `${collectedShare}%` }}
                  />
                  {pendingShare > 0 ? (
                    <span
                      className="admin-ops__finance-rail-seg admin-ops__finance-rail-seg--pending"
                      style={{ width: `${Math.max(pendingShare, 1)}%` }}
                    />
                  ) : null}
                </div>
                <p className="admin-ops__finance-rate-copy" aria-hidden>
                  <strong>{finance.collectionRate}%</strong> {t('admin.dashboard.financeRate')}
                </p>
              </div>

              <dl className="admin-ops__finance-metrics">
                <div className="admin-ops__finance-metric admin-ops__finance-metric--pending">
                  <dt>{t('admin.dashboard.financePending')}</dt>
                  <dd>{money(finance.pendingAmount)}</dd>
                </div>
                <div className="admin-ops__finance-metric">
                  <dt>{t('admin.dashboard.financeOperated')}</dt>
                  <dd>{money(finance.totalAmount)}</dd>
                </div>
              </dl>
            </section>

            <BreakdownPanel
              breakdowns={breakdowns}
              onNavigate={onNavigate}
              getLabel={breakdownLabel}
              t={t}
            />
          </div>

          <RecentActivityTabs
            recentAthletes={recentAthletes}
            recentMemberships={recentMemberships}
            recentRegistrations={recentRegistrations}
            locale={locale}
            onNavigate={onNavigate}
            onSelectAthlete={onSelectAthlete}
            canDeleteAthlete={canDeleteAthletes}
            onDeleteAthlete={onDeleteAthlete}
            getAthleteDetail={getAthleteDetail}
            t={t}
          />

          {canViewAnalytics ? <DashboardTrafficCard onNavigate={onNavigate} /> : null}

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

          <LaunchInterestWidget />

          <SpotlightInline event={spotlightEvent} locale={locale} onNavigate={onNavigate} t={t} />
        </section>
      </div>
    </div>
  )
}
