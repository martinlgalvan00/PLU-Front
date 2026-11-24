import '../../styles/components/ticket-type-options.css'
import { CalendarDays, DoorOpen, Flame, Minus, Plus, ShieldCheck, Users } from 'lucide-react'
import { money } from '../../lib/format.js'
import { ticketTypeNameParts } from '../../lib/eventPricing.js'

/**
 * TicketTypeOptions — elegir entrada sabiendo qué abre — PLU ARG
 *
 * Un tipo de entrada dejó de ser un nombre: es un precio, una lista de zonas y
 * una cantidad de credenciales. La diferencia entre espectador y entrenador no
 * está en cómo se llaman sino en que una abre la entrada en calor y la otra no,
 * y eso tiene que leerse antes de pagar, no después.
 *
 * La misma pieza sirve para mostrar el catálogo (tienda, vista rápida del
 * evento) y para elegir en el checkout: con `onQuantityChange` cada tipo lleva
 * su propio contador, así la vidriera y el lugar donde se compra son la misma
 * lista y no hay que leer el catálogo arriba para después elegir en un select.
 *
 * Sin `onChange` ni `onQuantityChange` es de sólo lectura: una lista, no un
 * grupo de radios, para no ofrecerle un control inerte a quien navega con
 * teclado.
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
          <li
            key={scope}
            className={`ticket-type-options__zone ticket-type-options__zone--${scope}`}
          >
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
  // El nombre puede traer su descripción entre paréntesis: se muestra como
  // línea secundaria y no como parte del título.
  const { title, note } = ticketTypeNameParts(type.name, locale)
  const description = type.description || note

  return (
    <>
      <div className="ticket-type-options__head">
        <div className="ticket-type-options__copy">
          <span className="ticket-type-options__name">{title || type.name}</span>
          {description ? <p className="ticket-type-options__description">{description}</p> : null}
        </div>
        <span className="ticket-type-options__price">{money(type.price, locale)}</span>
      </div>

      {/* Qué abre, cuándo vale y cuántas credenciales emite: una sola fila de
          datos en vez de cuatro capas apiladas. */}
      <div className="ticket-type-options__facts">
        {(type.accessDays ?? []).length ? (
          <span className="ticket-type-options__validity">
            <CalendarDays size={14} strokeWidth={1.8} aria-hidden />
            {t('pages.tickets.ticketTypes.validity', {
              days: type.accessDays.map((day) => day.label).join(' · '),
            })}
          </span>
        ) : null}

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
      </div>

      {included.length ? (
        <span className="ticket-type-options__includes">
          {t('pages.tickets.ticketTypes.includes')}:{' '}
          {included.map((addon) => addon.label).join(' · ')}
        </span>
      ) : null}
    </>
  )
}

/**
 * Contador de un tipo. El número es un `<output>` con aria-live: al tocar +
 * el lector anuncia la cantidad nueva sin mover el foco del botón.
 */
function TicketTypeStepper({ count, label, maxReached, onChange, t }) {
  return (
    <div
      className="ticket-type-options__stepper"
      role="group"
      aria-label={t('pages.tickets.flow.quantityFor', { name: label })}
    >
      <button
        type="button"
        aria-label={t('pages.tickets.flow.subtractNamed', { name: label })}
        disabled={count === 0}
        onClick={() => onChange(-1)}
      >
        <Minus size={16} strokeWidth={2} aria-hidden />
      </button>
      <output aria-live="polite" className="ticket-type-options__count">
        {count}
      </output>
      <button
        type="button"
        aria-label={t('pages.tickets.flow.addNamed', { name: label })}
        disabled={maxReached}
        onClick={() => onChange(1)}
      >
        <Plus size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}

export default function TicketTypeOptions({
  className = '',
  locale = 'es',
  maxReached = false,
  name,
  onChange,
  onQuantityChange,
  quantities = {},
  showAddons = true,
  t,
  ticketTypes = [],
  value,
}) {
  if (!ticketTypes.length) return null

  const rootClass = ['ticket-type-options', className].filter(Boolean).join(' ')
  const legend = t('pages.tickets.ticketTypes.legend')

  if (onQuantityChange) {
    return (
      <ul className={`${rootClass} ticket-type-options--picker`} aria-label={legend}>
        {ticketTypes.map((type) => {
          const count = quantities[type.id] ?? 0
          const label = ticketTypeNameParts(type.name, locale).title || type.name
          return (
            <li
              key={type.id}
              className={`ticket-type-options__option${count > 0 ? ' is-selected' : ''}`}
            >
              <div className="ticket-type-options__body">
                <TicketTypeBody type={type} locale={locale} t={t} showAddons={showAddons} />
              </div>
              <TicketTypeStepper
                count={count}
                label={label}
                maxReached={maxReached}
                onChange={(delta) => onQuantityChange(type.id, delta)}
                t={t}
              />
            </li>
          )
        })}
      </ul>
    )
  }

  if (!onChange) {
    return (
      <ul
        className={`${rootClass} ticket-type-options--readonly ticket-type-options--catalog`}
        aria-label={legend}
      >
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
