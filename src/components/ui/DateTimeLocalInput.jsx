import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  formatDateText,
  formatTimeText,
  isDayFirstLocale,
  maskDateInput,
  maskTimeInput,
  parseDateText,
  parseTimeText,
  splitIsoLocal,
  toIsoLocal,
} from '../../lib/localDateTime.js'
import '../../styles/components/datetime-local-input.css'

function emitChange(onChange, name, value) {
  onChange?.({ target: { name, value } })
}

/**
 * Fecha y hora en el orden del idioma de PLU (día/mes en es-AR).
 * El valor que viaja al draft sigue siendo `YYYY-MM-DDTHH:mm`.
 */
export default function DateTimeLocalInput({
  'aria-invalid': ariaInvalid = false,
  'data-field': dataField,
  disabled = false,
  id,
  name,
  onChange,
  required = false,
  value = '',
}) {
  const { locale, t } = useI18n()
  const dayFirst = isDayFirstLocale(locale)
  const parts = splitIsoLocal(value)

  const [dateText, setDateText] = useState(() => formatDateText(parts, dayFirst))
  const [timeText, setTimeText] = useState(() => formatTimeText(parts))

  useEffect(() => {
    const next = splitIsoLocal(value)
    setDateText(formatDateText(next, dayFirst))
    setTimeText(formatTimeText(next))
  }, [value, dayFirst])

  function commit(nextDateText, nextTimeText) {
    const dateEmpty = nextDateText.replace(/\D/g, '').length === 0
    const timeEmpty = nextTimeText.replace(/\D/g, '').length === 0
    if (dateEmpty) {
      if (timeEmpty || value) emitChange(onChange, name, '')
      return
    }

    const dateParts = parseDateText(nextDateText, dayFirst)
    const timeParts = parseTimeText(nextTimeText)
    if (!dateParts || !timeParts) return
    emitChange(onChange, name, toIsoLocal(dateParts, timeParts))
  }

  function handleDateChange(event) {
    const next = maskDateInput(event.target.value)
    setDateText(next)
    commit(next, timeText)
  }

  function handleTimeChange(event) {
    const next = maskTimeInput(event.target.value)
    setTimeText(next)
    commit(dateText, next)
  }

  function handleBlur() {
    const next = splitIsoLocal(value)
    setDateText(formatDateText(next, dayFirst))
    setTimeText(formatTimeText(next))
  }

  return (
    <div className="datetime-local-input" lang={dayFirst ? 'es-AR' : 'en-US'}>
      <input
        id={id}
        name={name}
        data-field={dataField}
        className="datetime-local-input__date"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        required={required}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        placeholder={t('admin.eventEditor.datetimeDatePlaceholder')}
        value={dateText}
        onChange={handleDateChange}
        onBlur={handleBlur}
      />
      <input
        className="datetime-local-input__time"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-label={t('admin.eventEditor.datetimeTime')}
        placeholder={t('admin.eventEditor.datetimeTimePlaceholder')}
        value={timeText}
        onChange={handleTimeChange}
        onBlur={handleBlur}
      />
    </div>
  )
}
