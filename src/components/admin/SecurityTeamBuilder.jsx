import { useState } from 'react'
import { ClipboardPaste, Mail, Plus, ShieldCheck, Trash2, Users } from 'lucide-react'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function SecurityTeamBuilder({
  members,
  errors,
  sendEmail,
  submitting,
  onAdd,
  onChange,
  onImport,
  onRemove,
  onSendEmailChange,
  onSubmit,
}) {
  const { t } = useI18n()
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState('')

  function handleImport() {
    const result = onImport(importText)
    if (!result.ok) {
      setImportError(result.message)
      return
    }
    setImportText('')
    setImportError('')
    setImportOpen(false)
  }

  return (
    <section className="security-team-builder" aria-labelledby="security-team-builder-title">
      <div className="security-team-builder__head">
        <div>
          <span>{t('admin.eventEditor.security.builderEyebrow')}</span>
          <h3 id="security-team-builder-title">{t('admin.eventEditor.security.builderTitle')}</h3>
          <p>{t('admin.eventEditor.security.builderLead')}</p>
        </div>
        <span className="security-team-builder__count">
          <Users size={13} aria-hidden />
          {members.length === 1
            ? t('admin.eventEditor.security.builderCountOne')
            : t('admin.eventEditor.security.builderCountMany', { count: members.length })}
        </span>
      </div>

      <div className="security-team-builder__rows">
        {members.map((member, index) => {
          const rowErrors = errors[member.id] ?? {}
          return (
            <div className="security-team-builder__row" key={member.id}>
              <span className="security-team-builder__index" aria-hidden>
                {index + 1}
              </span>
              <label>
                <span>{t('admin.users.name')}</span>
                <input
                  name={`security-name-${member.id}`}
                  value={member.name}
                  onChange={(event) => onChange(member.id, 'name', event.target.value)}
                  placeholder={t('admin.users.namePlaceholder')}
                  autoComplete="off"
                  aria-invalid={Boolean(rowErrors.name)}
                />
                {rowErrors.name && <small>{t('admin.users.errorName')}</small>}
              </label>
              <label>
                <span>{t('admin.users.email')}</span>
                <input
                  name={`security-email-${member.id}`}
                  type="email"
                  value={member.email}
                  onChange={(event) => onChange(member.id, 'email', event.target.value)}
                  placeholder="nombre@empresa.com"
                  autoComplete="off"
                  aria-invalid={Boolean(rowErrors.email)}
                />
                {rowErrors.email && (
                  <small>
                    {rowErrors.email === 'duplicate'
                      ? t('admin.eventEditor.security.duplicateEmail')
                      : t('admin.users.errorEmail')}
                  </small>
                )}
              </label>
              <button
                type="button"
                className="security-team-builder__remove"
                onClick={() => onRemove(member.id)}
                disabled={members.length === 1}
                aria-label={t('admin.eventEditor.security.removePerson', { number: index + 1 })}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      <div className="security-team-builder__tools">
        <button type="button" onClick={onAdd}>
          <Plus size={14} aria-hidden />
          {t('admin.eventEditor.security.addAnother')}
        </button>
        <button
          type="button"
          onClick={() => setImportOpen((current) => !current)}
          aria-expanded={importOpen}
        >
          <ClipboardPaste size={14} aria-hidden />
          {t('admin.eventEditor.security.pasteList')}
        </button>
      </div>

      {importOpen && (
        <div className="security-team-builder__import">
          <label>
            <span>{t('admin.eventEditor.security.importLabel')}</span>
            <textarea
              rows={5}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={t('admin.eventEditor.security.importPlaceholder')}
            />
            <small>{t('admin.eventEditor.security.importHint')}</small>
          </label>
          {importError && <p role="alert">{importError}</p>}
          <div>
            <button type="button" onClick={() => setImportOpen(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={handleImport}>
              {t('admin.eventEditor.security.importAction')}
            </button>
          </div>
        </div>
      )}

      <label className="security-team-builder__delivery">
        <input
          type="checkbox"
          checked={sendEmail}
          onChange={(event) => onSendEmailChange(event.target.checked)}
        />
        <span className="security-team-builder__delivery-icon">
          <Mail size={15} aria-hidden />
        </span>
        <span>
          <strong>{t('admin.eventEditor.security.deliveryTitle')}</strong>
          <small>{t('admin.eventEditor.security.deliveryLead')}</small>
        </span>
        <span className="security-team-builder__recommended">
          {t('admin.eventEditor.security.recommended')}
        </span>
      </label>

      <div className="security-team-builder__submit">
        <div>
          <ShieldCheck size={15} aria-hidden />
          <span>{t('admin.eventEditor.security.scopeReminder')}</span>
        </div>
        <Button type="button" disabled={submitting} onClick={onSubmit}>
          {submitting
            ? t('admin.eventEditor.security.creatingTeam')
            : members.length === 1
              ? t('admin.eventEditor.security.createTeamOne')
              : t('admin.eventEditor.security.createTeamMany', { count: members.length })}
        </Button>
      </div>
    </section>
  )
}
