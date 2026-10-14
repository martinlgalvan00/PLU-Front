import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarCheck } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/pages/admin-event-access.css'

/**
 * Eventos que puede gestionar una cuenta de rol Organizador.
 *
 * El organizador solo ve y opera los eventos que se marcan acá; sin ninguno no ve
 * nada. Lo decide PLU (Super Admin / Administrador): el servidor lo exige. Los cambios
 * valen al instante, sin cerrarle la sesión. Reusa la estructura del diálogo de
 * confirmación del panel (`admin-user-delete-dialog`) para foco, Escape y velo.
 */
export default function UserEventAccessDialog({
  busy = false,
  error = '',
  events = [],
  initialEventIds = [],
  onCancel,
  onSave,
  userName,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const searchId = useId()
  const panelRef = useRef(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set(initialEventIds))
  const dialogStateRef = useRef({ busy, onCancel })
  dialogStateRef.current = { busy, onCancel }

  useEffect(() => {
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('input')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !dialogStateRef.current.busy) {
        event.preventDefault()
        dialogStateRef.current.onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable =
        panelRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)') ?? []
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus?.()
    }
  }, [])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) =>
      `${event.title ?? ''} ${event.slug ?? ''}`.toLowerCase().includes(needle),
    )
  }, [events, query])

  const initialKey = useMemo(() => [...initialEventIds].sort().join('|'), [initialEventIds])
  const selectedKey = [...selected].sort().join('|')
  const changed = initialKey !== selectedKey

  function toggle(eventId) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
  }

  return createPortal(
    <div className="admin-user-delete-dialog admin-event-access">
      <button
        type="button"
        className="admin-user-delete-dialog__backdrop"
        aria-label={t('admin.users.eventAccess.cancel')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-user-delete-dialog__panel admin-event-access__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="admin-event-access__icon" aria-hidden>
          <CalendarCheck size={19} />
        </span>
        <div className="admin-user-delete-dialog__copy">
          <h2 id={titleId}>{t('admin.users.eventAccess.title', { name: userName })}</h2>
          <p id={descriptionId}>{t('admin.users.eventAccess.description')}</p>

          <label className="admin-event-access__search" htmlFor={searchId}>
            <span>{t('admin.users.eventAccess.searchLabel')}</span>
            <input
              id={searchId}
              type="search"
              value={query}
              autoComplete="off"
              disabled={busy}
              placeholder={t('admin.users.eventAccess.searchPlaceholder')}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          {visible.length === 0 ? (
            <p className="admin-event-access__empty">{t('admin.users.eventAccess.empty')}</p>
          ) : (
            <ul className="admin-event-access__list">
              {visible.map((event) => (
                <li key={event.id}>
                  <label className="admin-event-access__item">
                    <input
                      type="checkbox"
                      checked={selected.has(event.id)}
                      disabled={busy}
                      onChange={() => toggle(event.id)}
                    />
                    <span className="admin-event-access__item-copy">
                      <strong>{event.title}</strong>
                      <small>{event.slug}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <p className="admin-event-access__count" role="status">
            {selected.size === 0
              ? t('admin.users.eventAccess.noneSelected')
              : t('admin.users.eventAccess.selectedCount', { count: selected.size })}
          </p>

          {error ? (
            <p className="admin-user-delete-dialog__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="admin-user-delete-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.users.eventAccess.cancel')}
          </Button>
          <Button
            type="button"
            variant="gold"
            disabled={busy || !changed}
            onClick={() => onSave([...selected])}
          >
            {busy ? t('admin.users.eventAccess.saving') : t('admin.users.eventAccess.save')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
