import '../../styles/components/ticket-type-options.css'
import { DoorOpen, Flame, ShieldCheck, Users } from 'lucide-react'
import { money } from '../../lib/format.js'

/**
 * TicketTypeOptions — elegir entrada sabiendo qué abre — PLU ARG
 *
 * Un tipo de entrada dejó de ser un nombre: es un precio, una lista de zonas y
 * una cantidad de credenciales. La diferencia entre espectador y entrenador no
 * está en cómo se llaman sino en que una abre la entrada en calor y la otra no,
 * y eso tiene que leerse antes de pagar, no después.
 *
 * La misma pieza sirve para elegir (checkout) y para mostrar (tienda, vista
 * rápida del evento, página de entradas). Es a propósito: cuando cada
 * superficie armaba su propia fila, la tienda decía "desde $X" y el checkout
 * un nombre suelto, y ninguna de las dos decía lo mismo que la credencial que
 * después se emitía.
 *
 * Sin `onChange` es de sólo lectura: una lista, no un grupo de radios, para no
 * ofrecerle un control inerte a quien navega con teclado.
 */

const ZONE_ICONS = {
  gate_tickets: DoorOpen,
  athletes_only: Users,
  athletes_coaches: Flame,
  staff_only: ShieldCheck,
}

/** Nombre público de una zona. El panel usa otro: describe el alcance del
 *  escáner, no el lugar al que se entra. */
export function zoneScopeLabel(scope, t) {
  return t(`pages.tickets.ticketTypes.zone.${scope}`)
}

/** "Puerta general + Entrada en calor", para una línea suelta. */
export function zoneScopeList(zoneScopes = [], t) {
  return zoneScopes.map((scope) => zoneScopeLabel(scope, t)).join(' + ')
}

/**
 * "2 credenciales · 2 QR". Se dice siempre, también cuando es una: que el
 * espectador lea "1 credencial" es lo que vuelve informativo el "2" del
 * entrenador, en vez de un adorno que sólo aparece en el caso raro.
 */
export function credentialCountLabel(count, t) {
  return count === 1
    ? t('pages.tickets.ticketTypes.credentials_one')
    : t('pages.tickets.ticketTypes.credentials_other', { count })
}

function ZoneChips({ zoneScopes = [], t }) {
  if (!zoneScopes.length) return null
  return (
    <ul className="ticket-type-options__zones">
      {zoneScopes.map((scope) => {
        const Icon = ZONE_ICONS[scope] ?? DoorOpen
        return (
          <li key={scope} className={`ticket-type-options__zone ticket-type-options__zone--${scope}`}>
            <Icon size={13} strokeWidth={1.9} aria-hidden />
            {zoneScopeLabel(scope, t)}
          </li>
        )
      })}
    </ul>
  )
}

function TicketTypeBody({ type, locale, t, showAddons }) {
  const count = type.credentialCount ?? 1
  const included = showAddons ? (type.includedAddons ?? []) : []

  return (
    <>
      <span className="ticket-type-options__head">
        <span className="ticket-type-options__name">{type.name}</span>
        <span className="ticket-type-options__price">{money(type.price, locale)}</span>
      </span>

      <ZoneChips zoneScopes={type.zoneScopes} t={t} />

      <span className="ticket-type-options__meta">
        <span className="ticket-type-options__credentials">{credentialCountLabel(count, t)}</span>
        {/* El cupo cuenta compras, no credenciales. Sin decirlo, "quedan 40
            lugares" y "80 QR emitidos" parecen contradecirse. */}
        {count > 1 ? (
          <span className="ticket-type-options__quota">
            {t('pages.tickets.ticketTypes.quotaNote')}
          </span>
        ) : null}
      </span>

      {included.length ? (
        <span className="ticket-type-options__includes">
          {t('pages.tickets.ticketTypes.includes')}:{' '}
          {included.map((addon) => addon.label).join(' · ')}
        </span>
      ) : null}
    </>
  )
}

export default function TicketTypeOptions({
  className = '',
  locale = 'es',
  name,
  onChange,
  showAddons = true,
  t,
  ticketTypes = [],
  value,
}) {
  if (!ticketTypes.length) return null

  const rootClass = ['ticket-type-options', className].filter(Boolean).join(' ')
  const legend = t('pages.tickets.ticketTypes.legend')

  if (!onChange) {
    return (
      <ul className={`${rootClass} ticket-type-options--readonly`} aria-label={legend}>
        {ticketTypes.map((type) => (
          <li key={type.id} className="ticket-type-options__option">
            <TicketTypeBody type={type} locale={locale} t={t} showAddons={showAddons} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <fieldset className={rootClass}>
      <legend className="ticket-type-options__legend">{legend}</legend>
      {ticketTypes.map((type) => (
        <label
          key={type.id}
          className={`ticket-type-options__option${value === type.id ? ' is-selected' : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={type.id}
            checked={value === type.id}
            onChange={() => onChange(type.id)}
          />
          <TicketTypeBody type={type} locale={locale} t={t} showAddons={showAddons} />
        </label>
      ))}
    </fieldset>
  )
}
