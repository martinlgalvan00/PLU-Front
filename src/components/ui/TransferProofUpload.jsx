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
 * la del alta (`RegisterMembershipConfirmation`), que hasta ahora mostraba los
 * datos bancarios sin ninguna forma de adjuntar el ticket.
 */
export default function TransferProofUpload({ orderId, onUploaded }) {
  const { t } = useI18n()
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')

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
      await registerAthletePaymentProof(orderId, storagePath)
      setState('done')
      onUploaded?.()
    } catch (uploadError) {
      setError(uploadError?.message ?? t('account.membership.proofError'))
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <p className="account-transfer-proof__done" role="status">
        <Check size={15} aria-hidden />
        {t('account.membership.proofUploaded')}
      </p>
    )
  }

  return (
    <div className="account-transfer-proof">
      {/* El input va primero para que el foco de teclado pueda pintarse sobre
          el label, que es el control visible. */}
      <input
        id={`proof-${orderId}`}
        className="account-transfer-proof__input"
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        disabled={state === 'uploading'}
        onChange={handleFile}
      />
      <label className="account-transfer-proof__label" htmlFor={`proof-${orderId}`}>
        <Upload size={15} aria-hidden />
        {state === 'uploading'
          ? t('account.membership.proofUploading')
          : t('account.membership.proofAction')}
      </label>
      <p className="account-transfer-proof__hint">{t('account.membership.proofHint')}</p>
      {error ? (
        <p className="account-transfer-proof__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
