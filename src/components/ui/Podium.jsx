import { useEffect, useRef, useState } from 'react'
import { Medal } from 'lucide-react'
import { parseAthleteTotal } from '../../lib/parseAthleteTotal.js'
import AnimatedNumber from '../../motion/AnimatedNumber.tsx'
import TiltCard from '../../motion/TiltCard.tsx'

const SLOT_CONFIG = {
  '1°': {
    rankLabel: '1° Lugar',
    platformH: '160px',
    cardClass: 'podium-slot--first',
    entryDelay: '0.1s',
    rankNum: '1',
    premium: true,
  },
  '2°': {
    rankLabel: '2° Lugar',
    platformH: '100px',
    cardClass: 'podium-slot--second',
    entryDelay: '0s',
    rankNum: '2',
    premium: false,
  },
  '3°': {
    rankLabel: '3° Lugar',
    platformH: '68px',
    cardClass: 'podium-slot--third',
    entryDelay: '0.2s',
    rankNum: '3',
    premium: false,
  },
}

const DISPLAY_ORDER = ['2°', '1°', '3°']

function PodiumTotal({ total, premium = false }) {
  const parsed = parseAthleteTotal(total)

  if (!parsed.valid) {
    return <strong className="podium-athlete__total">{total}</strong>
  }

  return (
    <AnimatedNumber
      className={`podium-athlete__total${premium ? ' podium-athlete__total--animated' : ''}`}
      value={parsed.value}
      suffix={parsed.suffix}
      decimals={parsed.value % 1 === 0 ? 0 : 1}
      duration={premium ? 0.62 : 0.48}
    />
  )
}

function AthleteCard({ result, config, premium }) {
  const body = (
    <>
      <Medal className="podium-athlete__medal" aria-hidden strokeWidth={1.6} />
      <span className="podium-athlete__rank-badge" aria-hidden>
        {config.rankNum}
      </span>
      {premium ? <span className="podium-athlete__gold-line" aria-hidden /> : null}
      <h3 className="podium-athlete__name">{result.athlete}</h3>
      <p className="podium-athlete__category">
        {result.place?.replace(result.place?.split(' ')[0], '').trim()}
      </p>
      <p className="podium-athlete__event">{result.event}</p>
      <div className="podium-athlete__total-wrap">
        <PodiumTotal total={result.total} premium={premium} />
      </div>
      <span className="podium-athlete__shimmer" aria-hidden />
    </>
  )

  if (!premium) {
    return <div className="podium-athlete">{body}</div>
  }

  return (
    <TiltCard className="podium-athlete-tilt" innerClassName="podium-athlete podium-athlete--premium" maxTilt={5}>
      {body}
    </TiltCard>
  )
}

export default function Podium({ results = [] }) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.25 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (!results.length) return null

  const resultByRank = Object.fromEntries(
    results.map((r) => {
      const rank = r.place?.split(' ')[0] ?? ''
      return [rank, r]
    }),
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
      <div className="podium-stage__ambient" aria-hidden />

      <div className="podium-stage__arena">
        {slots.map(({ rank, config, result }) => (
          <div
            key={rank}
            className={`podium-slot ${config.cardClass}`}
            style={{ '--entry-delay': config.entryDelay }}
            aria-label={`${config.rankLabel}: ${result.athlete}`}
          >
            <AthleteCard result={result} config={config} premium={config.premium} />

            <div className="podium-platform" style={{ '--platform-h': config.platformH }}>
              <span className="podium-platform__rank" aria-hidden>
                {config.rankNum}
              </span>
              <span className="podium-platform__reflection" aria-hidden />
            </div>
          </div>
        ))}
      </div>

      <div className="podium-stage__floor" aria-hidden />
    </section>
  )
}
