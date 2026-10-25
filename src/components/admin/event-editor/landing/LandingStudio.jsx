import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Blocks, Check, Construction, Eye, Redo2, Save, Undo2, X } from 'lucide-react'
import useModalDialog from '../../../../hooks/useModalDialog.js'
import { mapDraftToPreviewEvent } from '../../../../services/eventAdminService.js'
import {
  clearLandingStudioReopen,
  markLandingStudioForReopen,
} from '../../../../lib/landingStudioSession.js'
import { LandingContentEditor } from '../EventLandingSection.jsx'
import FormatFieldset from './FormatFieldset.jsx'
import LandingCopyFrom from './LandingCopyFrom.jsx'
import { convertLandingToBuilder } from '../../../../lib/eventLandingCopy.js'
import SeoFieldset from './SeoFieldset.jsx'
import Segmented from './Segmented.jsx'
import StudioPreview from './StudioPreview.jsx'
import useLandingDraft from './useLandingDraft.js'
import useLandingHistory from './useLandingHistory.js'
import '../../../../styles/pages/admin-landing-studio.css'

const PANELS = ['content', 'design', 'seo']
const DEVICES = ['desktop', 'tablet', 'mobile']

/** Arranca mostrando la página como se vería en la pantalla en la que se edita. */
function initialDevice() {
  const width = typeof window === 'undefined' ? 1440 : window.innerWidth
  if (width < 640) return 'mobile'
  if (width < 900) return 'tablet'
  return 'desktop'
}

/** ¿El foco está en un campo de texto? Ahí Ctrl+Z es el deshacer del propio campo. */
function isTextEntry(element) {
  if (!element) return false
  if (element.isContentEditable) return true
  if (element.tagName === 'TEXTAREA') return true
  return element.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(element.type)
}

/**
 * Editor visual de la landing, a pantalla completa: a la izquierda el panel
 * (contenido, diseño, SEO), a la derecha la landing real actualizándose
 * mientras se edita, y arriba lo que se decide de un vistazo: qué ve el
 * público, el dispositivo, deshacer / rehacer y guardar.
 *
 * Edita el mismo borrador que el formulario del evento (no es una copia):
 * cerrarlo no descarta nada, y guardar es el mismo guardado del evento.
 *
 * En el Constructor, un clic sobre un bloque de la vista previa lo abre en el
 * panel; elegir un bloque en el panel lleva la vista previa hasta él.
 */
