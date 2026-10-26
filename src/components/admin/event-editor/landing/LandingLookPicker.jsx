import { useId, useState } from 'react'
import { Check, ChevronDown, Palette } from 'lucide-react'
import { EVENT_LANDING_THEMES } from '../../../../lib/eventLanding.js'
import {
  landingPaletteStyle,
  normalizeLandingPalette,
} from '../../../../lib/eventLandingPalette.js'
import PaletteEditor from './PaletteEditor.jsx'
import '../../../../styles/pages/admin-landing-look.css'

const LANDING_TEMPLATE_IDS = Object.freeze(['meet', 'editorial', 'submission', 'builder'])

const TEMPLATE_KEY = {
  meet: 'landingTemplateMeet',
  editorial: 'landingTemplateEditorial',
  submission: 'landingTemplateSubmission',
  builder: 'landingTemplateBuilder',
}

/**
 * Colores con los que se dibuja una muestra: los del tema (vía
 * `data-event-theme`, que remapea los tokens en event-landing-themes.css) y,
 * encima, los propios del evento. El fondo propio solo rige en el Constructor,
 * igual que en la landing pública.
 */
function lookStyle(templateId, palette) {
  return landingPaletteStyle({ palette }, { withBackground: templateId === 'builder' })
}

/** Esquema de cada plantilla: qué estructura tiene la página, no su contenido. */
function TemplateSketch({ templateId }) {
  if (templateId === 'meet') {
    return (
      <span className="admin-landing-look__sketch admin-landing-look__sketch--meet">
        <span className="admin-landing-look__date" />
        <span className="admin-landing-look__lines">
          <span className="admin-landing-look__line admin-landing-look__line--title" />
          <span className="admin-landing-look__line admin-landing-look__line--accent" />
          <span className="admin-landing-look__line" />
        </span>
        <span className="admin-landing-look__rows">
          <span />
          <span />
          <span />
        </span>
      </span>
    )
  }
  if (templateId === 'editorial') {
    return (
      <span className="admin-landing-look__sketch admin-landing-look__sketch--editorial">
        <span className="admin-landing-look__line admin-landing-look__line--accent admin-landing-look__line--short" />
        <span className="admin-landing-look__line admin-landing-look__line--display" />
        <span className="admin-landing-look__line admin-landing-look__line--display admin-landing-look__line--short" />
        <span className="admin-landing-look__columns">
          <span />
          <span />
        </span>
      </span>
    )
  }
  if (templateId === 'submission') {
    return (
      <span className="admin-landing-look__sketch admin-landing-look__sketch--submission">
        <span className="admin-landing-look__hero">
          <span className="admin-landing-look__line admin-landing-look__line--display" />
          <span className="admin-landing-look__countdown">
            <span />
            <span />
            <span />
          </span>
          <span className="admin-landing-look__cta" />
        </span>
      </span>
    )
  }
  return (
    <span className="admin-landing-look__sketch admin-landing-look__sketch--builder">
      <span className="admin-landing-look__block admin-landing-look__block--hero">
        <span className="admin-landing-look__line admin-landing-look__line--title" />
        <span className="admin-landing-look__cta" />
      </span>
      <span className="admin-landing-look__block" />
      <span className="admin-landing-look__block admin-landing-look__block--add" />
    </span>
  )
}

/**
 * Plantilla de la landing como tarjetas con su esquema dibujado en los colores
 * elegidos: se decide viendo, no leyendo nombres. Radios nativos, así teclado y
 * lector de pantalla funcionan sin trabajo extra.
 */
