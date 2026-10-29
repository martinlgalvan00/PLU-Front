import { useId } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardList,
  Layers,
  PackagePlus,
  ScanLine,
  Ticket,
} from 'lucide-react'
import {
  EVENT_INSTALLMENT_OPTIONS,
  normalizeEventPaymentPolicy,
  resolveEventModules,
} from '../../../../shared/eventModules.js'
import {
  EVENT_PAYMENT_CHANNELS,
  eventChannelFlagFor,
  resolveEventChannelState,
  setEventChannelFlag,
} from '../../../lib/eventPaymentChannels.js'
import { platformCellsFor } from '../../../lib/platformPaymentChannels.js'
import { setEventInstallmentCap, setEventModule } from './draftPatches.js'
import '../../../styles/pages/admin-event-modules.css'

const MODULE_ICON = {
  registration: ClipboardList,
  tickets: Ticket,
  combo: Layers,
  ticketAddons: PackagePlus,
  schedule: CalendarClock,
  door: ScanLine,
}

const CHANNEL_LABEL_KEY = {
  mercado_pago: 'paymentChannelMercadoPago',
  bank_transfer: 'paymentChannelBankTransfer',
  cash_pitbull: 'paymentChannelCashPitbull',
  wise_transfer: 'paymentChannelWise',
}

/**
 * Dónde se configura cada módulo: un capítulo de Venta o una sección del
 * workspace. Combo no tiene destino propio: la oferta vive en Tarifas.
 */
const MODULE_GOTO = {
  registration: { chapter: 'cupo' },
  tickets: { chapter: 'tickets' },
  ticketAddons: { chapter: 'tickets' },
  schedule: { section: 'structure' },
  door: { section: 'security' },
}

/**
 * EventModulesBoard — PLU ARG
 *
 * Primer capítulo de Venta: qué partes del evento están prendidas y, para las
 * que venden, con qué medios cobra cada una y hasta cuántas cuotas. Es la
 * vista de conjunto; el detalle de cada medio (cuenta, alias, lugar) sigue en
 * Cobro, y la apertura de la venta en Cupo.
 *
 * Una lista con reglas, no cards: los módulos se comparan entre sí y cada fila
 * tiene un solo control dominante (el interruptor).
 */
