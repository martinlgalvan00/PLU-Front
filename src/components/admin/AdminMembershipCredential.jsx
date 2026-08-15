import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, QrCode, RefreshCcw, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildCredentialUrl, generateStyledAthleteCredentialQr } from '../../lib/credentialQr.js'
import { formatShortDate } from '../../lib/format.js'
import {
  getMembershipCredential,
  rotateAthleteCredentialToken,
} from '../../services/athleteApi.js'
import StatusBadge from '../ui/StatusBadge.jsx'

/**
 * AdminMembershipCredential — PLU ARG
 *
 * Credencial emitida de un socio, desde el panel. Antes no había forma de ver
 * el QR que el atleta tiene en su cuenta ni de reemitirlo: si un token se
 * filtraba, la única salida era editar la fila en la base.
 *
 * La rotación invalida el QR viejo en el acto, así que va detrás de una
 * confirmación explícita y queda auditada (`athlete.credential_rotated`).
 *
 * `layout`: "panel" (ficha del atleta) | "modal" (overlay desde Afiliaciones).
 */
export default function AdminMembershipCredential({
  membershipId,
  canRotate = false,
  layout = 'panel',
}) {
  const { locale, t } = useI18n()
  const [credential, setCredential] = useState(null)
  const [qrSrc, setQrSrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmingRotation, setConfirmingRotation] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [rotatedAt, setRotatedAt] = useState(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    if (!membershipId) return
    setLoading(true)
    setError('')
    setConfirmingRotation(false)
    setRotatedAt(null)
    setCopied(false)
    try {
      setCredential(await getMembershipCredential(membershipId))
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.credential.loadError'))
      setCredential(null)
    } finally {
      setLoading(false)
    }
  }, [membershipId, t])

  useEffect(() => {
    void load()
  }, [load])

  // El QR que el socio realmente tiene cuelga de la persona, no del período:
  // apuntar al `qrToken` de la afiliación mostraba en el panel un código
  // distinto al de la card del atleta, y rotar ese no invalidaba nada.
  const athleteId = credential?.athlete?.id
  const qrToken = credential?.athlete?.credentialToken ?? credential?.membership?.qrToken
  useEffect(() => {
    if (!qrToken) {
      setQrSrc(null)
      return undefined
    }
    let cancelled = false
    generateStyledAthleteCredentialQr(buildCredentialUrl({ code: qrToken }))
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setQrSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [qrToken])

  async function rotate() {
    setRotating(true)
    setError('')
    try {
      const { athlete } = await rotateAthleteCredentialToken(athleteId)
      setCredential((current) => ({ ...current, athlete: { ...current.athlete, ...athlete } }))
      setRotatedAt(new Date().toISOString())
      setConfirmingRotation(false)
    } catch (rotateError) {
      setError(rotateError?.message ?? t('admin.credential.rotateError'))
    } finally {
      setRotating(false)
    }
  }

  async function copyToken() {
    if (!qrToken) return
    try {
      await navigator.clipboard.writeText(qrToken)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin clipboard el token ya queda visible para copiar a mano.
    }
  }

  if (!membershipId) {
    return <p className="admin-credential__empty">{t('admin.credential.none')}</p>
  }

  if (loading) {
    return <p className="admin-credential__empty">{t('admin.credential.loading')}</p>
  }

  if (!credential?.membership && error) {
    return (
      <p className="admin-credential__error" role="alert">
        {error}
      </p>
    )
  }

  const membership = credential?.membership
  const athlete = credential?.athlete
  const rootClass =
    layout === 'modal' ? 'admin-credential admin-credential--modal' : 'admin-credential'

  return (
    <div className={rootClass}>
      <div className="admin-credential__qr">
        {qrSrc ? (
          <img src={qrSrc} alt={t('admin.credential.qrAlt')} />
        ) : (
          <span className="admin-credential__qr-placeholder" aria-hidden>
            <QrCode size={36} strokeWidth={1.2} />
          </span>
        )}
      </div>

      <div className="admin-credential__data">
        {athlete?.fullName && layout === 'panel' ? (
          <div className="admin-credential__identity">
            <p className="admin-credential__name">{athlete.fullName}</p>
            {athlete.documentId ? (
              <p className="admin-credential__meta data-table__mono">{athlete.documentId}</p>
            ) : null}
          </div>
        ) : null}

        <p className="admin-credential__code data-table__mono">
          {membership?.memberCode ?? '—'}
        </p>

        <dl className="admin-credential__rows">
          <div>
            <dt>{t('admin.columns.status')}</dt>
            <dd>{membership?.status ? <StatusBadge value={membership.status} /> : '—'}</dd>
          </div>
          <div>
            <dt>{t('admin.columns.expiration')}</dt>
            <dd>
              {membership?.expirationDate
                ? formatShortDate(membership.expirationDate, locale)
                : '—'}
            </dd>
          </div>
          {athlete?.documentId && layout === 'modal' ? (
            <div>
              <dt>{t('admin.columns.document')}</dt>
              <dd className="data-table__mono">{athlete.documentId}</dd>
            </div>
          ) : null}
        </dl>

        {qrToken ? (
          <div className="admin-credential__token-row">
            <div className="admin-credential__token-copy">
              <span className="admin-credential__token-label">{t('admin.credential.token')}</span>
              <code className="admin-credential__token" title={qrToken}>
                {qrToken}
              </code>
            </div>
            <button
              type="button"
              className="admin-credential__copy-btn"
              onClick={copyToken}
              aria-label={
                copied ? t('admin.credential.copied') : t('admin.credential.copyToken')
              }
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              <span>{copied ? t('admin.credential.copied') : t('admin.credential.copyToken')}</span>
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="admin-credential__error" role="alert">
            {error}
          </p>
        ) : null}

        {rotatedAt ? (
          <p className="admin-credential__notice" role="status">
            {t('admin.credential.rotated')}
          </p>
        ) : null}

        {canRotate && athleteId ? (
          <div className="admin-credential__actions">
            {confirmingRotation ? (
              <>
                <p className="admin-credential__warning">
                  <ShieldAlert size={15} aria-hidden />
                  {t('admin.credential.rotateWarning')}
                </p>
                <div className="admin-credential__confirm">
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={rotating}
                    onClick={rotate}
                  >
                    {rotating ? t('admin.credential.rotating') : t('admin.credential.rotateConfirm')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    disabled={rotating}
                    onClick={() => setConfirmingRotation(false)}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => setConfirmingRotation(true)}
              >
                <RefreshCcw size={15} aria-hidden />
                {t('admin.credential.rotate')}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
