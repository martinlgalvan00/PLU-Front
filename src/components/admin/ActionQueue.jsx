import { AlertCircle, ArrowRight } from 'lucide-react'

const PRIORITY_LABELS = {
  high: 'Urgente',
  medium: 'Pendiente',
  low: 'Próximo',
}

export default function ActionQueue({ items = [], onNavigate, onApprovePayment, canEdit }) {
  if (!items.length) {
    return (
      <section className="action-queue surface-card">
        <header className="action-queue__header">
          <div>
            <h2>Acciones pendientes</h2>
            <p>Todo al día. No hay tareas operativas urgentes.</p>
          </div>
          <span className="action-queue__count action-queue__count--ok">0</span>
        </header>
      </section>
    )
  }

  return (
    <section className="action-queue surface-card">
      <header className="action-queue__header">
        <div>
          <h2>Acciones pendientes</h2>
          <p>{items.length} tarea{items.length === 1 ? '' : 's'} requieren atención</p>
        </div>
        <span className="action-queue__count">{items.length}</span>
      </header>
      <ul className="action-queue__list">
        {items.map((item) => (
          <li key={item.id} className={`action-queue__item action-queue__item--${item.priority}`}>
            <div className="action-queue__icon" aria-hidden>
              <AlertCircle size={18} />
            </div>
            <div className="action-queue__body">
              <span className="action-queue__priority">{PRIORITY_LABELS[item.priority]}</span>
              <strong>{item.title}</strong>
              {item.detail && <p>{item.detail}</p>}
            </div>
            <div className="action-queue__actions">
              {item.paymentId && canEdit && (
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={(event) => {
                    event.stopPropagation()
                    onApprovePayment?.(item.paymentId)
                  }}
                >
                  Validar
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => onNavigate?.(item.section)}
              >
                Ver
                <ArrowRight size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
