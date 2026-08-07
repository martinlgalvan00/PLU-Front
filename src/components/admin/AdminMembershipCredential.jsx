import { useCallback, useEffect, useState } from 'react'
import { QrCode, RefreshCcw, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'
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
 */
export default function AdminMembershipCredential({ membershipId, canRotate = false }) {
  const { locale, t } = useI18n()
  const [credential, setCredential] = useState(null)
  const [qrSrc, setQrSrc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmingRotation, setConfirmingRotation] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [rotatedAt, setRotatedAt] = useState(null)

  const load = useCallback(async () => {
    if (!membershipId) return
    setLoading(true)
    setError('')
    try {
      setCredential(await getMembershipCredential(membershipId))
    } catch (loadError) {
      setError(loadError?.message ?? t('admin.credential.loadError'))
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
    generateCredentialQr(buildCredentialUrl({ code: qrToken }))
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

  if (!membershipId) {
    return <p className="data-table__empty">{t('admin.credential.none')}</p>
  }

  if (loading) {
    return <p className="data-table__empty">{t('admin.credential.loading')}</p>
  }

  const membership = credential?.membership

  return (
    <div className="admin-credential">
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
        <dl className="admin-credential__rows">
          <div>
            <dt>{t('admin.columns.code')}</dt>
            <dd className="data-table__mono">{membership?.memberCode ?? '—'}</dd>
          </div>
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
          <div>
            <dt>{t('admin.credential.token')}</dt>
            <dd className="data-table__mono admin-credential__token">{qrToken ?? '—'}</dd>
          </div>
        </dl>

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
