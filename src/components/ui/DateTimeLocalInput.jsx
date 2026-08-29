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
 *
 * Mientras se retippea un lado, el otro se toma del valor ya committed: borrar
 * la fecha no puede vaciar la hora (si no, al completar la fecha nueva el
 * commit falla por falta de hora y el campo parece trabado).
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

    // Sólo se borra el valor cuando los dos lados quedan vacíos. Vaciar la
    // fecha al retippear no puede tirar abajo la hora committed.
    if (dateEmpty && timeEmpty) {
      if (value) emitChange(onChange, name, '')
      return
    }

    const typedDate = parseDateText(nextDateText, dayFirst)
    const typedTime = parseTimeText(nextTimeText)
    const current = splitIsoLocal(value)

    // Tipeo a medias: esperar a que el lado con dígitos sea parseable.
    if (!dateEmpty && !typedDate) return
    if (!timeEmpty && !typedTime) return
    // Fecha borrada temporalmente para retippear: no tocar el parent.
    if (dateEmpty) return

    const timeParts =
      typedTime ?? (current ? { hours: current.hours, minutes: current.minutes } : null)
    if (!timeParts) return

    const nextValue = toIsoLocal(typedDate, timeParts)
    if (nextValue !== value) emitChange(onChange, name, nextValue)
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
    const dateEmpty = dateText.replace(/\D/g, '').length === 0
    const timeEmpty = timeText.replace(/\D/g, '').length === 0
    if (dateEmpty && timeEmpty) {
      if (value) emitChange(onChange, name, '')
      setDateText('')
      setTimeText('')
      return
    }

    const typedDate = parseDateText(dateText, dayFirst)
    const typedTime = parseTimeText(timeText)
    const current = splitIsoLocal(value)

    if (typedDate && (typedTime || current)) {
      const timeParts = typedTime ?? { hours: current.hours, minutes: current.minutes }
      const nextValue = toIsoLocal(typedDate, timeParts)
      if (nextValue !== value) emitChange(onChange, name, nextValue)
      setDateText(formatDateText(typedDate, dayFirst))
      setTimeText(formatTimeText(timeParts))
      return
    }

    if (typedTime && current) {
      const dateParts = { year: current.year, month: current.month, day: current.day }
      const nextValue = toIsoLocal(dateParts, typedTime)
      if (nextValue !== value) emitChange(onChange, name, nextValue)
      setDateText(formatDateText(dateParts, dayFirst))
      setTimeText(formatTimeText(typedTime))
      return
    }

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
