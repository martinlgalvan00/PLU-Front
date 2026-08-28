import { useId } from 'react'
import { createPortal } from 'react-dom'
import { MessageSquare } from 'lucide-react'
import Button from '../ui/Button.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import ObservationsThread from './ObservationsThread.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminModal } from './useAdminModal.js'

/**
 * El hilo de observaciones de una inscripción, desde la lista.
 *
 * Existe para que anotar no cueste entrar a la ficha del atleta: quien está
 * revisando la bandeja tiene el caso adelante y necesita dejar escrito lo que
 * acaba de averiguar, no navegar a otra pantalla y volver.
 *
 * Reusa `ObservationsThread` entero — el mismo hilo que muestra la ficha, con
 * las mismas acciones. Dos lugares para leer lo mismo, una sola implementación.
 */
export default function ObservationsDialog({
  registration,
  canWrite = false,
  onClose,
  onChange,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useAdminModal(onClose)

  if (!registration) return null

  return createPortal(
    <div className="admin-status-dialog">
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.observations.close')}
        onClick={onClose}
      />
      <section
        ref={panelRef}
        className="admin-status-dialog__panel admin-observations-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="admin-status-dialog__head">
          <span className="admin-status-dialog__icon" aria-hidden>
            <MessageSquare size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.observations.dialogTitle')}</h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {t('admin.observations.dialogLead')}
            </p>
          </div>
        </header>

        <dl className="admin-status-dialog__meta">
          <div>
            <dt>{t('admin.registrationStatus.athlete')}</dt>
            <dd>{registration.athlete}</dd>
          </div>
          <div>
            <dt>{t('admin.registrationStatus.event')}</dt>
            <dd>{registration.event}</dd>
          </div>
          <div>
            <dt>{t('admin.registrationStatus.current')}</dt>
            <dd>
              <StatusBadge value={registration.status} />
            </dd>
          </div>
        </dl>

        <ObservationsThread
          canWrite={canWrite}
          entityId={registration.id}
          entityType="registration"
          onChange={onChange}
        />

        <div className="admin-status-dialog__actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('admin.observations.close')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
