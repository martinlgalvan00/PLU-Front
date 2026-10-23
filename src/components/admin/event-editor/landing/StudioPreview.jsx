import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  STUDIO_DEVICE_WIDTHS,
  STUDIO_STAGE_PADDING,
  studioPreviewScale,
} from '../../../../lib/landingStudioLayout.js'
import PreviewFrame from './PreviewFrame.jsx'

const EventLandingRenderer = lazy(() => import('../../../events/EventLandingRenderer.jsx'))

function noop() {}

/** Estilos que se inyectan en la vista previa: contorno al pasar y al bloque elegido. */
function selectionStyles(selectedId) {
  // Los ids de bloque ya vienen validados (`[a-z0-9-]`, ver `normalizeLandingBlock`):
  // van tal cual al selector.
  const selected = /^[a-z0-9-]+$/.test(selectedId ?? '') ? `#bloque-${selectedId}` : null
  return `
    .event-builder [id^="bloque-"] {
      cursor: pointer;
      outline: 2px solid transparent;
      outline-offset: -2px;
      transition: outline-color 120ms ease-out;
    }
    .event-builder [id^="bloque-"]:hover {
      outline-color: color-mix(in srgb, var(--color-brand-celeste) 55%, transparent);
    }
    ${selected ? `${selected}, ${selected}:hover { outline-color: var(--color-brand-celeste); }` : ''}
    @media (prefers-reduced-motion: reduce) {
      .event-builder [id^="bloque-"] { transition: none; }
    }
  `
}

/**
 * Vista previa del editor visual: la landing real (la misma página que ve el
 * público) dibujada al ancho del dispositivo elegido y escalada para entrar en
 * el escenario.
 *
 * Con `selectable` (Constructor) un clic sobre un bloque lo elige en vez de
 * activar sus botones o links; el bloque elegido lleva un contorno. Cuando la
 * elección viene del panel (`scrollToken` cambia), la página se desplaza hasta
 * ese bloque.
 */
export default function StudioPreview({
  event,
  device = 'desktop',
  selectable = false,
  selectedId = null,
  scrollToken = 0,
  onSelectBlock,
  title,
}) {
  const stageRef = useRef(null)
  const docRef = useRef(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const node = stageRef.current
    if (!node) return undefined
    const measure = () => setStage({ width: node.clientWidth, height: node.clientHeight })
    measure()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!scrollToken || !selectedId) return
    const target = docRef.current?.getElementById(`bloque-${selectedId}`)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target?.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [scrollToken, selectedId])

  const deviceWidth = STUDIO_DEVICE_WIDTHS[device] ?? STUDIO_DEVICE_WIDTHS.desktop
  const scale = studioPreviewScale(stage.width, deviceWidth)
  const frameHeight = Math.max(320, (stage.height - STUDIO_STAGE_PADDING * 2) / scale)

  // Captura: ningún link ni botón de la página saca al staff del editor. En el
  // Constructor el clic elige el bloque que está debajo.
  function handleClickCapture(clickEvent) {
    const target = clickEvent.target
    if (selectable && onSelectBlock) {
      const block = target.closest?.('[id^="bloque-"]')
      if (block) {
        clickEvent.preventDefault()
        clickEvent.stopPropagation()
        onSelectBlock(block.id.slice('bloque-'.length), 'preview')
        return
      }
    }
    const anchor = target.closest?.('a[href]')
    if (anchor && !anchor.getAttribute('href').startsWith('#')) clickEvent.preventDefault()
  }

  const shownEvents = useMemo(() => [event], [event])

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div ref={stageRef} className="admin-landing-studio__stage" onClickCapture={handleClickCapture}>
      <div
        className={`admin-landing-studio__device admin-landing-studio__device--${device}`}
        style={{ width: deviceWidth * scale, height: frameHeight * scale }}
      >
        <PreviewFrame
          className="admin-landing-studio__frame"
          style={{
            width: deviceWidth,
            height: frameHeight,
            transform: scale === 1 ? undefined : `scale(${scale})`,
          }}
          title={title}
          onDocument={(doc) => {
            docRef.current = doc
          }}
        >
          {selectable ? <style>{selectionStyles(selectedId)}</style> : null}
          <Suspense fallback={<p className="admin-landing-preview__loading">…</p>}>
            <EventLandingRenderer
              event={event}
              events={shownEvents}
              eventSlug={event?.slug}
              onNavigate={noop}
              onSelectEvent={noop}
              preview
            />
          </Suspense>
        </PreviewFrame>
      </div>
    </div>
  )
}