export function LandingTemplatePicker({ t, disabled, value, themeId, palette, onChange }) {
  const name = useId()
  const labelId = `${name}-label`
  const text = (key) => t(`admin.eventEditor.${key}`)

  return (
    <div className="admin-landing-look__group">
      <p className="admin-landing-look__label" id={labelId}>
        {text('landingTemplateLabel')}
      </p>
      <div className="admin-landing-look__templates" role="radiogroup" aria-labelledby={labelId}>
        {LANDING_TEMPLATE_IDS.map((templateId) => {
          const checked = value === templateId
          return (
            <label
              key={templateId}
              className={`admin-landing-look__template${checked ? ' is-checked' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={templateId}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(templateId)}
              />
              <span
                className="admin-landing-look__frame event-landing-theme"
                data-event-theme={themeId}
                style={lookStyle(templateId, palette)}
                aria-hidden
              >
                <TemplateSketch templateId={templateId} />
              </span>
              <span className="admin-landing-look__name">
                {text(TEMPLATE_KEY[templateId])}
                {checked ? <Check size={14} aria-hidden /> : null}
              </span>
            </label>
          )
        })}
      </div>
      <p className="admin-landing-look__hint">
        {text(`${TEMPLATE_KEY[value] ?? TEMPLATE_KEY.meet}Hint`)}
      </p>
    </div>
  )
}

/**
 * Tema de color con sus dos colores a la vista (acento y botón) y, debajo, los
 * colores propios del evento. Los propios pisan al tema; vaciarlos vuelve a él.
 */
export function LandingColorPicker({
  t,
  disabled,
  themeId,
  palette,
  onThemeChange,
  onPaletteChange,
}) {
  const name = useId()
  const labelId = `${name}-label`
  const panelId = `${name}-custom`
  const custom = normalizeLandingPalette(palette)
  const hasCustom = Object.keys(custom).length > 0
  const [customOpen, setCustomOpen] = useState(hasCustom)
  const text = (key, params) => t(`admin.eventEditor.${key}`, params)

  return (
    <div className="admin-landing-look__group">
      <p className="admin-landing-look__label" id={labelId}>
        {text('landingThemeLabel')}
      </p>
      <div className="admin-landing-look__themes" role="radiogroup" aria-labelledby={labelId}>
        {EVENT_LANDING_THEMES.map((id) => {
          const checked = themeId === id
          return (
            <label key={id} className={`admin-landing-look__theme${checked ? ' is-checked' : ''}`}>
              <input
                type="radio"
                name={name}
                value={id}
                checked={checked}
                disabled={disabled}
                onChange={() => onThemeChange(id)}
              />
              <span
                className="admin-landing-look__swatches event-landing-theme"
                data-event-theme={id}
                aria-hidden
              >
                <span className="admin-landing-look__swatch admin-landing-look__swatch--accent" />
                <span className="admin-landing-look__swatch admin-landing-look__swatch--action" />
              </span>
              <span className="admin-landing-look__theme-name">
                {text(`landingTheme_${id.replace(/-/g, '_')}`)}
              </span>
            </label>
          )
        })}
      </div>

      <button
        type="button"
        className="admin-landing-look__custom-toggle"
        aria-expanded={customOpen}
        aria-controls={panelId}
        onClick={() => setCustomOpen((open) => !open)}
      >
        <Palette size={14} aria-hidden />
        {hasCustom ? text('landingLookCustomActive') : text('landingLookCustomOpen')}
        <ChevronDown size={14} aria-hidden className="admin-landing-look__chevron" />
      </button>
      {customOpen ? (
        <div className="admin-landing-look__custom" id={panelId}>
          <PaletteEditor t={t} canEdit={!disabled} palette={custom} onChange={onPaletteChange} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * La portada con lo cargado hasta acá, en la plantilla y los colores elegidos.
 * Es una muestra, no la landing: alcanza para ver si el título se lee y si el
 * botón se distingue antes de crear el evento.
 */
export function LandingCoverPreview({ t, templateId, themeId, palette, event }) {
  const text = (key) => t(`admin.eventEditor.${key}`)
  const meta = [event?.date, event?.location].filter((item) => item && item !== '—').join(' · ')

  return (
    <div
      className={`admin-landing-look__cover admin-landing-look__cover--${templateId} event-landing-theme`}
      data-event-theme={themeId}
      style={lookStyle(templateId, palette)}
      aria-hidden
    >
      {meta ? <span className="admin-landing-look__cover-meta">{meta}</span> : null}
      <strong className="admin-landing-look__cover-title">
        {event?.title || text('landingLookCoverPlaceholder')}
      </strong>
      {event?.venue && event.venue !== '—' ? (
        <span className="admin-landing-look__cover-venue">{event.venue}</span>
      ) : null}
      <span className="admin-landing-look__cover-cta">{text('landingLookCoverCta')}</span>
    </div>
  )
}
