import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CalendarDays,
  Layers,
  Plus,
  ShieldCheck,
  Ticket,
  Unlock,
  X,
} from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import Button from '../ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { validateAdminEventDraft } from '../../lib/schemas/adminEvent.js'
import {
  createAdminEventDraft,
  mapDraftToPreviewEvent,
  withEventStart,
} from '../../services/eventAdminService.js'

/**
 * AdminEventQuickCreate — PLU ARG
 *
 * Alta de un meet en un solo paso. El editor completo sigue existiendo para
 * editar, pero crear no debería costar cinco pestañas: al dar de alta no hay
 * tandas que ordenar (los días todavía no existen) ni equipo de seguridad que
 * cargar (la pestaña recién aparece cuando el evento tiene id), así que el
 * formulario largo pedía decisiones que no se pueden tomar todavía.
 *
 * Quedan los seis datos sin los que el evento no puede existir -- título,
 * inicio, fin, sede, ciudad y cupo -- más el acceso, que se decide acá porque
 * define quién se inscribe y quién pasa la puerta, y cambiarlo más tarde con
 * gente ya anotada tiene consecuencias. El resto (entradas, grilla, zonas) se
 * declara como trabajo pendiente en la consola en vez de esconderse detrás de
 * pestañas vacías.
 */
export default function AdminEventQuickCreate({ canEdit = false, onCancel, onOpenFullEditor, onSubmit }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(createAdminEventDraft)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const panelRef = useRef(null)
  const formRef = useRef(null)
  const previousFocusRef = useRef(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  const preview = mapDraftToPreviewEvent(draft)
  // El slug se deriva del título y del año. Mientras no haya título no se
  // muestra uno de relleno: "evento-preview" se leía como una dirección real.
  const slugPreview = draft.title?.trim() && draft.startsAt ? `/${preview.slug}` : ''
  const requiresMembership = draft.requiresMembership !== false

  const accessOptions = [
    ['members', t('admin.eventState.accessMembers')],
    ['open', t('admin.eventState.accessOpen')],
  ]

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!submitting) onCancelRef.current?.()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [
        ...panelRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    const focusFrame = requestAnimationFrame(() => {
      formRef.current?.querySelector('[name="title"]')?.focus?.()
    })

    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      previousFocusRef.current?.focus?.()
    }
  }, [submitting])

  function patch(next) {
    setDraft(next)
    setSubmitError(null)
    if (Object.keys(fieldErrors).length) setFieldErrors({})
  }

  function focusFirstInvalid(firstKey) {
    if (!firstKey || !formRef.current) return
    const target =
      formRef.current.querySelector(`[name="${firstKey}"]`) ??
      formRef.current.querySelector('[aria-invalid="true"]')
    target?.focus?.()
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError(null)

    const validation = validateAdminEventDraft(draft, t)
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors)
      requestAnimationFrame(() => focusFirstInvalid(validation.firstKey))
      return
    }

    setFieldErrors({})
    setSubmitting(true)
    try {
      const result = await onSubmit?.({ ...draft, slug: preview.slug })
      if (result?.error) throw new Error(result.error)
    } catch (error) {
      setSubmitError(error?.message ?? t('admin.eventEditor.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const err = (key) => fieldErrors[key]

  return createPortal(
    <div className="admin-event-quick">
      <button
        type="button"
        className="admin-event-quick__backdrop"
        aria-label={t('admin.eventQuickCreate.close')}
        onClick={() => {
          if (!submitting) onCancel?.()
        }}
      />
      <div
        ref={panelRef}
        className="admin-event-quick__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-event-quick-title"
        aria-describedby="admin-event-quick-lead"
        tabIndex={-1}
      >
        <form ref={formRef} className="admin-event-quick__form" onSubmit={handleSubmit} noValidate>
          <div className="admin-event-quick__head">
            <div className="admin-event-quick__head-copy">
              <span className="admin-event-quick__eyebrow">
                {t('admin.eventQuickCreate.eyebrow')}
              </span>
              <h3 id="admin-event-quick-title">{t('admin.eventQuickCreate.title')}</h3>
              <p id="admin-event-quick-lead" className="admin-event-quick__lead">
                {t('admin.eventQuickCreate.lead')}
              </p>
            </div>
            <button
              type="button"
              className="admin-event-quick__close"
              onClick={() => {
                if (!submitting) onCancel?.()
              }}
              aria-label={t('admin.eventQuickCreate.close')}
            >
              <X size={15} aria-hidden />
            </button>
          </div>

          <div className="admin-event-quick__body">
            <div className="admin-event-quick__grid">
              <label
                className={`admin-event-quick__field admin-event-quick__field--wide${err('title') ? ' is-invalid' : ''}`}
                htmlFor="quick-event-title"
              >
                <span>{t('admin.eventEditor.publicTitle')}</span>
                <input
                  id="quick-event-title"
                  name="title"
                  required
                  value={draft.title}
                  aria-invalid={Boolean(err('title'))}
                  placeholder={t('admin.eventEditor.titlePlaceholder')}
                  onChange={(event) => patch({ ...draft, title: event.target.value })}
                  disabled={!canEdit || submitting}
                />
                {err('title') ? <small role="alert">{err('title')}</small> : null}
              </label>

              <label
                className={`admin-event-quick__field${err('startsAt') ? ' is-invalid' : ''}`}
                htmlFor="quick-event-starts-at"
              >
                <span>{t('admin.eventEditor.supabase.startsAt')}</span>
                <input
                  id="quick-event-starts-at"
                  name="startsAt"
                  required
                  type="datetime-local"
                  value={draft.startsAt ?? ''}
                  aria-invalid={Boolean(err('startsAt'))}
                  onChange={(event) => patch(withEventStart(draft, event.target.value))}
                  disabled={!canEdit || submitting}
                />
                {err('startsAt') ? <small role="alert">{err('startsAt')}</small> : null}
              </label>

              <label
                className={`admin-event-quick__field${err('endsAt') ? ' is-invalid' : ''}`}
                htmlFor="quick-event-ends-at"
              >
                <span>{t('admin.eventEditor.supabase.endsAt')}</span>
                <input
                  id="quick-event-ends-at"
                  name="endsAt"
                  required
                  type="datetime-local"
                  value={draft.endsAt ?? ''}
                  aria-invalid={Boolean(err('endsAt'))}
                  onChange={(event) => patch({ ...draft, endsAt: event.target.value })}
                  disabled={!canEdit || submitting}
                />
                {err('endsAt') ? <small role="alert">{err('endsAt')}</small> : null}
              </label>

              <label
                className={`admin-event-quick__field${err('venue') ? ' is-invalid' : ''}`}
                htmlFor="quick-event-venue"
              >
                <span>{t('admin.eventEditor.venue')}</span>
                <input
                  id="quick-event-venue"
                  name="venue"
                  required
                  value={draft.venue}
                  aria-invalid={Boolean(err('venue'))}
                  placeholder={t('admin.eventEditor.venuePlaceholder')}
                  onChange={(event) => patch({ ...draft, venue: event.target.value })}
                  disabled={!canEdit || submitting}
                />
                {err('venue') ? <small role="alert">{err('venue')}</small> : null}
              </label>

              <label
                className={`admin-event-quick__field${err('location') ? ' is-invalid' : ''}`}
                htmlFor="quick-event-location"
              >
                <span>{t('admin.eventEditor.location')}</span>
                <input
                  id="quick-event-location"
                  name="location"
                  required
                  value={draft.location}
                  aria-invalid={Boolean(err('location'))}
                  placeholder={t('admin.eventEditor.locationPlaceholder')}
                  onChange={(event) => patch({ ...draft, location: event.target.value })}
                  disabled={!canEdit || submitting}
                />
                {err('location') ? <small role="alert">{err('location')}</small> : null}
              </label>

              <label
                className={`admin-event-quick__field${err('slots') ? ' is-invalid' : ''}`}
                htmlFor="quick-event-slots"
              >
                <span>{t('admin.eventEditor.slotsShortLabel')}</span>
                <input
                  id="quick-event-slots"
                  name="slots"
                  required
                  type="number"
                  min="1"
                  max="5000"
                  value={draft.slots}
                  aria-invalid={Boolean(err('slots'))}
                  onChange={(event) => patch({ ...draft, slots: event.target.value })}
                  disabled={!canEdit || submitting}
                />
                {err('slots') ? <small role="alert">{err('slots')}</small> : null}
              </label>

              {/* El slug no se edita al crear: se deriva del título y del año, y
                  es la dirección pública del evento. Mostrarlo evita el alta a
                  ciegas de un enlace que después aparece en mails y afiches. */}
              <div className="admin-event-quick__field admin-event-quick__field--readonly">
                <span>{t('admin.eventQuickCreate.slugLabel')}</span>
                <code>{slugPreview || t('admin.eventQuickCreate.slugPending')}</code>
              </div>
            </div>

            {/* Acceso al meet: mismo control y mismo copy que la consola de
                operación, para que no digan dos cosas distintas. */}
            <div className="admin-event-quick__access">
              <AdminFilterChipGroup
                compact
                disabled={!canEdit || submitting}
                id="quick-event-access"
                label={t('admin.eventEditor.accessLabel')}
                value={requiresMembership ? 'members' : 'open'}
                onChange={(value) => patch({ ...draft, requiresMembership: value === 'members' })}
                options={accessOptions}
              />
              <p className="admin-event-quick__access-note">
                {requiresMembership ? (
                  <ShieldCheck size={13} aria-hidden />
                ) : (
                  <Unlock size={13} aria-hidden />
                )}
                {requiresMembership
                  ? t('admin.eventState.accessMembersNote')
                  : t('admin.eventState.accessOpenNote')}
              </p>
            </div>

            {/* Lo que falta, escrito como trabajo y no como pestañas vacías. */}
            <div className="admin-event-quick__pending">
              <span className="admin-event-quick__pending-label">
                {t('admin.eventQuickCreate.pendingLabel')}
              </span>
              <ul>
                <li>
                  <Ticket size={15} aria-hidden />
                  {t('admin.eventQuickCreate.pendingTickets')}
                </li>
                <li>
                  <Layers size={15} aria-hidden />
                  {t('admin.eventQuickCreate.pendingStructure')}
                </li>
                <li>
                  <ShieldCheck size={15} aria-hidden />
                  {t('admin.eventQuickCreate.pendingZones')}
                </li>
              </ul>
            </div>

            {submitError ? (
              <p className="admin-event-quick__alert" role="alert">
                {submitError}
              </p>
            ) : null}
          </div>

          {/* Salida hacia el formulario largo: el alta rápida no puede ser una
              pared para quien ya sabe que necesita cargar precios o ventanas. */}
          {onOpenFullEditor ? (
            <button
              type="button"
              className="admin-event-quick__advanced"
              onClick={() => onOpenFullEditor(draft)}
              disabled={submitting}
            >
              {t('admin.eventQuickCreate.advanced')}
            </button>
          ) : null}

          <div className="admin-event-quick__foot">
            <p className="admin-event-quick__foot-note">
              <CalendarDays size={13} aria-hidden />
              {t('admin.eventQuickCreate.hiddenNote')}
            </p>
            <button
              type="button"
              className="admin-event-quick__cancel"
              onClick={() => {
                if (!submitting) onCancel?.()
              }}
              disabled={submitting}
            >
              {t('common.cancel')}
            </button>
            <Button type="submit" variant="gold" className="btn--small" disabled={!canEdit || submitting}>
              <Plus size={15} aria-hidden />
              {submitting
                ? t('admin.eventQuickCreate.submitting')
                : t('admin.eventQuickCreate.submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
