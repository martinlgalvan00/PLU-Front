import { useId, useRef } from 'react'
import { Dumbbell } from 'lucide-react'
import Button from './Button.jsx'
import PublicDialogFrame from './PublicDialogFrame.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/components/gym-confirmation.css'

export default function GymNameConfirmationDialog({
  open = true,
  gymName,
  onCancel,
  onConfirm,
}) {
  const { t } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const heldName = useRef(gymName)
  if (gymName) heldName.current = gymName
  const name = heldName.current

  return (
    <PublicDialogFrame
      open={open}
      onClose={onCancel}
      portal
      overlayClassName="gym-confirmation-dialog"
      panelClassName="gym-confirmation-dialog__panel"
      labelledBy={titleId}
      describedBy={descriptionId}
    >
      <span className="gym-confirmation-dialog__icon" aria-hidden>
        <Dumbbell size={19} />
      </span>
      <div className="gym-confirmation-dialog__copy">
        <h2 id={titleId}>{t('pages.register.gymConfirmation.title')}</h2>
        <p id={descriptionId}>
          {t('pages.register.gymConfirmation.description', { gym: name })}
        </p>
        <p className="gym-confirmation-dialog__name">{name}</p>
        <p className="gym-confirmation-dialog__warning">
          {t('pages.register.gymConfirmation.warning')}
        </p>
      </div>
      <div className="gym-confirmation-dialog__actions">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('pages.register.gymConfirmation.edit')}
        </Button>
        <Button type="button" onClick={onConfirm}>
          {t('pages.register.gymConfirmation.confirm')}
        </Button>
      </div>
    </PublicDialogFrame>
  )
}
