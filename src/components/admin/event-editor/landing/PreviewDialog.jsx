import { lazy, Suspense, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import useModalDialog from '../../../../hooks/useModalDialog.js'
import { eventLandingFromEvent } from '../../../../lib/eventLanding.js'
import PreviewFrame from './PreviewFrame.jsx'
import Segmented from './Segmented.jsx'
import '../../../../styles/pages/admin-event-landing.css'

const EventLandingRenderer = lazy(() => import('../../../events/EventLandingRenderer.jsx'))

/** Ancho del marco por dispositivo (`null` = todo el ancho disponible). */
const DEVICES = [
  ['desktop', null],
  ['tablet', 768],
  ['mobile', 390],
]

function noop() {}

/**
 * Visor de la landing dentro de la plataforma. Muestra el borrador (con los
 * cambios sin guardar) con la misma página que ve el público. Si el interruptor
 * está apagado ofrece las dos caras: lo que ve hoy el público ("en
 * construcción") y la landing ya publicada.
 */
export default function EventLandingPreviewDialog({ event, onClose, t }) {
  const [mode, setMode] = useState('public')
  const [device, setDevice] = useState('desktop')
  const { panelRef, initialFocusRef, onKeyDown } = useModalDialog({ onClose })

  const landing = useMemo(() => eventLandingFromEvent(event), [event])
  const underConstruction = !landing.publicVisible
  const deviceWidth = DEVICES.find(([id]) => id === device)?.[1] ?? null

  // `public` respeta el interruptor; `published` fuerza la landing encendida.
  // Memoizado: un objeto nuevo en cada render volvería a montar toda la página.
  const shownEvent = useMemo(
    () =>
      mode === 'published' && underConstruction
        ? { ...event, landing: { ...landing, publicVisible: true } }
        : event,
    [mode, underConstruction, event, landing],
  )
  const shownEvents = useMemo(() => [shownEvent], [shownEvent])

  // La vista previa no navega: los links a otras rutas no sacan al staff del panel.
  function blockNavigation(clickEvent) {
    const anchor = clickEvent.target.closest?.('a[href]')
    if (anchor && !anchor.getAttribute('href').startsWith('#')) clickEvent.preventDefault()
  }

  return createPortal(
    <div
      ref={panelRef}
      className="admin-landing-preview"
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.eventEditor.landingPreviewTitle')}
      onKeyDown={onKeyDown}
    >
      <header className="admin-landing-preview__bar">
        <div className="admin-landing-preview__heading">
          <strong>{t('admin.eventEditor.landingPreviewTitle')}</strong>
          <small>
            {underConstruction && mode === 'public'
              ? t('admin.eventEditor.landingPreviewUnderConstruction')
              : t('admin.eventEditor.landingPreviewDraftNote')}
          </small>
        </div>

        {underConstruction ? (
          <Segmented
            label={t('admin.eventEditor.landingPreviewModes')}
            options={[
              ['public', t('admin.eventEditor.landingPreviewModePublic')],
              ['published', t('admin.eventEditor.landingPreviewModePublished')],
            ]}
            value={mode}
            onChange={setMode}
          />
        ) : null}

        <Segmented
          label={t('admin.eventEditor.landingPreviewDevices')}
          options={DEVICES.map(([id]) => [id, t(`admin.eventEditor.landingPreviewDevice_${id}`)])}
          value={device}
          onChange={setDevice}
        />

        <button
          ref={initialFocusRef}
          type="button"
          className="admin-landing-preview__close"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
          {t('admin.eventEditor.landingPreviewClose')}
        </button>
      </header>

      {/* El click se intercepta en captura para que ningún link saque al staff del panel. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className={`admin-landing-preview__stage${deviceWidth ? ' is-framed' : ''}`}
        onClickCapture={blockNavigation}
      >
        <PreviewFrame
          title={t('admin.eventEditor.landingPreviewTitle')}
          width={deviceWidth}
          onEscape={onClose}
        >
          <Suspense fallback={<p className="admin-landing-preview__loading">…</p>}>
            <EventLandingRenderer
              event={shownEvent}
              events={shownEvents}
              eventSlug={shownEvent?.slug}
              onNavigate={noop}
              onSelectEvent={noop}
              preview
            />
          </Suspense>
        </PreviewFrame>
      </div>
    </div>,
    document.body,
  )
}
