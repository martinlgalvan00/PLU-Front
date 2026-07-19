import { useMemo, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  MapPin,
  ScanLine,
  Shield,
  Users,
} from 'lucide-react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
import AdminActionDrawer from '../../components/admin/AdminActionDrawer.jsx'
import RecentActivity from '../../components/admin/RecentActivity.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { METRIC_LABEL_KEYS } from '../../i18n/adminHelpers.js'
import { getStatusMeta } from '../../lib/status.js'
import { money } from '../../lib/format.js'

const METRIC_TONES = {
  users: 'celeste',
  badge: 'gold',
  clipboard: 'default',
  shield: 'alert',
  success: 'celeste',
  warning: 'alert',
  celeste: 'celeste',
  gold: 'gold',
}

const METRIC_ICONS = {
  users: Users,
  badge: BadgeCheck,
  clipboard: ClipboardList,
  shield: Shield,
}

const QUICK_ACTIONS = [
  {
    section: 'registrations',
    icon: ClipboardList,
    labelKey: 'admin.nav.registrations',
    hintKey: 'admin.dashboard.quickRegistrations',
  },
  {
    section: 'athletes',
    icon: Users,
    labelKey: 'admin.nav.athletes',
    hintKey: 'admin.dashboard.quickAthletes',
  },
  {
    section: 'events',
    icon: CalendarDays,
    labelKey: 'admin.nav.events',
    hintKey: 'admin.dashboard.quickEvents',
  },
  {
    section: 'checkin',
    icon: ScanLine,
    labelKey: 'admin.nav.checkin',
    hintKey: 'admin.dashboard.quickCheckin',
  },
]

function DashboardKpiTile({ icon, label, value, tone, onClick, index }) {
  const Icon = METRIC_ICONS[icon] ?? Users

  return (
    <button
      type="button"
      className={`admin-kpi-tile admin-kpi-tile--strip admin-kpi-tile--${tone}`}
      style={{ '--kpi-index': index }}
      onClick={onClick}
    >
      <span className="admin-kpi-tile__icon" aria-hidden>
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <span className="admin-kpi-tile__body">
        <span className="admin-kpi-tile__value">{value}</span>
        <span className="admin-kpi-tile__label">{label}</span>
      </span>
    </button>
  )
}

function DashboardKpiChip({ label, value, tone, onClick }) {
  return (
    <button type="button" className={`admin-kpi-chip admin-kpi-chip--${tone}`} onClick={onClick}>
      <span className="admin-kpi-chip__value">{value}</span>
      <span className="admin-kpi-chip__label">{label}</span>
    </button>
  )
}

function mapMetrics(items, t) {
  return items.map((item) => ({
    ...item,
    label: t(METRIC_LABEL_KEYS[item.labelKey] ?? item.labelKey),
    tone: METRIC_TONES[item.tone ?? item.icon] ?? item.tone ?? 'default',
  }))
}

function CommandCenterPaneHead({ eyebrow, subtitle, hideSubtitle = false }) {
  return (
    <header className="admin-command-center__head">
      <span className="admin-command-center__eyebrow">{eyebrow}</span>
      {!hideSubtitle && subtitle ? <p>{subtitle}</p> : null}
    </header>
  )
}

