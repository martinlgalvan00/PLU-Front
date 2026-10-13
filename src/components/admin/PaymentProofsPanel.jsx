import { useCallback, useEffect, useId, useState } from 'react'
import { Download, FileArchive, FileSpreadsheet, RefreshCw, TriangleAlert } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  downloadAllProofs,
  downloadProofIndex,
  downloadProofsZip,
  fetchProofArchive,
  fetchProofForecast,
  PROOF_GRACE_DAYS,
  PROOF_RETENTION_DAYS,
  saveProofRetention,
} from '../../services/paymentProofsAdminService.js'
import Button from '../ui/Button.jsx'
import AdminIconButton from './AdminIconButton.jsx'
import PaymentProofTrash from './PaymentProofTrash.jsx'
import '../../styles/pages/admin-payment-expiry.css'
import '../../styles/pages/admin-payment-proofs.css'

/**
 * Archivo de comprobantes: llevarlos a la computadora y decidir cuándo el
 * servidor puede borrarlos.
 *
 * Orden de lectura: ¿cuántos hay y en qué situación? → llevárselos (una acción
 * principal, el ZIP) → qué hace el servidor con ellos → la papelera. La
 * política manda los comprobantes a la papelera (recuperables durante su
 * período) y recién después se eliminan para siempre, así que el default es
 * conservar y los modos que mueven archivos lo dicen en voz alta. "Después de
 * descargar" sólo toca lo que ya se bajó: es la forma de liberar espacio sin
 * perder nada.
 */

const MODES = ['keep', 'after_export', 'after_days']
// Plazos habituales; cualquier otro valor se carga a mano con "Otro".
const DAY_PRESETS = [7, 10, 30, 90]
// Cuánto vive un archivo en la papelera antes de eliminarse del servidor.
const GRACE_PRESETS = [7, 15, 30, 60, 90]

function formatStamp(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDay(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', { dateStyle: 'medium' }).format(
    date,
  )
}

/**
 * Qué está por borrarse y cuánto de eso todavía no se bajó. Con `lead` es la
 * vista previa de una política sin guardar.
 */
function ForecastNote({ forecast, lead = false, locale, t }) {
  const parts = []
  if (forecast.count === 0) {
    parts.push(t('admin.paymentProofs.forecast.none', { days: forecast.windowDays }))
    if (forecast.nextDueAt) {
      parts.push(
        t('admin.paymentProofs.forecast.next', { date: formatDay(forecast.nextDueAt, locale) }),
      )
    }
  } else {
    parts.push(
      t('admin.paymentProofs.forecast.some', {
        count: forecast.count,
        days: forecast.windowDays,
      }),
    )
    if (forecast.dueNow > 0) {
      parts.push(t('admin.paymentProofs.forecast.dueNow', { count: forecast.dueNow }))
    }
    if (forecast.notDownloaded > 0) {
      parts.push(t('admin.paymentProofs.forecast.notDownloaded', { count: forecast.notDownloaded }))
    }
  }
  const alert = forecast.notDownloaded > 0
  return (
    <p
      className={`admin-proofs__forecast${alert ? ' is-alert' : ''}`}
      role={alert ? 'alert' : 'status'}
    >
      {alert ? <TriangleAlert size={16} aria-hidden /> : null}
      <span>
        {lead ? <strong>{t('admin.paymentProofs.forecast.draftLead')} </strong> : null}
        {parts.join(' ')}
      </span>
    </p>
  )
}

