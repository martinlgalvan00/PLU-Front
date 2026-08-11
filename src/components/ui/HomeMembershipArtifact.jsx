import '../../styles/components/home-membership-artifacts.css'
import { useRef, useState } from 'react'

const KIND_BY_BENEFIT = {
  events: 'podium',
  credential: 'card',
  discounts: 'seal',
  results: 'medal',
  access: 'device',
  network: 'constellation',
}

/** Matriz 11×11: finders + datos (credencial). */
const QR_MATRIX = [
  [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0],
  [1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1],
]

function QrGlyph() {
  return (
    <svg viewBox="0 0 11 11" aria-hidden className="hm-artifact__qr-svg">
      {QR_MATRIX.flatMap((row, y) =>
        row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} rx={0.12} /> : null)),
      )}
    </svg>
  )
}

/** Resultados — medalla quieta, mark mínimo. Cinta arriba: silueta de
 * medalla inconfundible, distinta del sello (que no lleva cinta). */
function MedalBody() {
  return (
    <>
      <span className="hm-artifact__medal-ribbon" />
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--disc">
        <span className="hm-artifact__medal-ring" />
        <span className="hm-artifact__medal-core">
          <svg viewBox="0 0 48 48" aria-hidden className="hm-artifact__glyph">
            <path
              d="M8 24h6M34 24h6M14 20v8M34 20v8M14 24h20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="24" r="2.6" fill="currentColor" />
          </svg>
        </span>
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--disc">
        <span className="hm-artifact__medal-mark" />
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--disc" />
    </>
  )
}

/** Credencial digital — pase editorial con QR. */
function CardBody() {
  return (
    <>
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--card">
        <span className="hm-artifact__card-top">
          <span className="hm-artifact__card-brand">PLU</span>
          <span className="hm-artifact__card-year">26</span>
        </span>
        <span className="hm-artifact__qr">
          <QrGlyph />
        </span>
        <span className="hm-artifact__card-footer">
          <span className="hm-artifact__card-name" />
          <span className="hm-artifact__card-meta" />
        </span>
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--card">
        <span className="hm-artifact__card-chip" />
        <span className="hm-artifact__card-magstripe" />
        <span className="hm-artifact__card-back-mark" />
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--card" />
    </>
  )
}

/** Ahorro — sello de cera: borde orgánico (no un círculo perfecto) y una
 * gota inferior. Sin cinta — así no compite con la silueta de la medalla. */
function SealBody() {
  return (
    <>
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--seal">
        <span className="hm-artifact__seal-ring hm-artifact__seal-ring--outer" />
        <span className="hm-artifact__seal-ring" />
        <span className="hm-artifact__seal-copy">
          <span className="hm-artifact__seal-pct">%</span>
        </span>
        <span className="hm-artifact__seal-drip" />
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--seal">
        <span className="hm-artifact__seal-ring" />
        <span className="hm-artifact__medal-mark" />
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--seal" />
    </>
  )
}

/** Subite a la tarima — escenario lujoso, bajo y ancho. */
function PodiumBody() {
  return (
    <div className="hm-artifact__podium">
      <span className="hm-artifact__podium-bar hm-artifact__podium-bar--2" />
      <span className="hm-artifact__podium-bar hm-artifact__podium-bar--1">
        <span className="hm-artifact__podium-crest" />
      </span>
      <span className="hm-artifact__podium-bar hm-artifact__podium-bar--3" />
      <span className="hm-artifact__podium-deck" />
    </div>
  )
}

/** Todo en un panel — teléfono editorial con Dynamic Island. */
function DeviceBody() {
  return (
    <>
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--device">
        <span className="hm-artifact__device-frame">
          <span className="hm-artifact__device-screen">
            <span className="hm-artifact__device-island" />
            <span className="hm-artifact__device-status">
              <span className="hm-artifact__device-time">9:41</span>
              <span className="hm-artifact__device-signal" />
            </span>
            <span className="hm-artifact__device-ui">
              <span className="hm-artifact__device-brand">PLU</span>
              <span className="hm-artifact__device-row" />
              <span className="hm-artifact__device-row hm-artifact__device-row--short" />
              <span className="hm-artifact__device-card">
                <span className="hm-artifact__device-card-line" />
                <span className="hm-artifact__device-card-line hm-artifact__device-card-line--dim" />
              </span>
            </span>
            <span className="hm-artifact__device-home" />
          </span>
        </span>
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--device">
        <span className="hm-artifact__device-camera">
          <span className="hm-artifact__device-lens" />
          <span className="hm-artifact__device-lens hm-artifact__device-lens--sm" />
        </span>
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--device" />
    </>
  )
}

