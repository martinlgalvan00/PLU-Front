import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StatusBadge } from '../ui/DataTable.jsx'
import { formatShortDate } from '../../lib/format.js'
import { PAYMENT_METHODS } from '../../lib/constants.js'
import { MoreHorizontal, Paperclip } from 'lucide-react'
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

const MENU_GAP = 4
const MENU_EDGE = 8

/**
 * Menú “más” para acciones secundarias en filas densas.
 *
 * El panel va en un portal con `position: fixed`: dentro de la celda lo
 * recortaban el scroll de la tabla y el borde del contenedor, y en las últimas
 * filas se abría hacia abajo, fuera de pantalla — el botón parecía no responder.
 * Se mide al abrir: debajo del botón si entra, arriba si no.
 *
 * Los hijos siguen montados con el menú cerrado (el panel solo se oculta):
 * algunos, como `PaymentRecoveryAction`, guardan estado y montan sus diálogos.
 */
export function AdminActionOverflow({ label, children }) {
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState(null)
  const [position, setPosition] = useState(null)

  // El tema y las variables `--admin-*` cuelgan de `.admin-shell`: el portal va
  // ahí adentro y no a <body>, donde el panel perdería el color.
  useEffect(() => {
    setHost(triggerRef.current?.closest('.admin-shell') ?? document.body)
  }, [])

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const anchor = trigger.getBoundingClientRect()
    const { width, height } = menu.getBoundingClientRect()
    const fitsBelow = anchor.bottom + MENU_GAP + height + MENU_EDGE <= window.innerHeight
    const top = fitsBelow
      ? anchor.bottom + MENU_GAP
      : Math.max(MENU_EDGE, anchor.top - MENU_GAP - height)
    const left = Math.min(
      Math.max(MENU_EDGE, anchor.right - width),
      window.innerWidth - width - MENU_EDGE,
    )
    setPosition({ top, left })
  }, [open])

  // Recién posicionado deja de estar oculto: un elemento con visibility:hidden
  // no recibe foco, así que no se puede enfocar en el mismo paso que se mide.
  useEffect(() => {
    if (!open || !position) return
    menuRef.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [open, position])

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) {
        return
      }
      close()
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close(true)
        return
      }
      if (event.key === 'Tab') {
        close()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const items = [...(menuRef.current?.querySelectorAll('button:not(:disabled)') ?? [])]
      if (items.length === 0) return
      event.preventDefault()
      const index = items.indexOf(document.activeElement)
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length].focus()
    }
    // Un menú fijo no acompaña el scroll de la tabla: cerrarlo es más honesto
    // que dejarlo flotando sobre otra fila.
    const dismiss = () => close()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open, close])

  if (!children) return null

  return (
    <div
      className="admin-table-actions__more"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="admin-icon-btn admin-icon-btn--ghost"
        aria-label={label}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        title={label}
        onClick={() => {
          if (open) close()
          else {
            setPosition(null)
            setOpen(true)
          }
        }}
      >
        <MoreHorizontal size={15} aria-hidden />
      </button>
      {host
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="admin-table-actions__more-menu"
              role="group"
              aria-label={label}
              hidden={!open}
              style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
              // Un ítem habilitado cierra el menú; el diálogo que abra, si abre
              // alguno, ya no depende de que el panel siga visible.
              onClick={(event) => {
                event.stopPropagation()
                if (event.target.closest('button:not(:disabled)')) close()
              }}
            >
              {children}
            </div>,
            host,
          )
        : null}
    </div>
  )
}

/**
 * Comprobante de una orden a simple vista. El descriptor lo arma
 * `describePaymentProof`; acá solo se pinta. `onView` abre el comprobante en
 * lectura — no se precarga ningún binario al listar.
 */
export function AdminProofCell({ proof, onView, viewLabel }) {
  const { locale, t } = useI18n()
  if (!proof || proof.kind === 'none') {
    return <span className="admin-payment-cell__empty">—</span>
  }

  const formatStamp = (value) => {
    const date = value ? new Date(value) : null
    if (!date || Number.isNaN(date.getTime())) return null
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
    })
  }
  const channelLabel =
    proof.channel === 'wise_transfer'
      ? t('formOptions.payment.wiseTransfer')
      : t('admin.athletePayments.methodTransfer')

  let main
  let meta = null
  if (proof.kind === 'provider') {
    main = <span className="admin-proof-cell__note">{PAYMENT_METHODS.mercado_pago.label}</span>
  } else if (proof.kind === 'cash') {
    main = <span className="admin-proof-cell__note">{t('formOptions.payment.cashPitbull')}</span>
  } else if (proof.kind === 'attached') {
    main = (
      <button
        type="button"
        className="admin-proof-cell__link"
        aria-label={viewLabel}
        onClick={onView}
      >
        <Paperclip size={13} aria-hidden />
        {t('admin.actions.view')}
      </button>
    )
    meta = formatStamp(proof.uploadedAt) ?? channelLabel
  } else if (proof.kind === 'archived') {
    main = (
      <span
        className="admin-proof-cell__note"
        title={t('admin.athletePayments.proofArchivedOn', {
          date: formatStamp(proof.purgedAt) ?? '',
        })}
      >
        {t('admin.athletePayments.proofArchived')}
      </span>
    )
    meta = channelLabel
  } else {
    main = (
      <span
        className={`admin-proof-cell__note${proof.needsAttention ? ' admin-proof-cell__note--warning' : ''}`}
      >
        {t('admin.athletePayments.proofMissing')}
      </span>
    )
    meta = channelLabel
  }

  return (
    <div className="admin-proof-cell" onClick={(event) => event.stopPropagation()}>
      {main}
      {meta ? <span className="admin-proof-cell__meta">{meta}</span> : null}
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