export default function LandingStudio({
  t,
  canEdit,
  draft,
  patchDraft,
  err,
  sourceEvent,
  publicCapacityPreview,
  onHeroUpload,
  onImageUpload,
  heroUploading = false,
  heroPreviewUrl = null,
  save = null,
  onClose,
  /** Eventos de los que se puede copiar la landing ("Copiar de otro evento"). */
  landingSourceEvents = [],
}) {
  const text = (key, params) => t(`admin.eventEditor.${key}`, params)
  const history = useLandingHistory(draft, patchDraft)
  const landingDraft = useLandingDraft(draft, history.patchDraft)
  const { landing, patchLanding, patchSlot, patchPalette, patchMotion } = landingDraft
  const isBuilder = landing.templateId === 'builder'

  const [panel, setPanel] = useState('content')
  const [device, setDevice] = useState(initialDevice)
  // Debajo de 900px no entran las dos columnas: se alterna entre editar y ver.
  const [mobileView, setMobileView] = useState('edit')
  const [selection, setSelection] = useState({ id: null, from: null, token: 0 })
  const { panelRef, initialFocusRef, onKeyDown } = useModalDialog({ onClose })

  useEffect(() => {
    clearLandingStudioReopen()
  }, [])

  const selectBlock = useCallback((id, from) => {
    setSelection((current) => {
      // Enfocar un campo del bloque que ya está elegido no mueve la vista previa.
      if (from === 'panel' && current.id === id) return current
      return { id, from, token: current.token + 1 }
    })
    if (from === 'preview') {
      setPanel('content')
      setMobileView('edit')
    }
  }, [])

  // La vista previa sigue al borrador sin frenar el tipeo: se re-dibuja con
  // prioridad baja.
  const previewSource = useMemo(
    () => ({
      ...sourceEvent,
      ...mapDraftToPreviewEvent(draft, sourceEvent),
      ...draft,
      heroImageUrl: heroPreviewUrl || draft.heroImageUrl || sourceEvent?.heroImageUrl || '',
    }),
    [draft, heroPreviewUrl, sourceEvent],
  )
  const previewEvent = useDeferredValue(previewSource)

  const underConstruction = !landing.publicVisible
  const [showConstruction, setShowConstruction] = useState(false)
  // Lo que se edita es la página: el cartel se ve solo si se pide.
  const shownEvent = useMemo(
    () => ({
      ...previewEvent,
      landing: {
        ...previewEvent.landing,
        publicVisible: !(underConstruction && showConstruction),
      },
    }),
    [previewEvent, showConstruction, underConstruction],
  )

  function handleKeyDown(event) {
    const mod = event.metaKey || event.ctrlKey
    if (mod && !isTextEntry(event.target)) {
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey && history.canUndo) {
        event.preventDefault()
        history.undo()
        return
      }
      if (((key === 'z' && event.shiftKey) || key === 'y') && history.canRedo) {
        event.preventDefault()
        history.redo()
        return
      }
    }
    onKeyDown(event)
  }

  function requestSave() {
    if (!save?.onSave) return
    markLandingStudioForReopen(draft.id)
    save.onSave()
  }

  const saveState = save?.syncing ? 'saving' : save?.dirty ? 'dirty' : 'saved'

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={panelRef}
      className="admin-landing-studio"
      role="dialog"
      aria-modal="true"
      aria-label={text('landingStudioTitle')}
      data-mobile-view={mobileView}
      onKeyDown={handleKeyDown}
    >
      <header className="admin-landing-studio__bar">
        <div className="admin-landing-studio__heading">
          <strong>{text('landingStudioTitle')}</strong>
          <small>{draft.title || sourceEvent?.title}</small>
        </div>

        <div className="admin-landing-studio__audience">
          <Segmented
            label={text('landingAudienceLabel')}
            options={[
              ['page', text('landingAudiencePage')],
              ['construction', text('landingAudienceConstruction')],
            ]}
            value={landing.publicVisible ? 'page' : 'construction'}
            onChange={(audience) => {
              if (!canEdit) return
              patchLanding({ ...landing, publicVisible: audience === 'page' })
            }}
          />
        </div>

        <div className="admin-landing-studio__tools">
          <Segmented
            label={text('landingPreviewDevices')}
            options={DEVICES.map((id) => [id, text(`landingPreviewDevice_${id}`)])}
            value={device}
            onChange={setDevice}
          />
          <div
            className="admin-landing-studio__history"
            role="group"
            aria-label={text('landingStudioHistory')}
          >
            <button
              type="button"
              className="admin-landing-studio__icon"
              aria-label={text('landingStudioUndo')}
              title={text('landingStudioUndo')}
              disabled={!history.canUndo}
              onClick={history.undo}
            >
              <Undo2 size={16} aria-hidden />
            </button>
            <button
              type="button"
              className="admin-landing-studio__icon"
              aria-label={text('landingStudioRedo')}
              title={text('landingStudioRedo')}
              disabled={!history.canRedo}
              onClick={history.redo}
            >
              <Redo2 size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="admin-landing-studio__actions">
          <span className={`admin-landing-studio__status is-${saveState}`} role="status">
            {saveState === 'saved' ? <Check size={13} aria-hidden /> : null}
            {text(`landingStudioStatus_${saveState}`)}
          </span>
          {save?.onSave ? (
            <button
              type="button"
              className="admin-landing-studio__save"
              disabled={!canEdit || save.syncing || !save.dirty}
              onClick={requestSave}
            >
              <Save size={15} aria-hidden />
              {save.syncing ? text('saving') : text('saveChanges')}
            </button>
          ) : null}
          <button
            ref={initialFocusRef}
            type="button"
            className="admin-landing-studio__close"
            onClick={onClose}
          >
            <X size={16} aria-hidden />
            {text('landingStudioClose')}
          </button>
        </div>
      </header>

      {save?.error ? (
        <p className="admin-landing-studio__alert" role="alert">
          {save.error}
        </p>
      ) : null}

      <div className="admin-landing-studio__mobile-switch">
        <Segmented
          label={text('landingStudioMobileView')}
          options={[
            ['edit', text('landingStudioMobileEdit')],
            ['preview', text('landingStudioMobilePreview')],
          ]}
          value={mobileView}
          onChange={setMobileView}
        />
      </div>

      <div className="admin-landing-studio__body">
        <aside className="admin-landing-studio__panel" aria-label={text('landingStudioPanel')}>
          <div
            className="admin-landing-studio__tabs"
            role="tablist"
            aria-label={text('landingStudioPanel')}
          >
            {PANELS.map((id) => (
              <button
                key={id}
                id={`landing-studio-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={panel === id}
                aria-controls={`landing-studio-panel-${id}`}
                className={panel === id ? 'is-active' : ''}
                onClick={() => setPanel(id)}
              >
                {text(`landingStudioTab_${id}`)}
              </button>
            ))}
          </div>

          <div
            id={`landing-studio-panel-${panel}`}
            // `admin-event-form`: los campos usan los mismos estilos que en el formulario del evento.
            className="admin-landing-studio__panel-body admin-event-form admin-event-form__landing"
            role="tabpanel"
            aria-labelledby={`landing-studio-tab-${panel}`}
          >
            {panel === 'content' ? (
              <>
                {isBuilder ? (
                  <p className="admin-event-form__section-note">
                    {text('landingStudioContentHint')}
                  </p>
                ) : (
                  <div className="admin-landing-convert">
                    <p className="admin-event-form__section-note">
                      {text('landingStudioFixedTemplateHint')}
                    </p>
                    {canEdit ? (
                      <button
                        type="button"
                        className="admin-landing-convert__button"
                        onClick={() => patchLanding(convertLandingToBuilder(landing))}
                      >
                        <Blocks size={14} aria-hidden />
                        {text('landingConvertToBuilder')}
                      </button>
                    ) : null}
                    <p className="admin-landing-convert__note">{text('landingConvertToBuilderNote')}</p>
                  </div>
                )}
                <LandingContentEditor
                  canEdit={canEdit}
                  draft={draft}
                  err={err}
                  heroPreviewUrl={heroPreviewUrl}
                  heroUploading={heroUploading}
                  landingDraft={landingDraft}
                  patchDraft={history.patchDraft}
                  publicCapacityPreview={publicCapacityPreview}
                  revealToken={selection.from === 'panel' ? 0 : selection.token}
                  selectedId={isBuilder ? selection.id : null}
                  sourceEvent={sourceEvent}
                  t={t}
                  onHeroUpload={onHeroUpload}
                  onImageUpload={onImageUpload}
                  onSelectBlock={isBuilder ? selectBlock : null}
                />
              </>
            ) : null}
            {panel === 'design' ? (
              <>
                <LandingCopyFrom
                  t={t}
                  canEdit={canEdit}
                  events={landingSourceEvents}
                  currentEventId={draft.id ?? null}
                  landing={landing}
                  patchLanding={patchLanding}
                  undoable
                />
                <FormatFieldset
                  canEdit={canEdit}
                  landing={landing}
                  patchLanding={patchLanding}
                  patchMotion={patchMotion}
                  patchPalette={patchPalette}
                  showAudience={false}
                  t={t}
                />
              </>
            ) : null}
            {panel === 'seo' ? (
              <SeoFieldset
                canEdit={canEdit}
                err={err}
                landing={landing}
                patchSlot={patchSlot}
                t={t}
              />
            ) : null}
          </div>
        </aside>

        <section className="admin-landing-studio__preview" aria-label={text('landingPreviewTitle')}>
          {underConstruction ? (
            <div className="admin-landing-studio__notice" role="status">
              <Construction size={14} aria-hidden />
              <span>{text('landingStudioConstructionNotice')}</span>
              <button
                type="button"
                className="admin-landing-studio__notice-action"
                onClick={() => setShowConstruction((value) => !value)}
              >
                <Eye size={13} aria-hidden />
                {showConstruction ? text('landingStudioShowPage') : text('landingStudioShowNotice')}
              </button>
            </div>
          ) : null}
          <StudioPreview
            device={device}
            event={shownEvent}
            scrollToken={selection.from === 'preview' ? 0 : selection.token}
            selectable={isBuilder && !(underConstruction && showConstruction)}
            selectedId={selection.id}
            title={text('landingPreviewTitle')}
            onSelectBlock={selectBlock}
            blocks={canEdit && isBuilder ? (landing.layout?.blocks ?? []) : null}
            onBlocksChange={canEdit && isBuilder ? landingDraft.applyBlocks : null}
            t={t}
          />
        </section>
      </div>
    </div>,
    document.body,
  )
}
