import { createPortal } from 'react-dom'
import { IdCard, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import AdminMembershipCredential from './AdminMembershipCredential.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * MembershipCredentialModal — PLU ARG
 *
 * Overlay para ver y reemitir la credencial de un socio desde Afiliaciones.
 * Antes vivía debajo de la tabla y empujaba el listado; el QR pide foco
 * puntual, no un panel colgado al final del scroll.
 */
export default function MembershipCredentialModal({
  membershipId,
  athleteName,
  canRotate = false,
  onClose,
}) {
  const { t } = useI18n()
  const panelRef = useAdminModal(onClose, { active: Boolean(membershipId) })

  if (!membershipId) return null

  return createPortal(
    <div className="membership-credential-modal">
      <button
        type="button"
        className="membership-credential-modal__backdrop"
        aria-label={t('common.cancel')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="membership-credential-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-credential-modal-title"
      >
        <header className="membership-credential-modal__head">
          <div className="membership-credential-modal__who">
            <span className="membership-credential-modal__eyebrow">
              <IdCard size={13} aria-hidden />
              {t('admin.sections.memberships.credentialTitle')}
            </span>
            <h2
              id="membership-credential-modal-title"
              className="membership-credential-modal__title"
            >
              {athleteName || t('admin.sections.memberships.credentialFallbackName')}
            </h2>
            <p className="membership-credential-modal__lead">
              {t('admin.sections.memberships.credentialLead')}
            </p>
          </div>
          <button
            type="button"
            className="membership-credential-modal__close"
            onClick={onClose}
            aria-label={t('admin.sections.memberships.credentialClose')}
          >
            <X size={16} />
          </button>
        </header>

        <AdminMembershipCredential
          membershipId={membershipId}
          canRotate={canRotate}
          layout="modal"
        />
      </div>
    </div>,
    document.body,
  )
}
