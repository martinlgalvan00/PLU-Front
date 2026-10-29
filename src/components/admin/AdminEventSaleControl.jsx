import { useState } from 'react'
import { CalendarClock, Flag, LockKeyhole, Unlock } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { resolveEventPublishConfirmChecks } from '../../lib/eventPublishChecks.js'
import { registrationSalePatch } from '../../../shared/registrationSaleState.js'
import useEventRegistrationSale from '../../hooks/useEventRegistrationSale.js'
import '../../styles/pages/admin-event-sale.css'

/** Dónde se arregla cada bloqueo (`onFix`); `null` = se resuelve acá mismo o fuera del evento. */
const BLOCKER_FIX = {
  hidden: null,
  announceOnly: 'payment',
  platformPaused: null,
  noPaymentChannel: 'payment',
}

function formatDate(date, locale) {
  if (!date) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    // 24 h: "15:50" y no "03:50 p. m.", que además chocaba con el punto final.
    hourCycle: 'h23',
  }).format(date)
}

/** `datetime-local` → ISO, interpretado en la hora del navegador. */
function localInputToIso(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : ''
}

/** Mañana a las 10, o la apertura ya programada, en formato `datetime-local`. */
function defaultScheduleValue(opensAt) {
  const date = opensAt ? new Date(opensAt) : new Date(Date.now() + 86_400_000)
  if (!opensAt) date.setHours(10, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Lo que el evento tiene guardado en las claves que va a cambiar un parche:
 * es lo que repone el "Deshacer" del aviso.
 */
function previousFor(event, patch) {
  const previous = {}
  for (const key of Object.keys(patch)) {
    if (key === 'ticketsEnabled') {
      previous.ticketsEnabled = event?.pricing?.ticketsEnabled === true
      continue
    }
    previous[key] = event?.[key] ?? (key.startsWith('registration') ? null : undefined)
  }
  return previous
}

function hasPublicTicketPrice(event) {
  return (event?.pricing?.ticketTypes ?? []).some(
    (type) => type?.active !== false && Number(type?.price) > 0,
  )
}

/**
 * AdminEventSaleControl — PLU ARG
 *
 * El lugar donde se abre, se programa o se cierra la venta de inscripciones
 * y donde se habilita la venta pública de entradas. Las dos son interruptores
 * distintos: abrir inscripciones no prende el botón de compra del público.
 *
 * El estado del evento ya no se elige a mano: "Abrir ahora", "Programar" y
 * "Cerrar" escriben estado + ventana (`registrationSalePatch`) y la lectura
 * sale de `resolveRegistrationSale`, la misma regla que usan el sitio y el
 * servidor. Si algo impide cobrar (evento oculto, solo anuncio, sin medios de
 * cobro, inscripciones pausadas en la plataforma) se dice qué y dónde se
 * arregla, en vez de un "abierta" que después falla al pagar.
 *
 * Los cambios se aplican al instante con un "Deshacer" en el aviso, como el
 * resto de las acciones rápidas del evento.
 */
export default function AdminEventSaleControl({
  event,
  canEdit = false,
  hasUnsavedState = () => false,
  onFix,
  onSetEventState,
}) {
  const { locale, t } = useI18n()
  const sale = useEventRegistrationSale(event)
  const [busy, setBusy] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleValue, setScheduleValue] = useState('')
  const editable = canEdit && Boolean(onSetEventState)

  if (!event) return null

  const text = (key, params) => t(`admin.eventSale.${key}`, params)
  const registered = Number(event.registered) || 0
  const slots = Number(event.slots) || 0
  const endsAt = event.endsAt ? new Date(event.endsAt) : null
  const eventOver = endsAt && !Number.isNaN(endsAt.getTime()) && endsAt < new Date()

  async function apply(patch, successText) {
    if (busy || !editable) return false
    if (hasUnsavedState()) {
      notifyError(t('admin.eventQuick.unsavedState'))
      return false
    }
    if (patch.published === true && !event.published && !confirmPublish()) return false
    setBusy(true)
    const previous = previousFor(event, patch)
    try {
      const result = await onSetEventState(event.slug, patch)
      if (result?.error) {
        notifyError(result.error)
        return false
      }
      notifySuccess(successText, {
        label: t('admin.eventQuick.undo'),
        onClick: () => {
          void onSetEventState(event.slug, previous).then((undone) => {
            if (undone?.error) notifyError(undone.error)
          })
        },
      })
      return true
    } catch (error) {
      notifyError(error?.message || t('admin.eventState.saveFailed'))
      return false
    } finally {
      setBusy(false)
    }
  }

  /** Publicar con el cobro incompleto: el servidor frena lo grave; acá se avisa lo demás. */
  function confirmPublish() {
    const checks = resolveEventPublishConfirmChecks(event, sale.platform)
    if (checks.length === 0) return true
    const lines = checks.map((code) => `• ${t(`admin.eventEditor.publishChecks.codes.${code}`)}`)
    return window.confirm(
      `${t('admin.eventEditor.publishChecks.intro')}\n\n${lines.join('\n')}\n\n${t('admin.eventEditor.publishChecks.confirmOutro')}`,
    )
  }

  function openNow() {
    // Abrir también publica: una inscripción abierta en un evento oculto no se puede usar.
    const patch = { ...registrationSalePatch('open', { event }), published: true }
    void apply(patch, text('openedToast'))
  }

  async function schedule(submitEvent) {
    submitEvent.preventDefault()
    const iso = localInputToIso(scheduleValue)
    if (!iso || new Date(iso) <= new Date()) {
      notifyError(text('scheduleInvalid'))
      return
    }
    const patch = registrationSalePatch('scheduled', { event, opensAt: iso })
    const ok = await apply(patch, text('scheduledToast', { date: formatDate(new Date(iso), locale) }))
    if (ok) setScheduling(false)
  }

  function startScheduling() {
    setScheduleValue(defaultScheduleValue(sale.state === 'scheduled' ? sale.opensAt : null))
    setScheduling(true)
  }

  const stateLine = (() => {
    switch (sale.state) {
      case 'on_sale':
        return sale.closesAt
          ? text('detailOnSaleUntil', { date: formatDate(sale.closesAt, locale) })
          : text('detailOnSale')
      case 'scheduled':
        return text('detailScheduled', { date: formatDate(sale.opensAt, locale) })
      case 'blocked':
        return text('detailBlocked')
      case 'closed':
        return text(`detailClosed_${sale.reason ?? 'notOpened'}`)
      case 'sold_out':
        return text('detailSoldOut', { registered, slots })
      default:
        return text('detailEnded')
    }
  })()

  const canOpen = ['closed', 'scheduled'].includes(sale.state)
  const canClose = ['on_sale', 'blocked', 'scheduled'].includes(sale.state)
  const canSchedule = ['closed', 'scheduled'].includes(sale.state)
  const ticketsOn = event.pricing?.ticketsEnabled === true
  const ticketsEnded = event.status === 'finalizado'
  const platformTicketsOff = sale.platform?.ticketEnabled === false

  return (
    <section
      className={`admin-event-sale is-${sale.state}`}
      aria-labelledby={`event-sale-${event.id ?? event.slug}`}
    >
      <div className="admin-event-sale__head">
        <p className="admin-event-sale__eyebrow" id={`event-sale-${event.id ?? event.slug}`}>
          {text('title')}
        </p>
        <p className="admin-event-sale__state" role="status">
          <span className="admin-event-sale__dot" aria-hidden />
          <strong>{text(`state_${sale.state}`)}</strong>
        </p>
        <p className="admin-event-sale__detail">{stateLine}</p>
      </div>

      {editable && !ticketsEnded ? (
        <div className={`admin-event-sale__tickets${ticketsOn ? ' is-on' : ''}`}>
          <p className="admin-event-sale__eyebrow">{text('ticketsTitle')}</p>
          <p className="admin-event-sale__state">
            <span className="admin-event-sale__dot" aria-hidden />
            <strong>{ticketsOn ? text('ticketsOn') : text('ticketsOff')}</strong>
          </p>
          <p className="admin-event-sale__detail">
            {ticketsOn ? text('ticketsDetailOn') : text('ticketsDetailOff')}
          </p>
          {ticketsOn && !hasPublicTicketPrice(event) ? (
            <p className="admin-event-sale__detail">{text('ticketsNeedPrice')}</p>
          ) : null}
          {ticketsOn && !event.published ? (
            <p className="admin-event-sale__detail">{text('ticketsHidden')}</p>
          ) : null}
          {ticketsOn && platformTicketsOff ? (
            <p className="admin-event-sale__detail">{text('ticketsPlatformOff')}</p>
          ) : null}
          <div className="admin-event-sale__actions">
            {ticketsOn ? (
              <button
                type="button"
                className="admin-event-sale__btn"
                disabled={busy}
                onClick={() => void apply({ ticketsEnabled: false }, text('ticketsClosedToast'))}
              >
                <LockKeyhole size={14} aria-hidden />
                {text('ticketsClose')}
              </button>
            ) : (
              <button
                type="button"
                className="admin-event-sale__btn admin-event-sale__btn--primary"
                disabled={busy}
                onClick={() => void apply({ ticketsEnabled: true }, text('ticketsOpenedToast'))}
              >
                <Unlock size={14} aria-hidden />
                {text('ticketsOpen')}
              </button>
            )}
            {onFix ? (
              <button
                type="button"
                className="admin-event-sale__btn admin-event-sale__btn--quiet"
                onClick={() => onFix('tickets')}
              >
                {text('ticketsEditTypes')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Programando, la única acción es confirmar la fecha. */}
      {editable && !scheduling ? (
        <div className="admin-event-sale__actions">
          {canOpen ? (
            <button
              type="button"
              className="admin-event-sale__btn admin-event-sale__btn--primary"
              disabled={busy}
              onClick={openNow}
            >
              <Unlock size={14} aria-hidden />
              {text('openNow')}
            </button>
          ) : null}
          {canSchedule ? (
            <button
              type="button"
              className="admin-event-sale__btn"
              disabled={busy}
              onClick={startScheduling}
            >
              <CalendarClock size={14} aria-hidden />
              {sale.state === 'scheduled' ? text('reschedule') : text('schedule')}
            </button>
          ) : null}
          {canClose ? (
            <button
              type="button"
              className="admin-event-sale__btn"
              disabled={busy}
              onClick={() => void apply(registrationSalePatch('closed'), text('closedToast'))}
            >
              <LockKeyhole size={14} aria-hidden />
              {text('close')}
            </button>
          ) : null}
          {sale.state === 'sold_out' && onFix ? (
            <button type="button" className="admin-event-sale__btn" onClick={() => onFix('cupo')}>
              {text('raiseCapacity')}
            </button>
          ) : null}
          {eventOver && sale.state !== 'ended' ? (
            <button
              type="button"
              className="admin-event-sale__btn admin-event-sale__btn--quiet"
              disabled={busy}
              onClick={() => void apply(registrationSalePatch('ended'), text('endedToast'))}
            >
              <Flag size={14} aria-hidden />
              {text('markEnded')}
            </button>
          ) : null}
        </div>
      ) : null}

      {scheduling ? (
        <form className="admin-event-sale__schedule" onSubmit={schedule}>
          <label className="admin-event-sale__schedule-field">
            <span>{text('scheduleLabel')}</span>
            <input
              required
              type="datetime-local"
              value={scheduleValue}
              onChange={(changeEvent) => setScheduleValue(changeEvent.target.value)}
            />
          </label>
          <div className="admin-event-sale__schedule-actions">
            <button
              type="submit"
              className="admin-event-sale__btn admin-event-sale__btn--primary"
              disabled={busy}
            >
              {text('scheduleConfirm')}
            </button>
            <button
              type="button"
              className="admin-event-sale__btn admin-event-sale__btn--quiet"
              onClick={() => setScheduling(false)}
            >
              {text('scheduleCancel')}
            </button>
          </div>
          <p className="admin-event-sale__hint">{text('scheduleHint')}</p>
        </form>
      ) : null}

      {sale.blockers.length > 0 ? (
        <ul className="admin-event-sale__issues" aria-label={text('blockersLabel')}>
          {sale.blockers.map((code) => (
            <li key={code}>
              <span>{text(`blocker_${code}`)}</span>
              {code === 'hidden' && editable ? (
                <button
                  type="button"
                  className="admin-event-sale__fix"
                  disabled={busy}
                  onClick={() => void apply({ published: true }, t('admin.eventState.publishedSaved'))}
                >
                  {text('fixPublish')}
                </button>
              ) : BLOCKER_FIX[code] && onFix ? (
                <button
                  type="button"
                  className="admin-event-sale__fix"
                  onClick={() => onFix(BLOCKER_FIX[code])}
                >
                  {text('fixPayment')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {sale.warnings.length > 0 && sale.state !== 'ended' ? (
        <ul
          className="admin-event-sale__issues admin-event-sale__issues--warning"
          aria-label={text('warningsLabel')}
        >
          {sale.warnings.map((code) => (
            <li key={code}>
              <span>{t(`admin.eventEditor.publishChecks.codes.${code}`)}</span>
              {onFix ? (
                <button
                  type="button"
                  className="admin-event-sale__fix"
                  onClick={() => onFix('payment')}
                >
                  {text('fixPayment')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
