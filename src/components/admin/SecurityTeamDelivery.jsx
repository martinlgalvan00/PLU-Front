import { useState } from 'react'
import { Check, Copy, ExternalLink, KeyRound, MailCheck, QrCode, TriangleAlert } from 'lucide-react'
import { formatSecurityAccessList } from '../../services/securityTeamService.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

async function copyText(text) {
  await navigator.clipboard.writeText(text)
}

export default function SecurityTeamDelivery({ result, onOpenCredential, onClose }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState('')

  async function handleCopy(key, value) {
    try {
      await copyText(value)
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      // El valor permanece visible para copia manual.
    }
  }

  const created = result?.created ?? []
  const skipped = result?.skipped ?? []
  const accessReady = created.filter((item) => item.accessUrl)

  return (
    <section className="security-team-delivery" aria-labelledby="security-team-delivery-title" role="status">
      <div className="security-team-delivery__head">
        <span className="security-team-delivery__check"><Check size={17} aria-hidden /></span>
        <div>
          <span>{t('admin.eventEditor.security.deliveryDoneEyebrow')}</span>
          <h3 id="security-team-delivery-title">
            {created.length === 0
              ? t('admin.eventEditor.security.deliveryDoneTitleNone')
              : created.length === 1
              ? t('admin.eventEditor.security.deliveryDoneTitleOne')
              : t('admin.eventEditor.security.deliveryDoneTitleMany', { count: created.length })}
          </h3>
          <p>{t('admin.eventEditor.security.deliveryDoneLead')}</p>
        </div>
        <button type="button" onClick={onClose}>{t('admin.eventEditor.security.finish')}</button>
      </div>

      {accessReady.length > 1 && (
        <button
          type="button"
          className="security-team-delivery__copy-all"
          onClick={() => handleCopy('all', formatSecurityAccessList(accessReady))}
        >
          {copied === 'all' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied === 'all'
            ? t('admin.eventEditor.security.copied')
            : t('admin.eventEditor.security.copyAllLinks')}
        </button>
      )}

      <ul className="security-team-delivery__list">
        {created.map((item) => (
          <li key={item.user.id}>
            <div className="security-team-delivery__identity">
              <strong>{item.user.name}</strong>
              <span>{item.user.email}</span>
              {item.emailed && <small><MailCheck size={12} aria-hidden />{t('admin.eventEditor.security.emailSent')}</small>}
            </div>
            {item.accessUrl ? (
              <div className="security-team-delivery__access">
                <code>{item.accessUrl}</code>
                <div>
                  <button type="button" onClick={() => handleCopy(item.user.id, item.accessUrl)}>
                    {copied === item.user.id ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
                    {copied === item.user.id
                      ? t('admin.eventEditor.security.copied')
                      : t('admin.eventEditor.security.copyLink')}
                  </button>
                  <a href={item.accessUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} aria-hidden />
                    {t('admin.eventEditor.security.testAccess')}
                  </a>
                </div>
              </div>
            ) : (
              <div className="security-team-delivery__fallback">
                <TriangleAlert size={14} aria-hidden />
                <span>{t('admin.eventEditor.security.accessPending')}</span>
                <button type="button" onClick={() => onOpenCredential(item.user)}>
                  <QrCode size={13} aria-hidden />
                  {t('admin.eventEditor.security.generateNow')}
                </button>
                {item.tempPassword && (
                  <details>
                    <summary><KeyRound size={12} aria-hidden />{t('admin.eventEditor.security.backupPassword')}</summary>
                    <code>{item.tempPassword}</code>
                  </details>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {skipped.length > 0 && (
        <div className="security-team-delivery__skipped">
          <strong>
            {skipped.length === 1
              ? t('admin.eventEditor.security.skippedTitleOne')
              : t('admin.eventEditor.security.skippedTitleMany', { count: skipped.length })}
          </strong>
          <ul>
            {skipped.map((item) => (
              <li key={item.email}>{item.email} · {t(`admin.eventEditor.security.skipReason.${item.reason}`)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
