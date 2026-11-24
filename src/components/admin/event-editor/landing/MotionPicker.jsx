import AdminFilterChipGroup from '../../AdminFilterChipGroup.jsx'
import {
  LANDING_MOTION_PRESETS,
  normalizeLandingMotion,
} from '../../../../lib/eventLandingMotion.js'

/**
 * Cuánto se anima la página del evento: sin animaciones, suave o marcada. La
 * nota de abajo describe la opción elegida; el cambio se ve en el visor.
 */
export default function MotionPicker({ t, canEdit, motion, onChange }) {
  const current = normalizeLandingMotion(motion)
  const text = (key) => t(`admin.eventEditor.${key}`)

  return (
    <div className="admin-landing-motion admin-landing-look__group">
      <AdminFilterChipGroup
        compact
        disabled={!canEdit}
        id="event-landing-motion"
        label={text('landingMotionLegend')}
        value={current}
        onChange={onChange}
        options={LANDING_MOTION_PRESETS.map((id) => [id, text(`landingMotion_${id}`)])}
      />
      <p className="admin-landing-look__hint">
        {text(`landingMotionHint_${current}`)} {text('landingMotionScope')}
      </p>
    </div>
  )
}
