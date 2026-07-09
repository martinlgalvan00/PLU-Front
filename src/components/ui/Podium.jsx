import { useEffect, useRef, useState } from 'react'
import { Medal } from 'lucide-react'

/* ─── Configuración por posición ─────────────────────────── */
const SLOT_CONFIG = {
  '1°': {
    rankLabel:   '1° Lugar',
    platformH:   '160px',
    cardClass:   'podium-slot--first',
    entryDelay:  '0.1s',
    rankNum:     '1',
  },
  '2°': {
    rankLabel:   '2° Lugar',
    platformH:   '100px',
    cardClass:   'podium-slot--second',
    entryDelay:  '0s',
    rankNum:     '2',
  },
  '3°': {
    rankLabel:   '3° Lugar',
    platformH:   '68px',
    cardClass:   'podium-slot--third',
    entryDelay:  '0.2s',
    rankNum:     '3',
  },
}

// Orden visual: 2° izquierda, 1° centro, 3° derecha
const DISPLAY_ORDER = ['2°', '1°', '3°']

export default function Podium({ results = [] }) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.25 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!results.length) return null

  const resultByRank = Object.fromEntries(
    results.map((r) => {
      const rank = r.place?.split(' ')[0] ?? ''  // e.g. '1°', '2°', '3°'
      return [rank, r]
    })
  )

  const slots = DISPLAY_ORDER
    .map((rank) => ({ rank, config: SLOT_CONFIG[rank], result: resultByRank[rank] }))
    .filter((s) => s.result)

  return (
    <section
      ref={ref}
      className={`podium-stage ${isVisible ? 'podium-stage--visible' : ''}`}
      aria-label="Podio de resultados"
    >
      {/* Ambient glow background */}
      <div className="podium-stage__ambient" aria-hidden />

      <div className="podium-stage__arena">
        {slots.map(({ rank, config, result }) => (
          <div
            key={rank}
            className={`podium-slot ${config.cardClass}`}
            style={{ '--entry-delay': config.entryDelay }}
            aria-label={`${config.rankLabel}: ${result.athlete}`}
          >
            {/* Athlete card — floats */}
            <div className="podium-athlete">
              {/* Medal */}
              <Medal className="podium-athlete__medal" aria-hidden strokeWidth={1.6} />

              {/* Rank badge */}
              <span className="podium-athlete__rank-badge" aria-hidden>
                {config.rankNum}
              </span>

              {/* Info */}
              <h3 className="podium-athlete__name">{result.athlete}</h3>
              <p className="podium-athlete__category">
                {result.place?.replace(result.place?.split(' ')[0], '').trim()}
              </p>
              <p className="podium-athlete__event">{result.event}</p>

              {/* Total */}
              <div className="podium-athlete__total-wrap">
                <strong className="podium-athlete__total">{result.total}</strong>
              </div>

              {/* Shimmer sweep */}
              <span className="podium-athlete__shimmer" aria-hidden />
            </div>

            {/* Platform block — rises from bottom */}
            <div
              className="podium-platform"
              style={{ '--platform-h': config.platformH }}
            >
              <span className="podium-platform__rank" aria-hidden>
                {config.rankNum}
              </span>
              {/* Platform reflection */}
              <span className="podium-platform__reflection" aria-hidden />
            </div>
          </div>
        ))}
      </div>

      {/* Floor line */}
      <div className="podium-stage__floor" aria-hidden />
    </section>
  )
}
