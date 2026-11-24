import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Ban, FileUp, LoaderCircle, Plus, UserCheck } from 'lucide-react'
import Button from '../ui/Button.jsx'
import Pill from '../ui/Pill.jsx'
import { Field, Select } from '../ui/FormFields.jsx'
import AdminDataTable from './AdminDataTable.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import AdminApiConnectionNotice from './AdminApiConnectionNotice.jsx'
import { AdminTableActions, AdminTableActionsEmpty } from './AdminTableCells.jsx'
import { useAdminModal } from './useAdminModal.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/components/admin-toolbar.css'
import '../../styles/pages/admin-event-security.css'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import {
  GUEST_LIST_MAX,
  guestStatus,
  parseGuestList,
  summarizeGuests,
} from '../../services/guestListService.js'
import {
  cancelGuestTicket,
  issueGuestTickets,
  listGuestTickets,
} from '../../services/ticketApi.js'

const INVALID_REASON_KEYS = {
  name: 'admin.guestList.reasonName',
  dni: 'admin.guestList.reasonDni',
  email: 'admin.guestList.reasonEmail',
  duplicate: 'admin.guestList.reasonDuplicate',
}

function formatTime(value, locale) {
  if (!value) return ''
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Lista de invitados del evento: prensa, sponsors o staff externo reciben una
 * entrada sin cargo con QR propio. La puerta la escanea igual que cualquier
 * otra (mismas zonas, mismo "una sola vez"), y ocupa cupo.
 *
 * Carga masiva pegando desde una planilla o importando un CSV; cada línea se
 * valida acá antes de emitir para que el operador corrija la planilla en vez
 * de enterarse por un error del servidor. La baja es individual y con motivo.
 */
export default function AdminEventGuestList({ event, canEdit = false }) {
  const { locale, t } = useI18n()
  const eventSlug = event?.slug ?? ''
  const ticketTypes = useMemo(
    () => (event?.ticketTypes ?? []).filter((type) => type.active !== false),
    [event?.ticketTypes],
  )

  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [ticketTypeId, setTicketTypeId] = useState('')
  const [label, setLabel] = useState('')
  const [raw, setRaw] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const fileInputRef = useRef(null)
  const loadGeneration = useRef(0)

  const load = useCallback(async () => {
    if (!eventSlug) return
    const generation = ++loadGeneration.current
    setLoading(true)
    setLoadError(null)
    try {
      const rows = await listGuestTickets(eventSlug)
      if (generation === loadGeneration.current) setGuests(rows)
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(error)
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }, [eventSlug])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!ticketTypeId && ticketTypes.length === 1) setTicketTypeId(ticketTypes[0].id)
  }, [ticketTypeId, ticketTypes])

  const parsed = useMemo(() => parseGuestList(raw), [raw])
  const summary = useMemo(() => summarizeGuests(guests), [guests])

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return guests
      .filter((guest) =>
        normalized
          ? [guest.fullName, guest.dni, guest.email, guest.label]
              .filter(Boolean)
              .some((field) => String(field).toLowerCase().includes(normalized))
          : true,
      )
      .map((guest) => ({ ...guest, id: guest.orderId, state: guestStatus(guest) }))
  }, [guests, query])

  async function handleImportFile(fileEvent) {
    const file = fileEvent.target.files?.[0]
    fileEvent.target.value = ''
    if (!file) return
    const text = await file.text()
    setRaw((current) => (current.trim() ? `${current.trim()}\n${text}` : text))
  }

  async function handleSubmit(formEvent) {
    formEvent.preventDefault()
    if (submitting || !ticketTypeId || parsed.guests.length === 0) return
    setSubmitting(true)
    setSubmitError('')
    setResult(null)
    try {
      const outcome = await issueGuestTickets(eventSlug, {
        ticketTypeId,
        label: label.trim(),
        sendEmail,
        guests: parsed.guests.map(({ fullName, dni, email }) => ({ fullName, dni, email })),
      })
      setResult(outcome)
      setRaw('')
      notifySuccess(t('admin.guestList.resultIssued', { count: outcome.issued }))
      await load()
    } catch (error) {
      const message = error?.message ?? t('admin.ticketOrders.lifecycle.errorFallback')
      setSubmitError(message)
      notifyError(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleConfirmCancel(reason) {
    const target = cancelTarget
    if (!target) return
    await cancelGuestTicket(eventSlug, target.orderId, reason)
    notifySuccess(t('admin.guestList.cancelled'))
    setCancelTarget(null)
    await load()
  }

  function renderStatus(row) {
    if (row.state === 'cancelled') {
      return (
        <div className="admin-guest-list__status">
          <Pill tone="neutral">{t('admin.guestList.statusCancelled')}</Pill>
          {row.cancellationReason ? (
            <small title={row.cancellationReason}>{row.cancellationReason}</small>
          ) : null}
        </div>
      )
    }
    if (row.state === 'checked_in') {
      return (
        <div className="admin-guest-list__status">
          <Pill tone="success">{t('admin.guestList.statusCheckedIn')}</Pill>
          <small title={row.checkedInGate ?? undefined}>{formatTime(row.checkedInAt, locale)}</small>
        </div>
      )
    }
    return <Pill tone="info">{t('admin.guestList.statusActive')}</Pill>
  }

  const validCount = parsed.guests.length
  const canSubmit = Boolean(ticketTypeId) && validCount > 0 && !submitting

  return (
    <section className="admin-event-security admin-guest-list" aria-labelledby="admin-guest-list-title">
      <header className="admin-event-security__head">
        <div className="admin-event-security__head-copy">
          <h3 id="admin-guest-list-title">{t('admin.guestList.title')}</h3>
          <p className="admin-event-security__lead">{t('admin.guestList.lead')}</p>
        </div>
        {canEdit && ticketTypes.length > 0 ? (
          <button
            type="button"
            className="admin-event-security__toggle"
            aria-expanded={formOpen}
            onClick={() => setFormOpen((open) => !open)}
          >
            {formOpen ? null : <Plus size={14} aria-hidden />}
            {formOpen ? t('admin.guestList.closeForm') : t('admin.guestList.add')}
          </button>
        ) : null}
      </header>

      {canEdit && ticketTypes.length === 0 ? (
        <p className="admin-event-security__lifecycle-note" role="note">
          {t('admin.guestList.noTicketTypes')}
        </p>
      ) : null}

      {formOpen && canEdit ? (
        <form className="admin-guest-list__form" onSubmit={handleSubmit}>
          <div className="admin-guest-list__form-row">
            <Select
              name="guest-ticket-type"
              label={t('admin.guestList.ticketType')}
              value={ticketTypeId}
              onChange={(changeEvent) => setTicketTypeId(changeEvent.target.value)}
              options={[
                ['', t('admin.guestList.ticketTypePlaceholder')],
                ...ticketTypes.map((type) => [type.id, type.name]),
              ]}
              required
            />
            <Field
              name="guest-label"
              label={t('admin.guestList.label')}
              value={label}
              maxLength={60}
              placeholder={t('admin.guestList.labelPlaceholder')}
              onChange={(changeEvent) => setLabel(changeEvent.target.value)}
            />
          </div>

          <div className="admin-guest-list__paste">
            <div className="admin-guest-list__paste-head">
              <label htmlFor="admin-guest-list-paste">{t('admin.guestList.paste')}</label>
              <button
                type="button"
                className="admin-event-security__toggle"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={14} aria-hidden />
                {t('admin.guestList.importFile')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                hidden
                onChange={handleImportFile}
              />
            </div>
            <textarea
              id="admin-guest-list-paste"
              rows={6}
              value={raw}
              disabled={submitting}
              placeholder={t('admin.guestList.pastePlaceholder')}
              aria-describedby="admin-guest-list-paste-hint"
              onChange={(changeEvent) => setRaw(changeEvent.target.value)}
            />
            <small id="admin-guest-list-paste-hint">{t('admin.guestList.pasteHint')}</small>
          </div>

          {raw.trim() ? (
            <div className="admin-guest-list__preview" role="status">
              <strong>
                {validCount === 1
                  ? t('admin.guestList.previewOne')
                  : t('admin.guestList.preview', { count: validCount })}
                {parsed.truncated ? ` · ${GUEST_LIST_MAX} max.` : ''}
              </strong>
              {parsed.invalid.length > 0 ? (
                <details>
                  <summary>
                    {parsed.invalid.length === 1
                      ? t('admin.guestList.invalidLinesOne')
                      : t('admin.guestList.invalidLines', { count: parsed.invalid.length })}
                  </summary>
                  <ul>
                    {parsed.invalid.slice(0, 20).map((item) => (
                      <li key={`${item.line}-${item.reason}`}>
                        {t('admin.guestList.invalidLine', {
                          line: item.line,
                          reason: t(INVALID_REASON_KEYS[item.reason]),
                        })}
                        {' — '}
                        <span className="data-table__mono">{item.value}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          <label className="admin-guest-list__checkbox">
            <input
              type="checkbox"
              checked={sendEmail}
              disabled={submitting}
              onChange={(changeEvent) => setSendEmail(changeEvent.target.checked)}
            />
            <span>
              {t('admin.guestList.sendEmail')}
              <small>{t('admin.guestList.sendEmailHint')}</small>
            </span>
          </label>

          {submitError ? (
            <p className="admin-users__form-error" role="alert">
              {submitError}
            </p>
          ) : null}

          <div className="admin-guest-list__form-actions">
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <LoaderCircle size={15} aria-hidden className="is-spinning" />
              ) : (
                <UserCheck size={15} aria-hidden />
              )}
              {submitting
                ? t('admin.guestList.submitting')
                : validCount === 1
                  ? t('admin.guestList.submitOne')
                  : t('admin.guestList.submit', { count: validCount })}
            </Button>
          </div>
        </form>
      ) : null}

      {result ? (
        <p className="admin-guest-list__result" role="status">
          {t('admin.guestList.resultIssued', { count: result.issued })}
          {result.emailed > 0 ? ` · ${t('admin.guestList.resultEmailed', { count: result.emailed })}` : ''}
          {result.skipped.length > 0
            ? ` · ${t('admin.guestList.resultSkipped', { count: result.skipped.length })}`
            : ''}
        </p>
      ) : null}
      {result?.emailFailed > 0 ? (
        <p className="admin-users__form-error" role="alert">
          {t('admin.guestList.resultEmailFailed', { count: result.emailFailed })}
        </p>
      ) : null}

      {loadError ? (
        <AdminApiConnectionNotice error={loadError} retrying={loading} onRetry={() => void load()} />
      ) : loading && guests.length === 0 ? (
        <p className="admin-event-security__empty">{t('admin.ticketOrders.loading')}</p>
      ) : guests.length === 0 ? (
        <p className="admin-event-security__empty">{t('admin.guestList.empty')}</p>
      ) : (
        <div className="admin-event-security__roster">
          <div className="admin-toolbar">
            <div className="admin-toolbar__row admin-guest-list__toolbar">
              <AdminFilterSearch
                placeholder={t('admin.guestList.searchPlaceholder')}
                query={query}
                onQueryChange={setQuery}
              />
              <small className="admin-guest-list__count" role="status">
                {t('admin.guestList.total', {
                  active: summary.active,
                  checkedIn: summary.checkedIn,
                })}
              </small>
            </div>
          </div>
          <AdminDataTable
            className="admin-data-table--guest-list"
            density="compact"
            rows={rows}
            emptyMessage={t('admin.guestList.emptySearch')}
            columns={[
              {
                key: 'fullName',
                label: t('admin.guestList.columnGuest'),
                mobile: 'primary',
                sortable: true,
                render: (row) => (
                  <div className="admin-orders-block__stack">
                    <span className="admin-orders-block__concept">{row.fullName}</span>
                    <span className="data-table__mono admin-orders-block__ref">
                      {row.dni}
                      {row.email ? ` · ${row.email}` : ''}
                    </span>
                  </div>
                ),
              },
              {
                key: 'label',
                label: t('admin.guestList.columnLabel'),
                mobile: 'default',
                width: 140,
                sortable: true,
                render: (row) => row.label || '—',
              },
              {
                key: 'state',
                label: t('admin.guestList.columnStatus'),
                mobile: 'badge',
                width: 220,
                sortable: true,
                render: renderStatus,
              },
              {
                key: 'actions',
                label: t('admin.guestList.columnAction'),
                mobile: 'action',
                width: 88,
                className: 'data-table__column--actions',
                render: (row) =>
                  canEdit && row.state !== 'cancelled' ? (
                    <AdminTableActions>
                      <AdminIconButton
                        icon={Ban}
                        label={t('admin.guestList.cancel')}
                        variant="danger"
                        onClick={() => setCancelTarget(row)}
                      />
                    </AdminTableActions>
                  ) : (
                    <AdminTableActionsEmpty />
                  ),
              },
            ]}
          />
        </div>
      )}

      {cancelTarget ? (
        <GuestCancelDialog
          guest={cancelTarget}
          onCancel={() => setCancelTarget(null)}
          onConfirm={handleConfirmCancel}
        />
      ) : null}
    </section>
  )
}

function GuestCancelDialog({ guest, onCancel, onConfirm }) {
  const { t } = useI18n()
  const titleId = useId()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })
  const valid = reason.trim().length >= 3

  async function handleSubmit(formEvent) {
    formEvent.preventDefault()
    if (busy || !valid) return
    setBusy(true)
    setError('')
    try {
      await onConfirm(reason.trim())
    } catch (err) {
      setError(err?.message ?? t('admin.ticketOrders.lifecycle.errorFallback'))
      setBusy(false)
    }
  }

  return createPortal(
    <div className="admin-status-dialog">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.ticketOrders.lifecycle.close')}
        disabled={busy}
        onClick={onCancel}
      />
      <form
        ref={panelRef}
        className="admin-status-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
      >
        <header className="admin-status-dialog__head">
          <span className="admin-status-dialog__icon admin-status-dialog__icon--danger" aria-hidden>
            <Ban size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.guestList.cancelTitle')}</h2>
            <p className="admin-status-dialog__lead">
              {t('admin.guestList.cancelLead', { name: guest.fullName })}
            </p>
          </div>
        </header>
        <div className="admin-status-dialog__field">
          <label htmlFor={reasonId}>{t('admin.guestList.cancelReason')}</label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={500}
            required
            value={reason}
            disabled={busy}
            placeholder={t('admin.guestList.cancelReasonPlaceholder')}
            onChange={(changeEvent) => setReason(changeEvent.target.value)}
          />
        </div>
        {error ? (
          <p className="admin-status-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-status-dialog__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.guestList.cancelBack')}
          </Button>
          <Button type="submit" variant="danger" disabled={busy || !valid}>
            {busy ? <LoaderCircle size={15} aria-hidden className="is-spinning" /> : null}
            {t('admin.guestList.cancelConfirm')}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
