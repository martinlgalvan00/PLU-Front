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
  const holder = (isWise ? env.payments.wiseHolder : env.payments.transferHolder) || askAdmin
  const reference = `${athlete.documentId} · ${athlete.fullName}`
  const copyLabel = t('account.membership.transferCopy')
  const copiedLabel = t('account.membership.transferCopied')

  const wiseRows = [
    { labelKey: 'account.membership.transferHolder', value: holder },
    {
      labelKey: 'account.membership.transferWiseAccountType',
      value: env.payments.wiseAccountType || askAdmin,
    },
    {
      labelKey: 'account.membership.transferWiseRoutingNumber',
      value: env.payments.wiseRoutingNumber || askAdmin,
    },
    {
      labelKey: 'account.membership.transferWiseAccountNumber',
      value: env.payments.wiseAccount || askAdmin,
    },
    {
      labelKey: 'account.membership.transferWiseAddress',
      value: env.payments.wiseAddress || askAdmin,
    },
    {
      labelKey: 'account.membership.transferWiseSwiftBic',
      value: env.payments.wiseSwiftOrIban || askAdmin,
    },
    ...(env.payments.wiseEmail
      ? [{ labelKey: 'account.membership.transferWiseEmail', value: env.payments.wiseEmail }]
      : []),
  ]

  const bankRows = [
    {
      labelKey: 'account.membership.transferAlias',
      value: env.payments.transferAlias || askAdmin,
      meta: t('account.membership.transferAccountValue'),
      className: 'account-transfer-data__row--alias',
    },
    ...(env.payments.transferCbu
      ? [{ labelKey: 'account.membership.transferCbu', value: env.payments.transferCbu }]
      : []),
    { labelKey: 'account.membership.transferHolder', value: holder },
  ]

  const transferRows = isWise ? wiseRows : bankRows

  function copyAria(fieldKey) {
    return t('account.membership.transferCopyField', { field: t(fieldKey) })
  }

  return (
    <>
      <div className="account-transfer-receipt">
        <dl className="account-transfer-data account-transfer-data--receipt">
          {transferRows.map((row) => (
            <div className={row.className} key={row.labelKey}>
              <dt>{t(row.labelKey)}</dt>
              {row.value !== askAdmin ? (
                <CopyableValue
                  value={row.value}
                  copyLabel={copyLabel}
                  copiedLabel={copiedLabel}
                  copyAria={copyAria(row.labelKey)}
                  meta={row.meta}
                />
              ) : (
                <dd>{row.value}</dd>
              )}
            </div>
          ))}
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
          {t(
            isWise
              ? 'account.membership.transferWiseVerifyWarning'
              : 'account.membership.transferVerifyWarning',
          )}
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
