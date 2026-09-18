import { useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { LoaderCircle, Plus, Ticket, X } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { validateTicketAttendees, validateTicketBuyer } from '../../lib/validation.js'
import { useAdminModal } from './useAdminModal.js'

const MAX_ATTENDEES = 8
const MANUAL_CHANNELS = ['cash_pitbull', 'bank_transfer']

function emptyAttendee() {
  return { fullName: '', dni: '', ticketTypeId: '' }
}

/**
 * Alta de una venta de mostrador: la carga un operador para una venta que ya
 * se cobró por fuera del checkout público (efectivo en la puerta,
 * transferencia recibida por privado). Efectivo se auto-aprueba del lado del
 * servidor (`POST /orders/manual`); transferencia queda pendiente y sigue el
 * circuito de validación existente. Este componente sólo arma el payload y
 * valida con las mismas reglas que el checkout público
 * (`validateTicketAttendees`/`validateTicketBuyer`) -- el precio, el cupo y
 * los medios habilitados los decide siempre el servidor.
 */
export default function ManualTicketSaleDialog({ events = [], busy = false, error = '', onCancel, onConfirm }) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const formId = useId()
  const panelRef = useAdminModal(() => {
    if (!busy) onCancel()
  })

  const ticketableEvents = useMemo(
    () => events.filter((event) => (event.ticketTypes?.length ?? 0) > 0),
    [events],
  )

  const [eventSlug, setEventSlug] = useState('')
  const [attendees, setAttendees] = useState(() => [emptyAttendee()])
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [manualPaymentChannel, setManualPaymentChannel] = useState('cash_pitbull')
  const [formErrors, setFormErrors] = useState({})

  const selectedEvent = ticketableEvents.find((event) => event.slug === eventSlug) ?? null
  const activeTicketTypes = useMemo(
    () => (selectedEvent?.ticketTypes ?? []).filter((type) => type.active),
    [selectedEvent],
  )
  const validTicketTypeIds = useMemo(
    () => activeTicketTypes.map((type) => type.id),
    [activeTicketTypes],
  )

  function handleEventChange(nextSlug) {
    setEventSlug(nextSlug)
    // Los tipos de entrada son propios de cada evento: un tipo válido acá
    // puede no existir en el próximo, así que se resetean con el evento.
    setAttendees((current) => current.map((attendee) => ({ ...attendee, ticketTypeId: '' })))
  }

  function patchAttendee(index, field, value) {
    setAttendees((current) =>
      current.map((attendee, i) => (i === index ? { ...attendee, [field]: value } : attendee)),
    )
  }

  function addAttendee() {
    setAttendees((current) =>
      current.length >= MAX_ATTENDEES ? current : [...current, emptyAttendee()],
    )
  }

  function removeAttendee(index) {
    setAttendees((current) =>
      current.length <= 1 ? current : current.filter((_, i) => i !== index),
    )
  }

  function patchBuyer(field, value) {
    setBuyer((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const attendeesResult = validateTicketAttendees(attendees, t, validTicketTypeIds)
    const buyerResult = validateTicketBuyer(buyer, t)
    const errors = { ...attendeesResult.errors, ...buyerResult.errors }
    if (!eventSlug) {
      errors.event = t('admin.ticketOrders.manualSale.eventRequired')
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    onConfirm({
      eventSlug,
      attendees: attendees.map((attendee) => ({
        fullName: attendee.fullName.trim(),
        dni: attendee.dni.trim(),
        ticketTypeId: attendee.ticketTypeId,
      })),
      buyer: {
        name: buyer.name.trim(),
        email: buyer.email.trim().toLowerCase(),
        phone: buyer.phone.trim() || undefined,
      },
      manualPaymentChannel,
    })
  }

  return createPortal(
    <div className="admin-manual-ticket-sale">
      <button
        type="button"
        className="admin-manual-ticket-sale__backdrop"
        aria-label={t('admin.ticketOrders.manualSale.cancel')}
        disabled={busy}
        onClick={onCancel}
      />
      <section
        ref={panelRef}
        className="admin-manual-ticket-sale__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="admin-manual-ticket-sale__head">
          <span className="admin-manual-ticket-sale__icon" aria-hidden>
            <Ticket size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.ticketOrders.manualSale.title')}</h2>
            <p id={descriptionId} className="admin-manual-ticket-sale__lead">
              {t('admin.ticketOrders.manualSale.hint')}
            </p>
          </div>
        </header>

        <form id={formId} className="admin-manual-ticket-sale__form" onSubmit={handleSubmit}>
          <label className="admin-manual-ticket-sale__field">
            <span>{t('admin.ticketOrders.manualSale.event')}</span>
            <select
              required
              disabled={busy}
              value={eventSlug}
              onChange={(event) => handleEventChange(event.target.value)}
            >
              <option value="" disabled>
                {t('admin.ticketOrders.manualSale.eventPlaceholder')}
              </option>
              {ticketableEvents.map((event) => (
                <option key={event.slug} value={event.slug}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
          {formErrors.event ? (
            <p className="admin-manual-ticket-sale__field-error" role="alert">
              {formErrors.event}
            </p>
          ) : null}
          {eventSlug && ticketableEvents.length === 0 ? (
            <p className="admin-manual-ticket-sale__field-error" role="alert">
              {t('admin.ticketOrders.manualSale.noEvents')}
            </p>
          ) : null}

          <div className="admin-manual-ticket-sale__attendees">
            {attendees.map((attendee, index) => (
              <fieldset key={index} className="admin-manual-ticket-sale__attendee">
                <legend>{t('admin.ticketOrders.manualSale.attendee', { index: index + 1 })}</legend>
                <div className="admin-manual-ticket-sale__attendee-grid">
                  <label className="admin-manual-ticket-sale__field">
                    <span>{t('admin.ticketOrders.manualSale.fullName')}</span>
                    <input
                      required
                      minLength={3}
                      disabled={busy}
                      value={attendee.fullName}
                      onChange={(event) => patchAttendee(index, 'fullName', event.target.value)}
                    />
                    {formErrors[`attendee-${index}-fullName`] ? (
                      <span className="admin-manual-ticket-sale__field-error" role="alert">
                        {formErrors[`attendee-${index}-fullName`]}
                      </span>
                    ) : null}
                  </label>
                  <label className="admin-manual-ticket-sale__field">
                    <span>{t('admin.ticketOrders.manualSale.dni')}</span>
                    <input
                      required
                      inputMode="numeric"
                      maxLength={8}
                      autoComplete="off"
                      disabled={busy}
                      value={attendee.dni}
                      onChange={(event) =>
                        patchAttendee(index, 'dni', event.target.value.replace(/\D/g, ''))
                      }
                    />
                    {formErrors[`attendee-${index}-dni`] ? (
                      <span className="admin-manual-ticket-sale__field-error" role="alert">
                        {formErrors[`attendee-${index}-dni`]}
                      </span>
                    ) : null}
                  </label>
                  <label className="admin-manual-ticket-sale__field admin-manual-ticket-sale__field--wide">
                    <span>{t('admin.ticketOrders.manualSale.ticketType')}</span>
                    <select
                      required
                      disabled={busy || !eventSlug}
                      value={attendee.ticketTypeId}
                      onChange={(event) => patchAttendee(index, 'ticketTypeId', event.target.value)}
                    >
                      <option value="" disabled>
                        {t('admin.ticketOrders.manualSale.ticketTypePlaceholder')}
                      </option>
                      {activeTicketTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                    {formErrors[`attendee-${index}-ticketTypeId`] ? (
                      <span className="admin-manual-ticket-sale__field-error" role="alert">
                        {formErrors[`attendee-${index}-ticketTypeId`]}
                      </span>
                    ) : null}
                  </label>
                </div>
                {attendees.length > 1 ? (
                  <button
                    type="button"
                    className="admin-manual-ticket-sale__remove-attendee"
                    disabled={busy}
                    onClick={() => removeAttendee(index)}
                  >
                    <X size={14} aria-hidden />
                    {t('admin.ticketOrders.manualSale.removeAttendee')}
                  </button>
                ) : null}
              </fieldset>
            ))}
          </div>

          {attendees.length < MAX_ATTENDEES ? (
            <button
              type="button"
              className="admin-manual-ticket-sale__add-attendee"
              disabled={busy}
              onClick={addAttendee}
            >
              <Plus size={14} aria-hidden />
              {t('admin.ticketOrders.manualSale.addAttendee')}
            </button>
          ) : (
            <p className="admin-manual-ticket-sale__hint">
              {t('admin.ticketOrders.manualSale.maxAttendees')}
            </p>
          )}

          <fieldset className="admin-manual-ticket-sale__buyer">
            <legend>{t('admin.ticketOrders.manualSale.buyerTitle')}</legend>
            <div className="admin-manual-ticket-sale__attendee-grid">
              <label className="admin-manual-ticket-sale__field">
                <span>{t('admin.ticketOrders.manualSale.buyerName')}</span>
                <input
                  required
                  minLength={3}
                  autoComplete="name"
                  disabled={busy}
                  value={buyer.name}
                  onChange={(event) => patchBuyer('name', event.target.value)}
                />
                {formErrors['buyer-name'] ? (
                  <span className="admin-manual-ticket-sale__field-error" role="alert">
                    {formErrors['buyer-name']}
                  </span>
                ) : null}
              </label>
              <label className="admin-manual-ticket-sale__field">
                <span>{t('admin.ticketOrders.manualSale.buyerEmail')}</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  disabled={busy}
                  value={buyer.email}
                  onChange={(event) => patchBuyer('email', event.target.value)}
                />
                {formErrors['buyer-email'] ? (
                  <span className="admin-manual-ticket-sale__field-error" role="alert">
                    {formErrors['buyer-email']}
                  </span>
                ) : (
                  <span className="admin-manual-ticket-sale__hint">
                    {t('admin.ticketOrders.manualSale.buyerEmailHint')}
                  </span>
                )}
              </label>
              <label className="admin-manual-ticket-sale__field admin-manual-ticket-sale__field--wide">
                <span>{t('admin.ticketOrders.manualSale.buyerPhone')}</span>
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  disabled={busy}
                  value={buyer.phone}
                  onChange={(event) => patchBuyer('phone', event.target.value)}
                />
                {formErrors['buyer-phone'] ? (
                  <span className="admin-manual-ticket-sale__field-error" role="alert">
                    {formErrors['buyer-phone']}
                  </span>
                ) : null}
              </label>
            </div>
          </fieldset>

          <fieldset className="admin-manual-ticket-sale__channels" role="radiogroup">
            <legend>{t('admin.ticketOrders.manualSale.channelTitle')}</legend>
            {MANUAL_CHANNELS.map((channel) => (
              <label
                key={channel}
                className={`admin-manual-ticket-sale__channel${manualPaymentChannel === channel ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="manual-ticket-channel"
                  value={channel}
                  checked={manualPaymentChannel === channel}
                  disabled={busy}
                  onChange={() => setManualPaymentChannel(channel)}
                />
                <span className="admin-manual-ticket-sale__channel-name">
                  {t(`admin.ticketOrders.manualSale.${channel === 'cash_pitbull' ? 'cash' : 'transfer'}`)}
                </span>
                <span className="admin-manual-ticket-sale__channel-hint">
                  {t(
                    `admin.ticketOrders.manualSale.${channel === 'cash_pitbull' ? 'cashHint' : 'transferHint'}`,
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        </form>

        {error ? (
          <p className="admin-manual-ticket-sale__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="admin-manual-ticket-sale__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            {t('admin.ticketOrders.manualSale.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} aria-hidden className="is-spinning" />
            ) : (
              <Ticket size={15} aria-hidden />
            )}
            {busy ? t('admin.ticketOrders.manualSale.submitting') : t('admin.ticketOrders.manualSale.submit')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
