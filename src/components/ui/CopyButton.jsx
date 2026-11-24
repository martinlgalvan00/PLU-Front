import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import '../../styles/components/copy-button.css'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Botón de copiar para un dato de pago (alias, CBU, referencia, monto).
 * Copiar en vez de tipear es lo que evita mandar la plata a otra cuenta.
 * El estado "Copiado" se anuncia por `aria-live` y dura 1,6 s.
 */
export default function CopyButton({ value, field }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      className="copy-button"
      data-copied={copied || undefined}
      aria-label={
        copied
          ? t('account.membership.transferCopied')
          : t('account.membership.transferCopyField', { field })
      }
      onClick={() => void copy()}
    >
      {copied ? (
        <Check aria-hidden size={15} strokeWidth={1.9} />
      ) : (
        <Copy aria-hidden size={15} strokeWidth={1.75} />
      )}
      <span aria-live="polite" className="copy-button__label">
        {copied ? t('account.membership.transferCopied') : t('account.membership.transferCopy')}
      </span>
    </button>
  )
}
