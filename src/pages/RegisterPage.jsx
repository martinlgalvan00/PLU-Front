import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  ImageDown,
  User,
  Mail,
  Phone,
  Calendar,
  Lock,
  Hash,
  Globe,
  MapPin,
  Dumbbell,
} from 'lucide-react'
import FormSection from '../components/ui/FormSection.jsx'
import { DateField, Field, Select, ChoiceField } from '../components/ui/FormFields.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import CardPreviewModal from '../components/ui/CardPreviewModal.jsx'
import RegisterMembershipConfirmation from '../components/ui/RegisterMembershipConfirmation.jsx'
import MercadoPagoEmbeddedCheckout from '../components/ui/MercadoPagoEmbeddedCheckout.jsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getFormOptions } from '../lib/formOptions.js'
import { formatShortDate, money } from '../lib/format.js'
import { getStatusMeta, isRegistrationAdmitted } from '../lib/status.js'
import { hasCurrentMembership, isMembershipCurrent } from '../services/membershipService.js'
import { resendAthleteVerification, checkAthleteAvailability } from '../services/athleteApi.js'
import {
  validateAthleteFields,
  validateAthleteForm,
  validateCompetitionFields,
  validateCompetitionForm,
  validateMembershipForm,
} from '../lib/validation.js'

function PasswordStrengthMeter({ password }) {
  const str = String(password ?? '')
  if (!str) return null

  let score = 0
  if (str.length >= 8) score += 1
  if (str.length >= 12) score += 1
  if (/[A-Z]/.test(str) || /[0-9]/.test(str)) score += 1
  if (/[^A-Za-z0-9]/.test(str)) score += 1

  const labels = ['Muy corta', 'Aceptable', 'Segura', 'Excelente']
  const label = labels[Math.max(0, score - 1)] ?? ''

  return (
    <div className="password-strength" aria-live="polite">
      <div className="password-strength__bar">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`password-strength__segment${step <= score ? ` is-active-${score}` : ''}`}
          />
        ))}
      </div>
      <div className="password-strength__meta">
        <small className="password-strength__label">{label}</small>
        {str.length < 12 ? (
          <small className="password-strength__hint">Requerido: mínimo 12 caracteres</small>
        ) : (
          <small className="password-strength__hint password-strength__hint--valid">✓ Cumple requisito de seguridad</small>
        )}
      </div>
    </div>
  )
}

function RegisterLiveCredential({ form, t }) {
  const name = form.fullName && form.fullName.trim() ? form.fullName.trim() : t('pages.register.fullNamePlaceholder') || 'Tu nombre y apellido'
  const doc = form.documentId && form.documentId.trim() ? `DNI ${form.documentId.trim()}` : 'DNI —'
  const location = [form.city, form.province, form.country].filter(Boolean).map((s) => s.trim()).join(', ') || 'Argentina'
  const gym = form.gym && form.gym.trim() ? form.gym.trim() : 'Gimnasio / Club'

  return (
    <div className="register-live-credential" aria-hidden="true">
      <div className="register-live-credential__header">
        <span className="register-live-credential__brand">PLU ARGENTINA</span>
        <span className="register-live-credential__badge">NUEVA FICHA</span>
      </div>
      <div className="register-live-credential__body">
        <div className="register-live-credential__avatar">
          <User size={22} />
        </div>
        <div className="register-live-credential__info">
          <strong className="register-live-credential__name">{name}</strong>
          <span className="register-live-credential__doc">{doc}</span>
        </div>
      </div>
      <div className="register-live-credential__meta">
        <span className="register-live-credential__gym">{gym}</span>
        <span className="register-live-credential__location">{location}</span>
      </div>
    </div>
  )
}

function getProfileSteps(t) {
  return [
    {
      id: 'personal',
      step: '01',
      label: t('pages.register.stepPersonal'),
      fields: ['fullName', 'documentId', 'birthDate', 'email', 'phone', 'password'],
    },
    {
      id: 'location',
      step: '02',
      label: t('pages.register.stepLocation'),
      fields: ['country', 'province', 'city', 'gym', 'sex'],
    },
  ]
}

function isFieldFilled(form, field) {
  const value = form[field]
  const str = String(value ?? '').trim()

  switch (field) {
    case 'phone':
      return str.replace(/\D/g, '').length >= 8
    case 'email':
      return str.includes('@') && str.length >= 5
    case 'fullName':
      return str.length >= 3
    case 'documentId':
      // Mismo umbral que la validación real (7 u 8 dígitos): con 6 la barra de
      // progreso daba el paso por completo y el error salía al continuar.
      return /^\d{7,8}$/.test(str.replace(/[.\-\s]/g, ''))
    case 'birthDate':
      return /^\d{4}-\d{2}-\d{2}$/.test(str)
    case 'password':
      return str.length >= 12
    default:
      return str.length > 0
  }
}

