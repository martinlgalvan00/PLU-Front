import { useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  MapPin,
  Shield,
  Users,
} from 'lucide-react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
import AdminActionDrawer from '../../components/admin/AdminActionDrawer.jsx'
import ActionQueue from '../../components/admin/ActionQueue.jsx'
import AdminRecentActivity from '../../components/admin/AdminRecentActivity.jsx'
import { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import CollectionDonut from '../../components/admin/CollectionDonut.jsx'
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

const PRIORITY_KEYS = ['high', 'medium', 'low']

function mapMetrics(items, t, locale) {
  return items.map((item) => {
    let hint = null
    if (item.hintKey === 'expiringSoon' && item.hintValue > 0) {
      hint = t('admin.dashboard.kpiHintExpiring', { count: item.hintValue })
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
        <Icon size={18} strokeWidth={1.65} />
      </span>
      <span className="admin-ops__kpi-body">
        <span className="admin-ops__kpi-value">{value}</span>
        <span className="admin-ops__kpi-label">{label}</span>
        {hint ? <span className="admin-ops__kpi-hint">{hint}</span> : null}
      </span>
    </button>
  )
}

function PriorityChips({ counts, t }) {
  const active = PRIORITY_KEYS.filter((priority) => counts[priority] > 0)
  if (!active.length) return null

  return (
    <ul className="admin-ops__priority-chips" aria-label={t('admin.dashboard.priorityAria')}>
      {active.map((priority) => (
        <li
          key={priority}
          className={`admin-ops__priority-chip admin-ops__priority-chip--${priority} is-active`}
        >
          <strong>{counts[priority]}</strong>
          <span>{t(`admin.actionQueue.priority.${priority}`)}</span>
        </li>
      ))}
    </ul>
  )
}

function StackedBarChart({ title, total, items, section, onNavigate, getLabel, t }) {
  const activeItems = items.filter((item) => item.value > 0)
  const chartTotal = Math.max(
    total,
    activeItems.reduce((sum, item) => sum + item.value, 0),
    1,
  )
  const totalLabel = t('admin.dashboard.chartTotal', { count: total })
  const segmentSummary = activeItems.length
    ? activeItems
        .map((item) => {
          const percent = Math.round((item.value / chartTotal) * 100)
          return `${getLabel(item)} ${item.value} (${percent}%)`
        })
        .join(', ')
    : t('admin.dashboard.breakdownEmpty')
  const stackLabel = `${title}: ${totalLabel}. ${segmentSummary}`

  return (
    <section className="admin-ops__chart">
      <header className="admin-ops__chart-head">
        <div className="admin-ops__chart-copy">
          <h3>{title}</h3>
          <div className="admin-ops__chart-total-wrap">
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
        {activeItems.length > 0 ? (
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

      {activeItems.length > 0 ? (
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

function RecentAthletesCard({ athletes, locale, onNavigate, t }) {
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
            <span className="admin-ops__recent-avatar" aria-hidden>
              {initials(athlete.fullName)}
            </span>
            <span className="admin-ops__recent-body">
              <strong>{athlete.fullName}</strong>
              <span>{athlete.gym || t('admin.dashboard.recentAthletesNoGym')}</span>
            </span>
            <span className="admin-ops__recent-date">
              {formatDayMonth(athlete.createdAt.slice(0, 10), locale)}
            </span>
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
 */
function RecentMembershipsCard({ memberships, locale, onNavigate, t }) {
  if (!memberships?.items?.length) return null

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
          <li key={membership.id} className="admin-ops__recent-item">
            <span className="admin-ops__recent-avatar" aria-hidden>
              {initials(membership.fullName)}
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
          </li>
        ))}
      </ul>
    </section>
  )
}

function LeaderboardCard({ eyebrow, title, subtitle, items, navigateSection, onNavigate, t, renderItem }) {
  if (!items?.length) return null

  return (
    <section className="admin-ops__leaderboard" aria-label={title}>
      <header className="admin-ops__chart-head">
        <div>
          <p className="admin-ops__eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          <p>{subtitle}</p>
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

export default function DashboardSection({
  dashboardOverview,
  pendingActions,
  pendingPayments,
  onNavigate,
  onApprovePayment,
  onApproveTicketOrder,
  canEdit,
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
    spotlightEvent,
    topGyms,
  } = dashboardOverview

  const primaryMetrics = useMemo(
    () => mapMetrics(primary, t, locale),
    [primary, t, locale],
  )

  const priorityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 }
    pendingActions.forEach((action) => {
      if (Object.hasOwn(counts, action.priority)) counts[action.priority] += 1
    })
    return counts
  }, [pendingActions])

  const queuePreview = useMemo(
    () => pendingActions.slice(0, QUEUE_PREVIEW_LIMIT),
    [pendingActions],
  )

  const hasMoreQueue = pendingActions.length > QUEUE_PREVIEW_LIMIT
  const hasWork = pendingActions.length > 0 || finance.pendingItems.length > 0

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
        onApproveTicketOrder={onApproveTicketOrder}
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
                  <h3>{t('admin.dashboard.financeTitle')}</h3>
                  <p>{t('admin.dashboard.financeSubtitle')}</p>
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
              <div>
                <p className="admin-ops__eyebrow">{t('admin.dashboard.priorityEyebrow')}</p>
                <h3>{t('admin.dashboard.workTitle')}</h3>
                <p>
                  {hasWork
                    ? t('admin.dashboard.workSubtitle', {
                        queue: pendingActions.length,
                        payments: finance.pendingCount,
                      })
                    : t('admin.dashboard.noUrgency')}
                </p>
                <PriorityChips counts={priorityCounts} t={t} />
              </div>
              {hasWork ? (
                <button
                  type="button"
                  className="admin-dashboard-link"
                  onClick={() => setAlertsOpen(true)}
                >
                  {hasMoreQueue
                    ? t('admin.dashboard.queueSeeAll', { count: pendingActions.length })
                    : t('admin.dashboard.priorityReview')}
                  <ArrowRight size={12} aria-hidden />
                </button>
              ) : null}
            </header>

            {pendingActions.length > 0 ? (
              <ActionQueue
                compact
                embedded
                showHeader={false}
                items={queuePreview}
                onNavigate={onNavigate}
                onApprovePayment={onApprovePayment}
                onApproveTicketOrder={onApproveTicketOrder}
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

          <RecentAthletesCard
            athletes={recentAthletes}
            locale={locale}
            onNavigate={onNavigate}
            t={t}
          />

          <RecentMembershipsCard
            memberships={recentMemberships}
            locale={locale}
            onNavigate={onNavigate}
            t={t}
          />

          <div className="admin-ops__stats-row">
            <LeaderboardCard
              eyebrow={t('admin.dashboard.eventLeaderboardEyebrow')}
              title={t('admin.dashboard.eventLeaderboardTitle')}
              subtitle={t('admin.dashboard.eventLeaderboardSubtitle')}
              items={eventLeaderboard.items}
              navigateSection="events"
              onNavigate={onNavigate}
              t={t}
              renderItem={(event) => (
                <li key={event.id} className="admin-ops__leaderboard-item">
                  <span className="admin-ops__leaderboard-title">{event.title}</span>
                  <span className="admin-ops__leaderboard-value">
                    {event.registered}/{event.slots} · {event.fillPercent}%
                  </span>
                  <span className="admin-ops__leaderboard-bar">
                    <span style={{ width: `${event.fillPercent}%` }} />
                  </span>
                </li>
              )}
            />
            <LeaderboardCard
              eyebrow={t('admin.dashboard.topGymsEyebrow')}
              title={t('admin.dashboard.topGymsTitle')}
              subtitle={t('admin.dashboard.topGymsSubtitle')}
              items={topGyms.items}
              navigateSection="athletes"
              onNavigate={onNavigate}
              t={t}
              renderItem={(gym, index) => (
                <li
                  key={gym.gym}
                  className="admin-ops__leaderboard-item admin-ops__leaderboard-item--rank"
                >
                  <span className="admin-ops__leaderboard-rank">{index + 1}</span>
                  <span className="admin-ops__leaderboard-title">{gym.gym}</span>
                  <span className="admin-ops__leaderboard-value">{gym.count}</span>
                </li>
              )}
            />
          </div>

          <SpotlightInline
            event={spotlightEvent}
            locale={locale}
            onNavigate={onNavigate}
            t={t}
          />

          <AdminRecentActivity />
        </section>
      </div>
    </div>
  )
}
