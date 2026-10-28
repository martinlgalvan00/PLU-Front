import { useId } from 'react'
import { Check, ChevronDown, Construction, LayoutTemplate, PanelsTopLeft } from 'lucide-react'
import AdminFilterChipGroup from '../../AdminFilterChipGroup.jsx'
import MotionPicker from './MotionPicker.jsx'
import { LandingColorPicker, LandingTemplatePicker } from './LandingLookPicker.jsx'

const PHASES = [
  ['coming_soon', 'landingSubmissionPhaseComingSoon'],
  ['published', 'landingSubmissionPhasePublished'],
]

const AUDIENCES = [
  ['page', 'landingAudiencePage', PanelsTopLeft],
  ['construction', 'landingAudienceConstruction', Construction],
]

/**
 * Qué ve el público: la página o el cartel de "en construcción". Dos opciones
 * con su consecuencia a la vista; el detalle largo (calendario, portada,
 * destacados) queda plegado para quien lo necesite.
 */
function AudiencePicker({ t, disabled, value, onChange }) {
  const name = useId()
  const labelId = `${name}-label`
  const text = (key) => t(`admin.eventEditor.${key}`)

  return (
    <div className="admin-landing-look__group">
      <p className="admin-landing-look__label" id={labelId}>
        {text('landingAudienceLabel')}
      </p>
      <div className="admin-landing-audience" role="radiogroup" aria-labelledby={labelId}>
        {AUDIENCES.map(([id, key, Icon]) => {
          const checked = value === id
          return (
            <label key={id} className={`admin-landing-audience__option${checked ? ' is-checked' : ''}`}>
              <input
                type="radio"
                name={name}
                value={id}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(id)}
              />
              <Icon size={16} aria-hidden className="admin-landing-audience__icon" />
              <span className="admin-landing-audience__copy">
                <strong>
                  {text(key)}
                  {checked ? <Check size={14} aria-hidden /> : null}
                </strong>
                <small>{text(`${key}Hint`)}</small>
              </span>
            </label>
          )
        })}
      </div>
      <details className="admin-landing-audience__details">
        <summary>
          {text('landingAudienceDetails')}
          <ChevronDown size={14} aria-hidden />
        </summary>
        <p>{text('landingPublicVisibleHint')}</p>
      </details>
    </div>
  )
}

/**
 * Formato de la landing: qué ve el público, plantilla, fase (Submission), tema
 * de color, colores propios y animación. Todo lo que define "cómo se ve" antes
 * del contenido.
 *
 * Plantilla y tema se eligen viendo (las mismas muestras que el alta rápida):
 * cada tarjeta se dibuja con los colores del tema y los propios del evento, así
 * que cambiar un color repinta las muestras antes de mirar la vista previa.
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
  const palette = landing.layout?.palette

  return (
    <fieldset className="admin-event-form__landing-format">
      <legend>
        <LayoutTemplate size={13} aria-hidden />
        {text('landingLegend')}
      </legend>
      <p className="admin-event-form__section-note">{text('landingHint')}</p>

      {/* Primero, qué ve el público: es la decisión que más se busca (mostrar
          la página o el cartel de "en construcción"). */}
      {showAudience ? (
        <AudiencePicker
          t={t}
          disabled={!canEdit}
          value={landing.publicVisible ? 'page' : 'construction'}
          onChange={(audience) => patchLanding({ ...landing, publicVisible: audience === 'page' })}
        />
      ) : null}

      <LandingTemplatePicker
        t={t}
        disabled={!canEdit}
        value={landing.templateId}
        themeId={landing.themeId}
        palette={palette}
        onChange={(templateId) => patchLanding({ ...landing, templateId })}
      />

      {landing.templateId === 'submission' ? (
        <div className="admin-landing-look__group">
          <AdminFilterChipGroup
            compact
            disabled={!canEdit}
            id="event-landing-submission-phase"
            label={text('landingSubmissionPhaseLabel')}
            value={landing.phase}
            onChange={(phase) => patchLanding({ ...landing, phase })}
            options={PHASES.map(([id, key]) => [id, text(key)])}
          />
          <p className="admin-landing-look__hint">
            {landing.phase === 'coming_soon'
              ? text('landingSubmissionComingSoonHint')
              : text('landingSubmissionPublishedHint')}
          </p>
        </div>
      ) : null}

      <LandingColorPicker
        t={t}
        disabled={!canEdit}
        themeId={landing.themeId}
        palette={palette}
        onThemeChange={(themeId) => patchLanding({ ...landing, themeId })}
        onPaletteChange={patchPalette}
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
