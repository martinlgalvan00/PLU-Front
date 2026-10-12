import { StatusBadge } from '../ui/DataTable.jsx'
import { formatShortDate } from '../../lib/format.js'
import { MoreHorizontal } from 'lucide-react'
import { LazyPhoto } from '../ui/LazyPhoto.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Celda de identidad: nombre primario + sublínea secundaria.
 * `subMono` tipifica documentos/IDs con números tabulares.
 * `badge` reemplaza la sublínea (p. ej. pill Staff) sin tipografía mono.
 * La foto solo se pide cuando la fila está cerca del viewport.
 */
export function AdminIdentityCell({
  accent = 'celeste',
  name,
  photoUrl,
  sub,
  subMono = false,
  badge = null,
}) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <div className="data-table__identity">
      <span
        className={`data-table__avatar ${accent === 'gold' ? 'data-table__avatar--gold' : ''}`.trim()}
        aria-hidden
      >
        {photoUrl ? (
          <LazyPhoto
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
        {badge ? (
          <span className="data-table__identity-badge">{badge}</span>
        ) : sub ? (
          <span className={`data-table__sub${subMono ? ' data-table__sub--mono' : ''}`.trim()}>
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
    <span
      className="data-table__mono"
      title={title ?? (typeof children === 'string' ? children : undefined)}
    >
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
      {year != null && year !== '' ? <span className="data-table__period-year">{year}</span> : null}
    </div>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysUntil(iso, today = new Date()) {
  if (!iso) return null
  const end = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

/**
 * Vigencia en una sola línea (inicio → fin) y, debajo, solo lo que pide acción:
 * cuánto falta si está por vencer, o hace cuánto venció. Una afiliación vigente
 * y holgada no repite el año ni suma una tercera línea.
 */
export function AdminValidityCell({ start, end, lifecycle, locale = 'es' }) {
  const { t } = useI18n()
  // «1 may 2026», sin las preposiciones de «01 de may de 2026»: la fila entra en una línea.
  const compactDate = (iso) =>
    iso ? (formatShortDate(iso, locale) || iso).replace(/\s+de\s+/g, ' ').replace(/^0/, '') : null
  const startLabel = compactDate(start)
  const endLabel = compactDate(end)

  if (!startLabel && !endLabel) {
    return <span className="data-table__period data-table__period--empty">—</span>
  }

  const days = daysUntil(end)
  let note = null
  let noteTone = null
  if (lifecycle === 'expiring' && days != null && days >= 0) {
    noteTone = 'attention'
    note =
      days === 0
        ? t('admin.sections.memberships.expiresToday')
        : days === 1
          ? t('admin.sections.memberships.expiresTomorrow')
          : t('admin.sections.memberships.expiresIn', { count: days })
  } else if (lifecycle === 'expired' && days != null && days < 0) {
    noteTone = 'muted'
    note =
      days === -1
        ? t('admin.sections.memberships.expiredYesterday')
        : t('admin.sections.memberships.expiredAgo', { count: Math.abs(days) })
  }

  return (
    <div className="data-table__validity">
      <span className="data-table__validity-range">
        {startLabel ? (
          <time dateTime={start}>{startLabel}</time>
        ) : (
          <span className="data-table__date--empty">—</span>
        )}
        <span className="data-table__validity-sep" aria-hidden>
          →
        </span>
        {endLabel ? (
          <time dateTime={end}>{endLabel}</time>
        ) : (
          <span className="data-table__date--empty">—</span>
        )}
      </span>
      {note ? (
        <span className={`data-table__validity-note data-table__validity-note--${noteTone}`}>
          {noteTone === 'attention' ? (
            <span className="data-table__validity-dot" aria-hidden />
          ) : null}
          {note}
        </span>
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
      {amount && amount !== '—' ? (
        <span className="admin-payment-cell__amount">{amount}</span>
      ) : null}
    </div>
  )
}

export function AdminTableActions({ children, className = '', 'aria-label': ariaLabel, onClick }) {
  return (
    <div
      className={`admin-table-actions${className ? ` ${className}` : ''}`}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

/**
 * Menú “más” para acciones secundarias en filas densas.
 * Usa <details> nativo para no sumar dependencias de popover.
 */
export function AdminActionOverflow({ label, children }) {
  if (!children) return null

  return (
    <details
      className="admin-table-actions__more"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <summary
        className="admin-icon-btn admin-icon-btn--ghost"
        aria-label={label}
        title={label}
      >
        <MoreHorizontal size={15} aria-hidden />
      </summary>
      <div className="admin-table-actions__more-menu" role="menu">
        {children}
      </div>
    </details>
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
