import { Gift, Plus, Trash2 } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { createEmptyTicketAddon } from '../../lib/ticketAddons.js'

function updateAddon(addons, index, patch) {
  return addons.map((addon, i) => (i === index ? { ...addon, ...patch } : addon))
}

export default function AdminTicketAddonsEditor({ addons = [], canEdit, onChange }) {
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
                    onChange={(event) => patchAddon(index, 'label', event.target.value)}
                    placeholder={t('admin.eventEditor.ticketAddonLabelPlaceholder')}
                  />
                </label>
                <label className="admin-event-form__field">
                  <span>{t('admin.eventEditor.ticketAddonPrice')}</span>
                  <input
                    disabled={!canEdit}
                    min={0}
                    required
                    type="number"
                    value={addon.price}
                    onChange={(event) => patchAddon(index, 'price', event.target.value)}
                  />
                </label>
                <label className="admin-event-form__field admin-event-form__field--wide">
                  <span>{t('admin.eventEditor.ticketAddonDescription')}</span>
                  <input
                    disabled={!canEdit}
                    type="text"
                    value={addon.description}
                    onChange={(event) => patchAddon(index, 'description', event.target.value)}
                    placeholder={t('admin.eventEditor.ticketAddonDescriptionPlaceholder')}
                  />
                </label>
                <label className="admin-event-form__field admin-event-form__field--wide">
                  <span>{t('admin.eventEditor.ticketAddonRedeem')}</span>
                  <input
                    disabled={!canEdit}
                    type="text"
                    value={addon.redeemLabel}
                    onChange={(event) => patchAddon(index, 'redeemLabel', event.target.value)}
                    placeholder={t('admin.eventEditor.ticketAddonRedeemPlaceholder')}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <Button className="btn--small btn--ghost admin-ticket-addons__add" type="button" onClick={addAddon}>
          <Plus size={14} aria-hidden />
          {t('admin.eventEditor.ticketAddonAdd')}
        </Button>
      ) : null}
    </fieldset>
  )
}