export default function PaymentProofsPanel({ canEdit = false }) {
  const { locale, t } = useI18n()
  const groupId = useId()
  const [archive, setArchive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [draft, setDraft] = useState({
    mode: 'keep',
    days: String(PROOF_RETENTION_DAYS.fallback),
    graceDays: String(PROOF_GRACE_DAYS.fallback),
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState('')
  const [draftForecast, setDraftForecast] = useState(null)
  const [customDays, setCustomDays] = useState(false)
  const [customGrace, setCustomGrace] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [batch, setBatch] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchProofArchive()
      setArchive(next)
      setDraft({
        mode: next.settings.mode,
        days: String(next.settings.days),
        graceDays: String(next.settings.graceDays),
      })
      setCustomDays(!DAY_PRESETS.includes(next.settings.days))
      setCustomGrace(!GRACE_PRESETS.includes(next.settings.graceDays))
      setConfirming(false)
    } catch (loadError) {
      // Un rol sin permiso de lectura de pagos no ve esta sección; no es una
      // falla que reportarle.
      if (loadError?.status === 403) setForbidden(true)
      else setError(loadError?.message ?? t('admin.paymentProofs.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  // Cambios en la papelera mueven las cifras, pero no tienen que pisar una
  // política que se está editando: se refresca el estado sin tocar el borrador.
  const reloadStatus = useCallback(async () => {
    try {
      setArchive(await fetchProofArchive())
    } catch {
      // Las cifras quedan como estaban; el próximo "Actualizar" las corrige.
    }
  }, [])

  const summary = archive?.summary
  const value = (key) => (summary ? summary[key] : '—')
  const days = Number(draft.days)
  const daysValid =
    Number.isInteger(days) && days >= PROOF_RETENTION_DAYS.min && days <= PROOF_RETENTION_DAYS.max
  const graceDays = Number(draft.graceDays)
  const graceValid =
    Number.isInteger(graceDays) &&
    graceDays >= PROOF_GRACE_DAYS.min &&
    graceDays <= PROOF_GRACE_DAYS.max
  const policyDirty =
    archive != null &&
    (draft.mode !== archive.settings.mode ||
      (draft.mode !== 'keep' && Number(draft.days) !== archive.settings.days))
  const dirty = policyDirty || (archive != null && graceDays !== archive.settings.graceDays)
  const pendingCount = summary?.notDownloaded ?? 0
  const trashCount = archive?.trash.count ?? 0
  // Lo irreversible es lo que se pierde al salir de la papelera: se pide una
  // segunda confirmación cuando la política puede mandar comprobantes sin copia
  // (y, por eso, perderlos pasado el período)...
  const policyNeedsConfirm =
    policyDirty &&
    (draft.mode === 'after_days' || (draftForecast != null && draftForecast.notDownloaded > 0))
  // ...y cuando se acorta el período con archivos en la papelera: los que ya lo
  // superen se eliminan en la próxima limpieza.
  const graceShortened =
    archive != null && graceValid && graceDays < archive.settings.graceDays && trashCount > 0
  const needsConfirm = policyNeedsConfirm || graceShortened
  const previewing = policyDirty && draft.mode !== 'keep' && daysValid

  // Vista previa de la política a medio elegir: se pide recién cuando el valor
  // se asienta, y una respuesta tardía de un borrador viejo se descarta.
  useEffect(() => {
    if (!previewing) {
      setDraftForecast(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchProofForecast({ mode: draft.mode, days })
        .then((next) => {
          if (!cancelled) setDraftForecast(next)
        })
        .catch(() => {
          if (!cancelled) setDraftForecast(null)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewing, draft.mode, days])

  async function handleZip() {
    setBusy('zip')
    setError('')
    setNotice('')
    try {
      const result = await downloadProofsZip('pending')
      setNotice(
        [
          t('admin.paymentProofs.zipDone', { count: result.count }),
          result.remaining > 0
            ? t('admin.paymentProofs.zipRemaining', { count: result.remaining })
            : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      await load()
    } catch (downloadError) {
      setError(downloadError?.message ?? t('admin.paymentProofs.downloadError'))
    } finally {
      setBusy(null)
    }
  }

  async function handleAll() {
    setBusy('all')
    setBatch(1)
    setError('')
    setNotice('')
    try {
      const result = await downloadAllProofs({ onBatch: setBatch })
      setNotice(t('admin.paymentProofs.allDone', { count: result.count, batches: result.batches }))
      await load()
    } catch (downloadError) {
      setError(downloadError?.message ?? t('admin.paymentProofs.downloadError'))
    } finally {
      setBusy(null)
    }
  }

  async function handleIndex() {
    setBusy('csv')
    setError('')
    setNotice('')
    try {
      await downloadProofIndex()
    } catch (downloadError) {
      setError(downloadError?.message ?? t('admin.paymentProofs.downloadError'))
    } finally {
      setBusy(null)
    }
  }

  // Cualquier cambio del borrador invalida una confirmación ya pedida.
  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }))
    setSaved(false)
    setConfirming(false)
  }

  function handleSaveClick() {
    if (needsConfirm && !confirming) {
      setConfirming(true)
      return
    }
    void handleSave()
  }

  async function handleSave() {
    if (!canEdit || !dirty || !graceValid || (draft.mode !== 'keep' && !daysValid)) return
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await saveProofRetention({
        mode: draft.mode,
        days: daysValid ? days : PROOF_RETENTION_DAYS.fallback,
        graceDays,
      })
      setSaved(true)
      await load()
    } catch (saveError) {
      setError(saveError?.message ?? t('admin.paymentProofs.saveError'))
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) return null

  const metrics = [
    { id: 'onServer', value: value('onServer'), alert: false },
    { id: 'notDownloaded', value: value('notDownloaded'), alert: pendingCount > 0 },
    { id: 'downloaded', value: value('downloaded'), alert: false },
    { id: 'trash', value: archive ? trashCount : '—', alert: false },
    { id: 'deleted', value: value('deleted'), alert: false },
  ]

  return (
    <section className="admin-payment-expiry admin-proofs" aria-labelledby="payment-proofs-title">
      <header className="admin-payment-expiry__header">
        <div>
          <span className="admin-payment-expiry__eyebrow">
            <FileArchive size={14} aria-hidden /> {t('admin.paymentProofs.eyebrow')}
          </span>
          <h3 className="admin-payment-expiry__title" id="payment-proofs-title">
            {t('admin.paymentProofs.title')}
          </h3>
        </div>
        <AdminIconButton
          icon={RefreshCw}
          label={t('admin.paymentProofs.refresh')}
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

      <div className="admin-payment-expiry__grid admin-proofs__metrics">
        {metrics.map((metric) => (
          <article
            className={`admin-payment-expiry__metric${metric.alert ? ' is-alert' : ''}`}
            data-zero={metric.value === 0 ? 'true' : undefined}
            key={metric.id}
            title={t(`admin.paymentProofs.${metric.id}Hint`)}
          >
            <span className="admin-payment-expiry__metric-value">{metric.value}</span>
            <span className="admin-payment-expiry__metric-label">
              {t(`admin.paymentProofs.${metric.id}Label`)}
            </span>
          </article>
        ))}
      </div>

      {archive?.settings.mode !== 'keep' && archive?.forecast ? (
        <ForecastNote forecast={archive.forecast} locale={locale} t={t} />
      ) : null}

      <div className="admin-proofs__actions">
        <Button
          type="button"
          variant="gold"
          className="btn--small"
          disabled={busy !== null || pendingCount === 0}
          onClick={() => void handleZip()}
        >
          <Download size={15} aria-hidden />
          <span>
            {busy === 'zip'
              ? t('admin.paymentProofs.preparingZip')
              : pendingCount === 0
                ? t('admin.paymentProofs.nothingToDownload')
                : t('admin.paymentProofs.downloadZip', { count: pendingCount })}
          </span>
        </Button>
        <button
          type="button"
          className="admin-proofs__link"
          disabled={busy !== null || !summary || summary.onServer === 0}
          onClick={() => void handleAll()}
        >
          <FileArchive size={15} aria-hidden />
          <span>
            {busy === 'all'
              ? t('admin.paymentProofs.downloadingAll', { batch })
              : t('admin.paymentProofs.downloadAll')}
          </span>
        </button>
        <button
          type="button"
          className="admin-proofs__link"
          disabled={busy !== null}
          onClick={() => void handleIndex()}
        >
          <FileSpreadsheet size={15} aria-hidden />
          <span>{t('admin.paymentProofs.downloadIndex')}</span>
        </button>
        <p className="admin-proofs__help">{t('admin.paymentProofs.zipHelp')}</p>
        <p className="admin-proofs__notice" role="status">
          {notice}
        </p>
      </div>

      <fieldset className="admin-proofs__policy" disabled={!canEdit || saving}>
        <legend className="admin-proofs__policy-title">
          {t('admin.paymentProofs.policyTitle')}
        </legend>

        <div className="admin-proofs__modes" role="radiogroup">
          {MODES.map((mode) => (
            <label
              className={`admin-proofs__mode${draft.mode === mode ? ' is-selected' : ''}`}
              key={mode}
            >
              <input
                type="radio"
                name={groupId}
                value={mode}
                checked={draft.mode === mode}
                onChange={() => updateDraft({ mode })}
              />
              <span className="admin-proofs__mode-copy">
                <strong>{t(`admin.paymentProofs.mode.${mode}.title`)}</strong>
                <span>{t(`admin.paymentProofs.mode.${mode}.description`)}</span>
              </span>
            </label>
          ))}
        </div>

        {draft.mode !== 'keep' ? (
          <div className="admin-proofs__days">
            <div className="admin-proofs__days-picker">
              <span className="admin-proofs__days-title" id={`${groupId}-days`}>
                {t('admin.paymentProofs.daysLabel')}
              </span>
              <div
                className="admin-proofs__chips"
                role="radiogroup"
                aria-labelledby={`${groupId}-days`}
              >
                {DAY_PRESETS.map((preset) => (
                  <label className="admin-proofs__chip" key={preset}>
                    <input
                      type="radio"
                      name={`${groupId}-days`}
                      checked={!customDays && days === preset}
                      onChange={() => {
                        setCustomDays(false)
                        updateDraft({ days: String(preset) })
                      }}
                    />
                    <span>{t('admin.paymentProofs.daysPreset', { count: preset })}</span>
                  </label>
                ))}
                <label className="admin-proofs__chip">
                  <input
                    type="radio"
                    name={`${groupId}-days`}
                    checked={customDays}
                    onChange={() => setCustomDays(true)}
                  />
                  <span>{t('admin.paymentProofs.daysOther')}</span>
                </label>
              </div>
              {customDays ? (
                <label className="admin-proofs__days-field">
                  <span>{t('admin.paymentProofs.daysCustomLabel')}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={PROOF_RETENTION_DAYS.min}
                    max={PROOF_RETENTION_DAYS.max}
                    value={draft.days}
                    aria-invalid={!daysValid}
                    onChange={(event) => updateDraft({ days: event.target.value })}
                  />
                </label>
              ) : null}
            </div>
            {/* Al confirmar, el aviso de confirmación ya dice lo mismo. */}
            {confirming ? null : (
              <p className="admin-payment-expiry__callout">
                <TriangleAlert size={16} aria-hidden />
                <span>
                  {t('admin.paymentProofs.irreversible')}{' '}
                  {draft.mode === 'after_days'
                    ? t('admin.paymentProofs.afterDaysWarning')
                    : t('admin.paymentProofs.afterExportNote')}
                </span>
              </p>
            )}
            {previewing && draftForecast ? (
              <ForecastNote forecast={draftForecast} lead locale={locale} t={t} />
            ) : null}
          </div>
        ) : null}

        <div className="admin-proofs__grace">
          <div className="admin-proofs__days-picker">
            <span className="admin-proofs__days-title" id={`${groupId}-grace`}>
              {t('admin.paymentProofs.graceTitle')}
            </span>
            <p className="admin-proofs__help">{t('admin.paymentProofs.graceDescription')}</p>
            <div
              className="admin-proofs__chips"
              role="radiogroup"
              aria-labelledby={`${groupId}-grace`}
            >
              {GRACE_PRESETS.map((preset) => (
                <label className="admin-proofs__chip" key={preset}>
                  <input
                    type="radio"
                    name={`${groupId}-grace`}
                    checked={!customGrace && graceDays === preset}
                    onChange={() => {
                      setCustomGrace(false)
                      updateDraft({ graceDays: String(preset) })
                    }}
                  />
                  <span>{t('admin.paymentProofs.daysPreset', { count: preset })}</span>
                </label>
              ))}
              <label className="admin-proofs__chip">
                <input
                  type="radio"
                  name={`${groupId}-grace`}
                  checked={customGrace}
                  onChange={() => setCustomGrace(true)}
                />
                <span>{t('admin.paymentProofs.daysOther')}</span>
              </label>
            </div>
            {customGrace ? (
              <label className="admin-proofs__days-field">
                <span>{t('admin.paymentProofs.graceCustomLabel')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={PROOF_GRACE_DAYS.min}
                  max={PROOF_GRACE_DAYS.max}
                  value={draft.graceDays}
                  aria-invalid={!graceValid}
                  onChange={(event) => updateDraft({ graceDays: event.target.value })}
                />
              </label>
            ) : null}
          </div>
        </div>

        {confirming ? (
          <p className="admin-payment-expiry__callout" role="alert">
            <TriangleAlert size={16} aria-hidden />
            <span>
              {policyNeedsConfirm
                ? t('admin.paymentProofs.confirm.warning', { graceDays: draft.graceDays })
                : t('admin.paymentProofs.confirm.graceWarning')}
            </span>
          </p>
        ) : null}

        <div className="admin-proofs__save">
          <Button
            type="button"
            variant={confirming ? 'gold' : 'outline'}
            className="btn--small"
            disabled={
              !canEdit || !dirty || saving || !graceValid || (draft.mode !== 'keep' && !daysValid)
            }
            onClick={handleSaveClick}
          >
            {saving
              ? t('admin.paymentProofs.saving')
              : confirming
                ? t('admin.paymentProofs.confirm.accept')
                : t('admin.paymentProofs.save')}
          </Button>
          {confirming ? (
            <button
              type="button"
              className="admin-proofs__link"
              disabled={saving}
              onClick={() => setConfirming(false)}
            >
              {t('admin.paymentProofs.confirm.cancel')}
            </button>
          ) : null}
          <span className="admin-proofs__status" role="status">
            {saved
              ? t('admin.paymentProofs.saved')
              : !canEdit
                ? t('admin.paymentProofs.readOnly')
                : archive?.settings.updatedAt
                  ? t('admin.paymentProofs.updatedAt', {
                      date: formatStamp(archive.settings.updatedAt, locale),
                    })
                  : ''}
          </span>
        </div>
      </fieldset>

      {archive ? (
        <PaymentProofTrash canEdit={canEdit} count={trashCount} onChanged={reloadStatus} />
      ) : null}
    </section>
  )
}
