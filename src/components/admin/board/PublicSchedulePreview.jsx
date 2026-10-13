import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Eye, RefreshCw } from 'lucide-react'
import Button from '../../ui/Button.jsx'
import PublicEventSchedule from '../../ui/PublicEventSchedule.jsx'
import { useI18n } from '../../../i18n/I18nProvider.jsx'
import { formatScheduleTime } from '../../../lib/eventSchedule.js'
import {
  MIN_ATHLETES_FOR_RANGES,
  boardToPublicPayload,
  normalizePublicSchedule,
  publicScheduleChecks,
} from '../../../lib/publicSchedule.js'
import { useAdminModal } from '../useAdminModal.js'

/** Orden en que se listan los puntos a revisar: del que más cambia lo que se ve al que menos. */
const CHECK_KEYS = ['noPlatform', 'noStart', 'empty', 'small']

/** Casa con `--motion-fast`: lo que dura la salida antes de desmontar. */
const EXIT_MS = 160

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

/**
 * PublicSchedulePreview — PLU ARG
 *
 * "Ver como público": la grilla con los datos de hoy, dibujada por el mismo
 * componente que usa el sitio. Se mira antes de prender la publicación (o con
 * ella prendida, para comprobar un cambio) en vez de publicar para enterarse.
 *
 * Se arma del tablero y solo con composición: no recibe nombres ni clubes, así
 * que no puede mostrar más de lo que mostraría el sitio.
 *
 * Entra y sale con la misma animación corta (opacidad y desplazamiento); al
 * cerrar se espera a que termine la salida antes de desmontar, salvo con
 * movimiento reducido. "Actualizar" vuelve a leer el tablero —otra persona de la
 * organización pudo cambiarlo— y dice a qué hora son los datos que se ven.
 */
export default function PublicSchedulePreview({
  board,
  loadedAt = null,
  onClose,
  onRefresh,
  published,
  t,
}) {
  const { locale } = useI18n()
  const titleId = useId()
  const descriptionId = useId()
  const bodyRef = useRef(null)
  const closeTimer = useRef(null)
  const firstLoad = useRef(true)
  const [closing, setClosing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const requestClose = useCallback(() => {
    if (closing) return
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setClosing(true)
    closeTimer.current = setTimeout(onClose, EXIT_MS)
  }, [closing, onClose])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const panelRef = useAdminModal(requestClose)
  const schedule = useMemo(() => normalizePublicSchedule(boardToPublicPayload(board)), [board])
  const checks = useMemo(() => publicScheduleChecks(board), [board])
  const pending = CHECK_KEYS.filter((key) => checks[key] > 0)

  // Al llegar datos nuevos el contenido se reasienta (opacidad, una vez): se ve
  // que "Actualizar" hizo algo aunque nada haya cambiado de lugar.
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    const node = bodyRef.current
    if (!node?.animate || prefersReducedMotion()) return
    node.animate([{ opacity: 0.4 }, { opacity: 1 }], {
      duration: 240,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    })
  }, [loadedAt])

  async function refresh() {
    if (refreshing || !onRefresh) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const loadedTime = loadedAt ? formatScheduleTime(new Date(loadedAt).toISOString(), locale) : ''

  return createPortal(
    <div
      className="admin-status-dialog admin-board__preview"
      data-state={closing ? 'closing' : 'open'}
    >
      <button
        type="button"
        className="admin-status-dialog__backdrop"
        aria-label={t('admin.board.publicPreviewClose')}
        onClick={requestClose}
      />
      <section
        ref={panelRef}
        className="admin-status-dialog__panel admin-board__preview-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="admin-status-dialog__head">
          <span className="admin-status-dialog__icon" aria-hidden>
            <Eye size={18} />
          </span>
          <div>
            <h2 id={titleId}>{t('admin.board.publicPreviewTitle')}</h2>
            <p id={descriptionId} className="admin-status-dialog__lead">
              {published
                ? t('admin.board.publicPreviewLeadOn')
                : t('admin.board.publicPreviewLeadOff')}
            </p>
          </div>
        </header>

        {onRefresh ? (
          <div className="admin-board__preview-bar">
            <span className="admin-board__preview-stamp" aria-live="polite">
              {loadedTime ? t('admin.board.publicPreviewUpdated', { time: loadedTime }) : ''}
            </span>
            <button
              type="button"
              className="admin-board__preview-refresh"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing || undefined}
            >
              <RefreshCw
                className={refreshing ? 'admin-board__spin' : undefined}
                size={14}
                strokeWidth={1.8}
                aria-hidden
              />
              {refreshing
                ? t('admin.board.publicPreviewRefreshing')
                : t('admin.board.publicPreviewRefresh')}
            </button>
          </div>
        ) : null}

        <div className="admin-board__preview-body" ref={bodyRef}>
          {schedule.hasContent ? (
            <PublicEventSchedule schedule={schedule} />
          ) : (
            <p className="admin-board__empty admin-board__empty--inline">
              {t('admin.board.publicPreviewEmpty')}
            </p>
          )}
        </div>

        {pending.length > 0 ? (
          <div className="admin-board__preview-checks">
            <h3 className="admin-board__preview-checks-title">
              {t('admin.board.publicPreviewChecksTitle')}
            </h3>
            <ul>
              {pending.map((key) => (
                <li key={key}>
                  {t(`admin.board.publicPreviewCheck_${key}`, {
                    count: checks[key],
                    min: MIN_ATHLETES_FOR_RANGES,
                  })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="admin-board__preview-note">
          {t('admin.board.publicPreviewNote', { min: MIN_ATHLETES_FOR_RANGES })}
        </p>

        <div className="admin-status-dialog__actions">
          <Button type="button" variant="secondary" onClick={requestClose}>
            {t('admin.board.publicPreviewClose')}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
