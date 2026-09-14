import { useEffect, useState } from 'react'
import { CalendarClock, CalendarOff } from 'lucide-react'
import Button from '../ui/Button.jsx'
import DateTimeLocalInput from '../ui/DateTimeLocalInput.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function emptyDraft(currentPrice, currentManualPrice, priceEffectiveAt) {
  return {
    price: currentPrice != null && currentPrice !== '' ? String(currentPrice) : '',
    manualPrice:
      currentManualPrice != null && currentManualPrice !== '' ? String(currentManualPrice) : '',
    effectiveAt: toLocalDateTime(priceEffectiveAt),
  }
}

/**
 * Programación del precio de inscripción — PLU ARG
 *
 * Las cifras de arriba son el precio de HOY y se guardan con el evento. Esta
 * fila es el "desde esta fecha, tanto": un solo cambio pendiente, el mismo
 * contrato que Tarifas (`staff_set_event_registration_price`). No viaja en el
 * Guardar del formulario: un upsert que pisa `price` cancela la programación.
 */
export default function AdminEventPriceSchedule({
  canEdit,
  currentManualPrice = null,
  currentPrice,
  onClearSchedule,
  onSetSchedule,
  priceDirty = false,
  priceEffectiveAt = null,
  scheduledManualPrice = null,
  scheduledPrice = null,
}) {
  const { locale, t } = useI18n()
  const hasSchedule = Boolean(priceEffectiveAt) && Number(scheduledPrice) > 0
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState('')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(() =>
    emptyDraft(
      hasSchedule ? scheduledPrice : currentPrice,
      hasSchedule ? scheduledManualPrice : currentManualPrice,
      priceEffectiveAt,
    ),
  )

  useEffect(() => {
    if (!open) return
    setDraft(
      emptyDraft(
        hasSchedule ? scheduledPrice : currentPrice,
        hasSchedule ? scheduledManualPrice : currentManualPrice,
        priceEffectiveAt,
      ),
    )
    setError('')
  }, [
    currentManualPrice,
    currentPrice,
    hasSchedule,
    open,
    priceEffectiveAt,
    scheduledManualPrice,
    scheduledPrice,
  ])

  const dateLabel = hasSchedule
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(priceEffectiveAt),
      )
    : ''
  const pendingLabel = hasSchedule
    ? t(
        scheduledManualPrice != null
          ? 'admin.eventEditor.priceSchedulePendingManual'
          : 'admin.eventEditor.priceSchedulePending',
        {
          date: dateLabel,
          amount: money(scheduledPrice, locale),
          manual: scheduledManualPrice != null ? money(scheduledManualPrice, locale) : undefined,
        },
      )
    : ''

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const price = Number(draft.price)
    const manualPrice = draft.manualPrice === '' ? undefined : Number(draft.manualPrice)
    if (!Number.isInteger(price) || price <= 0) {
      setError(t('admin.eventEditor.priceScheduleNeedPrice'))
      return
    }
    if (manualPrice !== undefined && (!Number.isInteger(manualPrice) || manualPrice <= 0)) {
      setError(t('admin.eventEditor.priceScheduleNeedPrice'))
      return
    }
    if (!draft.effectiveAt) {
      setError(t('admin.eventEditor.priceScheduleNeedDate'))
      return
    }
    const when = new Date(draft.effectiveAt).getTime()
    if (!Number.isFinite(when) || when <= Date.now()) {
      setError(t('admin.eventEditor.priceScheduleNeedFuture'))
      return
    }

    setPending('save')
    const result = await onSetSchedule?.({
      price,
      manualPrice,
      effectiveAt: draft.effectiveAt,
    })
    setPending('')
    if (result?.error) {
      setError(result.error)
      return
    }
    setOpen(false)
  }

  async function handleClear() {
    setError('')
    setPending('clear')
    const result = await onClearSchedule?.()
    setPending('')
    if (result?.error) {
      setError(result.error)
      return
    }
    setOpen(false)
  }

  if (!onSetSchedule && !hasSchedule) return null

  return (
    <div className="admin-event-form__price-schedule">
      {hasSchedule ? (
        <div className="admin-event-form__price-schedule-pending">
          <CalendarClock size={13} aria-hidden />
          <p>{pendingLabel}</p>
          {canEdit && onClearSchedule ? (
            <button
              type="button"
              className="admin-event-form__price-schedule-cancel"
              disabled={Boolean(pending)}
              onClick={handleClear}
              aria-label={t('admin.eventEditor.priceScheduleCancel')}
            >
              <CalendarOff size={13} aria-hidden />
              {pending === 'clear'
                ? t('admin.eventEditor.priceScheduleSaving')
                : t('admin.eventEditor.priceScheduleCancel')}
            </button>
          ) : null}
        </div>
      ) : null}

      {priceDirty && hasSchedule ? (
        <p className="admin-event-form__price-schedule-warn">
          {t('admin.eventEditor.priceScheduleOverwriteHint')}
        </p>
      ) : null}

      {canEdit && onSetSchedule ? (
        open ? (
          <form className="admin-event-form__price-schedule-form" onSubmit={handleSubmit} noValidate>
            <p className="admin-event-form__price-schedule-lead">
              {t('admin.eventEditor.priceScheduleHint')}
            </p>
            <div className="admin-event-form__price-schedule-grid">
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.priceSchedulePrice')}</span>
                <span className="admin-event-form__rate-card-input">
                  <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                  <input
                    min={1}
                    name="scheduledPrice"
                    required
                    type="number"
                    value={draft.price}
                    onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                    disabled={Boolean(pending)}
                  />
                </span>
              </label>
              <label className="admin-event-form__field">
                <span>{t('admin.eventEditor.priceScheduleManual')}</span>
                <span className="admin-event-form__rate-card-input">
                  <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                  <input
                    min={1}
                    name="scheduledManualPrice"
                    type="number"
                    placeholder={t('admin.eventEditor.priceRegistrationManualPlaceholder')}
                    value={draft.manualPrice}
                    onChange={(event) => setDraft({ ...draft, manualPrice: event.target.value })}
                    disabled={Boolean(pending)}
                  />
                </span>
              </label>
              <label className="admin-event-form__field admin-event-form__field--wide">
                <span>{t('admin.eventEditor.priceScheduleFrom')}</span>
                <DateTimeLocalInput
                  disabled={Boolean(pending)}
                  name="priceEffectiveAt"
                  value={draft.effectiveAt}
                  onChange={(event) => setDraft({ ...draft, effectiveAt: event.target.value })}
                />
              </label>
            </div>
            {error ? (
              <p className="admin-event-form__error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="admin-event-form__price-schedule-actions">
              <Button
                className="btn--small btn--ghost"
                type="button"
                onClick={() => setOpen(false)}
                disabled={Boolean(pending)}
              >
                {t('admin.eventEditor.priceScheduleHide')}
              </Button>
              <Button
                className="btn--small"
                type="submit"
                disabled={Boolean(pending)}
              >
                {pending === 'save'
                  ? t('admin.eventEditor.priceScheduleSaving')
                  : t('admin.eventEditor.priceScheduleSubmit')}
              </Button>
            </div>
          </form>
        ) : (
          <Button
            className="btn--small btn--ghost admin-event-form__price-schedule-open"
            type="button"
            onClick={() => setOpen(true)}
          >
            <CalendarClock size={14} aria-hidden />
            {hasSchedule
              ? t('admin.eventEditor.priceScheduleChange')
              : t('admin.eventEditor.priceScheduleOpen')}
          </Button>
        )
      ) : null}

      {error && !open ? (
        <p className="admin-event-form__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
