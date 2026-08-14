import { useState } from 'react'
import { Check, Upload } from 'lucide-react'
import '../../styles/components/transfer-proof.css'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { registerAthletePaymentProof } from '../../services/athleteApi.js'
import {
  uploadAthletePaymentProof,
  validateAthletePaymentProofFile,
} from '../../services/athleteProofService.js'

/**
 * TransferProofUpload — PLU ARG
 *
 * El comprobante cierra el circuito de la transferencia: sin él Finanzas
 * aprueba a ciegas, sin evidencia adjunta a la orden. Mismo flujo que la compra
 * de entradas (subida firmada al bucket privado y registro de la ruta).
 *
 * Vive acá y no dentro de `MembershipPurchaseSection` porque lo necesitan los
 * dos puntos donde se genera una orden manual: la afiliación desde la cuenta y
 * la del alta (`RegisterMembershipConfirmation`).
 */
export default function TransferProofUpload({ orderId, onUploaded }) {
  const { t } = useI18n()
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const inputId = `proof-${orderId}`
  const busy = state === 'uploading'

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const validation = validateAthletePaymentProofFile(file)
    if (validation.error) {
      setError(validation.error)
      setState('error')
      return
    }

    setState('uploading')
    setError('')
    try {
      const { storagePath } = await uploadAthletePaymentProof(orderId, file)
      const result = await registerAthletePaymentProof(orderId, storagePath)
      setState('done')
      // La orden entra en validación manual recién cuando la API registró la
      // ruta privada. Avisamos a las pantallas abiertas para refrescarla.
      window.dispatchEvent(new CustomEvent('plu:payment-updated', {
        detail: { orderId, status: result?.order?.status ?? 'validacion_manual' },
      }))
      onUploaded?.(result?.order ?? null)
    } catch (uploadError) {
      setError(uploadError?.message ?? t('account.membership.proofError'))
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <p className="account-transfer-proof__done" role="status">
        <Check size={16} aria-hidden />
        {t('account.membership.proofUploaded')}
      </p>
    )
  }

  return (
    <div className="account-transfer-proof">
      {/* El input va primero para que el foco de teclado pueda pintarse sobre
          el label, que es el control visible. */}
      <input
        id={inputId}
        className="account-transfer-proof__input"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        disabled={busy}
        onChange={handleFile}
      />
      <label
        className={`account-transfer-proof__drop${busy ? ' is-busy' : ''}`}
        htmlFor={inputId}
        aria-busy={busy || undefined}
      >
        {busy ? (
          <span className="account-transfer-proof__spinner" aria-hidden />
        ) : (
          <Upload size={18} aria-hidden />
        )}
        <span className="account-transfer-proof__copy">
          <strong>
            {busy ? t('account.membership.proofUploading') : t('account.membership.proofAction')}
          </strong>
          <span className="account-transfer-proof__hint">{t('account.membership.proofHint')}</span>
        </span>
      </label>
      {error ? (
        <p className="account-transfer-proof__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
