import '../../styles/components/page-error-state.css'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import Button from './Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Estado de fallo de una vista. Composición editorial (regla + eyebrow +
 * título + acción), sin card: el shell sigue montado y solo degrada el área
 * de contenido, así que la pantalla no debe leerse como una tarjeta suelta.
 *
 * El detalle técnico solo aparece en dev; en producción el visitante ve el
 * mensaje institucional y las dos salidas.
 */
export default function PageErrorState({ error, onRetry, onGoHome }) {
  const { t } = useI18n()
  const detail = import.meta.env.DEV ? String(error?.stack || error?.message || error || '') : ''

  return (
    <main className="page-error-state" role="alert" aria-live="assertive">
      <div className="page-error-state__inner">
        <p className="page-error-state__eyebrow">
          <TriangleAlert aria-hidden size={13} />
          {t('pageError.eyebrow')}
        </p>
        <h1 className="page-error-state__title">{t('pageError.title')}</h1>
        <p className="page-error-state__lead">{t('pageError.lead')}</p>
        <div
          className="page-error-state__actions"
          role="group"
          aria-label={t('pageError.actionsAria')}
        >
          <Button onClick={onRetry}>
            <RotateCcw size={16} aria-hidden />
            {t('pageError.retry')}
          </Button>
          {onGoHome ? (
            <Button variant="outline" onClick={onGoHome}>
              {t('pageError.home')}
            </Button>
          ) : null}
        </div>
        {detail ? (
          <details className="page-error-state__detail">
            <summary>{t('pageError.detail')}</summary>
            <pre>{detail}</pre>
          </details>
        ) : null}
      </div>
    </main>
  )
}
