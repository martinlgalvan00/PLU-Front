import { ListChecks } from 'lucide-react'
import { useI18n } from '../../../i18n/I18nProvider.jsx'
import {
  EVENT_OFFERING_CATEGORIES,
  EVENT_OFFERING_DIVISIONS,
  EVENT_OFFERING_MODALITIES,
  isDefaultOffering,
  normalizeEventOffering,
} from '../../../../shared/eventOffering.js'

const GROUPS = [
  { key: 'categories', catalog: EVENT_OFFERING_CATEGORIES, label: 'offeringCategories' },
  { key: 'divisions', catalog: EVENT_OFFERING_DIVISIONS, label: 'offeringDivisions' },
  { key: 'modalities', catalog: EVENT_OFFERING_MODALITIES, label: 'offeringModalities' },
]

/**
 * Qué ofrece el evento: categorías de competencia, divisiones y modalidades. La
 * inscripción y la API respetan esta lista. Nunca queda una lista vacía y Open
 * siempre se ofrece (todos pueden anotarse en Open).
 */
export default function EventOfferingField({ canEdit, draft, patchDraft }) {
  const { t } = useI18n()
  const base = 'admin.eventEditor'
  const offering = normalizeEventOffering(draft.offering)
  const isDefault = isDefaultOffering(offering)

  function optionLabel(key, value) {
    return key === 'modalities' ? t(`${base}.offeringModalityOptions.${value}`) : value
  }

  function toggle(key, value, checked) {
    const current = offering[key]
    const next = checked ? [...current, value] : current.filter((item) => item !== value)
    // Una lista vacía no se guarda: el evento tiene que ofrecer algo.
    if (next.length === 0) return
    patchDraft({ ...draft, offering: normalizeEventOffering({ ...offering, [key]: next }) })
  }

  return (
    <div className="admin-event-form__offering">
      <div className="admin-event-form__ticket-config-summary admin-event-form__ticket-config-summary--static">
        <span>
          <strong>
            <ListChecks size={13} aria-hidden />
            {t(`${base}.offeringTitle`)}
          </strong>
          <small>{t(`${base}.offeringHint`)}</small>
        </span>
        <small className="admin-event-form__offering-state" data-state={isDefault ? 'all' : 'custom'}>
          {isDefault ? t(`${base}.offeringAll`) : t(`${base}.offeringCustom`)}
        </small>
      </div>

      {GROUPS.map(({ key, catalog, label }) => (
        <fieldset className="admin-event-form__offering-group" key={key}>
          <legend>{t(`${base}.${label}`)}</legend>
          <div className="admin-event-form__offering-chips">
            {catalog.map((value) => {
              const checked = offering[key].includes(value)
              const alwaysOn = key === 'divisions' && value === 'Open'
              const lastOne = checked && offering[key].length === 1
              return (
                <label
                  className={`admin-event-form__offering-chip${checked ? ' is-on' : ''}`}
                  key={value}
                >
                  <input
                    checked={checked}
                    disabled={!canEdit || alwaysOn || lastOne}
                    name={`offering-${key}`}
                    type="checkbox"
                    value={value}
                    onChange={(event) => toggle(key, value, event.target.checked)}
                  />
                  <span>{optionLabel(key, value)}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