export default function EventModulesBoard({
  canEdit,
  draft,
  /** Secciones del workspace a las que se puede ir (Estructura, Zonas…). */
  gotoSections = [],
  locale = 'es',
  onGoTo = null,
  patchDraft,
  platformChannels = null,
  readiness = null,
  // Cuenta por evento: puede cerrar un medio, no abrir uno que PLU tiene cerrado.
  restrictOpen = false,
  t,
}) {
  const baseId = useId()
  const modules = resolveEventModules(draft)
  const policy = normalizeEventPaymentPolicy(draft.paymentPolicy)
  const platform = platformChannels?.platform ?? null
  const platformLoading = platformChannels?.status === 'loading'
  const tm = (key, params) => t(`admin.eventEditor.eventModules.${key}`, params)
  const moduleName = (key) => tm(`name.${key}`)
  const channelLabel = (channel) => t(`admin.eventEditor.${CHANNEL_LABEL_KEY[channel]}`)
  const listFormat = new Intl.ListFormat(locale === 'en' ? 'en' : 'es', { type: 'conjunction' })

  const onCount = modules.filter((module) => module.on).length
  const selling = modules.filter((module) => module.group === 'sales' && module.active)

  function toggleModule(key, on) {
    patchDraft(setEventModule(draft, key, on))
  }

  function patchChannel(concept, channel, want) {
    const platformCell = platformCellsFor(platform, concept)[channel]
    const flag = eventChannelFlagFor(want, platformCell)
    patchDraft({
      ...draft,
      paymentChannelOverrides: setEventChannelFlag(
        draft.paymentChannelOverrides,
        concept,
        channel,
        flag,
      ),
    })
  }

  function renderChannels(module) {
    const concept = module.concept
    const cells = platformCellsFor(platform, concept)
    const states = EVENT_PAYMENT_CHANNELS.map((channel) => {
      const checked = resolveEventChannelState(
        draft.paymentChannelOverrides,
        concept,
        channel,
        cells[channel],
      )
      const row = readiness?.rows?.find((item) => item.channel === channel) ?? null
      const pending = checked && row && ['missing', 'warning'].includes(row.state)
      const lockedByPlatform = restrictOpen && !checked && cells[channel] !== true
      return { channel, checked, pending, lockedByPlatform, row }
    })
    const openCount = states.filter((state) => state.checked).length
    const firstPending = states.find((state) => state.pending)
    const mercadoPagoOpen = states.find((state) => state.channel === 'mercado_pago')?.checked
    const capId = `${baseId}-${module.key}-cap`
    const cap = policy[concept]?.maxInstallments ?? null

    return (
      <div className="admin-event-module__commerce">
        <div
          className="admin-event-module__channels"
          role="group"
          aria-label={tm('channelsAria', { module: moduleName(module.key) })}
          aria-busy={platformLoading || undefined}
        >
          {states.map(({ channel, checked, pending, lockedByPlatform, row }) => (
            <button
              key={channel}
              type="button"
              className={`admin-event-module__channel${checked ? ' is-on' : ''}${
                pending ? ' is-pending' : ''
              }`}
              aria-pressed={checked}
              disabled={!canEdit || platformLoading || lockedByPlatform}
              title={
                lockedByPlatform
                  ? tm('channelClosedByPlatform')
                  : pending && row
                    ? t(`admin.eventEditor.${row.detail.key}`, row.detail.params)
                    : undefined
              }
              onClick={() => patchChannel(concept, channel, !checked)}
            >
              <span className="admin-event-module__channel-mark" aria-hidden>
                {pending ? <AlertTriangle size={12} /> : <Check size={12} strokeWidth={2.6} />}
              </span>
              {channelLabel(channel)}
              {pending ? (
                <span className="admin-event-module__sr">{` · ${tm('channelPending')}`}</span>
              ) : null}
            </button>
          ))}
        </div>

        {openCount === 0 ? (
          <p className="admin-event-module__warning" role="status">
            <AlertTriangle size={13} aria-hidden />
            {tm('noChannels')}
          </p>
        ) : firstPending ? (
          <p className="admin-event-module__warning" role="status">
            <AlertTriangle size={13} aria-hidden />
            <span>
              {channelLabel(firstPending.channel)}:{' '}
              {t(
                `admin.eventEditor.${firstPending.row.detail.key}`,
                firstPending.row.detail.params,
              )}
            </span>
            {onGoTo ? (
              <button
                type="button"
                className="admin-event-module__inline-link"
                onClick={() => onGoTo({ chapter: 'payment' })}
              >
                {tm('configurePayment')}
              </button>
            ) : null}
          </p>
        ) : null}

        {mercadoPagoOpen ? (
          <div className="admin-event-module__installments">
            <label htmlFor={capId}>{tm('installments')}</label>
            <select
              id={capId}
              value={cap ?? ''}
              disabled={!canEdit}
              aria-describedby={`${capId}-hint`}
              onChange={(changeEvent) =>
                patchDraft(
                  setEventInstallmentCap(
                    draft,
                    concept,
                    changeEvent.target.value ? Number(changeEvent.target.value) : null,
                  ),
                )
              }
            >
              <option value="">{tm('installmentsNone')}</option>
              {EVENT_INSTALLMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 1 ? tm('installmentsOne') : tm('installmentsUpTo', { count: option })}
                </option>
              ))}
            </select>
            <small id={`${capId}-hint`}>{tm('installmentsHint')}</small>
          </div>
        ) : null}
      </div>
    )
  }

  function renderModule(module) {
    const Icon = MODULE_ICON[module.key]
    const nameId = `${baseId}-${module.key}-name`
    const descId = `${baseId}-${module.key}-desc`
    const target = MODULE_GOTO[module.key]
    const goto =
      target && (!target.section || gotoSections.includes(target.section)) ? target : null
    const ownChannels = module.key === 'registration' || module.key === 'tickets'
    // Bloqueado, la nota de dependencia ya dice todo lo que hace falta.
    const sharesChannels = module.concept && !ownChannels && !module.blockedBy
    const parentName = module.dependsOn ? moduleName(module.dependsOn) : ''

    return (
      <li
        key={module.key}
        className={`admin-event-module${module.on ? ' is-on' : ''}${
          module.blockedBy ? ' is-blocked' : ''
        }`}
        data-module={module.key}
      >
        <div className="admin-event-module__row">
          <span className="admin-event-module__icon" aria-hidden>
            <Icon size={16} strokeWidth={1.8} />
          </span>
          <div className="admin-event-module__copy">
            <strong id={nameId}>{moduleName(module.key)}</strong>
            <small id={descId}>
              {module.on ? tm(`on.${module.key}`) : tm(`off.${module.key}`)}
            </small>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={module.on}
            aria-labelledby={nameId}
            aria-describedby={descId}
            className={`admin-event-module__switch${module.on ? ' is-on' : ''}`}
            disabled={!canEdit}
            onClick={() => toggleModule(module.key, !module.on)}
          >
            <span className="admin-event-module__switch-thumb" aria-hidden />
          </button>
        </div>

        {/* El detalle queda montado y se pliega: así la transición de alto no
            depende de medir contenido, y apagar/prender no pierde el foco. */}
        <div className="admin-event-module__detail" inert={!module.on || undefined}>
          <div className="admin-event-module__detail-inner">
            <div className="admin-event-module__detail-body">
              {module.blockedBy ? (
                <p className="admin-event-module__note">
                  {tm('blockedBy', { module: moduleName(module.blockedBy) })}
                </p>
              ) : null}
              {ownChannels ? renderChannels(module) : null}
              {sharesChannels ? (
                <p className="admin-event-module__note">
                  {tm('sharedChannels', { module: parentName })}
                </p>
              ) : null}
              {goto && onGoTo ? (
                <button
                  type="button"
                  className="admin-event-module__goto"
                  onClick={() => onGoTo(goto)}
                >
                  {tm(`goto.${module.key}`)}
                  <ArrowRight size={13} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </li>
    )
  }

  const salesModules = modules.filter((module) => module.group === 'sales')
  const operationModules = modules.filter((module) => module.group === 'operation')

  return (
    <div className="admin-event-modules">
      <header className="admin-event-modules__head">
        <h3 className="admin-event-modules__title">{tm('title')}</h3>
        <p className="admin-event-modules__lead">{tm('lead')}</p>
        <p className="admin-event-modules__summary" role="status">
          <span>{tm('summary', { count: onCount, total: modules.length })}</span>
          <span aria-hidden>·</span>
          <span>
            {selling.length > 0
              ? tm('summarySelling', {
                  list: listFormat.format(selling.map((module) => moduleName(module.key))),
                })
              : tm('summaryNothing')}
          </span>
        </p>
      </header>

      <section className="admin-event-modules__group" aria-labelledby={`${baseId}-sales`}>
        <h4 id={`${baseId}-sales`} className="admin-event-modules__group-title">
          {tm('groupSales')}
        </h4>
        <ul className="admin-event-modules__list">{salesModules.map(renderModule)}</ul>
      </section>

      <section className="admin-event-modules__group" aria-labelledby={`${baseId}-operation`}>
        <h4 id={`${baseId}-operation`} className="admin-event-modules__group-title">
          {tm('groupOperation')}
        </h4>
        <ul className="admin-event-modules__list">{operationModules.map(renderModule)}</ul>
      </section>
    </div>
  )
}
