import { useEffect, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { env } from '../../config/env.js'
import TransferProofUpload from '../ui/TransferProofUpload.jsx'
import { usePaymentModal } from './usePaymentModal.js'
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
 * Recibo de transferencia + comprobante. Lo usan la afiliación de cuenta y
 * el checkout de inscripción: mismos datos bancarios, copy distinto.
 */
export default function TransferPayModal({
  athlete,
  amount,
  currency = 'ARS',
  onClose,
  orderId,
  purpose = 'membership',
  channel = 'bank_transfer',
}) {
  const { t, locale } = useI18n()
  const panelRef = usePaymentModal(onClose)
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
    <div className="account-payment-modal__overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={panelRef}
        aria-labelledby="transfer-title"
        aria-describedby="transfer-verify"
        aria-modal="true"
        className="account-payment-modal account-payment-modal--transfer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="account-payment-modal__header">
          <div className="account-transfer-receipt__heading">
            <h2 id="transfer-title">
              {isWise
                ? t('account.membership.transferWiseTitle')
                : isCompetition
                  ? t('pages.register.transferTitle')
                  : t('account.membership.transferTitle')}
            </h2>
            <p className="account-transfer-receipt__total">
              <span className="visually-hidden">{t('account.membership.transferAmount')}</span>
              <strong>{money(amount, locale, currency)}</strong>
            </p>
          </div>
          <button
            type="button"
            className="account-payment-modal__close"
            onClick={onClose}
            aria-label={t('account.membership.transferClose')}
          >
            <X size={18} />
          </button>
        </header>
        <div className="account-transfer-receipt">
          <dl className="account-transfer-data account-transfer-data--receipt">
            <div className="account-transfer-data__row--alias">
              <dt>{t(isWise ? 'account.membership.transferWiseEmail' : 'account.membership.transferAlias')}</dt>
              {alias !== askAdmin ? (
                <CopyableValue
                  value={alias}
                  copyLabel={copyLabel}
                  copiedLabel={copiedLabel}
                  copyAria={copyAria(isWise ? 'account.membership.transferWiseEmail' : 'account.membership.transferAlias')}
                  meta={isWise ? undefined : t('account.membership.transferAccountValue')}
                />
              ) : (
                <dd>{alias}</dd>
              )}
            </div>
            {cbu ? (
              <div>
                <dt>{t(isWise ? 'account.membership.transferWiseSwiftIban' : 'account.membership.transferCbu')}</dt>
                <CopyableValue
                  value={cbu}
                  copyLabel={copyLabel}
                  copiedLabel={copiedLabel}
                  copyAria={copyAria(isWise ? 'account.membership.transferWiseSwiftIban' : 'account.membership.transferCbu')}
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
          <p id="transfer-verify" className="account-transfer-warning" role="note">
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
          <TransferProofUpload notes={notes} orderId={orderId} />
        ) : (
          <p className="account-payment-modal__footnote">
            {isCompetition
              ? t('pages.register.transferHint')
              : t('account.membership.transferHint')}
          </p>
        )}
        <button type="button" className="account-secondary-action" onClick={onClose}>
          {t('account.membership.transferUnderstood')}
        </button>
      </section>
    </div>
  )
}
