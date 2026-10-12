import { eventInitials, resolveEventLogo } from '../../lib/eventMark.js'

/**
 * Logo del evento, o monograma si no tiene. Es decorativo: el nombre del evento
 * siempre está escrito al lado, así que no suma un nombre accesible propio.
 * size: sm (fila), md (cabecera de la ficha), lg (evento principal).
 */
export default function AdminEventMark({ event, size = 'sm', className = '' }) {
  const src = resolveEventLogo(event)
  const classes = [
    'admin-event-mark',
    `admin-event-mark--${size}`,
    src ? 'admin-event-mark--logo' : 'admin-event-mark--mono',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-hidden="true">
      {src ? (
        <img src={src} alt="" width={96} height={96} loading="lazy" decoding="async" />
      ) : (
        <span className="admin-event-mark__initials">{eventInitials(event?.title)}</span>
      )}
    </span>
  )
}
