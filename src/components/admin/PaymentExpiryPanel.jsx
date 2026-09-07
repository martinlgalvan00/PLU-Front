import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Clock, FileClock, LoaderCircle, RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  CHECKOUT_WINDOW_LIMITS,
  fetchPaymentExpiryOverview,
  saveCheckoutWindow,
} from '../../services/platformSettingsAdminService.js'

/**
 * Cierre automático de órdenes: qué plazo rige, qué está trabado y por qué.
 *
 * Las dos cifras que importan no son la misma cosa. `blockedByProvider` son
 * órdenes vencidas con un pago que sí llegó a Mercado Pago: el barrido no las
 * toca a propósito —cancelarlas sería dar por muerto un cobro que puede
 * acreditarse— y necesitan que una persona las mire. `heldForProof` son las
 * que tienen comprobante adjunto, y eso es el diseño funcionando, no una
 * falla. Se muestran separadas porque exigen acciones distintas.
 */

const WINDOW_FIELDS = [
  { key: 'manual', stateKey: 'manualWindowMinutes' },
  { key: 'stale_attempt', stateKey: 'staleAttemptGraceMinutes' },
]

/**
 * Minutos a algo legible. Un plazo de cobro se comunica en días cuando son
 * días: "7200 minutos" no le dice nada a quien tiene que decidir si acortarlo.
 */
function formatWindow(minutes, t) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value % 1440 === 0) return t('admin.paymentExpiry.unitDays', { count: value / 1440 })
  if (value % 60 === 0) return t('admin.paymentExpiry.unitHours', { count: value / 60 })
  return t('admin.paymentExpiry.unitMinutes', { count: value })
}

