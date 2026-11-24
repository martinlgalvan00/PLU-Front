import {
  defaultInscriptionCopy,
  resolveInscriptionCopyVariant,
} from '../../../../lib/eventInscriptionCopy.js'
import { patchDraftPublicCopy } from '../draftPatches.js'
import { CapacityPublicBreakdown, FormField } from '../parts.jsx'

/**
 * Textos de la inscripción y cuánto del cupo ve el público. Vacío cae al texto
 * del estado (cerrado, abierto, cupo lleno), que se muestra como placeholder.
 */
export default function InscriptionFields({
  t,
  canEdit,
  draft,
  patchDraft,
  err,
  publicCapacityPreview,
}) {
  const defaults = defaultInscriptionCopy(
    resolveInscriptionCopyVariant({
      status: draft.status,
      progressPublic: draft.capacityProgressPublic !== false,
    }),
    t,
  )
  const patchCopy = (patch) => patchDraft(patchDraftPublicCopy(draft, patch))

  return (
    <>
      <p className="admin-event-form__section-note">{t('admin.eventEditor.inscriptionCopyHint')}</p>
      <FormField
        htmlFor="event-inscription-mark"
        label={t('admin.eventEditor.inscriptionMarkField')}
        error={err('publicCopy.inscriptionMark')}
      >
        <input
          id="event-inscription-mark"
          name="publicCopy.inscriptionMark"
          data-field="publicCopy.inscriptionMark"
          type="text"
          maxLength={40}
          value={draft.publicCopy?.inscriptionMark ?? ''}
          placeholder={defaults.mark}
          disabled={!canEdit}
          onChange={(event) => patchCopy({ inscriptionMark: event.target.value })}
        />
      </FormField>
      <FormField
        htmlFor="event-inscription-note"
        label={t('admin.eventEditor.inscriptionNoteField')}
        error={err('publicCopy.inscriptionNote')}
      >
        <textarea
          id="event-inscription-note"
          name="publicCopy.inscriptionNote"
          data-field="publicCopy.inscriptionNote"
          rows={2}
          maxLength={160}
          value={draft.publicCopy?.inscriptionNote ?? ''}
          placeholder={defaults.hint}
          disabled={!canEdit}
          onChange={(event) => patchCopy({ inscriptionNote: event.target.value })}
        />
      </FormField>
      <CapacityPublicBreakdown
        canEdit={canEdit}
        preview={publicCapacityPreview}
        progressChecked={draft.capacityProgressPublic !== false}
        progressId="event-capacity-progress-public-surface"
        t={t}
        totalChecked={draft.capacityTotalPublic !== false}
        totalId="event-capacity-total-public-surface"
        onProgressChange={(value) => patchDraft({ ...draft, capacityProgressPublic: value })}
        onTotalChange={(value) => patchDraft({ ...draft, capacityTotalPublic: value })}
      />
    </>
  )
}
