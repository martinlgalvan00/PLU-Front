import { Gift, Plus, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { createEmptyTicketAddon } from '../../lib/ticketAddons.js'

function updateAddon(addons, index, patch) {
  return addons.map((addon, i) => (i === index ? { ...addon, ...patch } : addon))
}

export default function AdminTicketAddonsEditor({ addons = [], canEdit, errors = {}, onChange }) {
  const { locale, t } = useI18n()

  function addAddon() {
    onChange([...addons, createEmptyTicketAddon({ sortOrder: addons.length })])
  }

  function removeAddon(index) {
    onChange(addons.filter((_, i) => i !== index))
  }

  function patchAddon(index, field, value) {
    onChange(updateAddon(addons, index, { [field]: value }))
  }

  return (
    <fieldset className="admin-event-form__pricing admin-ticket-addons">
      <legend>
        <Gift size={14} aria-hidden />
        {t('admin.eventEditor.ticketAddonsTitle')}
      </legend>
      <p className="admin-event-form__pricing-lead">{t('admin.eventEditor.ticketAddonsLead')}</p>

      {addons.length === 0 ? (
        <p className="admin-ticket-addons__empty">{t('admin.eventEditor.ticketAddonsEmpty')}</p>
      ) : (
        <ul className="admin-ticket-addons__list">
          {addons.map((addon, index) => (
            <li key={addon.id} className="admin-ticket-addons__item">
              <div className="admin-ticket-addons__item-head">
                <label className="admin-event-form__toggle admin-ticket-addons__toggle">
                  <input
                    checked={addon.enabled !== false}
                    className="admin-event-form__toggle-input"
                    disabled={!canEdit}
                    type="checkbox"
                    onChange={(event) => patchAddon(index, 'enabled', event.target.checked)}
                  />
                  <span className="admin-event-form__toggle-ui" aria-hidden />
                  <span className="admin-event-form__toggle-copy">
                    <strong>{addon.label || t('admin.eventEditor.ticketAddonUntitled')}</strong>
                    <small>{money(addon.price, locale)}</small>
                  </span>
                </label>
                {canEdit ? (
                  <button
                    type="button"
                    className="admin-ticket-addons__remove"
                    onClick={() => removeAddon(index)}
                    aria-label={t('admin.eventEditor.ticketAddonRemove')}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                ) : null}
              </div>

              <div className="admin-ticket-addons__grid">
                <label className="admin-event-form__field">
                  <span>{t('admin.eventEditor.ticketAddonLabel')}</span>
                  <input
                    disabled={!canEdit}
                    required
                    type="text"
                    value={addon.label}
                    name={`pricing.ticketAddons.${index}.label`}
                    data-field={`pricing.ticketAddons.${index}.label`}
                    aria-invalid={Boolean(errors[`pricing.ticketAddons.${index}.label`])}
                    onChange={(event) => patchAddon(index, 'label', event.target.value)}
                    placeholder={t('admin.eventEditor.ticketAddonLabelPlaceholder')}
                  />
                  {errors[`pricing.ticketAddons.${index}.label`] ? (
                    <small className="admin-event-form__error" role="alert">
                      {errors[`pricing.ticketAddons.${index}.label`]}
                    </small>
                  ) : null}
                </label>
                <label className="admin-event-form__field">
                  <span>{t('admin.eventEditor.ticketAddonPrice')}</span>
                  <input
                    disabled={!canEdit}
                    min={0}
                    required
                    type="number"
                    value={addon.price}
                    name={`pricing.ticketAddons.${index}.price`}
                    data-field={`pricing.ticketAddons.${index}.price`}
                    aria-invalid={Boolean(errors[`pricing.ticketAddons.${index}.price`])}
                    onChange={(event) => patchAddon(index, 'price', event.target.value)}
                  />
                  {errors[`pricing.ticketAddons.${index}.price`] ? (
                    <small className="admin-event-form__error" role="alert">
                      {errors[`pricing.ticketAddons.${index}.price`]}
                    </small>
                  ) : null}
                </label>
                <label className="admin-event-form__field admin-event-form__field--wide">
                  <span>{t('admin.eventEditor.ticketAddonDescription')}</span>
                  <input
                    disabled={!canEdit}
                    type="text"
                    value={addon.description}
                    name={`pricing.ticketAddons.${index}.description`}
                    data-field={`pricing.ticketAddons.${index}.description`}
                    aria-invalid={Boolean(errors[`pricing.ticketAddons.${index}.description`])}
                    onChange={(event) => patchAddon(index, 'description', event.target.value)}
                    placeholder={t('admin.eventEditor.ticketAddonDescriptionPlaceholder')}
                  />
                  {errors[`pricing.ticketAddons.${index}.description`] ? (
                    <small className="admin-event-form__error" role="alert">
                      {errors[`pricing.ticketAddons.${index}.description`]}
                    </small>
                  ) : null}
                </label>
                <label className="admin-event-form__field admin-event-form__field--wide">
                  <span>{t('admin.eventEditor.ticketAddonRedeem')}</span>
                  <input
                    disabled={!canEdit}
                    type="text"
                    value={addon.redeemLabel}
                    name={`pricing.ticketAddons.${index}.redeemLabel`}
                    data-field={`pricing.ticketAddons.${index}.redeemLabel`}
                    aria-invalid={Boolean(errors[`pricing.ticketAddons.${index}.redeemLabel`])}
                    onChange={(event) => patchAddon(index, 'redeemLabel', event.target.value)}
                    placeholder={t('admin.eventEditor.ticketAddonRedeemPlaceholder')}
                  />
                  {errors[`pricing.ticketAddons.${index}.redeemLabel`] ? (
                    <small className="admin-event-form__error" role="alert">
                      {errors[`pricing.ticketAddons.${index}.redeemLabel`]}
                    </small>
                  ) : null}
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <Button
          className="btn--small btn--ghost admin-ticket-addons__add"
          type="button"
          onClick={addAddon}
        >
          <Plus size={14} aria-hidden />
          {t('admin.eventEditor.ticketAddonAdd')}
        </Button>
      ) : null}
    </fieldset>
  )
}
