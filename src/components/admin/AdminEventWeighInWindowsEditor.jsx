import { Plus, Scale, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import EventWeighInSchedule, {
  eventHasWeighInWindows,
} from '../ui/EventWeighInSchedule.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  createEmptyWeighInWindow,
  weighInWindowFromForm,
  weighInWindowToForm,
  weighInWindowsNeedDayPrefill,
} from '../../lib/weighInWindows.js'

/**
 * Franjas públicas de pesaje: día, horario de apertura y cierre, nota.
 * Varias filas pueden compartir fecha (pesaje adelantado mañana y tarde).
 */
export default function AdminEventWeighInWindowsEditor({
  canEdit = false,
  eventDays = [],
  errors = {},
  onChange,
  onPrefillFromDays,
  windows = [],
}) {
  const { t } = useI18n()
  const forms = windows.map((window, index) =>
    window.startTime != null || window.endTime != null
      ? window
      : weighInWindowToForm(window, index),
  )
  const previewWindows = forms.map((window, index) => weighInWindowFromForm(window, index))
  const canPrefill = canEdit && weighInWindowsNeedDayPrefill(eventDays, forms)

  function addWindow() {
    onChange?.([...forms, weighInWindowToForm(createEmptyWeighInWindow(), forms.length)])
  }

  function removeWindow(index) {
    onChange?.(forms.filter((_, position) => position !== index))
  }

  function patchWindow(index, field, value) {
    onChange?.(
      forms.map((window, position) =>
        position === index ? { ...window, [field]: value } : window,
      ),
    )
  }

  return (
    <section className="admin-event-form__block admin-weigh-in-windows">
      <header className="admin-event-form__block-head">
        <h3 className="admin-event-form__block-title">
          <Scale size={13} aria-hidden />
          {t('admin.schedule.weighInWindows.title')}
        </h3>
        <p className="admin-event-form__block-lead">{t('admin.schedule.weighInWindows.lead')}</p>
      </header>

      {forms.length === 0 ? (
        <p className="admin-ticket-types__empty">{t('admin.schedule.weighInWindows.empty')}</p>
      ) : (
        <ul className="admin-weigh-in-windows__list">
          {forms.map((window, index) => (
            <li key={window.id ?? `new-${index}`} className="admin-weigh-in-windows__row">
              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.weighInWindows.labelField')}</span>
                <input
                  disabled={!canEdit}
                  type="text"
                  maxLength={80}
                  value={window.label}
                  name={`weighInWindows.${index}.label`}
                  data-field={`weighInWindows.${index}.label`}
                  aria-invalid={Boolean(errors[`weighInWindows.${index}.label`])}
                  placeholder={t('admin.schedule.weighInWindows.labelPlaceholder')}
                  onChange={(event) => patchWindow(index, 'label', event.target.value)}
                />
                {errors[`weighInWindows.${index}.label`] ? (
                  <small className="admin-event-form__error" role="alert">
                    {errors[`weighInWindows.${index}.label`]}
                  </small>
                ) : null}
              </label>
              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.weighInWindows.dateField')}</span>
                <input
                  disabled={!canEdit}
                  type="date"
                  value={window.date}
                  name={`weighInWindows.${index}.date`}
                  data-field={`weighInWindows.${index}.date`}
                  aria-invalid={Boolean(errors[`weighInWindows.${index}.date`])}
                  onChange={(event) => patchWindow(index, 'date', event.target.value)}
                />
                {errors[`weighInWindows.${index}.date`] ? (
                  <small className="admin-event-form__error" role="alert">
                    {errors[`weighInWindows.${index}.date`]}
                  </small>
                ) : null}
              </label>
              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.weighInWindows.opensField')}</span>
                <input
                  disabled={!canEdit}
                  type="time"
                  value={window.startTime}
                  name={`weighInWindows.${index}.startTime`}
                  data-field={`weighInWindows.${index}.startsAt`}
                  aria-invalid={Boolean(errors[`weighInWindows.${index}.startsAt`])}
                  onChange={(event) => patchWindow(index, 'startTime', event.target.value)}
                />
                {errors[`weighInWindows.${index}.startsAt`] ? (
                  <small className="admin-event-form__error" role="alert">
                    {errors[`weighInWindows.${index}.startsAt`]}
                  </small>
                ) : null}
              </label>
              <label className="admin-event-sessions__field">
                <span>{t('admin.schedule.weighInWindows.closesField')}</span>
                <input
                  disabled={!canEdit}
                  type="time"
                  value={window.endTime}
                  name={`weighInWindows.${index}.endTime`}
                  data-field={`weighInWindows.${index}.endsAt`}
                  aria-invalid={Boolean(errors[`weighInWindows.${index}.endsAt`])}
                  onChange={(event) => patchWindow(index, 'endTime', event.target.value)}
                />
                {errors[`weighInWindows.${index}.endsAt`] ? (
                  <small className="admin-event-form__error" role="alert">
                    {errors[`weighInWindows.${index}.endsAt`]}
                  </small>
                ) : null}
              </label>
              <label className="admin-event-sessions__field admin-weigh-in-windows__note">
                <span>{t('admin.schedule.weighInWindows.noteField')}</span>
                <input
                  disabled={!canEdit}
                  type="text"
                  maxLength={160}
                  value={window.note}
                  name={`weighInWindows.${index}.note`}
                  data-field={`weighInWindows.${index}.note`}
                  placeholder={t('admin.schedule.weighInWindows.notePlaceholder')}
                  onChange={(event) => patchWindow(index, 'note', event.target.value)}
                />
              </label>
              {canEdit ? (
                <button
                  type="button"
                  className="admin-event-sessions__remove"
                  onClick={() => removeWindow(index)}
                  aria-label={t('admin.schedule.weighInWindows.remove', {
                    number: index + 1,
                  })}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="admin-weigh-in-windows__actions">
          {canPrefill && onPrefillFromDays ? (
            <Button
              className="btn--small btn--ghost"
              type="button"
              onClick={onPrefillFromDays}
            >
              {t('admin.schedule.weighInWindows.fromDays')}
            </Button>
          ) : null}
          <Button
            className="btn--small btn--ghost admin-ticket-types__add"
            type="button"
            onClick={addWindow}
          >
            <Plus size={14} aria-hidden />
            {t('admin.schedule.weighInWindows.add')}
          </Button>
        </div>
      ) : null}

      {eventHasWeighInWindows({ weighInWindows: previewWindows }) ? (
        <div className="admin-weigh-in-windows__preview">
          <p className="admin-weigh-in-windows__preview-label">
            {t('admin.schedule.weighInWindows.preview')}
          </p>
          <EventWeighInSchedule windows={previewWindows} />
        </div>
      ) : null}
    </section>
  )
}
