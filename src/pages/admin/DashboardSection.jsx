import { useRef } from 'react'
import AdminTopBar from '../../components/layout/AdminTopBar.jsx'
import ActionQueue from '../../components/admin/ActionQueue.jsx'
import AdminMetricCard from '../../components/admin/AdminMetricCard.jsx'

const METRIC_TONES = {
  users: 'celeste',
  badge: 'gold',
  clipboard: 'default',
  shield: 'alert',
}

export default function DashboardSection({
  dashboard,
  pendingActions,
  pendingPayments,
  onNavigate,
  onApprovePayment,
  canEdit,
  globalSearch,
  onGlobalSearchChange,
}) {
  const actionQueueRef = useRef(null)

  function scrollToActions() {
    actionQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="admin-dashboard">
      <AdminTopBar
        title="Dashboard"
        subtitle="Vista general de atletas, afiliaciones y operación diaria"
        searchValue={globalSearch}
        onSearchChange={onGlobalSearchChange}
        alertCount={pendingPayments}
        onAlertClick={scrollToActions}
      />

      <section className="admin-welcome" aria-label="Resumen rápido">
        <div className="admin-welcome__content">
          <span className="admin-welcome__eyebrow">Operación diaria</span>
          <h2>Estado general de la federación</h2>
          <p>
            {pendingActions.length > 0
              ? `${pendingActions.length} tarea${pendingActions.length === 1 ? '' : 's'} esperan tu acción.`
              : 'Sin urgencias operativas por ahora.'}
          </p>
        </div>
        {pendingPayments > 0 && (
          <button type="button" className="btn btn--small btn--secondary" onClick={() => onNavigate?.('payments')}>
            Ver pagos
          </button>
        )}
      </section>

      <div className="admin-stats">
        {dashboard.map((item) => (
          <AdminMetricCard
            key={item.label}
            value={item.value}
            label={item.label}
            icon={item.icon}
            tone={METRIC_TONES[item.icon] ?? 'default'}
          />
        ))}
      </div>

      <div ref={actionQueueRef}>
        <ActionQueue
          items={pendingActions}
          onNavigate={onNavigate}
          onApprovePayment={onApprovePayment}
          canEdit={canEdit}
        />
      </div>
    </div>
  )
}
