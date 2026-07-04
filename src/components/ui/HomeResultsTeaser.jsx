import { HOME_RESULTS } from '../../lib/content.js'
import SectionHeading from './SectionHeading.jsx'

export default function HomeResultsTeaser({ onNavigate }) {
  return (
    <div className="home-results-teaser">
      <SectionHeading
        align="left"
        variant="ref"
        eyebrow={HOME_RESULTS.eyebrow}
        title={HOME_RESULTS.title}
        description={HOME_RESULTS.description}
      />
      <button type="button" className="home-results-teaser__btn" onClick={() => onNavigate('results')}>
        Ver resultados →
      </button>
    </div>
  )
}
