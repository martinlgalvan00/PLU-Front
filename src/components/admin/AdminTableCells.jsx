import { StatusBadge } from '../ui/DataTable.jsx'
import { formatShortDate } from '../../lib/format.js'

/**
 * Celda de identidad: nombre primario + sublínea secundaria.
 * `subMono` tipifica documentos/IDs con números tabulares.
 */
export function AdminIdentityCell({
  accent = 'celeste',
  name,
  photoUrl,
  sub,
  subMono = false,
}) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div className="data-table__identity">
      <span
        className={`data-table__avatar ${accent === 'gold' ? 'data-table__avatar--gold' : ''}`.trim()}
        aria-hidden
      >
        {photoUrl ? (
          <img
            className="data-table__avatar-photo"
            src={photoUrl}
            alt=""
            onError={(event) => {
              event.currentTarget.hidden = true
            }}
          />
        ) : null}
        <span>{initial}</span>
      </span>
      <div className="data-table__identity-copy">
        <strong className="data-table__identity-name">{name ?? '—'}</strong>
        {sub ? (
          <span
            className={`data-table__sub${subMono ? ' data-table__sub--mono' : ''}`.trim()}
          >
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Valor monoespaciado / tabular (documento, código, montos). */
export function AdminMonoCell({ children, title }) {
  if (children == null || children === '') {
    return <span className="data-table__mono data-table__mono--empty">—</span>
  }

  return (
    <span className="data-table__mono" title={title ?? (typeof children === 'string' ? children : undefined)}>
      {children}
    </span>
  )
}

/** Fecha corta localizada (ej. 21 jul 2026). */
export function AdminDateCell({ value, locale = 'es' }) {
  if (!value) {
    return <span className="data-table__date data-table__date--empty">—</span>
  }

  const label = formatShortDate(value, locale) || value
  return (
    <time className="data-table__date" dateTime={value}>
      {label}
    </time>
  )
}

/**
 * Rango de vigencia: inicio → fin, con año opcional como meta.
 */
export function AdminPeriodCell({ start, end, year, locale = 'es' }) {
  const startLabel = start ? formatShortDate(start, locale) || start : null
  const endLabel = end ? formatShortDate(end, locale) || end : null

  if (!startLabel && !endLabel) {
    return <span className="data-table__period data-table__period--empty">—</span>
  }

  return (
    <div className="data-table__period">
      <span className="data-table__period-range">
        {startLabel ? (
          <time className="data-table__date" dateTime={start}>
            {startLabel}
          </time>
        ) : (
          <span className="data-table__date data-table__date--empty">—</span>
        )}
        <span className="data-table__period-sep" aria-hidden>
          →
        </span>
        {endLabel ? (
          <time className="data-table__date" dateTime={end}>
            {endLabel}
          </time>
        ) : (
          <span className="data-table__date data-table__date--empty">—</span>
        )}
      </span>
      {year != null && year !== '' ? (
        <span className="data-table__period-year">{year}</span>
      ) : null}
    </div>
  )
}

export function AdminPaymentCell({ amount, status }) {
  if (!status && (!amount || amount === '—')) {
    return <span className="admin-payment-cell__empty">—</span>
  }

  return (
    <div className="admin-payment-cell">
      {status ? <StatusBadge value={status} /> : null}
      {amount && amount !== '—' ? <span className="admin-payment-cell__amount">{amount}</span> : null}
    </div>
  )
}

export function AdminTableActions({ children, 'aria-label': ariaLabel, onClick }) {
  return (
    <div
      className="admin-table-actions"
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/** Placeholder tipográfico cuando la fila no tiene acciones disponibles. */
export function AdminTableActionsEmpty() {
  return (
    <span className="admin-table-actions__empty" aria-hidden>
      —
    </span>
  )
}
