import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  formatWeighInSlotRange,
  groupWeighInWindowsByDay,
  normalizeWeighInWindows,
} from '../../lib/weighInWindows.js'

/**
 * Horarios de pesaje publicados desde la consola de Eventos.
 * Sin ventanas configuradas no inventa copy: el consumidor decide no renderizar.
 */
export default function EventWeighInSchedule({ className = '', windows }) {
  const { locale } = useI18n()
  const groups = groupWeighInWindowsByDay(windows, locale)
  if (groups.length === 0) return null

  return (
    <div className={`event-weighins ${className}`.trim()} role="list">
      {groups.map((group, index) => {
        // La fecha manda como encabezado; el label editorial pasa a acompañar
        // cada franja. Sin fecha cargada se cae al label, que es lo único que
        // hay -- y es exactamente el caso que el panel ahora avisa.
        const heading = group.dayLabel || group.label
        const showSlotLabels = Boolean(group.dayLabel)
        return (
        <article key={group.key} className="event-weighin pitbull-weighin" role="listitem">
          <span className="event-weighin__node pitbull-weighin__node" aria-hidden />
          <p className="event-weighin__day pitbull-weighin__day">
            <span className="event-weighin__day-index pitbull-weighin__day-index motif-num" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            {group.date ? (
              <time className="event-weighin__day-date" dateTime={group.date}>
                {heading}
              </time>
            ) : (
              heading
            )}
          </p>
          <div className="event-weighin__content pitbull-weighin__content">
            <div className="event-weighin__slots pitbull-weighin__slots">
              {group.slots.map((slot) => (
                <time
                  key={slot.id}
                  className="event-weighin__time pitbull-weighin__time"
                  dateTime={`${slot.startsAt}/${slot.endsAt}`}
                >
                  {showSlotLabels && slot.label ? (
                    <span className="event-weighin__slot-label">{slot.label}</span>
                  ) : null}
                  {formatWeighInSlotRange(slot, locale)}
                </time>
              ))}
            </div>
            {group.notes.map((note) => (
              <p key={note} className="event-weighin__note pitbull-weighin__note">
                {note}
              </p>
            ))}
          </div>
        </article>
        )
      })}
    </div>
  )
}

export function eventHasWeighInWindows(event) {
  return normalizeWeighInWindows(event?.weighInWindows).length > 0
}
