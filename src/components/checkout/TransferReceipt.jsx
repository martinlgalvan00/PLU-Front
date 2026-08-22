import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { env } from '../../config/env.js'
import TransferProofUpload from '../ui/TransferProofUpload.jsx'
import ManualPaymentConfirmation from './ManualPaymentConfirmation.jsx'
// Las reglas del recibo viven acá y las alcanzan dos scopes: el modal
// (`.account-payment-modal--transfer`) y la liquidación en línea de la ficha de
// la oferta (`.account-offer__manual`). Se importa desde el componente y no
// sólo desde el modal para que el recibo nunca se renderice sin sus estilos.
import '../../styles/components/transfer-pay-modal.css'

function CopyableValue({ value, copyLabel, copiedLabel, copyAria, meta }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <dd className="account-transfer-data__value">
      <span className="account-transfer-data__text">
        {value}
        {meta ? <span className="account-transfer-data__meta">{meta}</span> : null}
      </span>
      <button
        type="button"
        className="account-transfer-data__copy"
        onClick={handleCopy}
        aria-label={copied ? copiedLabel : copyAria}
        data-tooltip={copied ? copiedLabel : copyLabel}
      >
        {copied ? (
          <Check size={16} strokeWidth={1.75} aria-hidden />
        ) : (
          <Copy size={16} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </dd>
  )
}

/**
 * Datos de la transferencia y envío del comprobante, sin envoltorio.
 *
 * Vive aparte de `TransferPayModal` porque el mismo recibo se liquida en dos
 * formas distintas: como modal encima del checkout (afiliación e inscripción,
 * donde el escritorio de cobro ya ocupa la pantalla) y en línea dentro de la
 * ficha de la oferta exclusiva, que se paga sin salir de la pestaña. Duplicarlo
 * dejaría dos juegos de datos bancarios que se pueden desincronizar, que es
 * exactamente el error que no se puede cometer con un alias de cobro.
 *
 * No confirma nada: el comprobante lo valida Finanzas y la acreditación llega
 * por el mismo camino que el resto de los pagos manuales.
 */
export default function TransferReceipt({
  athlete,
  orderId = null,
  channel = 'bank_transfer',
  purpose = 'membership',
  warningId = 'transfer-verify',
  financingAllowed = false,
  manualPaymentDeclaredAt = null,
  financedEntitlementsAt = null,
  onConfirmed,
}) {
  const { t } = useI18n()
  const [notes, setNotes] = useState('')
  const isCompetition = purpose === 'competition'
  const isWise = channel === 'wise_transfer'
  const askAdmin = t('account.membership.transferAskAdmin')
  const alias = (isWise ? env.payments.wiseEmail : env.payments.transferAlias) || askAdmin
  const holder = (isWise ? env.payments.wiseHolder : env.payments.transferHolder) || askAdmin
  const cbu = isWise ? env.payments.wiseSwiftOrIban : env.payments.transferCbu
  const reference = `${athlete.documentId} · ${athlete.fullName}`
  const copyLabel = t('account.membership.transferCopy')
  const copiedLabel = t('account.membership.transferCopied')

  function copyAria(fieldKey) {
    return t('account.membership.transferCopyField', { field: t(fieldKey) })
  }

  return (
    <>
      <div className="account-transfer-receipt">
        <dl className="account-transfer-data account-transfer-data--receipt">
          <div className="account-transfer-data__row--alias">
            <dt>
              {t(
                isWise
                  ? 'account.membership.transferWiseEmail'
                  : 'account.membership.transferAlias',
              )}
            </dt>
            {alias !== askAdmin ? (
              <CopyableValue
                value={alias}
                copyLabel={copyLabel}
                copiedLabel={copiedLabel}
                copyAria={copyAria(
                  isWise
                    ? 'account.membership.transferWiseEmail'
                    : 'account.membership.transferAlias',
                )}
                meta={isWise ? undefined : t('account.membership.transferAccountValue')}
              />
            ) : (
              <dd>{alias}</dd>
            )}
          </div>
          {cbu ? (
            <div>
              <dt>
                {t(
                  isWise
                    ? 'account.membership.transferWiseSwiftIban'
                    : 'account.membership.transferCbu',
                )}
              </dt>
              <CopyableValue
                value={cbu}
                copyLabel={copyLabel}
                copiedLabel={copiedLabel}
                copyAria={copyAria(
                  isWise
                    ? 'account.membership.transferWiseSwiftIban'
                    : 'account.membership.transferCbu',
                )}
              />
            </div>
          ) : null}
          <div>
            <dt>{t('account.membership.transferHolder')}</dt>
            {holder !== askAdmin ? (
              <CopyableValue
                value={holder}
                copyLabel={copyLabel}
                copiedLabel={copiedLabel}
                copyAria={copyAria('account.membership.transferHolder')}
              />
            ) : (
              <dd>{holder}</dd>
            )}
          </div>
          <div>
            <dt>{t('account.membership.transferReference')}</dt>
            <CopyableValue
              value={reference}
              copyLabel={copyLabel}
              copiedLabel={copiedLabel}
              copyAria={copyAria('account.membership.transferReference')}
            />
          </div>
        </dl>
        <p id={warningId} className="account-transfer-warning" role="note">
          {t('account.membership.transferVerifyWarning')}
        </p>
      </div>
      <label className="account-transfer-notes">
        <span>{t('account.membership.transferNotesLabel')}</span>
        <textarea
          maxLength={300}
          placeholder={t('account.membership.transferNotesPlaceholder')}
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      {orderId ? (
        <>
          <TransferProofUpload notes={notes} orderId={orderId} />
          {!isWise ? (
            <ManualPaymentConfirmation
              channel={channel}
              financedEntitlementsAt={financedEntitlementsAt}
              financingAllowed={financingAllowed}
              manualPaymentDeclaredAt={manualPaymentDeclaredAt}
              orderId={orderId}
              onConfirmed={onConfirmed}
            />
          ) : null}
        </>
      ) : (
        <p className="account-payment-modal__footnote">
          {isCompetition ? t('pages.register.transferHint') : t('account.membership.transferHint')}
        </p>
      )}
    </>
  )
}
