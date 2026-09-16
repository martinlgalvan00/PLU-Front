import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, HelpCircle, Plus, Tag, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import DateTimeLocalInput from '../ui/DateTimeLocalInput.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { defaultTicketCredential } from '../../lib/ticketCredentials.js'
import { openEventChannelsFor } from '../../lib/eventPaymentChannels.js'
import { resolveTicketTypeChannels } from '../../lib/ticketTypePaymentChannels.js'
import {
  optionalTicketChannelPrice,
  paidAddonsMissingWise,
} from '../../lib/ticketTypePrices.js'
import AdminEventDaysEditor from './AdminEventDaysEditor.jsx'
import AdminTicketCredentialsEditor from './AdminTicketCredentialsEditor.jsx'
import AdminTicketTypeChannels from './AdminTicketTypeChannels.jsx'

function createEmptyTicketType(index) {
  return {
    name: '',
    price: 0,
    // Vacío: sin precio manual propio, transferencia y efectivo cobran igual
    // que Mercado Pago (comportamiento de siempre). Poner 0 sería inválido.
    manualPrice: '',
    // Vacío: sin USD propio el checkout convierte el precio en pesos, que es
    // el comportamiento de siempre. Poner 0 sería un precio inválido.
    wisePrice: '',
    // Vacías: hereda la ventana del evento.
    salesOpensAt: '',
    salesClosesAt: '',
    quota: null,
    sortOrder: index,
    active: true,
    dayIndexes: [],
    includedAddonIds: [],
    // Null: hereda los medios de cobro del evento, que es lo que hacían todas
    // las entradas antes de que el tipo pudiera tener los suyos.
    paymentChannels: null,
    // Un tipo nuevo arranca emitiendo la credencial de siempre: sin ninguna
    // vendería una entrada que no abre nada.
    credentials: [defaultTicketCredential()],
  }
}

/** Índice del primer tipo con un error de validación, o -1. */
function firstTicketTypeWithError(errors) {
  let found = -1
  for (const key of Object.keys(errors ?? {})) {
    const match = /^ticketTypes\.(\d+)\./.exec(key)
    if (!match) continue
    const index = Number(match[1])
    if (found === -1 || index < found) found = index
  }
  return found
}

function TicketTypeRowPrices({ locale, t, type }) {
  const manual = optionalTicketChannelPrice(type.manualPrice)
  const wise = optionalTicketChannelPrice(type.wisePrice)
  return (
    <span className="admin-ticket-types__row-price">
      <strong>{money(type.price, locale)}</strong>
      <small>
        {t('admin.eventEditor.supabase.ticketTypeRowManual', {
          amount:
            manual != null
              ? money(manual, locale)
              : t('admin.eventEditor.supabase.ticketTypeRowManualSame'),
        })}
      </small>
      <small>
        {t('admin.eventEditor.supabase.ticketTypeRowWise', {
          amount:
            wise != null
              ? money(wise, locale, 'USD')
              : t('admin.eventEditor.supabase.ticketTypeRowWiseCalculated'),
        })}
      </small>
    </span>
  )
}

/**
 * Tipos de entrada del evento — PLU ARG
 *
 * Lista y detalle, no una pila de formularios. Cada tipo tiene nombre, precio
 * en pesos, precio en dólares, cupo, ventana propia, jornadas, beneficios,
 * credenciales y ahora medios de cobro: apilados todos abiertos, cuatro tipos
 * eran un scroll en el que no se podían comparar dos precios sin recordarlos.
 *
 * La lista responde de un vistazo "qué se vende y a cuánto"; el detalle edita
 * uno por vez. Como las pestañas del evento, la fila SELECCIONA: no se puede
 * cerrar el detalle dejando la pantalla sin nada editable, y un tipo con error
 * de validación se selecciona solo — si no, el Guardar fallaba señalando un
 * campo que no estaba en pantalla.
 *
 * Los días se cargan en Estructura; acá cada tipo elige a cuáles da acceso. En
 * el alta completa (sin consola) todavía se pueden editar los días in-place.
 */