function DashboardQuickActions({ onNavigate, t }) {
  return (
    <section
      className="admin-quick-dock admin-dashboard__block"
      aria-labelledby="admin-quick-dock-title"
    >
      <header className="admin-quick-dock__intro">
        <span className="admin-quick-dock__eyebrow">{t('admin.dashboard.quickEyebrow')}</span>
        <h2 id="admin-quick-dock-title">{t('admin.dashboard.quickTitle')}</h2>
      </header>
      <div className="admin-quick-dock__track">
        {QUICK_ACTIONS.map(({ section, icon: Icon, labelKey, hintKey }) => (
          <button
            key={section}
            type="button"
            className="admin-quick-dock__action"
            onClick={() => onNavigate?.(section)}
          >
            <span className="admin-quick-dock__icon" aria-hidden>
              <Icon size={17} strokeWidth={1.7} />
            </span>
            <span className="admin-quick-dock__copy">
              <strong>{t(labelKey)}</strong>
              <small>{t(hintKey)}</small>
            </span>
            <ArrowRight size={14} className="admin-quick-dock__arrow" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  )
}

function DashboardSpotlightEvent({ event, onNavigate, t }) {
  if (!event) {
    return (
      <div className="admin-spotlight admin-spotlight--empty admin-spotlight--flat">
        <p>{t('admin.dashboard.spotlightEmpty')}</p>
        <button
          type="button"
          className="admin-dashboard-link"
          onClick={() => onNavigate?.('events')}
        >
          {t('admin.actions.configureEvents')}
          <ChevronRight size={14} aria-hidden />
        </button>
      </div>
    )
  }

  const { label: statusLabel, tone } = getStatusMeta(event.status, t)
  const fillPercent = event.slots > 0 ? Math.round((event.registered / event.slots) * 100) : 0

  return (
    <article className="admin-spotlight admin-spotlight--flat">
      <div className="admin-spotlight__main">
        <div className="admin-spotlight__title-row">
          <h3 className="admin-spotlight__title">{event.title}</h3>
          <span className={`admin-spotlight__status admin-spotlight__status--${tone}`}>
            {statusLabel}
          </span>
        </div>
        <ul className="admin-spotlight__meta admin-spotlight__meta--inline">
          <li>
            <CalendarDays size={13} aria-hidden />
            {event.date}
          </li>
          <li>
            <MapPin size={13} aria-hidden />
            {event.venue}
          </li>
        </ul>
        <div className="admin-spotlight__fill" aria-label={t('admin.dashboard.slots')}>
          <span className="admin-spotlight__fill-label">{t('admin.dashboard.slots')}</span>
          <div className="admin-spotlight__capacity-bar">
            <span style={{ width: `${fillPercent}%` }} />
          </div>
          <span className="admin-spotlight__fill-count">
            {event.registered}/{event.slots}
          </span>
          <span className="admin-spotlight__fill-percent">{fillPercent}%</span>
        </div>
      </div>
      <button
        type="button"
        className="admin-dashboard-link admin-spotlight__link"
        onClick={() => onNavigate?.('events')}
      >
        {t('admin.actions.manage')}
        <ArrowRight size={13} aria-hidden />
      </button>
    </article>
  )
}

function DashboardFinancePanel({ canEdit, finance, onApprovePayment, onNavigate, t }) {
  const {
    collectionRate,
    collectedAmount,
    pendingAmount,
    pendingCount,
    pendingItems,
    totalAmount,
  } = finance
  const topPending = pendingItems[0]

  return (
    <div className="admin-finance admin-finance--flat">
      <div className="admin-finance__metrics" aria-label={t('admin.dashboard.financeAria')}>
        <div className="admin-finance__metric admin-finance__metric--primary">
          <span>{t('admin.dashboard.financeOperated')}</span>
          <strong>{money(totalAmount)}</strong>
        </div>
        <div className="admin-finance__metric admin-finance__metric--rate">
          <span>{t('admin.dashboard.financeRate')}</span>
          <strong>{collectionRate}%</strong>
        </div>
        <div className="admin-finance__metric admin-finance__metric--success">
          <span>{t('admin.dashboard.financeCollected')}</span>
          <strong>{money(collectedAmount)}</strong>
        </div>
        <div className="admin-finance__metric admin-finance__metric--pending">
          <span>
            {t('admin.dashboard.financePending')}
            {pendingCount > 0 ? ` · ${pendingCount}` : ''}
          </span>
          <strong>{money(pendingAmount)}</strong>
        </div>
      </div>
      <div className="admin-finance__progress" aria-hidden>
        <span style={{ width: `${collectionRate}%` }} />
      </div>

      {topPending && (
        <div className="admin-finance__pending admin-finance__pending--flat">
          <div className="admin-finance__pending-copy">
            <strong>{topPending.athlete}</strong>
            <p>
              {money(topPending.amount)} · {topPending.concept}
            </p>
          </div>
          <div className="admin-finance__pending-actions">
            {canEdit && (
              <button
                type="button"
                className="admin-finance__pending-action"
                onClick={() => onApprovePayment?.(topPending.id)}
              >
                {t('admin.actions.validate')}
                <ChevronRight size={14} aria-hidden />
              </button>
            )}
            <button
              type="button"
              className="admin-dashboard-link"
              onClick={() => onNavigate?.('registrations')}
            >
              {t('admin.actions.payments')}
            </button>
          </div>
        </div>
      )}

      {!topPending && (
        <div className="admin-finance__footer">
          <button
            type="button"
            className="admin-dashboard-link"
            onClick={() => onNavigate?.('registrations')}
          >
            {t('admin.actions.payments')}
            <ArrowRight size={13} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

export default function DashboardSection({
  dashboardOverview,
  pendingActions,
  pendingPayments,
  recentActivity = [],
  onNavigate,
  onApprovePayment,
  onApproveTicketOrder,
  canEdit,
  globalSearch,
  onGlobalSearchChange,
  onGlobalSearchSubmit,
}) {
  const { t } = useI18n()
  const [alertsOpen, setAlertsOpen] = useState(false)

  const { finance, primary, secondary, spotlightEvent } = dashboardOverview

  const financeSubtitle = t('admin.dashboard.financeSubtitleLive', {
    pending: finance.pendingCount,
    events: finance.openEvents,
  })

  const primaryMetrics = useMemo(() => mapMetrics(primary, t), [primary, t])
  const secondaryMetrics = useMemo(() => mapMetrics(secondary, t), [secondary, t])

  return (
    <div className="admin-dashboard admin-dashboard--compact admin-dashboard--luxury admin-dashboard--executive">
      <AdminTopBar
        eyebrow={t('admin.dashboard.eyebrow')}
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

      <section
        className="admin-dashboard-snapshot admin-dashboard__block"
        aria-label={t('admin.dashboard.metricsAria')}
      >
        <div className="admin-kpi-board">
          <div className="admin-kpi-strip" role="list" aria-label={t('admin.dashboard.swipeHint')}>
            {primaryMetrics.map((item, index) => (
              <DashboardKpiTile
                key={item.labelKey}
                icon={item.icon}
                index={index}
                label={item.label}
                tone={item.tone}
                value={item.value}
                onClick={() => onNavigate?.(item.section)}
              />
            ))}
          </div>

          {secondaryMetrics.length > 0 && (
            <details className="admin-kpi-more">
              <summary className="admin-kpi-more__summary">
                <span>{t('admin.dashboard.moreMetrics')}</span>
                <span className="admin-kpi-more__count">{secondaryMetrics.length}</span>
              </summary>
              <div className="admin-kpi-sub" role="list">
                {secondaryMetrics.map((item) => (
                  <DashboardKpiChip
                    key={item.labelKey}
                    label={item.label}
                    tone={item.tone}
                    value={item.value}
                    onClick={() => onNavigate?.(item.section)}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      {pendingActions.length > 0 && (
        <button
          type="button"
          className="admin-attention-bar admin-dashboard__block"
          onClick={() => setAlertsOpen(true)}
        >
          <span className="admin-attention-bar__count">{pendingActions.length}</span>
          <span className="admin-attention-bar__copy">
            {pendingActions.length === 1
              ? t('admin.actionQueue.tasks', { count: pendingActions.length })
              : t('admin.actionQueue.tasksMany', { count: pendingActions.length })}
          </span>
          <span className="admin-attention-bar__action">
            {t('admin.actionQueue.title')}
            <ChevronRight size={14} aria-hidden />
          </span>
        </button>
      )}

      <DashboardQuickActions onNavigate={onNavigate} t={t} />

      <section className="admin-command-center admin-dashboard__block">
        <article className="admin-command-center__pane admin-command-center__pane--spotlight">
          <CommandCenterPaneHead eyebrow={t('admin.dashboard.spotlightTitle')} />
          <DashboardSpotlightEvent event={spotlightEvent} onNavigate={onNavigate} t={t} />
        </article>

        <article className="admin-command-center__pane admin-command-center__pane--finance">
          <CommandCenterPaneHead
            eyebrow={t('admin.dashboard.financeTitle')}
            subtitle={financeSubtitle}
          />
          <DashboardFinancePanel
            canEdit={canEdit}
            finance={finance}
            onApprovePayment={onApprovePayment}
            onNavigate={onNavigate}
            t={t}
          />
        </article>
      </section>

      <div className="admin-dashboard__panels admin-dashboard__panels--activity admin-dashboard__block">
        <RecentActivity compact items={recentActivity} />
      </div>
    </div>
  )
}
