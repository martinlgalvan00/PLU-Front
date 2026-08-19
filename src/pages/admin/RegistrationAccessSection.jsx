import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Inbox,
  KeyRound,
  LockKeyhole,
  Power,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import { ApiError } from '../../lib/api.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getAccessGatesTourSteps } from '../../lib/adminTourSteps.js'
import {
  fetchPlatformFeatureToggles,
  savePaymentChannel,
  savePlatformFeatureToggle,
} from '../../services/platformSettingsAdminService.js'
import '../../styles/pages/admin-registration-access.css'

const EMPTY_GATE = {
  scope: 'membership',
  eventSlug: '',
  label: '',
  code: '',
  active: true,
  startsAt: '',
  endsAt: '',
}

/**
 * El maestro va aparte: apagado, corta todo lo demás.
 */
const CHECKOUT_FEATURE = {
  feature: 'checkout',
  key: 'checkoutEnabled',
  i18n: 'checkout',
  state: 'checkout',
  master: true,
}

/**
 * Un bloque por concepto, que es la pregunta que se hace quien opera: "¿qué le
 * pasa a Afiliaciones?". Dentro del bloque, tres ejes independientes: el alta
 * manda, los canales son los medios con los que se cobra ese concepto, y la
 * validación cierra el bloque.
 *
 * Antes esto eran cuatro grupos por eje, con los medios de pago fusionados en un
 * solo interruptor "transferencia y efectivo" y Mercado Pago sin control alguno.
 *
 * `channels` no incluye `cash_pitbull` para entradas: el checkout de entradas no
 * ofrece efectivo, y un interruptor sin efecto es justamente lo que esta
 * pantalla dejó de tener. La celda existe en la matriz por consistencia, pero no
 * se ofrece hasta que ese medio exista en la compra.
 */
const CONCEPT_BLOCKS = [
  {
    concept: 'membership',
    i18n: 'membershipToggle',
    intake: { feature: 'membership', key: 'membershipEnabled' },
    validation: {
      feature: 'membership_validation',
      key: 'membershipValidationEnabled',
      i18n: 'membershipValidation',
    },
    channels: ['mercado_pago', 'bank_transfer', 'cash_pitbull'],
  },
  {
    concept: 'registration',
    i18n: 'registrationToggle',
    intake: { feature: 'registration', key: 'registrationEnabled' },
    validation: {
      feature: 'registration_validation',
      key: 'registrationValidationEnabled',
      i18n: 'registrationValidation',
    },
    channels: ['mercado_pago', 'bank_transfer', 'cash_pitbull'],
  },
  {
    concept: 'ticket',
    i18n: 'ticketToggle',
    intake: { feature: 'ticket', key: 'ticketEnabled' },
    validation: {
      feature: 'ticket_validation',
      key: 'ticketValidationEnabled',
      i18n: 'ticketValidation',
    },
    channels: ['mercado_pago', 'bank_transfer'],
  },
]

const TOGGLE_FEATURES = [
  CHECKOUT_FEATURE,
  ...CONCEPT_BLOCKS.flatMap((block) => [block.intake, block.validation]),
]

const CHANNEL_CELLS = CONCEPT_BLOCKS.flatMap((block) =>
  block.channels.map((channel) => ({ concept: block.concept, channel })),
)

/**
 * Fila de interruptor. El estado vive en una sola columna —la derecha, junto al
 * control que lo cambia— y a la izquierda queda un indicador de ancho fijo: así
 * todos los nombres arrancan en la misma X y la columna se lee de un vistazo.
 *
 * La usan los tres ejes (alta, canal y validación) porque hacen lo mismo: un
 * booleano con nombre, estado y consecuencia. Lo que cambia es el encabezado del
 * bloque, el acento celeste del maestro y el tamaño de la fila del canal.
 */
