import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  Eye,
  Link2,
  Plus,
  ShieldCheck,
  Unlock,
} from 'lucide-react'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import Button from '../ui/Button.jsx'
import EventCard from '../ui/EventCard.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { validateAdminEventDraft } from '../../lib/schemas/adminEvent.js'
import '../../styles/pages/admin-event-quick.css'
import {
  createAdminEventDraft,
  mapDraftToPreviewEvent,
  withEventStart,
} from '../../services/eventAdminService.js'

/**
 * AdminEventQuickCreate — PLU ARG
 *
 * Alta de un meet en una sola pantalla, con su propia URL
 * (`/admin/eventos/nuevo`). Antes era un panel lateral sobre un fondo casi
 * negro: crear un evento tapaba justo lo que le da contexto (el listado, el
 * resto del calendario) y la vista previa de cómo queda en el sitio no existía.
 * Ahora es una página, igual que el workspace del evento, y a la derecha se ve
 * la card pública armándose mientras se escribe.
 *
 * El editor completo sigue existiendo para editar, pero crear no debería costar
 * cinco pestañas: al dar de alta no hay tandas que ordenar (los días todavía no
 * existen) ni equipo de seguridad que cargar (la pestaña recién aparece cuando
 * el evento tiene id), así que el formulario largo pedía decisiones que no se
 * pueden tomar todavía.
 *
 * Quedan los seis datos sin los que el evento no puede existir -- título,
 * inicio, fin, sede, ciudad y cupo -- más el acceso, que se decide acá porque
 * define quién se inscribe y quién pasa la puerta, y cambiarlo más tarde con
 * gente ya anotada tiene consecuencias. El resto (entradas, grilla, zonas) se
 * declara como trabajo pendiente en vez de esconderse detrás de pestañas vacías.
 */
/** Modos de inscripción del alta. "Abre en una fecha" y "Abierta ya" comparten
 * estado (`inscripcion_abierta`) y solo se distinguen por la fecha, que recién
 * se carga después de elegir el modo: por eso el modo se guarda aparte. */
const REGISTRATION_MODES = ['soon', 'scheduled', 'open']

