import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  Link2,
  PanelsTopLeft,
  Plus,
  ShieldCheck,
  Unlock,
} from 'lucide-react'
import AdminEventLogoStage from './AdminEventLogoStage.jsx'
import AdminFilterChipGroup from './AdminFilterChipGroup.jsx'
import Button from '../ui/Button.jsx'
import EventCard from '../ui/EventCard.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { validateAdminEventDraft } from '../../lib/schemas/adminEvent.js'
import { effectiveEventChannelsFor } from '../../lib/eventPaymentChannels.js'
import { resolveEventPublishConfirmChecks } from '../../lib/eventPublishChecks.js'
import usePlatformPaymentChannels from '../../hooks/usePlatformPaymentChannels.js'
import { platformCellsFor } from '../../lib/platformPaymentChannels.js'
import { fetchPaymentProfiles } from '../../services/paymentProfileService.js'
import EventPaymentChannelMatrix from './event-editor/EventPaymentChannelMatrix.jsx'
import AdminEventSaleControl from './AdminEventSaleControl.jsx'
import { updatePricingField } from './event-editor/draftPatches.js'
import { markLandingStudioForReopen } from '../../lib/landingStudioSession.js'
import {
  LandingColorPicker,
  LandingCoverPreview,
  LandingTemplatePicker,
} from './event-editor/landing/LandingLookPicker.jsx'
import { DEFAULT_EVENT_PRICING } from '../../lib/eventPricing.js'
import { QUICK_CREATE_STEPS as STEPS, quickCreateStepForField } from '../../lib/eventQuickCreateSteps.js'
import '../../styles/pages/admin-event-quick.css'
import {
  createAdminEventDraft,
  mapDraftToPreviewEvent,
  withEventStart,
} from '../../services/eventAdminService.js'
import {
  emptyEventLanding,
  normalizeEventLanding,
} from '../../lib/eventLanding.js'
import {
  applyEventPreset,
  DEFAULT_EVENT_PRESET_ID,
  describeEventPreset,
  EVENT_PRESET_IDS,
} from '../../lib/eventPresets.js'

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


/**
 * `initialDraft` / `initialLogo` / `duplicateOf` llegan al duplicar un evento: el
 * formulario arranca con sede, ciudad, cupo, acceso y logo del original (las
 * fechas y las entradas no se copian). `onSubmit(draft, { logo, another })`:
 * con `another` el alta no sale de la pantalla -- queda lista para el siguiente.
 */
