import { CalendarDays, Plus, Tag, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'

function reindexDays(days) {
  return days.map((day, index) => ({ ...day, dayIndex: index }))
}

function createEmptyDay(index) {
  return { dayIndex: index, label: '', date: '' }
}

function createEmptyTicketType(index) {
  return { name: '', price: 0, quota: null, sortOrder: index, active: true, dayIndexes: [], includedAddonIds: [] }
}

/**
 * Catálogo de días del evento + tipos de entrada, configurable por evento.
 * Reemplaza el enum fijo day1/day2/both: un evento puede durar más de 2
 * días, y cada tipo de entrada puede incluir addons sin cargo ("packs").
 */
export default function AdminTicketTypesEditor({
  addonsCatalog = [],
  canEdit,
  eventDays = [],
  onChangeEventDays,
  onChangeTicketTypes,
  ticketTypes = [],
}) {
  const { locale, t } = useI18n()

  function addDay() {
    onChangeEventDays(reindexDays([...eventDays, createEmptyDay(eventDays.length)]))
  }

  function removeDay(index) {
    const removedIndex = eventDays[index]?.dayIndex
    onChangeEventDays(reindexDays(eventDays.filter((_, i) => i !== index)))
    if (removedIndex !== undefined) {
      onChangeTicketTypes(
        ticketTypes.map((type) => ({
          ...type,
          dayIndexes: (type.dayIndexes ?? []).filter((dayIndex) => dayIndex !== removedIndex),
        })),
      )
    }
  }

  function patchDay(index, field, value) {
    onChangeEventDays(eventDays.map((day, i) => (i === index ? { ...day, [field]: value } : day)))
  }

  function addTicketType() {
    onChangeTicketTypes([...ticketTypes, createEmptyTicketType(ticketTypes.length)])
  }

  function removeTicketType(index) {
    onChangeTicketTypes(ticketTypes.filter((_, i) => i !== index))
  }

  function patchTicketType(index, patch) {
    onChangeTicketTypes(ticketTypes.map((type, i) => (i === index ? { ...type, ...patch } : type)))
  }

  function toggleTicketTypeDay(index, dayIndex) {
    const current = ticketTypes[index]?.dayIndexes ?? []
    const next = current.includes(dayIndex)
      ? current.filter((value) => value !== dayIndex)
      : [...current, dayIndex]
    patchTicketType(index, { dayIndexes: next })
  }

  function toggleTicketTypeAddon(index, addonId) {
    const current = ticketTypes[index]?.includedAddonIds ?? []
    const next = current.includes(addonId)
      ? current.filter((value) => value !== addonId)
      : [...current, addonId]
    patchTicketType(index, { includedAddonIds: next })
  }

  return (
    <>
      <fieldset className="admin-event-form__pricing admin-ticket-types">
        <legend>
          <CalendarDays size={14} aria-hidden />
          {t('admin.eventEditor.supabase.ticketDaysTitle')}
        </legend>
        <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.supabase.ticketDaysHint')}</p>

        {eventDays.length === 0 ? (
          <p className="admin-ticket-types__empty">{t('admin.eventEditor.supabase.ticketDaysEmpty')}</p>
        ) : (
          <ul className="admin-ticket-types__day-list">
            {eventDays.map((day, index) => (
              <li key={index} className="admin-ticket-types__day-item">
                <label className="admin-event-form__field">
                  <span>{t('admin.eventEditor.supabase.ticketDayLabel')}</span>
                  <input
                    disabled={!canEdit}
                    type="text"
                    value={day.label}
                    onChange={(event) => patchDay(index, 'label', event.target.value)}
                    placeholder={t('admin.eventEditor.supabase.ticketDayLabelPlaceholder')}
                  />
                </label>
                <label className="admin-event-form__field">
                  <span>{t('admin.eventEditor.supabase.ticketDayDate')}</span>
                  <input
                    disabled={!canEdit}
                    type="date"
                    value={day.date ?? ''}
                    onChange={(event) => patchDay(index, 'date', event.target.value)}
                  />
                </label>
                {canEdit ? (
                  <button
                    type="button"
                    className="admin-ticket-types__remove"
                    onClick={() => removeDay(index)}
                    aria-label={t('admin.eventEditor.supabase.ticketDayRemove', { number: index + 1 })}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <Button className="btn--small btn--ghost admin-ticket-types__add" type="button" onClick={addDay}>
            <Plus size={14} aria-hidden />
            {t('admin.eventEditor.supabase.ticketDayAdd')}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="admin-event-form__pricing admin-ticket-types">
        <legend>
          <Tag size={14} aria-hidden />
          {t('admin.eventEditor.supabase.ticketTypesTitle')}
        </legend>
        <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.supabase.ticketTypesHint')}</p>

        {ticketTypes.length === 0 ? (
          <p className="admin-ticket-types__empty">{t('admin.eventEditor.supabase.ticketTypesEmpty')}</p>
        ) : (
          <ul className="admin-ticket-types__list">
            {ticketTypes.map((type, index) => (
              <li key={index} className="admin-ticket-types__item">
                <div className="admin-ticket-types__item-head">
                  <label className="admin-event-form__toggle admin-ticket-types__toggle">
                    <input
                      checked={type.active !== false}
                      className="admin-event-form__toggle-input"
                      disabled={!canEdit}
                      type="checkbox"
                      onChange={(event) => patchTicketType(index, { active: event.target.checked })}
                    />
                    <span className="admin-event-form__toggle-ui" aria-hidden />
                    <span className="admin-event-form__toggle-copy">
                      <strong>{type.name || t('admin.eventEditor.supabase.ticketTypeUntitled')}</strong>
                      <small>{money(type.price, locale)}</small>
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
                      value={type.name}
                      onChange={(event) => patchTicketType(index, { name: event.target.value })}
                      placeholder={t('admin.eventEditor.supabase.ticketTypeNamePlaceholder')}
                    />
                  </label>
                  <label className="admin-event-form__field">
                    <span>{t('admin.eventEditor.supabase.ticketTypePrice')}</span>
                    <input
                      disabled={!canEdit}
                      min={0}
                      required
                      type="number"
                      value={type.price}
                      onChange={(event) => patchTicketType(index, { price: Number(event.target.value) || 0 })}
                    />
                  </label>
                  <label className="admin-event-form__field">
                    <span>{t('admin.eventEditor.supabase.ticketTypeQuota')}</span>
                    <input
                      disabled={!canEdit}
                      min={0}
                      type="number"
                      value={type.quota ?? ''}
                      onChange={(event) =>
                        patchTicketType(index, {
                          quota: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                    />
                    <small>{t('admin.eventEditor.supabase.ticketTypeQuotaHint')}</small>
                  </label>
                </div>

                {eventDays.length > 0 ? (
                  <div className="admin-ticket-types__days">
                    <span className="admin-ticket-types__days-label">
                      {t('admin.eventEditor.supabase.ticketTypeDaysLabel')}
                    </span>
                    <div className="admin-ticket-types__days-list">
                      {eventDays.map((day) => (
                        <label key={day.dayIndex} className="admin-ticket-types__day-chip">
                          <input
                            checked={(type.dayIndexes ?? []).includes(day.dayIndex)}
                            disabled={!canEdit}
                            type="checkbox"
                            onChange={() => toggleTicketTypeDay(index, day.dayIndex)}
                          />
                          <span>{day.label || `#${day.dayIndex + 1}`}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}

                {addonsCatalog.length > 0 ? (
                  <div className="admin-ticket-types__addons">
                    <span className="admin-ticket-types__days-label">
                      {t('admin.eventEditor.supabase.ticketTypeAddonsLabel')}
                    </span>
                    <div className="admin-ticket-types__days-list">
                      {addonsCatalog.map((addon) => (
                        <label key={addon.id} className="admin-ticket-types__day-chip">
                          <input
                            checked={(type.includedAddonIds ?? []).includes(addon.id)}
                            disabled={!canEdit}
                            type="checkbox"
                            onChange={() => toggleTicketTypeAddon(index, addon.id)}
                          />
                          <span>{addon.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="admin-ticket-types__empty">{t('admin.eventEditor.supabase.ticketTypeAddonsEmpty')}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit ? (
          <Button className="btn--small btn--ghost admin-ticket-types__add" type="button" onClick={addTicketType}>
            <Plus size={14} aria-hidden />
            {t('admin.eventEditor.supabase.ticketTypeAdd')}
          </Button>
        ) : null}
      </fieldset>
    </>
  )
}