export default function PaymentExpiryPanel({ canEdit = false }) {
  const { locale, t } = useI18n()
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchPaymentExpiryOverview()
      setOverview(next)
      setDrafts({
        manual: String(next.manualWindowMinutes),
        stale_attempt: String(next.staleAttemptGraceMinutes),
      })
    } catch (loadError) {
      // Un rol acotado puede no tener `admin.registration_access.read`. Eso no
      // es una falla que reportarle: es una sección que no le corresponde, y un
      // banner rojo permanente en la pantalla de Caja sería ruido para siempre.
      // Mismo criterio que `loadValidation` en la sección que lo contiene.
      if (loadError?.status === 403) setForbidden(true)
      else setError(loadError?.message ?? t('admin.paymentExpiry.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(key) {
    const minutes = Number(drafts[key])
    const { min, max } = CHECKOUT_WINDOW_LIMITS[key]
    if (!Number.isInteger(minutes) || minutes < min || minutes > max) return
    setSavingKey(key)
    setError('')
    try {
      await saveCheckoutWindow(key, minutes)
      await load()
    } catch (saveError) {
      setError(saveError?.message ?? t('admin.paymentExpiry.saveError'))
    } finally {
      setSavingKey(null)
    }
  }

  const blocked = overview?.blockedByProvider ?? 0
  const held = overview?.heldForProof ?? 0
  const reapable = overview?.reapableAttempts ?? 0
  const expiredOpen = overview?.expiredStillOpen ?? 0

  if (forbidden) return null

  return (
    <section className="admin-payment-expiry" aria-labelledby="payment-expiry-title">
      <header className="admin-payment-expiry__header">
        <div>
          <span className="admin-payment-expiry__eyebrow">
            <Clock size={14} aria-hidden /> {t('admin.paymentExpiry.eyebrow')}
          </span>
          <h3 className="admin-payment-expiry__title" id="payment-expiry-title">
            {t('admin.paymentExpiry.title')}
          </h3>
          <p className="admin-payment-expiry__subtitle">{t('admin.paymentExpiry.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? (
            <LoaderCircle size={14} aria-hidden className="is-spinning" />
          ) : (
            <RefreshCw size={14} aria-hidden />
          )}{' '}
          {t('admin.paymentExpiry.refresh')}
        </button>
      </header>

      {error ? (
        <p className="admin-payment-expiry__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-payment-expiry__grid">
        {/* El orden es el de la urgencia real, no el del esquema: lo que
            necesita a una persona primero. */}
        <article
          className={`admin-payment-expiry__metric${blocked > 0 ? ' is-alert' : ''}`}
          data-metric="blocked"
        >
          <span className="admin-payment-expiry__metric-value">{blocked}</span>
          <span className="admin-payment-expiry__metric-label">
            {t('admin.paymentExpiry.blockedLabel')}
          </span>
          <p className="admin-payment-expiry__metric-hint">
            {t('admin.paymentExpiry.blockedHint')}
          </p>
        </article>

        <article className="admin-payment-expiry__metric" data-metric="held">
          <span className="admin-payment-expiry__metric-value">{held}</span>
          <span className="admin-payment-expiry__metric-label">
            {t('admin.paymentExpiry.heldLabel')}
          </span>
          <p className="admin-payment-expiry__metric-hint">{t('admin.paymentExpiry.heldHint')}</p>
        </article>

        <article className="admin-payment-expiry__metric" data-metric="reapable">
          <span className="admin-payment-expiry__metric-value">{reapable}</span>
          <span className="admin-payment-expiry__metric-label">
            {t('admin.paymentExpiry.reapableLabel')}
          </span>
          <p className="admin-payment-expiry__metric-hint">
            {t('admin.paymentExpiry.reapableHint')}
          </p>
        </article>

        <article className="admin-payment-expiry__metric" data-metric="expired">
          <span className="admin-payment-expiry__metric-value">{expiredOpen}</span>
          <span className="admin-payment-expiry__metric-label">
            {t('admin.paymentExpiry.expiredLabel')}
          </span>
          <p className="admin-payment-expiry__metric-hint">
            {t('admin.paymentExpiry.expiredHint')}
          </p>
        </article>
      </div>

      {/* Un total de vencidas-abiertas mayor a lo que se explica por retención
          o proveedor significa que el cron no está corriendo. Es la única
          lectura del panel que apunta a la infraestructura y no a una orden. */}
      {expiredOpen > held + blocked ? (
        <p className="admin-payment-expiry__callout" role="status">
          <AlertTriangle size={15} aria-hidden />
          {t('admin.paymentExpiry.cronWarning', { count: expiredOpen - held - blocked })}
        </p>
      ) : null}

      <div className="admin-payment-expiry__windows">
        {WINDOW_FIELDS.map(({ key, stateKey }) => {
          const { min, max } = CHECKOUT_WINDOW_LIMITS[key]
          const draft = drafts[key] ?? ''
          const parsed = Number(draft)
          const invalid = !Number.isInteger(parsed) || parsed < min || parsed > max
          const dirty = String(overview?.[stateKey] ?? '') !== draft
          const inputId = `payment-expiry-window-${key}`
          return (
            <div className="admin-payment-expiry__window" key={key}>
              <label className="admin-payment-expiry__window-label" htmlFor={inputId}>
                {t(`admin.paymentExpiry.window.${key}.label`)}
              </label>
              <p className="admin-payment-expiry__window-hint">
                {t(`admin.paymentExpiry.window.${key}.hint`)}
              </p>
              <div className="admin-payment-expiry__window-controls">
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  className="admin-payment-expiry__window-input"
                  min={min}
                  max={max}
                  step={1}
                  value={draft}
                  disabled={!canEdit || loading}
                  aria-invalid={invalid || undefined}
                  aria-describedby={`${inputId}-current`}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
                <span className="admin-payment-expiry__window-unit">
                  {t('admin.paymentExpiry.minutesUnit')}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => void handleSave(key)}
                    disabled={invalid || !dirty || savingKey === key}
                  >
                    {savingKey === key ? (
                      <LoaderCircle size={14} aria-hidden className="is-spinning" />
                    ) : null}{' '}
                    {t('admin.paymentExpiry.save')}
                  </button>
                ) : null}
              </div>
              <p className="admin-payment-expiry__window-current" id={`${inputId}-current`}>
                {invalid
                  ? t('admin.paymentExpiry.windowRange', { min, max })
                  : t('admin.paymentExpiry.windowCurrent', {
                      value: formatWindow(overview?.[stateKey], t),
                    })}
              </p>
            </div>
          )
        })}
      </div>

      {overview?.nextExpiringAt ? (
        <p className="admin-payment-expiry__next">
          <FileClock size={14} aria-hidden />
          {t('admin.paymentExpiry.nextExpiring', {
            date: new Date(overview.nextExpiringAt).toLocaleString(
              locale === 'en' ? 'en-US' : 'es-AR',
              { dateStyle: 'short', timeStyle: 'short' },
            ),
          })}
        </p>
      ) : null}
    </section>
  )
}
