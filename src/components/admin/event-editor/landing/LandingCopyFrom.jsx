import { useId, useMemo, useState } from 'react'
import { ChevronDown, Copy } from 'lucide-react'
import { useI18n } from '../../../../i18n/I18nProvider.jsx'
import { copyLandingFrom, landingCopySources } from '../../../../lib/eventLandingCopy.js'

function eventOptionLabel(event, locale) {
  const value = event.startsAt ?? event.starts_at ?? null
  const date = value ? new Date(value) : null
  const year =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
          month: 'short',
          year: 'numeric',
        })
      : ''
  return [event.title || event.slug, year].filter(Boolean).join(' · ')
}

/**
 * "Copiar de otro evento": trae el diseño (y, si se pide, los textos) de la
 * landing de un meet anterior. Dentro del editor visual el cambio entra en el
 * historial, así que Deshacer lo revierte de una.
 */
export default function LandingCopyFrom({
  t,
  canEdit,
  events = [],
  currentEventId = null,
  landing,
  patchLanding,
  undoable = false,
}) {
  const id = useId()
  const { locale } = useI18n()
  const sources = useMemo(
    () => landingCopySources(events, currentEventId),
    [currentEventId, events],
  )
  const [open, setOpen] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const [includeTexts, setIncludeTexts] = useState(false)
  const [copiedFrom, setCopiedFrom] = useState(null)
  const text = (key, params) => t(`admin.eventEditor.${key}`, params)

  if (sources.length === 0) return null
  const source = sources.find((event) => String(event.id ?? event.slug) === sourceId) ?? null

  function copy() {
    if (!source) return
    patchLanding(copyLandingFrom(landing, source, { includeTexts }))
    setCopiedFrom(source.title || source.slug)
    setOpen(false)
  }

  return (
    <div className="admin-landing-copy">
      <button
        type="button"
        className="admin-landing-copy__toggle"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        disabled={!canEdit}
        onClick={() => setOpen((current) => !current)}
      >
        <Copy size={14} aria-hidden />
        {text('landingCopyOpen')}
        <ChevronDown size={14} aria-hidden className="admin-landing-copy__chevron" />
      </button>

      {copiedFrom ? (
        <p className="admin-landing-copy__done" role="status">
          {text(undoable ? 'landingCopyDoneUndo' : 'landingCopyDone', { event: copiedFrom })}
        </p>
      ) : null}

      {open ? (
        <div className="admin-landing-copy__panel" id={`${id}-panel`}>
          <label className="admin-landing-copy__field" htmlFor={`${id}-source`}>
            <span>{text('landingCopySource')}</span>
            <select
              id={`${id}-source`}
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              <option value="">{text('landingCopyPick')}</option>
              {sources.map((event) => (
                <option key={event.id ?? event.slug} value={String(event.id ?? event.slug)}>
                  {eventOptionLabel(event, locale)}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="admin-landing-copy__scope">
            <legend>{text('landingCopyScope')}</legend>
            <label className="admin-landing-copy__option">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={!includeTexts}
                onChange={() => setIncludeTexts(false)}
              />
              <span>
                <strong>{text('landingCopyDesign')}</strong>
                <small>{text('landingCopyDesignHint')}</small>
              </span>
            </label>
            <label className="admin-landing-copy__option">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={includeTexts}
                onChange={() => setIncludeTexts(true)}
              />
              <span>
                <strong>{text('landingCopyAll')}</strong>
                <small>{text('landingCopyAllHint')}</small>
              </span>
            </label>
          </fieldset>

          <div className="admin-landing-copy__actions">
            <button
              type="button"
              className="admin-landing-copy__confirm"
              disabled={!source}
              onClick={copy}
            >
              {text('landingCopyConfirm')}
            </button>
            <button
              type="button"
              className="admin-landing-copy__cancel"
              onClick={() => setOpen(false)}
            >
              {text('landingCopyCancel')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
