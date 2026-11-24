import { Eye, Globe } from 'lucide-react'
import { MIN_ATHLETES_FOR_RANGES } from '../../../lib/publicSchedule.js'

/**
 * PublishToggle — PLU ARG
 *
 * Interruptor de la grilla en el sitio oficial. Es una acción hacia afuera, así
 * que dice con todas las letras qué se publica (tandas, tablado, horario y
 * composición) y qué no (nombres): quien lo prende no tiene que adivinar.
 *
 * Sin tablados ni tandas no hay nada que mostrar; igual se puede dejar prendido
 * de antemano, y el sitio simplemente no pinta la sección hasta que haya datos.
 *
 * "Ver como público" abre la vista previa: es de solo lectura, así que está
 * disponible aunque quien mira no pueda publicar.
 */
export default function PublishToggle({
  busy,
  canEdit,
  eventPublished,
  onChange,
  onPreview,
  value,
  t,
}) {
  const disabled = !canEdit || busy
  return (
    <div className="admin-board__publish">
      <span className="admin-board__panel-icon" aria-hidden>
        <Globe size={15} strokeWidth={1.8} />
      </span>
      <div className="admin-board__publish-copy">
        <p className="admin-board__publish-title" id="board-publish-label">
          {t('admin.board.publishTitle')}
        </p>
        <p className="admin-board__publish-hint" id="board-publish-hint" key={value ? 'on' : 'off'}>
          {value
            ? t('admin.board.publishOnHint')
            : t('admin.board.publishOffHint', { min: MIN_ATHLETES_FOR_RANGES })}
        </p>
        {value && eventPublished === false ? (
          <p className="admin-board__publish-warn" role="status">
            {t('admin.board.publishEventHidden')}
          </p>
        ) : null}
      </div>
      {onPreview ? (
        <button type="button" className="admin-board__preview-btn" onClick={onPreview}>
          <Eye size={15} strokeWidth={1.8} aria-hidden />
          {t('admin.board.publicPreviewOpen')}
        </button>
      ) : null}
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby="board-publish-label"
        aria-describedby="board-publish-hint"
        className={`admin-board__switch${value ? ' is-on' : ''}`}
        disabled={disabled}
        aria-busy={busy || undefined}
        onClick={() => onChange(!value)}
      >
        <span className="admin-board__switch-state" key={value ? 'on' : 'off'}>
          {value ? t('admin.board.publishOn') : t('admin.board.publishOff')}
        </span>
        <span className="admin-board__switch-track" aria-hidden>
          <span className="admin-board__switch-thumb" />
        </span>
      </button>
    </div>
  )
}