export default function AdminEventQuickCreate({ canEdit = false, onCancel, onOpenFullEditor, onSubmit }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(createAdminEventDraft)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const formRef = useRef(null)
  const initialSignatureRef = useRef(JSON.stringify(draft))

  const preview = mapDraftToPreviewEvent(draft)
  // El slug se deriva del título y del año. Mientras no haya título no se
  // muestra uno de relleno: "evento-preview" se leía como una dirección real.
  const slugPreview = draft.title?.trim() && draft.startsAt ? `/${preview.slug}` : ''
  const requiresMembership = draft.requiresMembership !== false
  const isDirty = JSON.stringify(draft) !== initialSignatureRef.current

  // Cuántos de los cuatro datos que la card pública muestra ya están cargados.
  // La vista previa "se enciende" a medida que se completan, en vez de mostrar
  // un evento inventado a pleno contraste.
  const filledCount = useMemo(
    () =>
      [draft.title, draft.startsAt, draft.venue, draft.location].filter((value) =>
        String(value ?? '').trim(),
      ).length,
    [draft.title, draft.startsAt, draft.venue, draft.location],
  )

  const [registrationMode, setRegistrationModeState] = useState('soon')
  const registrationOptions = REGISTRATION_MODES.map((mode) => [
    mode,
    t(`admin.eventQuickCreate.reg${mode[0].toUpperCase()}${mode.slice(1)}`),
  ])

  function setRegistrationMode(mode) {
    setRegistrationModeState(mode)
    // Próximamente: la abrís vos. Abre en una fecha: queda "abierta" con la
    // ventana (el sitio la muestra como próxima hasta esa hora y abre sola).
    // Abierta ya: sin ventana.
    if (mode === 'soon') patch({ ...draft, status: 'proximamente', registrationOpensAt: '' })
    else if (mode === 'scheduled') patch({ ...draft, status: 'inscripcion_abierta' })
    else patch({ ...draft, status: 'inscripcion_abierta', registrationOpensAt: '' })
  }

  const accessOptions = [
    ['members', t('admin.eventState.accessMembers')],
    ['open', t('admin.eventState.accessOpen')],
  ]

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => {
      formRef.current?.querySelector('[name="title"]')?.focus?.()
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [])

  // Cerrar la pestaña o recargar con datos cargados pierde el borrador: el
  // navegador pregunta. Volver con el botón pregunta acá (`requestCancel`).
  useEffect(() => {
    if (!isDirty || submitting) return undefined
    function warn(event) {
      event.preventDefault()
      // Chrome exige returnValue para mostrar el aviso nativo.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty, submitting])

  function requestCancel() {
    if (submitting) return
    if (isDirty && !window.confirm(t('admin.eventQuickCreate.discardConfirm'))) return
    onCancel?.()
  }

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
    const registrationErrors = {}
    if (registrationMode === 'scheduled') {
      if (!draft.registrationOpensAt) {
        registrationErrors.registrationOpensAt = t('admin.eventQuickCreate.regScheduledRequired')
      } else if (draft.startsAt && draft.registrationOpensAt >= draft.startsAt) {
        registrationErrors.registrationOpensAt = t('admin.eventQuickCreate.regBeforeStart')
      }
    }
    if (!validation.ok || Object.keys(registrationErrors).length > 0) {
      setFieldErrors({ ...(validation.ok ? {} : validation.fieldErrors), ...registrationErrors })
      requestAnimationFrame(() =>
        focusFirstInvalid(
          validation.ok ? Object.keys(registrationErrors)[0] : validation.firstKey,
        ),
      )
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

  return (
    <section className="admin-event-quick" aria-labelledby="admin-event-quick-title">
      <button type="button" className="admin-event-quick__back" onClick={requestCancel}>
        <ChevronLeft size={14} aria-hidden />
        <span>{t('admin.eventQuickCreate.back')}</span>
      </button>

      <form ref={formRef} className="admin-event-quick__form" onSubmit={handleSubmit} noValidate>
        <div className="admin-event-quick__layout">
          <div className="admin-event-quick__main">
            <div className="admin-event-quick__head">
              <span className="admin-event-quick__eyebrow">
                {t('admin.eventQuickCreate.eyebrow')}
              </span>
              <h2 id="admin-event-quick-title">{t('admin.eventQuickCreate.title')}</h2>
              <p id="admin-event-quick-lead" className="admin-event-quick__lead">
                {t('admin.eventQuickCreate.lead')}
              </p>
            </div>

            <div className="admin-event-quick__body">
              {/* El título es el protagonista: se escribe a escala de título y de
                  él se deriva la dirección pública, que se muestra debajo. */}
              <label
                className={`admin-event-quick__hero${err('title') ? ' is-invalid' : ''}`}
                htmlFor="quick-event-title"
              >
                <span className="admin-event-quick__label">
                  {t('admin.eventEditor.publicTitle')}
                </span>
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

              {/* El slug no se edita al crear: se deriva del título y del año, y
                  es la dirección pública del evento. Mostrarlo evita el alta a
                  ciegas de un enlace que después aparece en mails y afiches. */}
              <p
                className="admin-event-quick__slug"
                aria-label={t('admin.eventQuickCreate.slugLabel')}
              >
                <Link2 size={14} aria-hidden />
                <code className={slugPreview ? undefined : 'is-pending'}>
                  {slugPreview || t('admin.eventQuickCreate.slugPending')}
                </code>
              </p>

              <div
                className="admin-event-quick__section"
                role="group"
                aria-labelledby="quick-event-when"
              >
                <h3 className="admin-event-quick__section-title" id="quick-event-when">
                  {t('admin.eventQuickCreate.sectionWhen')}
                </h3>
                <div className="admin-event-quick__row">
                  <label
                    className={`admin-event-quick__field${err('startsAt') ? ' is-invalid' : ''}`}
                    htmlFor="quick-event-starts-at"
                  >
                    <span className="admin-event-quick__label">
                      {t('admin.eventEditor.supabase.startsAt')}
                    </span>
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
                    <span className="admin-event-quick__label">
                      {t('admin.eventEditor.supabase.endsAt')}
                    </span>
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
                </div>
              </div>

              <div
                className="admin-event-quick__section"
                role="group"
                aria-labelledby="quick-event-where"
              >
                <h3 className="admin-event-quick__section-title" id="quick-event-where">
                  {t('admin.eventQuickCreate.sectionWhere')}
                </h3>
                <div className="admin-event-quick__row">
                  <label
                    className={`admin-event-quick__field${err('venue') ? ' is-invalid' : ''}`}
                    htmlFor="quick-event-venue"
                  >
                    <span className="admin-event-quick__label">{t('admin.eventEditor.venue')}</span>
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
                    <span className="admin-event-quick__label">
                      {t('admin.eventEditor.location')}
                    </span>
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
                </div>
              </div>

              <div
                className="admin-event-quick__section"
                role="group"
                aria-labelledby="quick-event-capacity"
              >
                <h3 className="admin-event-quick__section-title" id="quick-event-capacity">
                  {t('admin.eventQuickCreate.sectionCapacity')}
                </h3>
                <div className="admin-event-quick__row admin-event-quick__row--capacity">
                  <label
                    className={`admin-event-quick__field admin-event-quick__field--slots${err('slots') ? ' is-invalid' : ''}`}
                    htmlFor="quick-event-slots"
                  >
                    <span className="admin-event-quick__label">
                      {t('admin.eventEditor.slotsShortLabel')}
                    </span>
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

                  {/* Acceso al meet: mismo control y mismo copy que la consola de
                      operación, para que no digan dos cosas distintas. */}
                  <div className="admin-event-quick__access">
                    <AdminFilterChipGroup
                      compact
                      disabled={!canEdit || submitting}
                      id="quick-event-access"
                      label={t('admin.eventEditor.accessLabel')}
                      value={requiresMembership ? 'members' : 'open'}
                      onChange={(value) =>
                        patch({ ...draft, requiresMembership: value === 'members' })
                      }
                      options={accessOptions}
                    />
                  </div>
                </div>
                <p className="admin-event-quick__access-note">
                  {requiresMembership ? (
                    <ShieldCheck size={14} aria-hidden />
                  ) : (
                    <Unlock size={14} aria-hidden />
                  )}
                  {requiresMembership
                    ? t('admin.eventState.accessMembersNote')
                    : t('admin.eventState.accessOpenNote')}
                </p>
              </div>

              <div
                className="admin-event-quick__section"
                role="group"
                aria-labelledby="quick-event-registration"
              >
                <h3 className="admin-event-quick__section-title" id="quick-event-registration">
                  {t('admin.eventQuickCreate.sectionRegistration')}
                </h3>
                <AdminFilterChipGroup
                  compact
                  disabled={!canEdit || submitting}
                  id="quick-event-registration-mode"
                  label={t('admin.eventQuickCreate.regLabel')}
                  value={registrationMode}
                  onChange={setRegistrationMode}
                  options={registrationOptions}
                />
                {registrationMode === 'scheduled' ? (
                  <label
                    className={`admin-event-quick__field${err('registrationOpensAt') ? ' is-invalid' : ''}`}
                    htmlFor="quick-event-registration-opens"
                  >
                    <span className="admin-event-quick__label">
                      {t('admin.eventEditor.supabase.registrationOpensAt')}
                    </span>
                    <input
                      id="quick-event-registration-opens"
                      name="registrationOpensAt"
                      required
                      type="datetime-local"
                      value={draft.registrationOpensAt ?? ''}
                      aria-invalid={Boolean(err('registrationOpensAt'))}
                      onChange={(event) =>
                        patch({ ...draft, registrationOpensAt: event.target.value })
                      }
                      disabled={!canEdit || submitting}
                    />
                    {err('registrationOpensAt') ? (
                      <small role="alert">{err('registrationOpensAt')}</small>
                    ) : null}
                  </label>
                ) : null}
                <p className="admin-event-quick__access-note">
                  <CalendarDays size={14} aria-hidden />
                  {t(
                    `admin.eventQuickCreate.reg${registrationMode[0].toUpperCase()}${registrationMode.slice(1)}Note`,
                  )}
                </p>
              </div>

              {submitError ? (
                <p className="admin-event-quick__alert" role="alert">
                  {submitError}
                </p>
              ) : null}
            </div>
          </div>

          {/* Vista previa: la card pública con lo que ya se cargó. Va en un
              <aside> y no interrumpe el orden de lectura del formulario. */}
          <aside
            className="admin-event-quick__aside"
            aria-label={t('admin.eventQuickCreate.previewLabel')}
            style={{ '--quick-filled': filledCount / 4 }}
          >
            <p className="admin-event-quick__preview-label">
              <Eye size={13} aria-hidden />
              {t('admin.eventQuickCreate.previewLabel')}
            </p>
            <div className="admin-event-quick__preview-card" aria-hidden>
              <EventCard
                variant="minimal"
                date={preview.date}
                featured={preview.featured}
                location={preview.location}
                status={registrationMode === 'scheduled' ? 'proximamente' : preview.status}
                title={preview.title}
                venue={preview.venue}
              />
            </div>
            <p className="admin-event-quick__preview-hint">
              {filledCount === 0
                ? t('admin.eventQuickCreate.previewEmpty')
                : t('admin.eventQuickCreate.previewHint')}
            </p>

            {/* Lo que falta, escrito como trabajo y no como pestañas vacías. */}
            <p className="admin-event-quick__pending">
              <span className="admin-event-quick__pending-label">
                {t('admin.eventQuickCreate.pendingLabel')}
              </span>
              {[
                t('admin.eventQuickCreate.pendingTickets'),
                t('admin.eventQuickCreate.pendingStructure'),
                t('admin.eventQuickCreate.pendingZones'),
              ].join(' · ')}
            </p>
          </aside>
        </div>

        <div className="admin-event-quick__foot">
          <div className="admin-event-quick__foot-copy">
            <p className="admin-event-quick__foot-note">
              <CalendarDays size={13} aria-hidden />
              {t('admin.eventQuickCreate.hiddenNote')}
            </p>
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
                <ArrowUpRight size={14} aria-hidden />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="admin-event-quick__cancel"
            onClick={requestCancel}
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
    </section>
  )
}
