import { useState } from 'react'
import {
  LANDING_PALETTE_KEYS,
  normalizeLandingPalette,
  paletteContrastWarnings,
} from '../../../../lib/eventLandingPalette.js'

const HEX = /^#[0-9a-fA-F]{6}$/
const KEY_LABEL = {
  accent: 'landingPaletteAccent',
  action: 'landingPaletteAction',
  background: 'landingPaletteBackground',
}

function ColorField({ id, label, hint, value, disabled, onChange, t }) {
  // El texto se edita libre y solo viaja al borrador cuando es un hex válido.
  const [draftText, setDraftText] = useState(null)
  const text = draftText ?? value ?? ''
  const invalid = draftText != null && draftText !== '' && !HEX.test(draftText)

  function commit(next) {
    setDraftText(null)
    onChange(next)
  }

  return (
    <div className="admin-landing-palette__field">
      <label htmlFor={`${id}-hex`}>{label}</label>
      <div className="admin-landing-palette__control">
        <input
          aria-label={`${label} (selector)`}
          className="admin-landing-palette__swatch"
          disabled={disabled}
          type="color"
          value={value ?? '#888888'}
          onChange={(event) => commit(event.target.value)}
        />
        <input
          id={`${id}-hex`}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          disabled={disabled}
          inputMode="text"
          maxLength={7}
          placeholder="#RRGGBB"
          spellCheck={false}
          type="text"
          value={text}
          onChange={(event) => {
            const next = event.target.value.trim()
            setDraftText(next)
            if (HEX.test(next)) onChange(next.toLowerCase())
            if (next === '') onChange(null)
          }}
          onBlur={() => setDraftText(null)}
        />
        {value ? (
          <button
            type="button"
            className="admin-event-form__text-btn"
            disabled={disabled}
            onClick={() => commit(null)}
          >
            {t('admin.eventEditor.landingPaletteReset')}
          </button>
        ) : null}
      </div>
      {hint ? <small>{hint}</small> : null}
      {invalid ? (
        <small className="admin-event-form__error" role="alert">
          {t('admin.eventEditor.landingPaletteInvalid')}
        </small>
      ) : null}
    </div>
  )
}

/**
 * Colores propios del evento (acento, botón, fondo). Vacío = rige el tema. El
 * texto se deriva del fondo, así que lo único que puede salir mal es que el
 * acento o el botón no se distingan del fondo: se avisa, no se bloquea.
 */
export default function EventLandingPaletteEditor({ t, canEdit, palette, onChange }) {
  const current = normalizeLandingPalette(palette)
  const warnings = paletteContrastWarnings(current)
  const hasAny = Object.keys(current).length > 0

  function setColor(key, value) {
    const next = { ...current }
    if (value) next[key] = value
    else delete next[key]
    onChange(next)
  }

  return (
    <fieldset className="admin-landing-palette">
      <legend>{t('admin.eventEditor.landingPaletteLegend')}</legend>
      <p className="admin-event-form__section-note">{t('admin.eventEditor.landingPaletteHint')}</p>

      <div className="admin-landing-palette__grid">
        {LANDING_PALETTE_KEYS.map((key) => (
          <ColorField
            key={key}
            id={`event-landing-palette-${key}`}
            label={t(`admin.eventEditor.${KEY_LABEL[key]}`)}
            hint={key === 'background' ? t('admin.eventEditor.landingPaletteBackgroundHint') : null}
            value={current[key] ?? null}
            disabled={!canEdit}
            t={t}
            onChange={(value) => setColor(key, value)}
          />
        ))}
      </div>

      {warnings.length > 0 ? (
        <ul className="admin-landing-palette__warnings" role="status">
          {warnings.map((warning) => (
            <li key={warning.code}>
              {t(`admin.eventEditor.landingPaletteWarn_${warning.code}`, {
                ratio: warning.ratio.toFixed(1),
              })}
            </li>
          ))}
        </ul>
      ) : null}

      {hasAny ? (
        <button
          type="button"
          className="admin-event-form__text-btn"
          disabled={!canEdit}
          onClick={() => onChange({})}
        >
          {t('admin.eventEditor.landingPaletteResetAll')}
        </button>
      ) : null}
    </fieldset>
  )
}