export default function AdminTicketTypesEditor({
  addonsCatalog = [],
  allowEditDays = false,
  canEdit,
  errors = {},
  eventDays = [],
  eventPaymentChannelOverrides = null,
  lockedDayIndexes,
  onChangeEventDays,
  onChangeTicketTypes,
  onOpenStructure,
  ticketTypes = [],
}) {
  const { locale, t } = useI18n()
  const [selected, setSelected] = useState(0)

  const errorIndex = firstTicketTypeWithError(errors)
  // Un tipo con error tiene que estar en pantalla: el foco al primer campo
  // inválido busca el input en el DOM, y si el detalle mostraba otro tipo el
  // Guardar fallaba sin decir dónde.
  useEffect(() => {
    if (errorIndex >= 0) setSelected(errorIndex)
  }, [errorIndex])

  const index = Math.min(selected, Math.max(ticketTypes.length - 1, 0))
  const current = ticketTypes[index] ?? null

  const eventChannels = useMemo(
    () => openEventChannelsFor(eventPaymentChannelOverrides, 'ticket'),
    [eventPaymentChannelOverrides],
  )

  const typeHasError = useMemo(() => {
    const flags = new Set()
    for (const key of Object.keys(errors ?? {})) {
      const match = /^ticketTypes\.(\d+)\./.exec(key)
      if (match) flags.add(Number(match[1]))
    }
    return flags
  }, [errors])

  function addTicketType() {
    onChangeTicketTypes([...ticketTypes, createEmptyTicketType(ticketTypes.length)])
    setSelected(ticketTypes.length)
  }

  function removeTicketType(target) {
    onChangeTicketTypes(ticketTypes.filter((_, i) => i !== target))
    setSelected((value) => (target < value ? value - 1 : Math.min(value, ticketTypes.length - 2)))
  }

  function patchTicketType(target, patch) {
    onChangeTicketTypes(ticketTypes.map((type, i) => (i === target ? { ...type, ...patch } : type)))
  }

  function toggleTicketTypeDay(target, dayIndex) {
    const currentDays = ticketTypes[target]?.dayIndexes ?? []
    const next = currentDays.includes(dayIndex)
      ? currentDays.filter((value) => value !== dayIndex)
      : [...currentDays, dayIndex]
    patchTicketType(target, { dayIndexes: next })
  }

  function toggleTicketTypeAddon(target, addonId) {
    const currentAddons = ticketTypes[target]?.includedAddonIds ?? []
    const next = currentAddons.includes(addonId)
      ? currentAddons.filter((value) => value !== addonId)
      : [...currentAddons, addonId]
    patchTicketType(target, { includedAddonIds: next })
  }

  /** Resumen de medios para la fila: hereda, la lista corta, o ninguno. */
  function channelSummary(type) {
    if (!type?.paymentChannels) {
      return {
        label: t('admin.eventEditor.supabase.ticketTypeChannelsAll'),
        tone: 'inherit',
      }
    }
    const open = resolveTicketTypeChannels({
      eventOverrides: eventPaymentChannelOverrides,
      typeChannels: type.paymentChannels,
    })
    if (open.length === 0) {
      return { label: t('admin.eventEditor.supabase.ticketTypeChannelsNone'), tone: 'error' }
    }
    if (open.length === eventChannels.length) {
      return { label: t('admin.eventEditor.supabase.ticketTypeChannelsAll'), tone: 'inherit' }
    }
    return {
      label: open
        .map((channel) => t(`admin.eventEditor.paymentChannelShort.${channel}`))
        .join(' · '),
      tone: 'custom',
    }
  }

  const errorFor = (key) => errors[`ticketTypes.${index}.${key}`] ?? ''
  const windowHasError = Boolean(errorFor('salesOpensAt') || errorFor('salesClosesAt'))
  const accessHasError = Boolean(
    errorFor('dayIndexes') ||
      errorFor('includedAddonIds') ||
      Object.keys(errors ?? {}).some((key) => key.startsWith(`ticketTypes.${index}.credentials`)),
  )
  const addonsWithoutWise = useMemo(
    () => paidAddonsMissingWise(addonsCatalog),
    [addonsCatalog],
  )

  return (
    <>
      {allowEditDays ? (
        <AdminEventDaysEditor
          canEdit={canEdit}
          errors={errors}
          eventDays={eventDays}
          lockedDayIndexes={lockedDayIndexes}
          onChangeEventDays={onChangeEventDays}
          onChangeTicketTypes={onChangeTicketTypes}
          ticketTypes={ticketTypes}
        />
      ) : null}

      <section className="admin-event-form__block admin-ticket-types">
        <header className="admin-event-form__block-head">
          <h3 className="admin-event-form__block-title">
            <Tag size={13} aria-hidden />
            {t('admin.eventEditor.supabase.ticketTypesTitle')}
            <span className="admin-event-form__help">
              <button
                type="button"
                className="admin-event-form__help-trigger"
                aria-label={t('admin.eventEditor.supabase.ticketTypesHint')}
              >
                <HelpCircle size={13} aria-hidden />
              </button>
              <span className="admin-event-form__help-tooltip" role="tooltip">
                {t('admin.eventEditor.supabase.ticketTypesHint')}
              </span>
            </span>
          </h3>
          {canEdit && ticketTypes.length > 0 ? (
            <Button
              className="btn--small btn--ghost admin-ticket-types__add"
              type="button"
              onClick={addTicketType}
            >
              <Plus size={14} aria-hidden />
              {t('admin.eventEditor.supabase.ticketTypeAdd')}
            </Button>
          ) : null}
        </header>

        {!allowEditDays && eventDays.length === 0 ? (
          <div className="admin-ticket-types__need-days">
            <p className="admin-ticket-types__empty">
              {t('admin.eventEditor.supabase.ticketTypesNeedDays')}
            </p>
            {onOpenStructure ? (
              <Button className="btn--small btn--ghost" type="button" onClick={onOpenStructure}>
                {t('admin.eventEditor.supabase.ticketTypesNeedDaysCta')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {ticketTypes.length === 0 ? (
          <div className="admin-ticket-types__need-days">
            <p className="admin-ticket-types__empty">
              {t('admin.eventEditor.supabase.ticketTypesEmpty')}
            </p>
            {canEdit ? (
              <Button className="btn--small btn--ghost" type="button" onClick={addTicketType}>
                <Plus size={14} aria-hidden />
                {t('admin.eventEditor.supabase.ticketTypeAdd')}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className="admin-ticket-types__table"
              role="tablist"
              aria-label={t('admin.eventEditor.supabase.ticketTypesTitle')}
            >
              <div className="admin-ticket-types__head" aria-hidden="true">
                <span>{t('admin.eventEditor.supabase.ticketTypeColumnName')}</span>
                <span>{t('admin.eventEditor.supabase.ticketTypeColumnPrice')}</span>
                <span>{t('admin.eventEditor.supabase.ticketTypeColumnQuota')}</span>
                <span>{t('admin.eventEditor.supabase.ticketTypeColumnChannels')}</span>
                <span>{t('admin.eventEditor.supabase.ticketTypeColumnState')}</span>
              </div>

              {ticketTypes.map((type, position) => {
                const summary = channelSummary(type)
                const isActive = type.active !== false
                return (
                  <button
                    key={position}
                    type="button"
                    role="tab"
                    id={`ticket-type-row-${position}`}
                    aria-selected={position === index}
                    aria-controls="ticket-type-detail"
                    className={`admin-ticket-types__row${position === index ? ' is-selected' : ''}${
                      typeHasError.has(position) ? ' has-error' : ''
                    }${isActive ? '' : ' is-paused'}`}
                    onClick={() => setSelected(position)}
                  >
                    <span className="admin-ticket-types__row-name">
                      {typeHasError.has(position) ? (
                        <AlertCircle
                          className="admin-ticket-types__row-alert"
                          size={13}
                          aria-hidden
                        />
                      ) : null}
                      {type.name || t('admin.eventEditor.supabase.ticketTypeUntitled')}
                    </span>
                    <TicketTypeRowPrices locale={locale} t={t} type={type} />
                    <span className="admin-ticket-types__row-quota">
                      {type.quota == null || type.quota === ''
                        ? t('admin.eventEditor.supabase.ticketTypeQuotaUnlimited')
                        : type.quota}
                    </span>
                    <span
                      className="admin-ticket-types__row-channels"
                      data-tone={summary.tone}
                      title={summary.label}
                    >
                      {summary.label}
                    </span>
                    <span
                      className={`admin-ticket-types__row-state${isActive ? ' is-on' : ''}`}
                    >
                      {isActive
                        ? t('admin.eventEditor.supabase.ticketTypeStateActive')
                        : t('admin.eventEditor.supabase.ticketTypeStatePaused')}
                    </span>
                  </button>
                )
              })}
            </div>

            {current ? (
              <div
                className="admin-ticket-types__detail"
                id="ticket-type-detail"
                role="tabpanel"
                aria-labelledby={`ticket-type-row-${index}`}
              >
                <div className="admin-ticket-types__item-head">
                  <label className="admin-event-form__toggle admin-ticket-types__toggle">
                    <input
                      checked={current.active !== false}
                      className="admin-event-form__toggle-input"
                      disabled={!canEdit}
                      type="checkbox"
                      onChange={(event) => patchTicketType(index, { active: event.target.checked })}
                    />
                    <span className="admin-event-form__toggle-ui" aria-hidden />
                    <span className="admin-event-form__toggle-copy">
                      <strong>
                        {current.name || t('admin.eventEditor.supabase.ticketTypeUntitled')}
                      </strong>
                      <small>
                        {current.active !== false
                          ? t('admin.eventEditor.supabase.ticketTypeActiveHint')
                          : t('admin.eventEditor.supabase.ticketTypePausedHint')}
                      </small>
                    </span>
                  </label>
                  {canEdit ? (
                    <button
                      type="button"
                      className="admin-ticket-types__remove"
                      onClick={() => removeTicketType(index)}
                      aria-label={t('admin.eventEditor.supabase.ticketTypeRemove')}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>

                <div className="admin-ticket-types__grid">
                  <label className="admin-event-form__field">
                    <span>{t('admin.eventEditor.supabase.ticketTypeName')}</span>
                    <input
                      disabled={!canEdit}
                      required
                      type="text"
                      value={current.name}
                      name={`ticketTypes.${index}.name`}
                      data-field={`ticketTypes.${index}.name`}
                      aria-invalid={Boolean(errorFor('name'))}
                      onChange={(event) => patchTicketType(index, { name: event.target.value })}
                      placeholder={t('admin.eventEditor.supabase.ticketTypeNamePlaceholder')}
                    />
                    {errorFor('name') ? (
                      <small className="admin-event-form__error" role="alert">
                        {errorFor('name')}
                      </small>
                    ) : null}
                  </label>
                  <label className="admin-event-form__field">
                    <span>{t('admin.eventEditor.supabase.ticketTypeQuota')}</span>
                    <input
                      disabled={!canEdit}
                      min={0}
                      type="number"
                      value={current.quota ?? ''}
                      name={`ticketTypes.${index}.quota`}
                      data-field={`ticketTypes.${index}.quota`}
                      aria-invalid={Boolean(errorFor('quota'))}
                      onChange={(event) =>
                        patchTicketType(index, {
                          quota: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                    />
                    {errorFor('quota') ? (
                      <small className="admin-event-form__error" role="alert">
                        {errorFor('quota')}
                      </small>
                    ) : (
                      <small className="admin-event-form__field-hint">
                        {t('admin.eventEditor.supabase.ticketTypeQuotaHint')}
                      </small>
                    )}
                  </label>
                </div>

                <div className="admin-ticket-types__prices">
                  <span className="admin-ticket-types__days-label">
                    {t('admin.eventEditor.supabase.ticketTypePricesLabel')}
                  </span>
                  <div className="admin-ticket-types__prices-grid">
                    <label className="admin-event-form__field">
                      <span>{t('admin.eventEditor.supabase.ticketTypePrice')}</span>
                      <span className="admin-event-form__rate-card-input">
                        <input
                          disabled={!canEdit}
                          min={0}
                          required
                          step={1}
                          type="number"
                          value={current.price}
                          name={`ticketTypes.${index}.price`}
                          data-field={`ticketTypes.${index}.price`}
                          aria-invalid={Boolean(errorFor('price'))}
                          onChange={(event) =>
                            patchTicketType(index, { price: Number(event.target.value) || 0 })
                          }
                        />
                        <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                      </span>
                      {errorFor('price') ? (
                        <small className="admin-event-form__error" role="alert">
                          {errorFor('price')}
                        </small>
                      ) : null}
                    </label>
                    <label className="admin-event-form__field">
                      <span>{t('admin.eventEditor.supabase.ticketTypeManualPrice')}</span>
                      <span className="admin-event-form__rate-card-input">
                        <input
                          disabled={!canEdit}
                          min={1}
                          max={10000000}
                          step={1}
                          type="number"
                          value={current.manualPrice ?? ''}
                          name={`ticketTypes.${index}.manualPrice`}
                          data-field={`ticketTypes.${index}.manualPrice`}
                          aria-invalid={Boolean(errorFor('manualPrice'))}
                          onChange={(event) =>
                            patchTicketType(index, {
                              manualPrice:
                                event.target.value === '' ? '' : Number(event.target.value),
                            })
                          }
                          placeholder={t(
                            'admin.eventEditor.supabase.ticketTypeManualPricePlaceholder',
                          )}
                        />
                        <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                      </span>
                      {errorFor('manualPrice') ? (
                        <small className="admin-event-form__error" role="alert">
                          {errorFor('manualPrice')}
                        </small>
                      ) : (
                        <small className="admin-event-form__field-hint">
                          {t('admin.eventEditor.supabase.ticketTypeManualPriceHint')}
                        </small>
                      )}
                    </label>
                    <label className="admin-event-form__field">
                      <span>{t('admin.eventEditor.supabase.ticketTypeWisePrice')}</span>
                      <span className="admin-event-form__rate-card-input">
                        <input
                          disabled={!canEdit}
                          min={1}
                          max={100000}
                          step={1}
                          type="number"
                          value={current.wisePrice ?? ''}
                          name={`ticketTypes.${index}.wisePrice`}
                          data-field={`ticketTypes.${index}.wisePrice`}
                          aria-invalid={Boolean(errorFor('wisePrice'))}
                          onChange={(event) =>
                            patchTicketType(index, {
                              wisePrice:
                                event.target.value === '' ? '' : Number(event.target.value),
                            })
                          }
                          placeholder={t(
                            'admin.eventEditor.supabase.ticketTypeWisePricePlaceholder',
                          )}
                        />
                        <span aria-hidden>USD</span>
                      </span>
                      {errorFor('wisePrice') ? (
                        <small className="admin-event-form__error" role="alert">
                          {errorFor('wisePrice')}
                        </small>
                      ) : (
                        <small className="admin-event-form__field-hint">
                          {t('admin.eventEditor.supabase.ticketTypeWisePriceHint')}
                        </small>
                      )}
                    </label>
                  </div>
                  {addonsWithoutWise.length > 0 ? (
                    <p className="admin-ticket-types__wise-note" role="status">
                      {t('admin.eventEditor.supabase.ticketTypeWiseAddonsMissing')}
                    </p>
                  ) : null}
                </div>

                <details
                  key={`window-${index}`}
                  className="admin-ticket-types__fold"
                  open={windowHasError || undefined}
                >
                  <summary>
                    {t('admin.eventEditor.supabase.ticketTypeFoldWindow')}
                    <small>
                      {current.salesOpensAt || current.salesClosesAt
                        ? `${current.salesOpensAt || '—'} → ${current.salesClosesAt || '—'}`
                        : t('admin.eventEditor.supabase.ticketTypeWindowInherit')}
                    </small>
                  </summary>
                  <div className="admin-ticket-types__window">
                    <div className="admin-ticket-types__window-grid">
                      <label className="admin-event-form__field">
                        <span>{t('admin.eventEditor.supabase.ticketTypeSalesOpensAt')}</span>
                        <DateTimeLocalInput
                          disabled={!canEdit}
                          name={`ticketTypes.${index}.salesOpensAt`}
                          data-field={`ticketTypes.${index}.salesOpensAt`}
                          value={current.salesOpensAt ?? ''}
                          aria-invalid={Boolean(errorFor('salesOpensAt'))}
                          onChange={(event) =>
                            patchTicketType(index, { salesOpensAt: event.target.value })
                          }
                        />
                        {errorFor('salesOpensAt') ? (
                          <small className="admin-event-form__error" role="alert">
                            {errorFor('salesOpensAt')}
                          </small>
                        ) : null}
                      </label>
                      <label className="admin-event-form__field">
                        <span>{t('admin.eventEditor.supabase.ticketTypeSalesClosesAt')}</span>
                        <DateTimeLocalInput
                          disabled={!canEdit}
                          name={`ticketTypes.${index}.salesClosesAt`}
                          data-field={`ticketTypes.${index}.salesClosesAt`}
                          value={current.salesClosesAt ?? ''}
                          aria-invalid={Boolean(errorFor('salesClosesAt'))}
                          onChange={(event) =>
                            patchTicketType(index, { salesClosesAt: event.target.value })
                          }
                        />
                        {errorFor('salesClosesAt') ? (
                          <small className="admin-event-form__error" role="alert">
                            {errorFor('salesClosesAt')}
                          </small>
                        ) : null}
                      </label>
                    </div>
                    <small className="admin-ticket-types__grid-note">
                      {t('admin.eventEditor.supabase.ticketTypeWindowHint')}
                    </small>
                  </div>
                </details>

                <AdminTicketTypeChannels
                  canEdit={canEdit}
                  error={errorFor('paymentChannels')}
                  eventOverrides={eventPaymentChannelOverrides}
                  fieldName={`ticketTypes.${index}.paymentChannels`}
                  value={current.paymentChannels ?? null}
                  onChange={(paymentChannels) => patchTicketType(index, { paymentChannels })}
                />

                <details
                  key={`access-${index}`}
                  className="admin-ticket-types__fold"
                  open={accessHasError || undefined}
                >
                  <summary>{t('admin.eventEditor.supabase.ticketTypeFoldAccess')}</summary>

                  {eventDays.length > 0 ? (
                    <div
                      className="admin-ticket-types__days"
                      data-field={`ticketTypes.${index}.dayIndexes`}
                      tabIndex={errorFor('dayIndexes') ? -1 : undefined}
                    >
                      <span className="admin-ticket-types__days-label">
                        {t('admin.eventEditor.supabase.ticketTypeDaysLabel')}
                      </span>
                      <div className="admin-ticket-types__days-list">
                        {eventDays.map((day) => (
                          <label key={day.dayIndex} className="admin-ticket-types__day-chip">
                            <input
                              checked={(current.dayIndexes ?? []).includes(day.dayIndex)}
                              disabled={!canEdit}
                              type="checkbox"
                              onChange={() => toggleTicketTypeDay(index, day.dayIndex)}
                            />
                            <span>{day.label || `#${day.dayIndex + 1}`}</span>
                          </label>
                        ))}
                      </div>
                      {errorFor('dayIndexes') ? (
                        <small className="admin-event-form__error" role="alert">
                          {errorFor('dayIndexes')}
                        </small>
                      ) : null}
                    </div>
                  ) : null}

                  {addonsCatalog.length > 0 ? (
                    <div
                      className="admin-ticket-types__addons"
                      data-field={`ticketTypes.${index}.includedAddonIds`}
                      tabIndex={errorFor('includedAddonIds') ? -1 : undefined}
                    >
                      <span className="admin-ticket-types__days-label">
                        {t('admin.eventEditor.supabase.ticketTypeAddonsLabel')}
                      </span>
                      <div className="admin-ticket-types__days-list">
                        {addonsCatalog.map((addon) => (
                          <label key={addon.id} className="admin-ticket-types__day-chip">
                            <input
                              checked={(current.includedAddonIds ?? []).includes(addon.id)}
                              disabled={!canEdit}
                              type="checkbox"
                              onChange={() => toggleTicketTypeAddon(index, addon.id)}
                            />
                            <span>{addon.label}</span>
                          </label>
                        ))}
                      </div>
                      {errorFor('includedAddonIds') ? (
                        <small className="admin-event-form__error" role="alert">
                          {errorFor('includedAddonIds')}
                        </small>
                      ) : null}
                    </div>
                  ) : (
                    <p className="admin-ticket-types__empty">
                      {t('admin.eventEditor.supabase.ticketTypeAddonsEmpty')}
                    </p>
                  )}

                  <AdminTicketCredentialsEditor
                    canEdit={canEdit}
                    credentials={current.credentials ?? [defaultTicketCredential()]}
                    fieldPrefix={`ticketTypes.${index}`}
                    quota={current.quota}
                    onChange={(credentials) => patchTicketType(index, { credentials })}
                  />
                </details>
              </div>
            ) : null}
          </>
        )}
      </section>
    </>
  )
}