function ToggleRule({
  ariaLabel,
  busy,
  canEdit,
  enabled,
  headingLevel: Heading = 'h3',
  lead,
  loading,
  master = false,
  muted = false,
  onToggle,
  stateLabels,
  t,
  title,
  variant = 'primary',
}) {
  const tone = enabled ? 'on' : 'off'
  const stateLabel = enabled ? stateLabels.on : stateLabels.off

  return (
    <div
      className={[
        'admin-registration-access__rule',
        `admin-registration-access__rule--${variant}`,
        master ? 'admin-registration-access__rule--master' : '',
        master && !enabled ? 'admin-registration-access__rule--halted' : '',
        // Celda abierta con el concepto cerrado: sigue siendo configuración
        // válida (queda lista para la reapertura), pero no está cobrando.
        muted && enabled ? 'admin-registration-access__rule--muted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* El maestro es el único que gana icono: ahí el símbolo de encendido
          informa el rol de la fila en vez de decorar. */}
      <span
        className={`admin-registration-access__dot admin-registration-access__dot--${tone}`}
        aria-hidden
      >
        {master ? <Power size={15} /> : null}
      </span>
      <div className="admin-registration-access__rule-copy">
        <Heading>{title}</Heading>
        {lead ? <p>{lead}</p> : null}
      </div>
      {canEdit ? (
        <label className="admin-registration-access__switch">
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading || busy}
            onChange={(event) => onToggle(event.target.checked)}
            aria-label={ariaLabel}
          />
          <span>{busy ? t('admin.sections.accessGates.saving') : stateLabel}</span>
        </label>
      ) : (
        <span
          className={`admin-registration-access__state admin-registration-access__state--${tone}`}
        >
          {stateLabel}
        </span>
      )}
    </div>
  )
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function gateStateKey(gate, now = new Date()) {
  if (!gate?.active) return 'closed'
  if (gate.startsAt && new Date(gate.startsAt) > now) return 'scheduled'
  if (gate.endsAt && new Date(gate.endsAt) <= now) return 'expired'
  return 'open'
}

function isGateReopenable(gate) {
  if (!gate) return false
  const state = gateStateKey(gate)
  return state === 'closed' || state === 'expired'
}

function mapOperationalError(error, messages) {
  if (error instanceof ApiError) {
    if (error.status === 404) return messages.routeMissing
    if (error.status === 0) return messages.apiDown
  }
  const raw = error?.message ?? ''
  if (raw === 'Ruta no encontrada') return messages.routeMissing
  return raw || messages.fallback
}

export default function RegistrationAccessSection({
  configuration = { membershipGate: null, eventGates: [] },
  adminEvents = [],
  canEdit = false,
  isLoading = false,
  error = null,
  onRefresh,
  onSave,
  onDelete,
  onToggleSaved,
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()

  useEffect(() => {
    startTour('admin-access-gates', getAccessGatesTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  const [draft, setDraft] = useState(null)
  const [notice, setNotice] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  // Vacío = todo abierto: la fila se lee con `!== false`, así que un interruptor
  // nuevo no necesita sumarse acá para arrancar habilitado.
  const [toggles, setToggles] = useState({})
  const [togglesLoading, setTogglesLoading] = useState(true)
  const [togglesError, setTogglesError] = useState('')
  const [savingFeature, setSavingFeature] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const formRef = useRef(null)
  const triggerRef = useRef(null)
  const shouldFocusEditorRef = useRef(false)
  const eventGates = configuration.eventGates ?? []
  const events = useMemo(
    () => adminEvents.filter((event) => event.slug && event.status !== 'archived'),
    [adminEvents],
  )

  // Lo primero que pregunta el operador es "¿está todo abierto?". Contarlo acá
  // evita tener que leer interruptor por interruptor para responderlo. Entran los
  // dos tipos: los booleanos por concepto y las celdas de la matriz de canales.
  const togglesSummary = useMemo(() => {
    const openToggles = TOGGLE_FEATURES.filter((feature) => toggles[feature.key] !== false).length
    const openChannels = CHANNEL_CELLS.filter(
      ({ concept, channel }) => toggles.paymentChannels?.[concept]?.[channel] !== false,
    ).length
    const open = openToggles + openChannels
    const total = TOGGLE_FEATURES.length + CHANNEL_CELLS.length
    return { open, total, allOpen: open === total }
  }, [toggles])

  // Un concepto sin ningún medio abierto no cobra, aunque su alta esté en ON. Es
  // un estado configurable a propósito, así que se avisa en vez de impedirse.
  const conceptsWithoutChannel = useMemo(
    () =>
      CONCEPT_BLOCKS.filter(
        (block) =>
          toggles.paymentChannels &&
          block.channels.every(
            (channel) => toggles.paymentChannels[block.concept]?.[channel] === false,
          ),
      ).map((block) => block.concept),
    [toggles],
  )

  const operationalMessages = useMemo(
    () => ({
      routeMissing: t('admin.sections.accessGates.routeMissing'),
      apiDown: t('admin.sections.accessGates.apiDown'),
      fallback: t('admin.sections.accessGates.togglesLoadError'),
    }),
    [t],
  )

  const loadToggles = useCallback(async () => {
    setTogglesLoading(true)
    setTogglesError('')
    try {
      setToggles(await fetchPlatformFeatureToggles())
    } catch (loadError) {
      setTogglesError(mapOperationalError(loadError, operationalMessages))
    } finally {
      setTogglesLoading(false)
    }
  }, [operationalMessages])

  useEffect(() => {
    onRefresh?.()
  }, [onRefresh])

  useEffect(() => {
    void loadToggles()
  }, [loadToggles])

  // shouldFocusEditorRef, prendido solo por openEditor(), evita que el efecto
  // reenfoque en cada tecla (el draft cambia en cada keystroke) y también
  // vuelve a enfocar si se abre otra fila mientras el formulario ya estaba
  // abierto.
  useEffect(() => {
    if (!draft || !shouldFocusEditorRef.current) return undefined
    shouldFocusEditorRef.current = false
    const form = formRef.current
    if (typeof form?.scrollIntoView === 'function') {
      form.scrollIntoView({ block: 'nearest' })
    }
    const firstField = form?.querySelector(
      'input:not([disabled]):not([type="checkbox"]), select:not([disabled]), textarea:not([disabled])',
    )
    firstField?.focus?.()
    return undefined
  }, [draft])

  /**
   * Un solo camino de guardado para los dos tipos de interruptor: `save` es la
   * llamada concreta y `id` la clave con la que la fila muestra "Guardando…".
   */
  async function persistToggle(id, save) {
    setSavingFeature(id)
    setTogglesError('')
    try {
      setToggles(await save())
      await onToggleSaved?.()
    } catch (toggleError) {
      setTogglesError(
        mapOperationalError(toggleError, {
          ...operationalMessages,
          fallback: t('admin.sections.accessGates.togglesSaveError'),
        }),
      )
    } finally {
      setSavingFeature(null)
    }
  }

  const handleToggleFeature = (feature, enabled) =>
    persistToggle(feature, () => savePlatformFeatureToggle(feature, enabled))

  const handleToggleChannel = (concept, channel, enabled) =>
    persistToggle(`${concept}:${channel}`, () => savePaymentChannel(concept, channel, enabled))

  function openEditor(gate = null, scope = 'membership', trigger = null) {
    triggerRef.current = trigger
    shouldFocusEditorRef.current = true
    setNotice('')
    setFormError('')
    const reopening = isGateReopenable(gate)
    setDraft(
      gate
        ? {
            scope: gate.scope,
            eventSlug: gate.eventSlug ?? '',
            label: gate.label,
            code: '',
            active: reopening ? true : gate.active,
            startsAt: reopening ? '' : toLocalDateTime(gate.startsAt),
            endsAt: reopening ? '' : toLocalDateTime(gate.endsAt),
          }
        : {
            ...EMPTY_GATE,
            scope,
            eventSlug: scope === 'registration' ? (events[0]?.slug ?? '') : '',
          },
    )
  }

  function cancelEditor() {
    setDraft(null)
    setFormError('')
    const trigger = triggerRef.current
    triggerRef.current = null
    if (typeof trigger?.focus === 'function') {
      trigger.focus()
    }
  }

  const currentGate =
    draft?.scope === 'membership'
      ? configuration.membershipGate
      : (eventGates.find((gate) => gate.eventSlug === draft?.eventSlug) ?? null)
  const reopeningDraft = Boolean(draft && isGateReopenable(currentGate))
  const requiresNewCode = Boolean(draft?.active && (!currentGate?.active || reopeningDraft))

  async function submit(event) {
    event.preventDefault()
    setFormError('')
    setNotice('')
    const trimmedLabel = draft?.label.trim() ?? ''
    const trimmedCode = draft?.code.trim() ?? ''
    if (!trimmedLabel) {
      setFormError(t('admin.sections.accessGates.labelRequired'))
      return
    }
    if (draft.scope === 'registration' && !draft.eventSlug) {
      setFormError(t('admin.sections.accessGates.eventRequired'))
      return
    }
    if (requiresNewCode && !trimmedCode) {
      setFormError(t('admin.sections.accessGates.codeRequired'))
      return
    }
    setSaving(true)
    const result = await onSave?.({
      ...draft,
      eventSlug: draft.scope === 'registration' ? draft.eventSlug.trim() : undefined,
      label: trimmedLabel,
      code: trimmedCode || undefined,
    })
    setSaving(false)
    if (result?.error) {
      setFormError(
        mapOperationalError(
          {
            message: result.error,
            status: result.error === 'Ruta no encontrada' ? 404 : undefined,
          },
          {
            ...operationalMessages,
            fallback: t('admin.sections.accessGates.saveError'),
          },
        ),
      )
      return
    }
    setDraft(null)
    triggerRef.current = null
    setNotice(t('admin.sections.accessGates.saved'))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    const result = await onDelete?.(deleteTarget.id)
    setDeleting(false)
    if (result?.error) {
      setDeleteError(result.error)
      return
    }
    setDeleteTarget(null)
    setNotice(t('admin.sections.accessGates.deleted'))
  }

  const gatesError = error
    ? mapOperationalError(
        { message: error, status: error === 'Ruta no encontrada' ? 404 : undefined },
        {
          ...operationalMessages,
          fallback: t('admin.sections.accessGates.gatesLoadError'),
        },
      )
    : ''

  function stateLabel(key) {
    return t(`admin.sections.accessGates.state.${key}`)
  }

  function stateClass(key) {
    if (key === 'open') return 'abierta'
    if (key === 'scheduled') return 'programada'
    if (key === 'expired') return 'vencida'
    return 'cerrada'
  }

  function formatEndsAt(value) {
    if (!value) return ''
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    )
  }

  return (
    <section className="admin-registration-access" aria-labelledby="access-gates-title">
      <header className="admin-registration-access__hero">
        <div className="admin-registration-access__hero-copy">
          <p className="admin-registration-access__eyebrow">
            <KeyRound size={14} aria-hidden />
            {t('admin.sections.accessGates.eyebrow')}
          </p>
          <h1 id="access-gates-title">{t('admin.sections.accessGates.title')}</h1>
          <p className="admin-registration-access__subtitle">
            {t('admin.sections.accessGates.subtitle')}
          </p>
        </div>
        <button
          type="button"
          className="admin-registration-access__button admin-registration-access__button--quiet"
          onClick={() => {
            onRefresh?.()
            void loadToggles()
          }}
          disabled={isLoading || togglesLoading}
        >
          <RefreshCw size={15} aria-hidden />
          {t('admin.sections.accessGates.refresh')}
        </button>
      </header>

      {gatesError ? (
        <div
          className="admin-registration-access__message admin-registration-access__message--error"
          role="alert"
        >
          <XCircle size={15} aria-hidden />
          <span>{gatesError}</span>
          <button
            type="button"
            className="admin-registration-access__button"
            onClick={() => onRefresh?.()}
          >
            {t('admin.sections.accessGates.retry')}
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="admin-registration-access__notice" role="status">
          <ShieldCheck size={15} aria-hidden /> {notice}
        </p>
      ) : null}
      {isLoading && !configuration.membershipGate && eventGates.length === 0 ? (
        <p className="admin-registration-access__loading">
          {t('admin.sections.accessGates.loading')}
        </p>
      ) : null}

      <section className="admin-registration-access__block" aria-labelledby="access-toggles-title">
        <header className="admin-registration-access__block-head">
          <div>
            <h2 id="access-toggles-title">{t('admin.sections.accessGates.togglesTitle')}</h2>
            <p>{t('admin.sections.accessGates.togglesLead')}</p>
          </div>
          {togglesLoading || togglesError ? null : (
            <p className="admin-registration-access__summary" role="status">
              <span
                className={`admin-registration-access__dot admin-registration-access__dot--${
                  togglesSummary.allOpen ? 'on' : 'off'
                }`}
                aria-hidden
              />
              {t('admin.sections.accessGates.togglesSummary', {
                open: togglesSummary.open,
                total: togglesSummary.total,
              })}
            </p>
          )}
        </header>

        {/* Frenos que vienen del entorno, no del panel: sin esto un interruptor
            podía estar en ON y no tener ningún efecto, sin explicación. */}
        {(toggles.environmentHolds ?? []).length > 0 ? (
          <div
            className="admin-registration-access__message admin-registration-access__message--warning"
            role="status"
          >
            <LockKeyhole size={15} aria-hidden />
            <span>
              {t('admin.sections.accessGates.environmentHold', {
                variables: (toggles.environmentHolds ?? [])
                  .map((hold) => hold.variable)
                  .join(', '),
              })}
            </span>
          </div>
        ) : null}

        <div className="admin-registration-access__rules admin-registration-access__rules--primary">
          <ToggleRule
            ariaLabel={t('admin.sections.accessGates.checkoutAria')}
            busy={savingFeature === CHECKOUT_FEATURE.feature}
            canEdit={canEdit}
            enabled={toggles[CHECKOUT_FEATURE.key] !== false}
            lead={t('admin.sections.accessGates.checkoutLead')}
            loading={togglesLoading}
            master
            onToggle={(enabled) => handleToggleFeature(CHECKOUT_FEATURE.feature, enabled)}
            stateLabels={{
              on: t('admin.sections.accessGates.checkoutOn'),
              off: t('admin.sections.accessGates.checkoutOff'),
            }}
            t={t}
            title={t('admin.sections.accessGates.checkoutTitle')}
          />
        </div>

        {/* Un bloque por concepto: alta, medios de cobro y validación juntos,
            que es cómo se decide en la operación. */}
        {CONCEPT_BLOCKS.map((block) => {
          const intakeOpen = toggles[block.intake.key] !== false
          const withoutChannel = conceptsWithoutChannel.includes(block.concept)
          return (
            <article
              key={block.concept}
              className={`admin-registration-access__concept${
                intakeOpen ? '' : ' admin-registration-access__concept--closed'
              }`}
            >
              <ToggleRule
                ariaLabel={t(`admin.sections.accessGates.${block.i18n}Aria`)}
                busy={savingFeature === block.intake.feature}
                canEdit={canEdit}
                enabled={intakeOpen}
                lead={t(`admin.sections.accessGates.${block.i18n}Lead`)}
                loading={togglesLoading}
                onToggle={(enabled) => handleToggleFeature(block.intake.feature, enabled)}
                stateLabels={{
                  on: t('admin.sections.accessGates.enabledPlural'),
                  off: t('admin.sections.accessGates.closedPlural'),
                }}
                t={t}
                title={t(`admin.sections.accessGates.${block.i18n}Title`)}
                variant="intake"
              />

              <div
                className="admin-registration-access__channels"
                role="group"
                aria-label={t('admin.sections.accessGates.channelsGroupAria', {
                  concept: t(`admin.sections.accessGates.${block.i18n}Title`),
                })}
              >
                <p className="admin-registration-access__channels-label">
                  {t('admin.sections.accessGates.channelsLabel')}
                </p>
                {block.channels.map((channel) => (
                  <ToggleRule
                    ariaLabel={t('admin.sections.accessGates.channelAria', {
                      channel: t(`admin.sections.accessGates.channel.${channel}`),
                      concept: t(`admin.sections.accessGates.${block.i18n}Title`),
                    })}
                    busy={savingFeature === `${block.concept}:${channel}`}
                    canEdit={canEdit}
                    enabled={toggles.paymentChannels?.[block.concept]?.[channel] !== false}
                    headingLevel="h4"
                    key={channel}
                    loading={togglesLoading}
                    muted={!intakeOpen}
                    onToggle={(enabled) => handleToggleChannel(block.concept, channel, enabled)}
                    stateLabels={{
                      on: t('admin.sections.accessGates.channelOn'),
                      off: t('admin.sections.accessGates.channelOff'),
                    }}
                    t={t}
                    title={t(`admin.sections.accessGates.channel.${channel}`)}
                    variant="channel"
                  />
                ))}
                {withoutChannel ? (
                  <p className="admin-registration-access__channels-warning" role="status">
                    <XCircle size={14} aria-hidden />
                    {t('admin.sections.accessGates.noChannelWarning')}
                  </p>
                ) : null}
              </div>

              <ToggleRule
                ariaLabel={t(`admin.sections.accessGates.${block.validation.i18n}Aria`)}
                busy={savingFeature === block.validation.feature}
                canEdit={canEdit}
                enabled={toggles[block.validation.key] !== false}
                headingLevel="h4"
                lead={t(`admin.sections.accessGates.${block.validation.i18n}Lead`)}
                loading={togglesLoading}
                onToggle={(enabled) => handleToggleFeature(block.validation.feature, enabled)}
                stateLabels={{
                  on: t('admin.sections.accessGates.enabledSingular'),
                  off: t('admin.sections.accessGates.closedSingular'),
                }}
                t={t}
                title={t(`admin.sections.accessGates.${block.validation.i18n}Title`)}
                variant="validation"
              />
            </article>
          )
        })}

        {togglesLoading ? (
          <p className="admin-registration-access__loading">
            {t('admin.sections.accessGates.togglesLoading')}
          </p>
        ) : null}
        {togglesError ? (
          <div
            className="admin-registration-access__message admin-registration-access__message--error"
            role="alert"
          >
            <XCircle size={15} aria-hidden />
            <span>{togglesError}</span>
            <button
              type="button"
              className="admin-registration-access__button"
              onClick={() => void loadToggles()}
            >
              {t('admin.sections.accessGates.retry')}
            </button>
          </div>
        ) : null}
      </section>

      <section
        className="admin-registration-access__block"
        aria-labelledby="access-gates-private-title"
      >
        <header className="admin-registration-access__block-head">
          <div>
            <h2 id="access-gates-private-title">{t('admin.sections.accessGates.gatesTitle')}</h2>
            <p>{t('admin.sections.accessGates.gatesLead')}</p>
          </div>
        </header>

        <article className="admin-registration-access__rule">
          <span
            className={`admin-registration-access__dot admin-registration-access__dot--${stateClass(gateStateKey(configuration.membershipGate))}`}
            aria-hidden
          />
          <div className="admin-registration-access__rule-copy">
            <h3>{t('admin.sections.accessGates.membershipGateTitle')}</h3>
            <p>
              {configuration.membershipGate
                ? t('admin.sections.accessGates.membershipGateWithLabel', {
                    label: configuration.membershipGate.label,
                  })
                : t('admin.sections.accessGates.membershipGateEmpty')}
            </p>
          </div>
          <div className="admin-registration-access__trailing">
            <span
              className={`admin-registration-access__state admin-registration-access__state--${stateClass(gateStateKey(configuration.membershipGate))}`}
            >
              {stateLabel(gateStateKey(configuration.membershipGate))}
            </span>
            {canEdit ? (
              <div className="admin-registration-access__actions">
                <button
                  type="button"
                  className="admin-registration-access__button"
                  onClick={(event) =>
                    openEditor(configuration.membershipGate, 'membership', event.currentTarget)
                  }
                >
                  {isGateReopenable(configuration.membershipGate)
                    ? t('admin.sections.accessGates.reopen')
                    : t('admin.sections.accessGates.configure')}
                </button>
                {configuration.membershipGate ? (
                  <button
                    type="button"
                    className="admin-registration-access__button admin-registration-access__button--danger"
                    onClick={() => setDeleteTarget(configuration.membershipGate)}
                  >
                    <Trash2 size={15} aria-hidden /> {t('admin.sections.accessGates.delete')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </article>

        <div className="admin-registration-access__subhead">
          <div>
            <h3 id="access-event-gates-title">{t('admin.sections.accessGates.eventGatesTitle')}</h3>
            <p>{t('admin.sections.accessGates.eventGatesLead')}</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              className="admin-registration-access__button"
              onClick={(event) => openEditor(null, 'registration', event.currentTarget)}
            >
              {t('admin.sections.accessGates.newGate')}
            </button>
          ) : null}
        </div>

        <div
          className="admin-registration-access__list"
          role="list"
          aria-labelledby="access-event-gates-title"
        >
          {eventGates.length ? (
            eventGates.map((gate) => {
              const key = gateStateKey(gate)
              return (
                <article className="admin-registration-access__rule" role="listitem" key={gate.id}>
                  <span
                    className={`admin-registration-access__dot admin-registration-access__dot--${stateClass(key)}`}
                    aria-hidden
                  />
                  <div className="admin-registration-access__rule-copy">
                    <h3>{gate.eventTitle ?? gate.eventSlug}</h3>
                    <p>
                      {gate.label}
                      {gate.endsAt
                        ? t('admin.sections.accessGates.until', { date: formatEndsAt(gate.endsAt) })
                        : ''}
                    </p>
                  </div>
                  <div className="admin-registration-access__trailing">
                    <span
                      className={`admin-registration-access__state admin-registration-access__state--${stateClass(key)}`}
                    >
                      {stateLabel(key)}
                    </span>
                    {canEdit ? (
                      <div className="admin-registration-access__actions">
                        <button
                          type="button"
                          className="admin-registration-access__button"
                          onClick={(event) => openEditor(gate, 'registration', event.currentTarget)}
                        >
                          {isGateReopenable(gate)
                            ? t('admin.sections.accessGates.reopen')
                            : t('admin.sections.accessGates.edit')}
                        </button>
                        <button
                          type="button"
                          className="admin-registration-access__button admin-registration-access__button--danger"
                          onClick={() => setDeleteTarget(gate)}
                        >
                          <Trash2 size={15} aria-hidden /> {t('admin.sections.accessGates.delete')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              )
            })
          ) : (
            <div className="admin-registration-access__empty-state" role="status">
              <span className="admin-registration-access__empty-icon" aria-hidden>
                <Inbox size={18} />
              </span>
              <p className="admin-registration-access__empty">
                {t('admin.sections.accessGates.eventGatesEmpty')}
              </p>
            </div>
          )}
        </div>

        {canEdit && draft ? (
          <form
            ref={formRef}
            className="admin-registration-access__form"
            onSubmit={submit}
            noValidate
          >
            <header>
              <LockKeyhole size={17} aria-hidden />
              <div>
                <h3>
                  {draft.scope === 'membership'
                    ? t('admin.sections.accessGates.formTitleMembership')
                    : t('admin.sections.accessGates.formTitleRegistration')}
                </h3>
                <p>
                  {t(
                    reopeningDraft
                      ? 'admin.sections.accessGates.formLeadReopen'
                      : 'admin.sections.accessGates.formLead',
                  )}
                </p>
              </div>
            </header>

            <fieldset className="admin-registration-access__fields" disabled={saving}>
              <label htmlFor="access-gate-scope">
                <span>{t('admin.sections.accessGates.scope')}</span>
                <select
                  id="access-gate-scope"
                  value={draft.scope}
                  onChange={(event) =>
                    setDraft({
                      ...EMPTY_GATE,
                      scope: event.target.value,
                      eventSlug:
                        event.target.value === 'registration' ? (events[0]?.slug ?? '') : '',
                    })
                  }
                >
                  <option value="membership">
                    {t('admin.sections.accessGates.scopeMembership')}
                  </option>
                  <option value="registration">
                    {t('admin.sections.accessGates.scopeRegistration')}
                  </option>
                </select>
              </label>

              {draft.scope === 'registration' ? (
                <label htmlFor="access-gate-event">
                  <span>{t('admin.sections.accessGates.event')}</span>
                  <select
                    id="access-gate-event"
                    value={draft.eventSlug}
                    onChange={(event) => setDraft({ ...draft, eventSlug: event.target.value })}
                  >
                    {events.map((item) => (
                      <option key={item.slug} value={item.slug}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label htmlFor="access-gate-label">
                <span>{t('admin.sections.accessGates.label')}</span>
                <input
                  id="access-gate-label"
                  value={draft.label}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  placeholder={t('admin.sections.accessGates.labelPlaceholder')}
                  maxLength={80}
                />
              </label>

              <label htmlFor="access-gate-code">
                <span>
                  {t('admin.sections.accessGates.code')}
                  {requiresNewCode ? (
                    <small> {t('admin.sections.accessGates.codeRequired')}</small>
                  ) : currentGate?.active ? (
                    <small> {t('admin.sections.accessGates.codeKeepHint')}</small>
                  ) : null}
                </span>
                <input
                  id="access-gate-code"
                  type="password"
                  autoComplete="new-password"
                  value={draft.code}
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                  minLength={10}
                  maxLength={72}
                />
                {/* El requisito va solo en la ayuda: como placeholder desaparecía
                    justo cuando se empieza a tipear, y se leía dos veces. */}
                <small>{t('admin.sections.accessGates.codePlaceholder')}</small>
              </label>

              <label htmlFor="access-gate-starts">
                <span>{t('admin.sections.accessGates.startsAt')}</span>
                <input
                  id="access-gate-starts"
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })}
                />
              </label>

              <label htmlFor="access-gate-ends">
                <span>{t('admin.sections.accessGates.endsAt')}</span>
                <input
                  id="access-gate-ends"
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })}
                />
              </label>

              <label className="admin-registration-access__switch" htmlFor="access-gate-active">
                <input
                  id="access-gate-active"
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                  aria-label={t('admin.sections.accessGates.activeAria')}
                />
                <span>
                  {draft.active
                    ? t('admin.sections.accessGates.enabledSingular')
                    : t('admin.sections.accessGates.closedSingular')}
                </span>
              </label>
            </fieldset>

            {formError ? (
              <p className="admin-registration-access__error" role="alert">
                <XCircle size={15} aria-hidden /> {formError}
              </p>
            ) : null}

            <footer className="admin-registration-access__form-actions">
              <button
                type="button"
                className="admin-registration-access__button"
                onClick={cancelEditor}
              >
                {t('admin.sections.accessGates.cancel')}
              </button>
              <button
                type="submit"
                className="admin-registration-access__button admin-registration-access__button--primary"
                disabled={saving}
              >
                {saving ? (
                  t('admin.sections.accessGates.saving')
                ) : (
                  <>
                    <Save size={15} aria-hidden /> {t('admin.sections.accessGates.save')}
                  </>
                )}
              </button>
            </footer>
          </form>
        ) : null}
      </section>
      {deleteTarget ? (
        <AdminDeleteConfirmDialog
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null)
          }}
          onConfirm={() => void handleDelete()}
          title={t('admin.sections.accessGates.deleteTitle')}
          description={t('admin.sections.accessGates.deleteDescription', {
            label: deleteTarget.label,
          })}
          warning={t('admin.sections.accessGates.deleteWarning')}
          cancelLabel={t('admin.sections.accessGates.cancel')}
          confirmLabel={t('admin.sections.accessGates.delete')}
          busyLabel={t('admin.sections.accessGates.deleting')}
        />
      ) : null}
    </section>
  )
}
