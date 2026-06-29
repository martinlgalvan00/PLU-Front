export default function ResultCard({ athlete, event, total, place, date }) {
  return (
    <article className="result-card surface-card">
      <div className="result-card__top">
        <span className="result-card__place">{place}</span>
        <time className="result-card__date">{date}</time>
      </div>
      <h3 className="result-card__athlete">{athlete}</h3>
      <p className="result-card__event">{event}</p>
      <strong className="result-card__total">{total}</strong>
    </article>
  )
}
