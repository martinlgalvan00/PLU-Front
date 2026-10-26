import { lazy, Suspense, useState } from 'react'
import { PanelsTopLeft } from 'lucide-react'
import { landingSectionsForEvent } from '../../../lib/eventLandingSections.js'
import { shouldReopenLandingStudio } from '../../../lib/landingStudioSession.js'
import BlocksEditor from './landing/BlocksEditor.jsx'
import FormatFieldset from './landing/FormatFieldset.jsx'
import LandingCopyFrom from './landing/LandingCopyFrom.jsx'
import HeroImageField from './landing/HeroImageField.jsx'
import InscriptionFields from './landing/InscriptionFields.jsx'
import SectionsList from './landing/SectionsList.jsx'
import SeoFieldset from './landing/SeoFieldset.jsx'
import useLandingDraft from './landing/useLandingDraft.js'
import '../../../styles/pages/admin-event-landing.css'

// El editor visual pesa (vista previa completa de la landing): se carga al abrirlo.
const LandingStudio = lazy(() => import('./landing/LandingStudio.jsx'))

/**
 * Contenido editable de la landing: bloques del Constructor o secciones de las
 * plantillas fijas, más la imagen de portada y el cupo. Lo comparten el editor
 * en línea y el editor visual; este último le pasa además la selección.
 */
export function LandingContentEditor({
  t,
  canEdit,
  draft,
  patchDraft,
  landingDraft,
  err,
  sourceEvent,
  publicCapacityPreview,
  onHeroUpload,
  onImageUpload,
  heroUploading = false,
  heroPreviewUrl = null,
  selectedId = null,
  revealToken = 0,
  onSelectBlock = null,
}) {
  const { landing, patchLanding, patchSlot, applyBlocks, currentBlocks } = landingDraft
  const isBuilder = landing.templateId === 'builder'
  const hasCustomSections = ['editorial', 'submission'].includes(landing.templateId)

  const heroImage = onHeroUpload ? (
    <HeroImageField
      canEdit={canEdit}
      hasSlug={Boolean(draft.slug)}
      previewUrl={heroPreviewUrl || draft.heroImageUrl}
      t={t}
      uploading={heroUploading}
      onRemove={() => patchLanding({ ...landing, slots: { ...landing.slots, heroImagePath: '' } })}
      onUpload={onHeroUpload}
    />
  ) : null

  const inscription = (
    <InscriptionFields
      canEdit={canEdit}
      draft={draft}
      err={err}
      patchDraft={patchDraft}
      publicCapacityPreview={publicCapacityPreview}
      t={t}
    />
  )

  if (isBuilder) {
    return (
      <>
        <BlocksEditor
          blocks={landing.layout?.blocks ?? []}
          canEdit={canEdit}
          err={err}
          getCurrentBlocks={currentBlocks}
          hasSlug={Boolean(draft.slug)}
          heroSlot={heroImage}
          imageUploading={heroUploading}
          landing={landing}
          patchSlot={patchSlot}
          revealToken={revealToken}
          selectedId={selectedId}
          t={t}
          onChangeBlocks={applyBlocks}
          onImageUpload={onImageUpload}
          onSelectBlock={onSelectBlock}
        />
        <fieldset className="admin-event-form__landing-sections">
          <legend>{t('admin.eventEditor.landingSectionInscriptionTitle')}</legend>
          <p className="admin-event-form__section-note">
            {t('admin.eventEditor.landingSectionInscriptionHint')}
          </p>
          <div className="admin-event-form__landing-details-body">{inscription}</div>
        </fieldset>
      </>
    )
  }

  return (
    <SectionsList
      canEdit={canEdit}
      draft={draft}
      err={err}
      extras={{ hero: heroImage, inscription }}
      hint={t(
        hasCustomSections
          ? 'admin.eventEditor.landingSectionsHintCustom'
          : 'admin.eventEditor.landingSectionsHint',
      )}
      landing={landing}
      patchDraft={patchDraft}
      patchSlot={patchSlot}
      sections={landingSectionsForEvent({
        ...(sourceEvent ?? {}),
        ...draft,
        // El borrador manda: al elegir otra plantilla las secciones cambian antes de guardar.
        landing: draft.landing ?? sourceEvent?.landing,
        slug: draft.slug ?? sourceEvent?.slug,
      })}
      t={t}
    />
  )
}

/**
 * Landing del evento dentro del editor: formato (plantilla, tema, colores),
 * contenido (secciones fijas o bloques del Constructor) y SEO.
 *
 * Arriba de todo, la entrada al editor visual: la misma edición a pantalla
 * completa, con la landing real al lado actualizándose mientras se edita.
 *
 * El copy de la portada y del cupo también vive en `publicCopy` por compat con la
 * ficha, Pitbull y la inscripción; `useLandingDraft` los mantiene sincronizados.
 * Este componente solo compone: cada pieza tiene su archivo en `./landing/`.
 */
export default function EventLandingSection(props) {
  const { t, canEdit, draft, patchDraft, err, studioSave = null } = props
  const landingDraft = useLandingDraft(draft, patchDraft)
  const { landing, patchLanding, patchSlot, patchPalette, patchMotion } = landingDraft
  // Recién guardado desde el editor visual: el editor se vuelve a armar y el
  // visual se reabre solo (ver `landingStudioSession.js`).
  const [studioOpen, setStudioOpen] = useState(() => shouldReopenLandingStudio(draft.id))

  return (
    <div className="admin-event-form__landing">
      <div className="admin-landing-studio-entry">
        <div>
          <strong>{t('admin.eventEditor.landingStudioEntryTitle')}</strong>
          <p>{t('admin.eventEditor.landingStudioEntryHint')}</p>
        </div>
        <button
          type="button"
          className="admin-landing-studio-entry__open"
          onClick={() => setStudioOpen(true)}
        >
          <PanelsTopLeft size={15} aria-hidden />
          {t('admin.eventEditor.landingStudioOpen')}
        </button>
      </div>

      <LandingCopyFrom
        t={t}
        canEdit={canEdit}
        events={props.landingSourceEvents}
        currentEventId={draft.id ?? null}
        landing={landing}
        patchLanding={patchLanding}
      />

      <FormatFieldset
        canEdit={canEdit}
        landing={landing}
        patchLanding={patchLanding}
        patchMotion={patchMotion}
        patchPalette={patchPalette}
        t={t}
      />

      <LandingContentEditor {...props} landingDraft={landingDraft} />

      <SeoFieldset canEdit={canEdit} err={err} landing={landing} patchSlot={patchSlot} t={t} />

      {studioOpen ? (
        <Suspense fallback={null}>
          <LandingStudio {...props} save={studioSave} onClose={() => setStudioOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  )
}
