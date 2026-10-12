import { useCallback, useEffect, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { fetchShopCheckoutSettings, saveShopCheckoutSettings } from '../../services/shopService.js'
import '../../styles/pages/admin-shop-orders.css'

const METHODS = [
  {
    key: 'mercadoPago',
    flag: 'mercadoPagoEnabled',
    method: 'mercado_pago',
    profile: 'mercadoPagoProfileId',
    options: 'mercadoPago',
  },
  {
    key: 'bankTransfer',
    flag: 'bankTransferEnabled',
    method: 'bank_transfer',
    profile: 'bankTransferProfileId',
    options: 'bank',
  },
  { key: 'cash', flag: 'cashEnabled', method: 'cash_on_site', profile: null, options: null },
]

/**
 * Configuración de cobro de la tienda: qué medios se ofrecen, con qué cuenta y
 * qué se le dice a quien compra. Lo que se apaga acá deja de ofrecerse al
 * instante; "Hoy se ofrece" muestra lo que el servidor realmente publica.
 */
export default function ShopCheckoutSettingsPanel({ canEdit }) {
  const { t } = useI18n()
  const k = 'admin.shop.settings'
  const [state, setState] = useState('loading') // loading | ready | error
  const [draft, setDraft] = useState(null)
  const [profiles, setProfiles] = useState({ bank: [], mercadoPago: [] })
  const [effective, setEffective] = useState(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null) // { tone, text }

  const load = useCallback(async () => {
    setState('loading')
    try {
      const result = await fetchShopCheckoutSettings()
      setDraft(result.settings)
      setProfiles(result.profiles ?? { bank: [], mercadoPago: [] })
      setEffective(result.effective ?? null)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const update = (field, value) => {
    setFeedback(null)
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving || !canEdit) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await saveShopCheckoutSettings(draft)
      setDraft(result.settings)
      setEffective(result.effective ?? null)
      setFeedback({ tone: 'ok', text: t(`${k}.saved`) })
    } catch (error) {
      setFeedback({ tone: 'error', text: error?.message || t(`${k}.saveError`) })
    } finally {
      setSaving(false)
    }
  }

  if (state === 'loading') {
    return (
      <p className="admin-shop__state" role="status">
        {t(`${k}.loading`)}
      </p>
    )
  }
  if (state === 'error' || !draft) {
    return (
      <div className="admin-shop__state admin-shop__state--error" role="alert">
        <p>{t(`${k}.loadError`)}</p>
        <Button variant="outline" onClick={() => void load()}>
          {t(`${k}.retry`)}
        </Button>
      </div>
    )
  }

  return (
    <form className="admin-shop-settings" onSubmit={handleSubmit}>
      <header>
        <h2>{t(`${k}.title`)}</h2>
        <p>{t(`${k}.lead`)}</p>
      </header>

      <div className="admin-shop-settings__methods">
        {METHODS.map((entry) => (
          <fieldset key={entry.key} className="admin-shop-settings__method">
            <legend className="visually-hidden">{t(`${k}.${entry.key}`)}</legend>
            <label className="admin-shop-settings__switch">
              <input
                type="checkbox"
                checked={Boolean(draft[entry.flag])}
                disabled={!canEdit}
                onChange={(event) => update(entry.flag, event.target.checked)}
              />
              <span>
                <strong>{t(`${k}.${entry.key}`)}</strong>
                <small>{t(`${k}.${entry.key}Hint`)}</small>
              </span>
            </label>

            {entry.profile && draft[entry.flag] ? (
              <label className="admin-shop-settings__field">
                <span>{t(`${k}.${entry.key}Profile`)}</span>
                <select
                  value={draft[entry.profile] ?? ''}
                  disabled={!canEdit}
                  onChange={(event) => update(entry.profile, event.target.value || null)}
                >
                  <option value="">{t(`${k}.${entry.key}ProfileDefault`)}</option>
                  {profiles[entry.options].map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {entry.key === 'cash' && draft.cashEnabled ? (
              <label className="admin-shop-settings__field">
                <span>{t(`${k}.cashInstructions`)}</span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={draft.cashInstructions}
                  disabled={!canEdit}
                  placeholder={t(`${k}.cashInstructionsPlaceholder`)}
                  onChange={(event) => update('cashInstructions', event.target.value)}
                />
              </label>
            ) : null}
          </fieldset>
        ))}
      </div>

      <label className="admin-shop-settings__field">
        <span>{t(`${k}.fulfillmentNote`)}</span>
        <textarea
          rows={2}
          maxLength={500}
          value={draft.fulfillmentNote}
          disabled={!canEdit}
          placeholder={t(`${k}.fulfillmentNotePlaceholder`)}
          onChange={(event) => update('fulfillmentNote', event.target.value)}
        />
      </label>

      {effective ? (
        <section className="admin-shop-settings__effective" aria-labelledby="shop-effective">
          <h3 id="shop-effective">{t(`${k}.effectiveTitle`)}</h3>
          {effective.open ? (
            <ul>
              {METHODS.map((entry) => (
                <li key={entry.method} data-on={Boolean(effective.methods?.[entry.method])}>
                  <span aria-hidden className="admin-shop-order__dot" />
                  <span>{t(`${k}.${entry.key}`)}</span>
                  <small>
                    {effective.methods?.[entry.method]
                      ? t(`${k}.effectiveOn`)
                      : t(`${k}.effectiveOff`)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t(`${k}.effectiveClosed`)}</p>
          )}
          {draft.bankTransferEnabled && !effective.methods?.bank_transfer ? (
            <p className="admin-shop-settings__warn">{t(`${k}.bankNeedsDetails`)}</p>
          ) : null}
          {draft.mercadoPagoEnabled && !effective.methods?.mercado_pago ? (
            <p className="admin-shop-settings__warn">{t(`${k}.mpNeedsConfig`)}</p>
          ) : null}
        </section>
      ) : null}

      <footer className="admin-shop-settings__foot">
        {canEdit ? (
          <Button type="submit" disabled={saving}>
            {saving ? t(`${k}.saving`) : t(`${k}.save`)}
          </Button>
        ) : null}
        {feedback ? (
          <p role={feedback.tone === 'error' ? 'alert' : 'status'} data-tone={feedback.tone}>
            {feedback.text}
          </p>
        ) : null}
      </footer>
    </form>
  )
}
