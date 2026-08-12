import { Trophy, Calendar, Medal } from 'lucide-react'

const PLACE_MEDALS = {
  '1°': { className: 'result-card__medal--gold' },
  '2°': { className: 'result-card__medal--silver' },
  '3°': { className: 'result-card__medal--bronze' },
}

function getPlace(place) {
  const rank = place?.split(' ')[0] ?? ''
  return PLACE_MEDALS[rank] ?? null
}

export default function ResultCard({ athlete, event, total, place, date, featured = false }) {
  const medal = getPlace(place)
  const rankLabel = place?.split(' ')[0] ?? ''
  const category = place?.replace(rankLabel, '').trim() ?? ''

  return (
    <article className={`result-card surface-card ${featured ? 'result-card--featured' : ''}`}>
      <div className="result-card__top">
        <div className="result-card__rank" aria-label={`Posición: ${rankLabel}`}>
          {medal ? (
            <Medal className={`result-card__medal ${medal.className}`} aria-hidden strokeWidth={1.6} />
          ) : (
            <span className="result-card__rank-label">{rankLabel}</span>
          )}
        </div>
        <time className="result-card__date" dateTime={date}>
          <Calendar size={11} aria-hidden />
          {date}
        </time>
      </div>

      <h3 className="result-card__athlete">{athlete}</h3>

      {category && (
        <p className="result-card__category">{category}</p>
      )}

      <div className="result-card__footer">
        <p className="result-card__event">
          <Trophy size={11} aria-hidden />
          {event}
        </p>
        <strong className="result-card__total">{total}</strong>
      </div>
    </article>
  )
}
