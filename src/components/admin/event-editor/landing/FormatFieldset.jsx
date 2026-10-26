import { LayoutTemplate } from 'lucide-react'
import AdminFilterChipGroup from '../../AdminFilterChipGroup.jsx'
import { EVENT_LANDING_THEMES } from '../../../../lib/eventLanding.js'
import MotionPicker from './MotionPicker.jsx'
import PaletteEditor from './PaletteEditor.jsx'

const TEMPLATES = ['meet', 'editorial', 'submission', 'builder']
const TEMPLATE_KEY = {
  meet: 'landingTemplateMeet',
  editorial: 'landingTemplateEditorial',
  submission: 'landingTemplateSubmission',
  builder: 'landingTemplateBuilder',
}
const PHASES = [
  ['coming_soon', 'landingSubmissionPhaseComingSoon'],
  ['published', 'landingSubmissionPhasePublished'],
]

/**
 * Formato de la landing: plantilla, si está publicada, fase (Submission), tema de
 * color y colores propios. Todo lo que define "cómo se ve" antes del contenido.
 */
export default function FormatFieldset({
  t,
  canEdit,
  landing,
  patchLanding,
  patchPalette,
  patchMotion,
  // El editor visual lleva "Qué ve el público" en su barra superior.
  showAudience = true,
}) {
  const text = (key, params) => t(`admin.eventEditor.${key}`, params)

  return (
    <fieldset className="admin-event-form__landing-format">
      <legend>
        <LayoutTemplate size={13} aria-hidden />
        {text('landingLegend')}
      </legend>
      <p className="admin-event-form__section-note">{text('landingHint')}</p>

      {/* Primero, qué ve el público: es la decisión que más se busca (mostrar
          la página o el cartel de "en construcción") y antes quedaba debajo
          de la plantilla, como un interruptor más. */}
      {showAudience ? (
        <>
          <AdminFilterChipGroup
            compact
            disabled={!canEdit}
            id="event-landing-public-visible"
            label={text('landingAudienceLabel')}
            value={landing.publicVisible ? 'page' : 'construction'}
            onChange={(audience) =>
              patchLanding({ ...landing, publicVisible: audience === 'page' })
            }
            options={[
              ['page', text('landingAudiencePage')],
              ['construction', text('landingAudienceConstruction')],
            ]}
          />
          <p className="admin-event-form__section-note">{text('landingPublicVisibleHint')}</p>
        </>
      ) : null}

      <AdminFilterChipGroup
        compact
        disabled={!canEdit}
        id="event-landing-template"
        label={text('landingTemplateLabel')}
        value={landing.templateId}
        onChange={(templateId) => patchLanding({ ...landing, templateId })}
        options={TEMPLATES.map((id) => [id, text(TEMPLATE_KEY[id])])}
      />
      <p className="admin-event-form__section-note">
        {text(`${TEMPLATE_KEY[landing.templateId]}Hint`)}
      </p>

      {landing.templateId === 'submission' ? (
        <>
          <AdminFilterChipGroup
            compact
            disabled={!canEdit}
            id="event-landing-submission-phase"
            label={text('landingSubmissionPhaseLabel')}
            value={landing.phase}
            onChange={(phase) => patchLanding({ ...landing, phase })}
            options={PHASES.map(([id, key]) => [id, text(key)])}
          />
          <p className="admin-event-form__section-note">
            {landing.phase === 'coming_soon'
              ? text('landingSubmissionComingSoonHint')
              : text('landingSubmissionPublishedHint')}
          </p>
        </>
      ) : null}

      <AdminFilterChipGroup
        compact
        disabled={!canEdit}
        id="event-landing-theme"
        label={text('landingThemeLabel')}
        value={landing.themeId}
        onChange={(themeId) => patchLanding({ ...landing, themeId })}
        options={EVENT_LANDING_THEMES.map((id) => [
          id,
          text(`landingTheme_${id.replace(/-/g, '_')}`),
        ])}
      />
      <p className="admin-event-form__section-note">{text('landingThemeHint')}</p>

      <PaletteEditor
        canEdit={canEdit}
        palette={landing.layout?.palette}
        t={t}
        onChange={patchPalette}
      />

      <MotionPicker
        canEdit={canEdit}
        motion={landing.layout?.motion}
        t={t}
        onChange={patchMotion}
      />
    </fieldset>
  )
}