function canSelectProfileStep(index, activeStepIndex, steps) {
  if (index <= activeStepIndex) return true
  if (index === 0) return true
  return steps.slice(0, index).every((step) => step.state === 'complete')
}

function getSegmentVisualState(stepProgress, index, activeStepIndex) {
  if (stepProgress.state === 'complete') return 'complete'
  if (index === activeStepIndex || stepProgress.state === 'active') return 'active'
  return 'pending'
}

function getProfileProgress(form, profileSteps) {
  const steps = profileSteps.map((step) => {
    const filled = step.fields.filter((field) => isFieldFilled(form, field)).length
    const total = step.fields.length
    const complete = filled === total
    const active = filled > 0 && !complete

    return {
      ...step,
      filled,
      total,
      state: complete ? 'complete' : active ? 'active' : 'pending',
    }
  })

  const completedFields = steps.reduce((sum, step) => sum + step.filled, 0)
  const totalFields = steps.reduce((sum, step) => sum + step.total, 0)
  const percent = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0
  const currentStep = steps.find((step) => step.state === 'active') ?? steps.find((step) => step.state === 'pending')

  return { steps, percent, currentStep, complete: percent === 100 }
}

function RegisterProgress({ activeStepIndex = 0, form, flow, layout = 'stack', onStepSelect, profileSteps, t }) {
  const progress = useMemo(
    () => (flow === 'profile' ? getProfileProgress(form, profileSteps) : null),
    [flow, form, profileSteps],
  )

  if (!progress) return null

  return (
    <div
      className={`register-progress register-progress--compact register-progress--${layout}`.trim()}
      aria-label={t('pages.register.progressAria')}
    >
      <div className="register-progress__track">
        <div
          className="register-progress__bar"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('pages.register.progressLabel', { percent: progress.percent })}
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <strong className="register-progress__percent">{progress.percent}%</strong>
      </div>

      <ol className="register-progress__segments">
        {progress.steps.map((step, index) => {
          const state = getSegmentVisualState(step, index, activeStepIndex)
          const canSelect = canSelectProfileStep(index, activeStepIndex, progress.steps)

          return (
            <li key={step.id}>
              <button
                type="button"
                className={`register-progress__segment register-progress__segment--${state}`.trim()}
                aria-current={index === activeStepIndex ? 'step' : undefined}
                aria-label={t('pages.register.stepFields', {
                  label: step.label,
                  filled: step.filled,
                  total: step.total,
                })}
                disabled={!canSelect}
                onClick={() => onStepSelect?.(index)}
              >
                <span className="register-progress__segment-mark" aria-hidden>
                  {state === 'complete' ? <Check size={11} strokeWidth={2.5} /> : step.step}
                </span>
                <span className="register-progress__segment-copy">
                  <span className="register-progress__segment-label">{step.label}</span>
                  <span className="register-progress__segment-meta">
                    {step.filled}/{step.total}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function RegisterMembershipAside({ athlete, locale, t, total }) {
  return (
    <div className="register-membership-aside register-membership-aside--human">
      <div className="register-membership-summary register-membership-summary--human">
        <div className="register-membership-summary__head">
          <div className="register-membership-summary__identity">
            <strong className="register-membership-summary__plan">{t('pages.register.membershipPlanLabel')}</strong>
            <p className="register-membership-summary__validity">{t('pages.register.membershipValidityNote')}</p>
          </div>
          <div className="register-membership-summary__price">
            <span>{money(total, locale)}</span>
            <small>/{t('pages.membershipCard.periodAnnual')}</small>
          </div>
        </div>
        {athlete?.fullName && (
          <p className="register-membership-summary__athlete">
            {athlete.fullName}
          </p>
        )}
      </div>
    </div>
  )
}

export default function RegisterPage({
  athlete,
  createdOrder,
  event,
  flow,
  form,
  memberships = [],
  onNavigate,
  onSubmit,
  onUpdateForm,
  registrations = [],
  total,
}) {
  const { locale, t } = useI18n()
  const formOptions = useMemo(() => getFormOptions(t), [t])
  const profileSteps = useMemo(() => getProfileSteps(t), [t])

  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [profileErrorStepIndex, setProfileErrorStepIndex] = useState(null)
  const [submitError, setSubmitError] = useState('')
  // El checkout se corta si el correo no está confirmado. La acción de reenvío
  // vivía solo en el banner del perfil, así que acá el atleta leía "confirmá tu
  // correo" y no tenía nada que tocar.
  const [emailBlocked, setEmailBlocked] = useState(false)
  const [resendState, setResendState] = useState('idle')
  const [cardOpen, setCardOpen] = useState(false)
  const [profileStepIndex, setProfileStepIndex] = useState(0)
  const [wizardDirection, setWizardDirection] = useState(1)
  const [profileSubmitAttempted, setProfileSubmitAttempted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const availabilityRequestRef = useRef(0)
  const profileProgress = useMemo(
    () => (flow === 'profile' ? getProfileProgress(form, profileSteps) : null),
    [flow, form, profileSteps],
  )
  const isLastProfileStep = profileStepIndex >= profileSteps.length - 1
  const activeProfileStep = profileSteps[profileStepIndex]

  useEffect(() => {
    setProfileStepIndex(0)
    setErrors({})
    setTouched({})
    setProfileErrorStepIndex(null)
    setProfileSubmitAttempted(false)
    setShowPassword(false)
    setSubmitError('')
  }, [flow])

  const content = {
    profile: [t('pages.register.profileTitle'), t('pages.register.profileDesc'), t('pages.register.profileSubmit')],
    competition: [
      t('pages.register.competitionTitle'),
      t('pages.register.competitionDesc', { name: athlete?.fullName ?? '', event: event?.title ?? '' }),
      t('pages.register.competitionSubmit'),
    ],
    membership: [
      t('pages.register.membershipTitle'),
      t('pages.register.membershipDesc', { name: athlete?.fullName ?? '' }),
      t('pages.register.membershipSubmit'),
    ],
  }[flow]

  const visibleOrder = flow === 'profile' ? null : createdOrder?.type === flow ? createdOrder : null
  // La vigente primero; si todavía no hay ninguna (la afiliación recién
  // creada está pendiente de pago) cae a la más reciente, que es la de esta
  // misma orden. Antes tomaba la primera del array sin mirar el estado, así
  // que tras una renovación la card salía con el código del período anterior.
  const orderMemberships = memberships.filter((item) => item.athleteId === visibleOrder?.athleteId)
  const currentMembership = orderMemberships.find((item) => isMembershipCurrent(item))
  const activeMembership = currentMembership ?? orderMemberships[0]
  const memberCode = activeMembership?.memberCode
  // El QR de la card apunta a la persona, no al período: la credencial no se
  // vence ni cambia al renovar.
  const credentialCode = athlete?.credentialToken ?? activeMembership?.qrToken
  // Vigencia y no solo `status === 'activa'`: misma condición que usa la
  // puerta cuando el evento exige afiliación.
  const hasActiveMembership = hasCurrentMembership(memberships, athlete?.id)
  // Si el meet exige afiliación y todavía no está vigente, se puede inscribir
  // igual: el aviso empuja a afiliarse, pero no bloquea el submit. La puerta
  // es la que sigue exigiendo membresía activa.
  const membershipGatePending =
    flow === 'competition' && Boolean(event?.requiresMembership) && !hasActiveMembership
  const stepErrorsVisible =
    flow === 'profile' &&
    profileErrorStepIndex === profileStepIndex &&
    (profileStepIndex === 0 || profileSubmitAttempted)

  const visibleErrors = useMemo(() => {
    if (flow !== 'profile') return errors
    return Object.fromEntries(
      Object.entries(errors).filter(([field, message]) => Boolean(message) && (touched[field] || stepErrorsVisible)),
    )
  }, [errors, flow, stepErrorsVisible, touched])

  // La inscripción que pagó esta orden. Mismo criterio que la afiliación: la
  // credencial del torneo se emite cuando el ingreso ya está habilitado, no
  // cuando existe la orden.
  const orderRegistration = registrations.find(
    (item) => visibleOrder?.paymentId && item.paymentOrderId === visibleOrder.paymentId,
  )
  const registrationAdmitted = isRegistrationAdmitted(orderRegistration?.status)

  const cardData =
    visibleOrder && flow === 'competition' && registrationAdmitted
      ? {
          athleteName: visibleOrder.athleteName,
          athleteCode: memberCode,
          athletePhotoUrl: athlete?.photoUrl,
          qrCode: credentialCode,
          eventTitle: event?.title,
          eventDate: event?.date,
          eventVenue: event?.venue,
          eventLocation: event?.location,
          category: form.category,
          division: form.division,
          eventSlug: event?.slug,
          variant: 'event',
        }
      : // La credencial se emite recién cuando la afiliación cubre HOY, no
        // cuando existe la orden. `credentialToken` nace con la cuenta, así que
        // sin este gate la pantalla de confirmación ofrecía "Ver credencial"
        // con un QR funcional mientras la orden seguía en `pendiente`: por
        // transferencia eso son días entre el alta y la acreditación.
        visibleOrder && flow === 'membership' && currentMembership
        ? {
            athleteName: visibleOrder.athleteName,
            athleteCode: memberCode,
            athletePhotoUrl: athlete?.photoUrl,
            qrCode: credentialCode,
            membershipExpiration: formatShortDate(currentMembership.expirationDate, locale),
            variant: 'membership',
            eventSlug: 'afiliacion',
          }
        : null

  function changeField(event) {
    const field = event.target.name
    onUpdateForm(event)
    if (errors[field]) setErrors((current) => ({ ...current, [field]: '' }))
    setSubmitError('')
    setEmailBlocked(false)
  }

  function takenMessage(field) {
    if (field === 'email') return t('pages.register.emailTaken')
    if (field === 'documentId') return t('pages.register.documentTaken')
    return t('pages.register.accountExists')
  }

  async function checkAvailabilityForField(field, value) {
    if (field !== 'email' && field !== 'documentId') return
    const requestId = ++availabilityRequestRef.current
    try {
      const availability = await checkAthleteAvailability(
        field === 'email' ? { email: value } : { documentId: value },
      )
      if (requestId !== availabilityRequestRef.current) return

      const taken = field === 'email' ? availability.emailTaken : availability.documentTaken
      setErrors((current) => ({
        ...current,
        [field]: taken ? takenMessage(field) : '',
      }))
    } catch {
      // Fail-open: si el check cae, el submit del alta sigue siendo la red de seguridad.
    }
  }

  async function blurField(event) {
    const field = event.target.name
    if (!field) return

    // Radios: el value del option enfocado no implica selección; usamos el estado del form.
    const rawValue = event.target.type === 'radio' ? (form[field] ?? '') : event.target.value
    const value = String(rawValue ?? '').trim()
    setTouched((current) => ({ ...current, [field]: true }))

    // Vacío: no avisar formato hasta Continuar/enviar; limpia error previo.
    if (!value) {
      setErrors((current) => (current[field] ? { ...current, [field]: '' } : current))
      return
    }

    const snapshot = { ...form, [field]: rawValue }
    const validation =
      flow === 'competition'
        ? validateCompetitionFields(snapshot, [field], t)
        : flow === 'profile'
          ? validateAthleteFields(snapshot, [field], t)
          : null

    if (!validation) return

    const fieldError = validation.errors[field] ?? ''
    setErrors((current) => ({
      ...current,
      [field]: fieldError,
    }))

    // Formato OK: preguntamos al backend si email/documento ya están tomados.
    if (!fieldError && flow === 'profile') {
      await checkAvailabilityForField(field, value)
    }
  }

  async function ensureStepAvailability(fields) {
    const payload = {}
    if (fields.includes('email') && form.email) payload.email = form.email
    if (fields.includes('documentId') && form.documentId) payload.documentId = form.documentId
    if (!payload.email && !payload.documentId) return {}

    try {
      const availability = await checkAthleteAvailability(payload)
      const takenErrors = {}
      if (availability.emailTaken) takenErrors.email = takenMessage('email')
      if (availability.documentTaken) takenErrors.documentId = takenMessage('documentId')
      return takenErrors
    } catch {
      return {}
    }
  }

  function focusFirstError(stepErrors) {
    const firstField = Object.keys(stepErrors)[0]
    if (!firstField) return
    document.querySelector(`[name="${firstField}"]`)?.focus()
  }

  function selectProfileStep(index) {
    if (!profileProgress) return
    if (!canSelectProfileStep(index, profileStepIndex, profileProgress.steps)) return
    setWizardDirection(index >= profileStepIndex ? 1 : -1)
    setProfileStepIndex(index)
    setErrors({})
    setTouched({})
    setProfileErrorStepIndex(null)
    setProfileSubmitAttempted(false)
    setSubmitError('')
  }

  async function advanceProfileStep() {
    const step = profileSteps[profileStepIndex]
    const validation = validateAthleteFields(form, step.fields, t)
    if (!validation.success) {
      setErrors(validation.errors)
      setTouched((current) => ({
        ...current,
        ...Object.fromEntries(step.fields.map((field) => [field, true])),
      }))
      setProfileErrorStepIndex(profileStepIndex)
      focusFirstError(validation.errors)
      return
    }

    const takenErrors = await ensureStepAvailability(step.fields)
    if (Object.keys(takenErrors).length) {
      setErrors((current) => ({ ...current, ...takenErrors }))
      setTouched((current) => ({
        ...current,
        ...Object.fromEntries(Object.keys(takenErrors).map((field) => [field, true])),
      }))
      setProfileErrorStepIndex(profileStepIndex)
      focusFirstError(takenErrors)
      return
    }

    setErrors({})
    setTouched({})
    setProfileErrorStepIndex(null)
    setProfileSubmitAttempted(false)
    setSubmitError('')
    setWizardDirection(1)
    setProfileStepIndex((current) => Math.min(current + 1, profileSteps.length - 1))
  }

  function goBackProfileStep() {
    setWizardDirection(-1)
    setProfileStepIndex((current) => Math.max(current - 1, 0))
    setErrors({})
    setTouched({})
    setProfileErrorStepIndex(null)
    setProfileSubmitAttempted(false)
    setSubmitError('')
  }

  async function submit(eventObject) {
    eventObject.preventDefault()
    if (flow === 'profile') setProfileSubmitAttempted(true)

    const validation =
      flow === 'profile'
        ? validateAthleteForm(form, t)
        : flow === 'competition'
          ? validateCompetitionForm(form, t)
          : validateMembershipForm(form, t)

    if (!validation.success) {
      setErrors(validation.errors)
      focusFirstError(validation.errors)

      if (flow === 'profile') {
        const errorStepIndex = profileSteps.findIndex((step) =>
          step.fields.some((field) => validation.errors[field]),
        )
        if (errorStepIndex >= 0) {
          setProfileStepIndex(errorStepIndex)
          setProfileErrorStepIndex(errorStepIndex)
          setTouched((current) => ({
            ...current,
            ...Object.fromEntries(
              profileSteps[errorStepIndex].fields.map((field) => [field, true]),
            ),
          }))
        }
      } else {
        setTouched((current) => ({
          ...current,
          ...Object.fromEntries(Object.keys(validation.errors).map((field) => [field, true])),
        }))
      }

      return
    }

    if (flow === 'profile') {
      const takenErrors = await ensureStepAvailability(['email', 'documentId'])
      if (Object.keys(takenErrors).length) {
        setErrors((current) => ({ ...current, ...takenErrors }))
        setTouched((current) => ({
          ...current,
          ...Object.fromEntries(Object.keys(takenErrors).map((field) => [field, true])),
        }))
        setProfileStepIndex(0)
        setProfileErrorStepIndex(0)
        focusFirstError(takenErrors)
        return
      }
    }

    const result = await onSubmit(eventObject, event)
    if (result?.error) {
      const fieldErrors = {}
      if (result.fields?.email === 'taken') fieldErrors.email = takenMessage('email')
      if (result.fields?.documentId === 'taken') fieldErrors.documentId = takenMessage('documentId')

      if (Object.keys(fieldErrors).length) {
        setErrors((current) => ({ ...current, ...fieldErrors }))
        setTouched((current) => ({
          ...current,
          ...Object.fromEntries(Object.keys(fieldErrors).map((field) => [field, true])),
        }))
        if (flow === 'profile') {
          setProfileStepIndex(0)
          setProfileErrorStepIndex(0)
        }
        focusFirstError(fieldErrors)
        setSubmitError(result.error)
      } else {
        setSubmitError(result.error)
      }
      setEmailBlocked(result.code === 'EMAIL_NOT_VERIFIED')
      setResendState('idle')
    } else if (flow === 'profile') onNavigate?.('profile')
  }

  async function resendVerification() {
    setResendState('sending')
    try {
      const result = await resendAthleteVerification()
      setResendState(result?.alreadyVerified ? 'verified' : 'sent')
    } catch {
      setResendState('error')
    }
  }

  const membershipOrderConfirmed = flow === 'membership' && visibleOrder
  const membershipConfirmedActive =
    membershipOrderConfirmed && getStatusMeta(visibleOrder.status, t).tone === 'success'

  const registerIntro =
    membershipOrderConfirmed ? (
      <header className="register-intro register-intro--membership register-intro--confirmed">
        <h1 className="register-intro__title">
          {membershipConfirmedActive
            ? t('pages.register.membershipConfirmedActiveTitle')
            : t('pages.register.membershipConfirmedPendingTitle')}
        </h1>
        <p className="register-intro__desc">
          {membershipConfirmedActive
            ? t('pages.register.membershipConfirmedActiveDesc')
            : t('pages.register.membershipConfirmedPendingDesc')}
        </p>
      </header>
    ) : flow === 'membership' ? (
      <header className="register-intro register-intro--membership">
        <h1 className="register-intro__title">{t('pages.register.membershipTitle')}</h1>
        <p className="register-intro__desc">
          {t('pages.register.membershipDesc', { name: athlete?.fullName ?? '' })}
        </p>
      </header>
    ) : (
      <header className={`register-intro${flow === 'profile' ? ' register-intro--profile' : ''}`.trim()}>
        {flow === 'profile' ? (
          <p className="register-intro__eyebrow">{t('pages.register.profileEyebrow')}</p>
        ) : null}
        <h1 className="register-intro__title">{content[0]}</h1>
        <p className="register-intro__desc">{content[1]}</p>

        {flow !== 'profile' ? (
          <div className="register-intro__meta">
            <strong>{event?.title}</strong>
            <span>{athlete?.fullName}</span>
          </div>
        ) : null}
      </header>
    )

  const membershipPaymentHint =
    flow === 'membership' && !visibleOrder
      ? form.paymentMethod === 'manual_link'
        ? t('pages.register.membershipPaymentHintManual')
        : t('pages.register.membershipPaymentHintMp')
      : ''

  const registerStatus = flow !== 'profile' && !(flow === 'membership' && visibleOrder) && (
    <div className="register-status">
      {visibleOrder ? (
        <div className="register-status__body register-status__body--success">
          <span className="register-status__name">{visibleOrder.athleteName}</span>

          <strong>{money(visibleOrder.amount, locale)}</strong>
          <p>{visibleOrder.concept}</p>
          <StatusPill value={visibleOrder.status} />
          <code>{visibleOrder.reference}</code>
          {visibleOrder.paymentMethod === 'mercado_pago' ? (
            <p>{t('payments.embeddedLead')}</p>
          ) : (
            <>
              <p className="manual-note">{t('pages.register.manualNote')}</p>
            </>
          )}
          {cardData && (
            <>
              <button
                type="button"
                className="card-trigger-btn"
                onClick={() => setCardOpen(true)}
                id="register-generate-card-btn"
              >
                <ImageDown className="card-trigger-btn__icon" size={16} aria-hidden />
                {t('pages.register.generateCard')}
              </button>
              <CardPreviewModal open={cardOpen} onClose={() => setCardOpen(false)} cardData={cardData} />
            </>
          )}
        </div>
      ) : (
        <p className="register-status__hint">{t('pages.register.orderHint')}</p>
      )}
    </div>
  )

  const registerProgress =
    flow === 'profile' && !visibleOrder ? (
      <RegisterProgress
        activeStepIndex={profileStepIndex}
        form={form}
        flow={flow}
        layout="stack"
        profileSteps={profileSteps}
        t={t}
        onStepSelect={selectProfileStep}
      />
    ) : null

  return (
    <main
      className={`page auth-immersive-page register-page register-page--design register-page--premium${
        flow === 'profile' ? ' register-page--profile' : ''
      }${flow === 'membership' ? ' register-page--membership' : ''}`.trim()}
    >
      <div className="auth-immersive-glass auth-immersive-glass--wide register-shell">
        {(flow === 'profile' || flow === 'membership') && onNavigate && (
          <nav className="register-topbar" aria-label={t('pages.register.navAria')}>
            <button
              type="button"
              className="register-topbar__back"
              onClick={() => onNavigate(flow === 'membership' ? 'members' : 'members')}
            >
              <ArrowLeft size={15} aria-hidden />
              {flow === 'membership' ? t('pages.register.backToPlans') : t('pages.register.backMembership')}
            </button>
            {flow === 'profile' && (
              <button type="button" className="register-topbar__link" onClick={() => onNavigate('login')}>
                {t('pages.register.haveAccount')}
                <ArrowRight size={14} aria-hidden />
              </button>
            )}
          </nav>
        )}

        <aside className="register-aside register-aside--desktop">
          {registerIntro}
          {flow === 'profile' && !visibleOrder && <RegisterLiveCredential form={form} t={t} />}
          {flow === 'membership' && !visibleOrder && (
            <RegisterMembershipAside athlete={athlete} locale={locale} t={t} total={total} />
          )}
          {registerProgress}
          {registerStatus}
        </aside>

        <div className="register-main">
          <div className="register-mobile-context">
            {registerIntro}
            {flow === 'profile' && !visibleOrder && <RegisterLiveCredential form={form} t={t} />}
            {flow === 'membership' && !visibleOrder && (
              <RegisterMembershipAside athlete={athlete} locale={locale} t={t} total={total} />
            )}
            {flow === 'profile' && !visibleOrder && (
              <RegisterProgress
                activeStepIndex={profileStepIndex}
                form={form}
                flow={flow}
                layout="rail"
                profileSteps={profileSteps}
                t={t}
                onStepSelect={selectProfileStep}
              />
            )}
            {(flow !== 'profile' || visibleOrder) && !(flow === 'membership' && visibleOrder) && registerStatus}
          </div>

          {flow === 'competition' && visibleOrder?.paymentMethod === 'mercado_pago' && (
            <MercadoPagoEmbeddedCheckout order={visibleOrder} />
          )}

          {membershipOrderConfirmed ? (
            <div className="register-card register-card--confirmation">
              <RegisterMembershipConfirmation
                memberCode={memberCode}
                membershipExpiration={
                  cardData?.membershipExpiration ??
                  formatShortDate(activeMembership?.expirationDate, locale)
                }
                order={visibleOrder}
                onNavigate={onNavigate}
                onOpenCard={() => setCardOpen(true)}
                showCardAction={Boolean(cardData)}
              />
              {cardData && (
                <CardPreviewModal open={cardOpen} onClose={() => setCardOpen(false)} cardData={cardData} />
              )}
            </div>
          ) : (
          <form className="register-card athlete-form" onSubmit={submit} noValidate>
            {flow === 'profile' && (
              <MotionContentSwap
                className="register-wizard"
                direction={wizardDirection}
                swapKey={activeProfileStep.id}
              >
                {profileStepIndex === 0 && (
                  <FormSection
                    step="01"
                    title={t('pages.register.personalTitle')}
                    description={t('pages.register.personalDesc')}
                  >
                    <div className="form-grid">
                      <Field
                        autoComplete="name"
                        className="field--span-2"
                        error={visibleErrors.fullName}
                        icon={User}
                        label={t('pages.register.fullName')}
                        name="fullName"
                        placeholder={t('pages.register.fullNamePlaceholder')}
                        value={form.fullName}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <Field
                        error={visibleErrors.documentId}
                        icon={Hash}
                        inputMode="numeric"
                        label={t('pages.register.documentIdLabel')}
                        name="documentId"
                        placeholder={t('pages.register.documentPlaceholder')}
                        value={form.documentId}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <DateField
                        error={visibleErrors.birthDate}
                        icon={Calendar}
                        label={t('pages.register.birthDate')}
                        name="birthDate"
                        value={form.birthDate}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <Field
                        autoComplete="email"
                        error={visibleErrors.email}
                        icon={Mail}
                        label={t('pages.register.email')}
                        name="email"
                        placeholder={t('pages.register.emailPlaceholder')}
                        type="email"
                        value={form.email}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <Field
                        autoComplete="tel"
                        error={visibleErrors.phone}
                        icon={Phone}
                        inputMode="tel"
                        label={t('pages.register.phone')}
                        name="phone"
                        placeholder={t('pages.register.phonePlaceholder')}
                        value={form.phone}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <div className="field--span-2">
                        <Field
                          autoComplete="new-password"
                          error={visibleErrors.password}
                          icon={Lock}
                          label={t('login.password')}
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          value={form.password}
                          onBlur={blurField}
                          onChange={changeField}
                          trailing={
                            <button
                              type="button"
                              className="field__toggle"
                              aria-label={
                                showPassword ? t('login.hidePassword') : t('login.showPassword')
                              }
                              aria-pressed={showPassword}
                              onClick={(event) => {
                                event.preventDefault()
                                setShowPassword((visible) => !visible)
                              }}
                              onMouseDown={(event) => event.preventDefault()}
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          }
                        />
                        <PasswordStrengthMeter password={form.password} />
                      </div>
                    </div>
                  </FormSection>
                )}

                {profileStepIndex === 1 && (
                  <FormSection
                    step="02"
                    title={t('pages.register.locationTitle')}
                    description={t('pages.register.locationDesc')}
                  >
                    <div className="form-grid">
                      <Select
                        error={visibleErrors.country}
                        icon={Globe}
                        label={t('pages.register.country')}
                        name="country"
                        value={form.country}
                        onBlur={blurField}
                        onChange={changeField}
                        options={formOptions.country}
                      />
                      <Field
                        error={visibleErrors.province}
                        icon={MapPin}
                        label={t('pages.register.province')}
                        name="province"
                        placeholder={t('pages.register.provincePlaceholder')}
                        value={form.province}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <Field
                        error={visibleErrors.city}
                        icon={MapPin}
                        label={t('pages.register.city')}
                        name="city"
                        placeholder={t('pages.register.cityPlaceholder')}
                        value={form.city}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <Field
                        error={visibleErrors.gym}
                        icon={Dumbbell}
                        label={t('pages.register.gym')}
                        name="gym"
                        placeholder={t('pages.register.gymPlaceholder')}
                        value={form.gym}
                        onBlur={blurField}
                        onChange={changeField}
                      />
                      <ChoiceField
                        error={visibleErrors.sex}
                        label={t('pages.register.sexCompetitive')}
                        name="sex"
                        value={form.sex}
                        onBlur={blurField}
                        onChange={changeField}
                        options={formOptions.sex}
                      />
                    </div>
                  </FormSection>
                )}
              </MotionContentSwap>
            )}

            {flow === 'competition' && (
              <FormSection
                step="01"
                title={event?.title ?? ''}
                description={t('pages.register.competitionDataDesc')}
              >
                {membershipGatePending && (
                  <div className="register-eligibility-alert" role="status">
                    <strong>{t('pages.register.membershipRequiredTitle')}</strong>
                    <p>{t('pages.register.membershipRequiredForCompetition')}</p>
                    {onNavigate && (
                      <button type="button" className="btn btn--small btn--outline" onClick={() => onNavigate('membership')}>
                        {t('pages.register.membershipRequiredAction')}
                      </button>
                    )}
                  </div>
                )}
                <div className="form-grid">
                  <Select
                    error={errors.division}
                    label={t('pages.register.division')}
                    name="division"
                    value={form.division}
                    onBlur={blurField}
                    onChange={changeField}
                    options={formOptions.division}
                  />
                  <Select
                    error={errors.category}
                    label={t('pages.register.category')}
                    name="category"
                    value={form.category}
                    onBlur={blurField}
                    onChange={changeField}
                    options={formOptions.category}
                  />
                  <Field
                    error={errors.estimatedWeight}
                    inputMode="decimal"
                    label={t('pages.register.bodyWeight')}
                    name="estimatedWeight"
                    placeholder={t('pages.register.bodyWeightPlaceholder')}
                    value={form.estimatedWeight}
                    onBlur={blurField}
                    onChange={changeField}
                  />
                  <div className="field field--readonly">
                    <span>{t('pages.register.procedureType')}</span>
                    <strong>{t('pages.register.procedureRegistration', { event: event.title })}</strong>
                  </div>
                  <Select
                    error={errors.paymentMethod}
                    label={t('pages.register.paymentMethod')}
                    name="paymentMethod"
                    value={form.paymentMethod}
                    onBlur={blurField}
                    onChange={changeField}
                    options={formOptions.paymentMethod}
                  />
                </div>
              </FormSection>
            )}

            {flow === 'membership' && (
              <FormSection
                step="01"
                title={t('pages.register.paymentTitle')}
                description={t('pages.register.paymentDescLinked')}
              >
                  <div className="form-grid form-grid--compact">
                    <Select
                      label={t('pages.register.paymentMethod')}
                      name="paymentMethod"
                      value={form.paymentMethod}
                      onChange={changeField}
                      options={formOptions.paymentMethod}
                    />
                  </div>
                  {membershipPaymentHint && (
                    <p className="register-membership-payment-hint">{membershipPaymentHint}</p>
                  )}
                </FormSection>
            )}

            {submitError && emailBlocked && (
              <div className="register-eligibility-alert" role="alert">
                <strong>{t('pages.register.emailVerificationTitle')}</strong>
                <p>{submitError}</p>
                <p className="register-eligibility-alert__email">{athlete?.email}</p>
                {resendState === 'sent' || resendState === 'verified' ? (
                  <p role="status">
                    {resendState === 'sent'
                      ? t('pages.register.emailVerificationSent')
                      : t('pages.register.emailVerificationAlready')}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={resendState === 'sending'}
                    onClick={resendVerification}
                  >
                    {resendState === 'sending'
                      ? t('pages.register.emailVerificationSending')
                      : t('pages.register.emailVerificationResend')}
                  </button>
                )}
                {resendState === 'error' && <p>{t('pages.register.emailVerificationError')}</p>}
              </div>
            )}

            {submitError && !emailBlocked && (
              <p className="form-submit-error" role="alert">
                {submitError}
              </p>
            )}

            <div
              className={`register-card__footer form-actions${
                flow === 'profile'
                  ? ` register-card__footer--profile register-card__footer--wizard${profileStepIndex > 0 ? ' register-card__footer--wizard-back' : ''}`
                  : ' register-card__footer--checkout'
              }`}
            >
              {flow !== 'profile' && (
                <div className="register-card__total">
                  <span>{t('pages.register.total')}</span>
                  <strong>{money(total, locale)}</strong>
                </div>
              )}

              {flow === 'profile' && profileStepIndex > 0 && (
                <button type="button" className="register-card__back btn btn--outline" onClick={goBackProfileStep}>
                  <ArrowLeft size={15} aria-hidden />
                  {t('pages.register.back')}
                </button>
              )}

              {flow === 'profile' && !isLastProfileStep ? (
                <button type="button" className="btn register-card__submit" onClick={advanceProfileStep}>
                  {t('pages.register.continue')}
                  <ArrowRight size={16} className="register-card__submit-arrow" aria-hidden />
                </button>
              ) : (
                <button
                  type="submit"
                  className={[
                    'btn register-card__submit',
                    flow === 'profile' && profileProgress?.complete ? 'register-card__submit--ready' : '',
                    flow === 'membership' ? 'register-card__submit--membership' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={flow === 'profile' && Boolean(visibleOrder)}
                >
                  {content[2]}
                  <ArrowRight size={16} className="register-card__submit-arrow" aria-hidden />
                </button>
              )}
            </div>
          </form>
          )}
        </div>
      </div>
    </main>
  )
}
