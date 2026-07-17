import { useEffect, useRef, useState } from 'react'

const KIND_BY_BENEFIT = {
  events: 'medal',
  credential: 'card',
  discounts: 'seal',
  results: 'podium',
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

/** Meets oficiales — medalla circular con barra. */
function MedalBody() {
  return (
    <>
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--disc">
        <span className="hm-artifact__medal-ring hm-artifact__medal-ring--outer" />
        <span className="hm-artifact__medal-ring" />
        <span className="hm-artifact__medal-core">
          <svg viewBox="0 0 48 48" aria-hidden className="hm-artifact__glyph">
            <path
              d="M8 24h6M34 24h6M14 20v8M34 20v8M14 24h20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="24" r="3.2" fill="currentColor" />
          </svg>
        </span>
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--disc">
        <span className="hm-artifact__medal-ring" />
        <span className="hm-artifact__mark">PLU</span>
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--disc" />
    </>
  )
}

/** Credencial digital — card vertical con QR. */
function CardBody() {
  return (
    <>
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--card">
        <span className="hm-artifact__card-accent" />
        <span className="hm-artifact__card-brand">PLU ARG</span>
        <span className="hm-artifact__qr">
          <QrGlyph />
        </span>
        <span className="hm-artifact__card-label">ID</span>
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--card">
        <span className="hm-artifact__card-chip" />
        <span className="hm-artifact__mark hm-artifact__mark--gold">QR</span>
        <span className="hm-artifact__card-stripe" />
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--card" />
    </>
  )
}

/** Ahorro en inscripciones — sello de descuento (silueta de sticker, no de tag colgante). */
function SealBody() {
  return (
    <>
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--seal">
        <span className="hm-artifact__seal-copy">
          <span className="hm-artifact__seal-pct">%</span>
          <span className="hm-artifact__seal-hint">AHORRO</span>
        </span>
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--seal">
        <span className="hm-artifact__mark">PLU</span>
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--seal" />
    </>
  )
}

/** Resultados PLU — podio 3D real (tres barras). */
function PodiumBody() {
  return (
    <div className="hm-artifact__podium">
      <span className="hm-artifact__podium-bar hm-artifact__podium-bar--2">
        <span className="hm-artifact__podium-rank">2</span>
      </span>
      <span className="hm-artifact__podium-bar hm-artifact__podium-bar--1">
        <span className="hm-artifact__podium-rank">1</span>
      </span>
      <span className="hm-artifact__podium-bar hm-artifact__podium-bar--3">
        <span className="hm-artifact__podium-rank">3</span>
      </span>
      <span className="hm-artifact__podium-base" />
    </div>
  )
}

/**
 * Panel del atleta — afiliación, eventos e historial como app-icons
 * propios (grilla tipo home screen), no filas finitas ilegibles a
 * este tamaño ni un % inventado.
 */
function DeviceBody() {
  return (
    <>
      <div className="hm-artifact__face hm-artifact__face--front hm-artifact__face--device">
        <span className="hm-artifact__device-bezel">
          <span className="hm-artifact__device-grid">
            <span className="hm-artifact__device-tile hm-artifact__device-tile--gold">
              <span className="hm-artifact__device-tile-glyph hm-artifact__device-tile-glyph--card" />
            </span>
            <span className="hm-artifact__device-tile hm-artifact__device-tile--celeste">
              <span className="hm-artifact__device-tile-glyph hm-artifact__device-tile-glyph--dot" />
            </span>
            <span className="hm-artifact__device-tile hm-artifact__device-tile--muted">
              <span className="hm-artifact__device-tile-glyph hm-artifact__device-tile-glyph--dot" />
            </span>
            <span className="hm-artifact__device-tile hm-artifact__device-tile--ghost">
              <span className="hm-artifact__device-tile-plus" aria-hidden>
                +
              </span>
            </span>
          </span>
        </span>
      </div>
      <div className="hm-artifact__face hm-artifact__face--back hm-artifact__face--device">
        <span className="hm-artifact__device-cam" />
        <span className="hm-artifact__mark hm-artifact__mark--muted">APP</span>
      </div>
      <span className="hm-artifact__edge hm-artifact__edge--device" />
    </>
  )
}

/** Red oficial — nodos conectados (no tile). */
function ConstellationBody() {
  return (
    <div className="hm-artifact__constellation">
      <span className="hm-artifact__coverage" />
      <span className="hm-artifact__link hm-artifact__link--a" />
      <span className="hm-artifact__link hm-artifact__link--b" />
      <span className="hm-artifact__link hm-artifact__link--c" />
      <span className="hm-artifact__link hm-artifact__link--d" />
      <span className="hm-artifact__node hm-artifact__node--hub" />
      <span className="hm-artifact__node hm-artifact__node--n1" />
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
export default function HomeMembershipArtifact({ benefitId, paused = false, reducedMotion = false }) {
  const kind = KIND_BY_BENEFIT[benefitId] ?? 'medal'
  const stageRef = useRef(null)
  const [tilt, setTilt] = useState({ x: 8, y: -18 })
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 8, baseY: -18 })

  useEffect(() => {
    if (reducedMotion) {
      setTilt({ x: 6, y: -12 })
    }
  }, [reducedMotion])

  function onPointerDown(event) {
    if (reducedMotion) return
    const target = stageRef.current
    if (!target) return
    target.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      baseX: tilt.x,
      baseY: tilt.y,
    }
  }

  function onPointerMove(event) {
    if (reducedMotion) return
    const stage = stageRef.current
    if (!stage) return

    if (dragRef.current.active) {
      const dx = event.clientX - dragRef.current.startX
      const dy = event.clientY - dragRef.current.startY
      setTilt({
        x: Math.max(-22, Math.min(22, dragRef.current.baseX - dy * 0.18)),
        y: Math.max(-48, Math.min(48, dragRef.current.baseY + dx * 0.28)),
      })
      return
    }

    if (!paused) return
    const rect = stage.getBoundingClientRect()
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1
    setTilt({
      x: Math.max(-16, Math.min(16, -ny * 14)),
      y: Math.max(-28, Math.min(28, nx * 22)),
    })
  }

  function onPointerUp(event) {
    dragRef.current.active = false
    stageRef.current?.releasePointerCapture?.(event.pointerId)
  }

  function onPointerLeave() {
    if (dragRef.current.active) return
    if (!paused && !reducedMotion) return
    setTilt({ x: 8, y: -18 })
  }

  const className = [
    'hm-artifact',
    `hm-artifact--${kind}`,
    paused ? 'is-paused' : '',
    reducedMotion ? 'is-static' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={stageRef}
      className={className}
      aria-hidden
      style={{
        '--hm-tilt-x': `${tilt.x}deg`,
        '--hm-tilt-y': `${tilt.y}deg`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <div className="hm-artifact__orbit">
        <div className="hm-artifact__model">
          <ArtifactBody kind={kind} />
        </div>
      </div>
      <span className="hm-artifact__shadow" />
    </div>
  )
}

export { KIND_BY_BENEFIT }