export default function AdminEventQuickCreate({
  canEdit = false,
  duplicateOf = null,
  initialDraft = null,
  initialLogo = null,
  onCancel,
  onOpenFullEditor,
  onSubmit,
  /** "Listo": `onDone(event, { open, section?, chapter? })` sale del alta (al evento o a la lista). */
  onDone,
  /** Para abrir / publicar desde la pantalla "Listo" con el control de venta real. */
  onSetEventState,
}) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  // Hasta dónde se llegó: se puede volver a cualquier paso visto, no saltear.
  const [maxStep, setMaxStep] = useState(0)
  const [doneEvent, setDoneEvent] = useState(null)
  const stepId = STEPS[step]
  const [draft, setDraft] = useState(() => ({ ...createAdminEventDraft(), ...initialDraft }))
  const [logo, setLogo] = useState(initialLogo)
  const [logoPending, setLogoPending] = useState(false)
  // Cuántos se cargaron seguidos en esta pantalla y cuál fue el último.
  const [created, setCreated] = useState({ count: 0, lastTitle: '' })
  // Remonta el selector de logo al pasar al siguiente evento.
  const [stageKey, setStageKey] = useState(0)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const platformChannels = usePlatformPaymentChannels()
  const [bankProfiles, setBankProfiles] = useState([])
  const [mpProfiles, setMpProfiles] = useState([])
  const formRef = useRef(null)
  const initialSignatureRef = useRef(JSON.stringify(draft))

  const preview = mapDraftToPreviewEvent(draft)
  // La landing tal como la va a guardar el alta: plantilla, tema y colores.
  const pageLanding = normalizeEventLanding(draft.landing ?? emptyEventLanding('meet'))
  // El slug se deriva del título y del año. Mientras no haya título no se
  // muestra uno de relleno: "evento-preview" se leía como una dirección real.
  const slugPreview = draft.title?.trim() && draft.startsAt ? `/${preview.slug}` : ''
  const requiresMembership = draft.requiresMembership !== false
  const isDirty =
    JSON.stringify(draft) !== initialSignatureRef.current || Boolean(logo && logo !== initialLogo)

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

  // La transferencia necesita un destino de cobro. Si el evento la deja abierta
  // en algún concepto se pide el perfil acá, en vez de descubrir la falta de
  // alias en el 400 del guardado.
  const transferOpen = ['registration', 'ticket'].some((concept) =>
    effectiveEventChannelsFor(
      draft.paymentChannelOverrides,
      concept,
      platformCellsFor(platformChannels.platform, concept),
    ).includes('bank_transfer'),
  )
  const mpOpen = ['registration', 'ticket'].some((concept) =>
    effectiveEventChannelsFor(
      draft.paymentChannelOverrides,
      concept,
      platformCellsFor(platformChannels.platform, concept),
    ).includes('mercado_pago'),
  )

  useEffect(() => {
    if (!transferOpen) return undefined
    let alive = true
    fetchPaymentProfiles({ kind: 'bank_transfer' })
      .then((result) => {
        if (alive) setBankProfiles(result.profiles ?? [])
      })
      .catch(() => {
        if (alive) setBankProfiles([])
      })
    return () => {
      alive = false
    }
  }, [transferOpen])

  // Catálogo MP para los avisos de publicación (cuenta general vs perfil /
  // reconectar) sin abrir el editor completo.
  useEffect(() => {
    if (!mpOpen) return undefined
    let alive = true
    fetchPaymentProfiles({ kind: 'mercado_pago', includeArchived: true })
      .then((result) => {
        if (alive) setMpProfiles(result.profiles ?? [])
      })
      .catch(() => {
        if (alive) setMpProfiles([])
      })
    return () => {
      alive = false
    }
  }, [mpOpen])

  // El preset solo precarga política (acceso, plantilla, venta); duplicar ya trae
  // su propia configuración, así que ahí no se ofrece.
  const [presetId, setPresetId] = useState(DEFAULT_EVENT_PRESET_ID)
  const presetOptions = EVENT_PRESET_IDS.map((id) => [
    id,
    t(`admin.eventQuickCreate.preset${id[0].toUpperCase()}${id.slice(1)}`),
  ])
  const presetSummary = describeEventPreset(presetId)
  const presetNote = presetSummary.length
    ? t('admin.eventQuickCreate.presetsSummary', {
        access: t(
          presetSummary.find((item) => item.key === 'access')?.value === 'members'
            ? 'admin.eventState.accessMembers'
            : 'admin.eventState.accessOpen',
        ),
        landing: t(
          `admin.eventEditor.landingTemplate${presetSummary
            .find((item) => item.key === 'landing')
            ?.value.replace(/^./, (char) => char.toUpperCase())}`,
        ),
        sales: t(
          presetSummary.find((item) => item.key === 'sales')?.value === 'announce'
            ? 'admin.eventQuickCreate.presetsSalesAnnounce'
            : 'admin.eventQuickCreate.presetsSalesCharge',
        ),
      })
    : t('admin.eventQuickCreate.presetsBlankNote')

  function selectPreset(nextId) {
    setPresetId(nextId)
    patch(applyEventPreset(draft, nextId))
  }

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

  const visibilityOptions = [
    ['hidden', t('admin.eventQuickCreate.visHidden')],
    ['published', t('admin.eventQuickCreate.visPublished')],
  ]
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
    if (!isDirty || submitting || doneEvent) return undefined
    function warn(event) {
      event.preventDefault()
      // Chrome exige returnValue para mostrar el aviso nativo.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [doneEvent, isDirty, submitting])

  function requestCancel() {
    if (submitting) return
    if (doneEvent) {
      finish({ open: false })
      return
    }
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

  function handleSubmit(event) {
    event.preventDefault()
    return submit({ another: false })
  }

  /**
   * Lo que se repite entre un meet y el siguiente de la misma tanda (sede,
   * ciudad, cupo, acceso y modo de inscripción) queda cargado; lo que cambia
   * (título, fechas, logo) se vacía.
   */
  function startNextEvent(savedTitle) {
    const next = {
      ...createAdminEventDraft(),
      venue: draft.venue,
      location: draft.location,
      slots: draft.slots,
      requiresMembership: draft.requiresMembership,
      // Plantilla y tema (parte del preset) se repiten; los slots son del evento anterior.
      landing: emptyEventLanding(
        normalizeEventLanding(draft.landing).templateId,
        normalizeEventLanding(draft.landing).themeId,
      ),
      status: draft.status,
      published: draft.published,
      // Los medios de cobro se repiten casi siempre de un meet al siguiente.
      paymentChannelOverrides: draft.paymentChannelOverrides,
      bankTransfer: draft.bankTransfer,
      bankTransferProfileId: draft.bankTransferProfileId,
      mercadoPagoProfileId: draft.mercadoPagoProfileId,
      salesIntent: draft.salesIntent,
      cashPayment: draft.cashPayment,
    }
    initialSignatureRef.current = JSON.stringify(next)
    setDraft(next)
    setLogo(null)
    setStageKey((current) => current + 1)
    setFieldErrors({})
    setCreated((current) => ({ count: current.count + 1, lastTitle: savedTitle }))
    setDoneEvent(null)
    setStep(0)
    setMaxStep(0)
    requestAnimationFrame(() => formRef.current?.querySelector('[name="title"]')?.focus?.())
  }

  /** Errores del borrador entero: los del esquema más los del modo de inscripción. */
  function collectErrors() {
    const validation = validateAdminEventDraft(draft, t)
    const errors = validation.ok ? {} : { ...validation.fieldErrors }
    if (registrationMode === 'scheduled') {
      if (!draft.registrationOpensAt) {
        errors.registrationOpensAt = t('admin.eventQuickCreate.regScheduledRequired')
      } else if (new Date(draft.registrationOpensAt) <= new Date()) {
        // Una fecha pasada abriría la inscripción apenas se crea el evento.
        errors.registrationOpensAt = t('admin.eventQuickCreate.regScheduledFuture')
      } else if (draft.startsAt && draft.registrationOpensAt >= draft.startsAt) {
        errors.registrationOpensAt = t('admin.eventQuickCreate.regBeforeStart')
      }
    }
    return errors
  }

  function showStep(index) {
    setStep(index)
    setMaxStep((current) => Math.max(current, index))
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView?.({ block: 'start' })
      formRef.current
        ?.querySelector('.admin-event-quick__body input:not([type="hidden"]), .admin-event-quick__body button')
        ?.focus?.({ preventScroll: true })
    })
  }

  /** "Siguiente": solo frena por los errores de este paso. */
  function goNext() {
    const errors = Object.fromEntries(
      Object.entries(collectErrors()).filter(([key]) => quickCreateStepForField(key) === stepId),
    )
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      requestAnimationFrame(() => focusFirstInvalid(Object.keys(errors)[0]))
      return
    }
    setFieldErrors({})
    showStep(Math.min(step + 1, STEPS.length - 1))
  }

  /** Sale del alta desde "Listo": al evento recién creado o a la lista. */
  function finish(options) {
    if (onDone) onDone(doneEvent, options)
    else onCancel?.()
  }

  async function setDoneEventState(slug, patch) {
    const result = await onSetEventState?.(slug, patch)
    if (result?.event) setDoneEvent(result.event)
    return result
  }

  async function submit({ another }) {
    setSubmitError(null)

    const errors = collectErrors()
    if (Object.keys(errors).length > 0) {
      // El primer error en el orden de los pasos: se vuelve a ese paso.
      const firstKey =
        Object.keys(errors).sort(
          (a, b) =>
            STEPS.indexOf(quickCreateStepForField(a)) - STEPS.indexOf(quickCreateStepForField(b)),
        )[0]
      setFieldErrors(errors)
      // La landing no tiene un campo por regla (bloques, colores): sin esto el
      // alta se frenaba sin decir por qué.
      if (firstKey.startsWith('landing')) setSubmitError(errors[firstKey])
      setStep(STEPS.indexOf(quickCreateStepForField(firstKey)))
      requestAnimationFrame(() => requestAnimationFrame(() => focusFirstInvalid(firstKey)))
      return
    }

    // Publicar al crear es lo que ve el público: se avisa si el evento quedaría
    // sin cobro posible. Es un aviso, no un bloqueo (ver eventPublishChecks).
    if (draft.published === true) {
      const checks = resolveEventPublishConfirmChecks(draft, platformChannels.platform, {
        mpProfiles,
      })
      if (checks.length > 0) {
        const lines = checks.map((code) => `• ${t(`admin.eventEditor.publishChecks.codes.${code}`)}`)
        const proceed = window.confirm(
          [
            t('admin.eventEditor.publishChecks.bulkIntro', { count: 1 }),
            lines.join('\n'),
            t('admin.eventEditor.publishChecks.confirmOutro'),
          ].join('\n\n'),
        )
        if (!proceed) return
      }
    }

    setFieldErrors({})
    setSubmitting(true)
    try {
      const result = await onSubmit?.({ ...draft, slug: preview.slug }, { logo, another })
      if (result?.error) throw new Error(result.error)
      if (another) startNextEvent(draft.title.trim())
      else {
        // Lo que devolvió el servidor manda; el borrador completa lo que no traiga.
        setDoneEvent({
          ...mapDraftToPreviewEvent(draft),
          ...draft,
          slug: preview.slug,
          ...result?.event,
        })
        requestAnimationFrame(() => document.getElementById('admin-event-quick-done-title')?.focus?.())
      }
    } catch (error) {
      setSubmitError(error?.message ?? t('admin.eventEditor.saveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const err = (key) => fieldErrors[key]

  if (doneEvent) {
    return (
      <section className="admin-event-quick" aria-labelledby="admin-event-quick-done-title">
        {/* "Listo": el evento existe. Lo que importa ahora es si ya se puede
            vender; se responde con el mismo control que el Resumen. */}
        <div className="admin-event-quick__done">
          <span className="admin-event-quick__eyebrow">
            <Check size={13} aria-hidden />
            {t('admin.eventQuickCreate.doneEyebrow')}
          </span>
          <h2 id="admin-event-quick-done-title" tabIndex={-1}>
            {doneEvent.title}
          </h2>
          {doneEvent.slug ? (
            <p className="admin-event-quick__slug">
              <Link2 size={14} aria-hidden />
              <code>/{doneEvent.slug}</code>
            </p>
          ) : null}
          <AdminEventSaleControl
            canEdit={canEdit}
            event={doneEvent}
            onFix={(chapter) => finish({ open: true, section: 'sales', chapter })}
            onSetEventState={onSetEventState ? setDoneEventState : undefined}
          />
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
          <div className="admin-event-quick__done-actions">
            {onDone ? (
              <Button
                type="button"
                variant="gold"
                className="btn--small"
                onClick={() => finish({ open: true })}
              >
                {t('admin.eventQuickCreate.doneOpen')}
                <ArrowRight size={15} aria-hidden />
              </Button>
            ) : null}
            {/* La landing se termina en el editor visual: entra directo, sin
                buscarlo en Visibilidad (ver landingStudioSession.js). */}
            {onDone && doneEvent.id ? (
              <Button
                type="button"
                variant="outline"
                className="btn--small"
                onClick={() => {
                  markLandingStudioForReopen(doneEvent.id)
                  finish({ open: true, section: 'visibility' })
                }}
              >
                <PanelsTopLeft size={15} aria-hidden />
                {t('admin.eventQuickCreate.doneDesignLanding')}
              </Button>
            ) : null}
            <button
              type="button"
              className="admin-event-quick__cancel"
              onClick={() => startNextEvent(doneEvent.title ?? '')}
            >
              <Plus size={15} aria-hidden />
              {t('admin.eventQuickCreate.doneAnother')}
            </button>
            <button
              type="button"
              className="admin-event-quick__cancel"
              onClick={() => finish({ open: false })}
            >
              {t('admin.eventQuickCreate.doneList')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  const lastStep = step === STEPS.length - 1

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
              {duplicateOf ? (
                <p className="admin-event-quick__access-note">
                  <Copy size={14} aria-hidden />
                  {t('admin.eventQuickCreate.duplicateNote', { title: duplicateOf })}
                </p>
              ) : null}
            </div>

            {/* Pasos: se puede volver a cualquiera ya visto; avanzar valida. */}
            <ol className="admin-event-quick__steps" aria-label={t('admin.eventQuickCreate.stepsLabel')}>
              {STEPS.map((id, index) => (
                <li key={id}>
                  <button
                    type="button"
                    className={`admin-event-quick__step${index === step ? ' is-current' : ''}${index < step ? ' is-done' : ''}`}
                    aria-current={index === step ? 'step' : undefined}
                    disabled={submitting || index > maxStep}
                    onClick={() => showStep(index)}
                  >
                    <span className="admin-event-quick__step-index" aria-hidden>
                      {index < step ? <Check size={12} /> : index + 1}
                    </span>
                    {t(`admin.eventQuickCreate.step_${id}`)}
                  </button>
                </li>
              ))}
            </ol>

            {stepId === 'event' ? (
              <div
                className="admin-event-quick__body"
                role="group"
                aria-labelledby="quick-step-event"
              >
                <h3 className="admin-event-quick__step-title" id="quick-step-event">
                  {t('admin.eventQuickCreate.step_event')}
                </h3>
                {duplicateOf ? null : (
                  <div
                    className="admin-event-quick__section admin-event-quick__section--presets"
                    role="group"
                    aria-labelledby="quick-event-preset"
                  >
                    <h3 className="admin-event-quick__section-title" id="quick-event-preset">
                      {t('admin.eventQuickCreate.presetsLabel')}
                    </h3>
                    <AdminFilterChipGroup
                      compact
                      disabled={!canEdit || submitting}
                      id="quick-event-preset-chips"
                      ariaLabel={t('admin.eventQuickCreate.presetsLabel')}
                      value={presetId}
                      onChange={selectPreset}
                      options={presetOptions}
                    />
                    <p className="admin-event-quick__access-note">{presetNote}</p>
                  </div>
                )}

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

                {/* El logo se elige acá y se sube apenas el evento existe: antes
                    había que crearlo, entrar a su ficha y recién ahí subirlo. */}
                <AdminEventLogoStage
                  key={stageKey}
                  disabled={!canEdit || submitting}
                  initialFile={stageKey === 0 ? initialLogo : null}
                  onChange={setLogo}
                  onPendingChange={setLogoPending}
                />

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
              </div>
            ) : null}
            {stepId === 'sales' ? (
              <div
                className="admin-event-quick__body"
                role="group"
                aria-labelledby="quick-step-sales"
              >
                <h3 className="admin-event-quick__step-title" id="quick-step-sales">
                  {t('admin.eventQuickCreate.step_sales')}
                </h3>
                <div
                  className="admin-event-quick__section"
                  role="group"
                  aria-labelledby="quick-event-price"
                >
                  <h3 className="admin-event-quick__section-title" id="quick-event-price">
                    {t('admin.eventQuickCreate.sectionPrice')}
                  </h3>
                  <label
                    className={`admin-event-quick__field admin-event-quick__field--price${err('pricing.registration') ? ' is-invalid' : ''}`}
                    htmlFor="quick-event-price-registration"
                  >
                    <span className="admin-event-quick__label">
                      {t('admin.eventEditor.priceRegistration')}
                    </span>
                    <span className="admin-event-quick__money">
                      <span aria-hidden>{t('admin.eventEditor.priceCurrency')}</span>
                      <input
                        id="quick-event-price-registration"
                        name="pricing.registration"
                        min={1}
                        required
                        type="number"
                        value={draft.pricing?.registration ?? DEFAULT_EVENT_PRICING.registration}
                        aria-invalid={Boolean(err('pricing.registration'))}
                        onChange={(event) =>
                          patch(updatePricingField(draft, 'registration', event.target.value))
                        }
                        disabled={!canEdit || submitting}
                      />
                    </span>
                    {err('pricing.registration') ? (
                      <small role="alert">{err('pricing.registration')}</small>
                    ) : null}
                  </label>
                  <p className="admin-event-quick__access-note">
                    {t('admin.eventQuickCreate.priceNote')}
                  </p>
                  {draft.salesIntent === 'announce' ? (
                    <p className="admin-event-quick__access-note">
                      <Banknote size={14} aria-hidden />
                      {t('admin.eventQuickCreate.announceNote')}
                    </p>
                  ) : null}
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

                <div
                  className="admin-event-quick__section"
                  role="group"
                  aria-labelledby="quick-event-payments"
                >
                  <h3 className="admin-event-quick__section-title" id="quick-event-payments">
                    {t('admin.eventQuickCreate.sectionPayments')}
                  </h3>
                  <p className="admin-event-quick__access-note">
                    <Banknote size={14} aria-hidden />
                    {t('admin.eventQuickCreate.paymentsNote')}
                  </p>
                  <EventPaymentChannelMatrix
                    idPrefix="quick"
                    showLead={false}
                    value={draft.paymentChannelOverrides}
                    onChange={(next) => patch({ ...draft, paymentChannelOverrides: next })}
                    platform={platformChannels.platform}
                    platformStatus={platformChannels.status}
                    canEdit={canEdit && !submitting}
                    ticketError={err('paymentChannelOverrides.ticket')}
                  />
                  {transferOpen ? (
                    <label className="admin-event-quick__field" htmlFor="quick-event-bank-profile">
                      <span className="admin-event-quick__label">
                        {t('admin.eventEditor.bankTransferProfile')}
                      </span>
                      <select
                        id="quick-event-bank-profile"
                        name="bankTransferProfileId"
                        value={draft.bankTransferProfileId ?? ''}
                        onChange={(event) =>
                          patch({ ...draft, bankTransferProfileId: event.target.value || null })
                        }
                        disabled={!canEdit || submitting}
                      >
                        <option value="">{t('admin.eventEditor.bankTransferProfileNone')}</option>
                        {bankProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                            {profile.config?.alias ? ` · ${profile.config.alias}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
            {stepId === 'page' ? (
              <div
                className="admin-event-quick__body"
                role="group"
                aria-labelledby="quick-step-page"
              >
                <h3 className="admin-event-quick__step-title" id="quick-step-page">
                  {t('admin.eventQuickCreate.step_page')}
                </h3>
                <div
                  className="admin-event-quick__section"
                  role="group"
                  aria-labelledby="quick-event-landing"
                >
                  <h3 className="admin-event-quick__section-title" id="quick-event-landing">
                    {t('admin.eventQuickCreate.sectionLanding')}
                  </h3>
                  <LandingTemplatePicker
                    t={t}
                    disabled={!canEdit || submitting}
                    value={pageLanding.templateId}
                    themeId={pageLanding.themeId}
                    palette={pageLanding.layout?.palette}
                    onChange={(templateId) =>
                      patch({ ...draft, landing: { ...pageLanding, templateId } })
                    }
                  />
                  <LandingColorPicker
                    t={t}
                    disabled={!canEdit || submitting}
                    themeId={pageLanding.themeId}
                    palette={pageLanding.layout?.palette}
                    onThemeChange={(themeId) =>
                      patch({ ...draft, landing: { ...pageLanding, themeId } })
                    }
                    onPaletteChange={(palette) =>
                      patch({
                        ...draft,
                        landing: {
                          ...pageLanding,
                          layout: { ...(pageLanding.layout ?? {}), palette },
                        },
                      })
                    }
                  />
                </div>

                <div
                  className="admin-event-quick__section"
                  role="group"
                  aria-labelledby="quick-event-visibility"
                >
                  <h3 className="admin-event-quick__section-title" id="quick-event-visibility">
                    {t('admin.eventQuickCreate.sectionVisibility')}
                  </h3>
                  <AdminFilterChipGroup
                    compact
                    disabled={!canEdit || submitting}
                    id="quick-event-visibility-mode"
                    label={t('admin.eventQuickCreate.visLabel')}
                    value={draft.published === true ? 'published' : 'hidden'}
                    onChange={(value) => patch({ ...draft, published: value === 'published' })}
                    options={visibilityOptions}
                  />
                  <p className="admin-event-quick__access-note">
                    {draft.published === true ? (
                      <Eye size={14} aria-hidden />
                    ) : (
                      <EyeOff size={14} aria-hidden />
                    )}
                    {draft.published === true
                      ? t('admin.eventQuickCreate.visPublishedNote')
                      : t('admin.eventQuickCreate.visHiddenNote')}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="admin-event-quick__messages">
              {created.count > 0 ? (
                <p className="admin-event-quick__created" role="status">
                  <Check size={15} aria-hidden />
                  <span>
                    {t('admin.eventQuickCreate.createdAnother', { title: created.lastTitle })}
                    {created.count > 1 ? (
                      <small>{t('admin.eventQuickCreate.createdTally', { count: created.count })}</small>
                    ) : null}
                  </span>
                </p>
              ) : null}

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
              {stepId === 'page'
                ? t('admin.eventQuickCreate.previewCoverLabel')
                : t('admin.eventQuickCreate.previewLabel')}
            </p>
            {/* En "Página" se decide cómo se ve: la muestra pasa a ser la portada
                en la plantilla y los colores elegidos. */}
            {stepId === 'page' ? (
              <LandingCoverPreview
                t={t}
                templateId={pageLanding.templateId}
                themeId={pageLanding.themeId}
                palette={pageLanding.layout?.palette}
                event={preview}
              />
            ) : (
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
            )}
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
              {draft.published === true
                ? t('admin.eventQuickCreate.publishedNote')
                : t('admin.eventQuickCreate.hiddenNote')}
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
          {step > 0 ? (
            <button
              type="button"
              className="admin-event-quick__cancel"
              onClick={() => showStep(step - 1)}
              disabled={submitting}
            >
              <ArrowLeft size={14} aria-hidden />
              {t('admin.eventQuickCreate.stepBack')}
            </button>
          ) : (
            <button
              type="button"
              className="admin-event-quick__cancel"
              onClick={requestCancel}
              disabled={submitting}
            >
              {created.count > 0 ? t('admin.eventQuickCreate.done') : t('common.cancel')}
            </button>
          )}
          {lastStep ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="btn--small"
                disabled={!canEdit || submitting || logoPending}
                onClick={() => void submit({ another: true })}
              >
                {t('admin.eventQuickCreate.submitAnother')}
              </Button>
              <Button
                type="submit"
                variant="gold"
                className="btn--small"
                disabled={!canEdit || submitting || logoPending}
              >
                <Plus size={15} aria-hidden />
                {submitting
                  ? t('admin.eventQuickCreate.submitting')
                  : t('admin.eventQuickCreate.submit')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="gold"
              className="btn--small"
              disabled={!canEdit || submitting}
              onClick={goNext}
            >
              {t('admin.eventQuickCreate.stepNext', {
                step: t(`admin.eventQuickCreate.step_${STEPS[step + 1]}`),
              })}
              <ArrowRight size={15} aria-hidden />
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