/** Red oficial — nodos conectados. El nodo superior es un chip de
 * calendario (no una esfera más): la pieza lee "red" y "calendario" a la
 * vez, como dice su propio copy ("Una red, un calendario"). */
function ConstellationBody() {
  return (
    <div className="hm-artifact__constellation">
      <span className="hm-artifact__coverage" />
      <span className="hm-artifact__link hm-artifact__link--a" />
      <span className="hm-artifact__link hm-artifact__link--b" />
      <span className="hm-artifact__link hm-artifact__link--c" />
      <span className="hm-artifact__link hm-artifact__link--d" />
      <span className="hm-artifact__node hm-artifact__node--hub" />
      <span className="hm-artifact__node hm-artifact__node--n1 hm-artifact__node--calendar" />
      <span className="hm-artifact__node hm-artifact__node--n2" />
      <span className="hm-artifact__node hm-artifact__node--n3" />
      <span className="hm-artifact__node hm-artifact__node--n4" />
    </div>
  )
}

function ArtifactBody({ kind }) {
  if (kind === 'card') return <CardBody />
  if (kind === 'seal') return <SealBody />
  if (kind === 'podium') return <PodiumBody />
  if (kind === 'device') return <DeviceBody />
  if (kind === 'constellation') return <ConstellationBody />
  return <MedalBody />
}

/**
 * CSS 3D benefit artifact — una silueta distinta por beneficio.
 * Sin WebGL.
 */
// Tilt de reposo (vista 3/4). El seguimiento del cursor lo maneja el panel
// vía --reel-mx/my → --hm-tilt-x/y en CSS (cascada); acá solo intervenimos
// para el drag directo sobre la pieza.
const RESTING_TILT = { x: 8, y: -12 }

export default function HomeMembershipArtifact({ benefitId, paused = false, reducedMotion = false }) {
  const kind = KIND_BY_BENEFIT[benefitId] ?? 'medal'
  const stageRef = useRef(null)
  // null = sin arrastre (el tilt lo dicta la cascada del panel). Un objeto
  // {x,y} congela el tilt mientras se arrastra la pieza.
  const [dragTilt, setDragTilt] = useState(null)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: RESTING_TILT.x, baseY: RESTING_TILT.y })

  function onPointerDown(event) {
    if (reducedMotion) return
    const target = stageRef.current
    if (!target) return
    target.setPointerCapture?.(event.pointerId)
    const base = dragTilt ?? RESTING_TILT
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      baseX: base.x,
      baseY: base.y,
    }
    setDragTilt(base)
  }

  function onPointerMove(event) {
    if (reducedMotion || !dragRef.current.active) return
    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    setDragTilt({
      x: Math.max(-20, Math.min(20, dragRef.current.baseX - dy * 0.18)),
      y: Math.max(-40, Math.min(40, dragRef.current.baseY + dx * 0.26)),
    })
  }

  function onPointerUp(event) {
    dragRef.current.active = false
    stageRef.current?.releasePointerCapture?.(event.pointerId)
    setDragTilt(null)
  }

  const className = [
    'hm-artifact',
    `hm-artifact--${kind}`,
    paused ? 'is-paused' : '',
    reducedMotion ? 'is-static' : '',
    dragTilt ? 'is-dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Solo forzamos las vars durante el drag; en reposo las hereda del panel.
  const dragStyle = dragTilt
    ? { '--hm-tilt-x': `${dragTilt.x}deg`, '--hm-tilt-y': `${dragTilt.y}deg` }
    : undefined

  return (
    <div
      ref={stageRef}
      className={className}
      aria-hidden
      style={dragStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="hm-artifact__orbit">
        <div className="hm-artifact__model">
          <span className="hm-artifact__sheen" />
          <ArtifactBody kind={kind} />
          <span className="hm-artifact__glow" />
        </div>
      </div>
      <span className="hm-artifact__shadow" />
    </div>
  )
}

export { KIND_BY_BENEFIT }
