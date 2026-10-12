import TiltCard from '../../motion/TiltCard.tsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Placa/medalla editorial del empty state de Récords.
 * CSS 3D + TiltCard (sin WebGL, sin loop). Misma gramática que la credencial.
 */
export default function RecordsSoonMedal({ year = '2026' }) {
  const { t } = useI18n()

  return (
    <div className="records-medal" aria-hidden="true">
      <TiltCard
        className="records-medal__tilt"
        innerClassName="tilt-card__inner records-medal__plate"
        maxTilt={3}
      >
        <span className="records-medal__rim" />
        <span className="records-medal__face">
          <span className="records-medal__ring" />
          <span className="records-medal__mark">PLU</span>
          <span className="records-medal__sub">{t('pages.records.medalChapter')}</span>
          <span className="records-medal__year">{year}</span>
        </span>
        <span className="records-medal__glare" />
      </TiltCard>
    </div>
  )
}
