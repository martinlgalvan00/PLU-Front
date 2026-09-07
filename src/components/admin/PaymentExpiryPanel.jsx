import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Clock, FileClock, LoaderCircle, RefreshCw } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  checkoutWindowLimitsInUnit,
  isCheckoutWindowDraftValid,
  splitCheckoutWindowMinutes,
  toCheckoutWindowMinutes,
} from '../../lib/checkoutWindowUnits.js'
import {
  CHECKOUT_WINDOW_LIMITS,
  fetchPaymentExpiryOverview,
  saveCheckoutWindow,
} from '../../services/platformSettingsAdminService.js'
import SegmentedSwitch from '../ui/SegmentedSwitch.jsx'
import AdminIconButton from './AdminIconButton.jsx'

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

const UNIT_OPTION_KEYS = {
  minutes: 'admin.paymentExpiry.unitOptionMinutes',
  hours: 'admin.paymentExpiry.unitOptionHours',
  days: 'admin.paymentExpiry.unitOptionDays',
}

function toDraft(minutes) {
  const split = splitCheckoutWindowMinutes(minutes)
  return { amount: String(split.amount), unit: split.unit }
}

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

function metricDisplay(overview, value) {
  return overview ? value : '—'
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
        manual: toDraft(next.manualWindowMinutes),
        stale_attempt: toDraft(next.staleAttemptGraceMinutes),
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
    const draft = drafts[key]
    const limits = CHECKOUT_WINDOW_LIMITS[key]
    if (!isCheckoutWindowDraftValid(draft?.amount, draft?.unit, limits)) return
    const minutes = toCheckoutWindowMinutes(draft.amount, draft.unit)
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
  const unitOptions = [
    [
      'minutes',
      t('admin.paymentExpiry.unitOptionMinutes'),
      t('admin.paymentExpiry.minutesUnit'),
    ],
    ['hours', t('admin.paymentExpiry.unitOptionHours')],
    ['days', t('admin.paymentExpiry.unitOptionDays')],
  ]

  const metrics = [
    {
      id: 'blocked',
      value: metricDisplay(overview, blocked),
      label: t('admin.paymentExpiry.blockedLabel'),
      hint: t('admin.paymentExpiry.blockedHint'),
      alert: blocked > 0,
    },
    {
      id: 'held',
      value: metricDisplay(overview, held),
      label: t('admin.paymentExpiry.heldLabel'),
      hint: t('admin.paymentExpiry.heldHint'),
      alert: false,
    },
    {
      id: 'reapable',
      value: metricDisplay(overview, reapable),
      label: t('admin.paymentExpiry.reapableLabel'),
      hint: t('admin.paymentExpiry.reapableHint'),
      alert: false,
    },
    {
      id: 'expired',
      value: metricDisplay(overview, expiredOpen),
      label: t('admin.paymentExpiry.expiredLabel'),
      hint: t('admin.paymentExpiry.expiredHint'),
      alert: false,
    },
  ]

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
        <AdminIconButton
          icon={RefreshCw}
          label={t('admin.paymentExpiry.refresh')}
          onClick={() => void load()}
          disabled={loading}
          spinning={loading}
        />
      </header>

      {error ? (
        <p className="admin-payment-expiry__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-payment-expiry__grid">
        {/* El orden es el de la urgencia real, no el del esquema: lo que
            necesita a una persona primero. */}
        {metrics.map((metric) => (
          <article
            className={`admin-payment-expiry__metric${metric.alert ? ' is-alert' : ''}`}
            data-metric={metric.id}
            key={metric.id}
          >
            <span className="admin-payment-expiry__metric-value">{metric.value}</span>
            <span className="admin-payment-expiry__metric-label">{metric.label}</span>
            <p className="admin-payment-expiry__metric-hint" title={metric.hint}>
              {metric.hint}
            </p>
          </article>
        ))}
      </div>

      {/* Un total de vencidas-abiertas mayor a lo que se explica por retención
          o proveedor significa que el cron no está corriendo. Es la única
          lectura del panel que apunta a la infraestructura y no a una orden. */}
      {overview && expiredOpen > held + blocked ? (
        <p className="admin-payment-expiry__callout" role="status">
          <AlertTriangle size={15} aria-hidden />
          {t('admin.paymentExpiry.cronWarning', { count: expiredOpen - held - blocked })}
        </p>
      ) : null}

      <div className="admin-payment-expiry__windows">
        {WINDOW_FIELDS.map(({ key, stateKey }) => {
          const limits = CHECKOUT_WINDOW_LIMITS[key]
          const draft = drafts[key] ?? { amount: '', unit: 'minutes' }
          const unitLimits = checkoutWindowLimitsInUnit(limits, draft.unit)
          const invalid =
            Boolean(overview) && !isCheckoutWindowDraftValid(draft.amount, draft.unit, limits)
          const current = toDraft(overview?.[stateKey])
          const dirty =
            Boolean(overview) &&
            (current.amount !== draft.amount || current.unit !== draft.unit)
          const inputId = `payment-expiry-window-${key}`
          const unitId = `${inputId}-unit`
          const unitsLocked = !canEdit || loading
          const liveValue = overview ? formatWindow(overview[stateKey], t) : '—'
          return (
            <div className="admin-payment-expiry__window" key={key}>
              <div className="admin-payment-expiry__window-copy">
                <label className="admin-payment-expiry__window-label" htmlFor={inputId}>
                  {t(`admin.paymentExpiry.window.${key}.label`)}
                </label>
                <p className="admin-payment-expiry__window-hint">
                  {t(`admin.paymentExpiry.window.${key}.hint`)}
                </p>
              </div>
              <p className="admin-payment-expiry__window-figure" aria-hidden="true">
                {liveValue}
              </p>
              <div className="admin-payment-expiry__window-edit">
                <div className="admin-payment-expiry__window-controls">
                  <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    className="admin-payment-expiry__window-input"
                    min={unitLimits.min}
                    max={unitLimits.max}
                    step={1}
                    value={draft.amount}
                    disabled={unitsLocked}
                    aria-invalid={invalid || undefined}
                    aria-describedby={`${inputId}-current`}
                    onChange={(event) =>
                      setDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [key]: { ...draft, amount: event.target.value },
                      }))
                    }
                  />
                  <div
                    className={`admin-payment-expiry__window-units${unitsLocked ? ' is-readonly' : ''}`}
                    id={unitId}
                    inert={unitsLocked || undefined}
                  >
                    <SegmentedSwitch
                      className="admin-payment-expiry__unit-switch"
                      active={draft.unit}
                      ariaLabel={t('admin.paymentExpiry.unitLabel')}
                      onChange={(unit) => {
                        if (unitsLocked) return
                        setDrafts((currentDrafts) => ({
                          ...currentDrafts,
                          [key]: { ...draft, unit },
                        }))
                      }}
                      options={unitOptions}
                    />
                  </div>
                  {canEdit && dirty ? (
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => void handleSave(key)}
                      disabled={invalid || savingKey === key}
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
                    ? t('admin.paymentExpiry.windowRange', {
                        min: unitLimits.min,
                        max: unitLimits.max,
                        unit: t(UNIT_OPTION_KEYS[draft.unit] ?? UNIT_OPTION_KEYS.minutes),
                      })
                    : t('admin.paymentExpiry.windowCurrent', {
                        value: liveValue,
                      })}
                </p>
              </div>
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
