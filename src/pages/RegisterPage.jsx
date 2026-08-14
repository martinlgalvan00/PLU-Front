import '../styles/pages/design-phase2.css'
import '../styles/pages/register.css'
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
import Pill from '../components/ui/Pill.jsx'
import CardPreviewModal from '../components/ui/CardPreviewModal.jsx'
import RegisterMembershipConfirmation from '../components/ui/RegisterMembershipConfirmation.jsx'
import MercadoPagoEmbeddedCheckout from '../components/ui/MercadoPagoEmbeddedCheckout.jsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getFormOptions } from '../lib/formOptions.js'
import { formatShortDate, money } from '../lib/format.js'
import { resolveEventPricing } from '../lib/eventPricing.js'
import { getStatusMeta, isRegistrationAdmitted } from '../lib/status.js'
import { hasCurrentMembership, isMembershipCurrent } from '../services/membershipService.js'
import { getEventComboAvailability } from '../services/comboOfferService.js'
import { env } from '../config/env.js'
import { isPaidCheckoutOpen } from '../lib/registrationSchedule.js'
import {
  resendAthleteVerification,
  checkAthleteAvailability,
  verifyAthleteEmailCode,
} from '../services/athleteApi.js'
import LaunchRegistrationTeaser from '../components/ui/LaunchRegistrationTeaser.jsx'
import RegisterSettle, { RegisterCheckoutBar } from '../components/checkout/RegisterSettle.jsx'
import TransferPayModal from '../components/checkout/TransferPayModal.jsx'
import {
  validateAthleteFields,
  validateAthleteForm,
  validateCompetitionFields,
  validateCompetitionForm,
  validateMembershipForm,
} from '../lib/validation.js'

const PASSWORD_STRENGTH_LABEL_KEYS = [
  'pages.register.passwordStrengthWeak',
  'pages.register.passwordStrengthFair',
  'pages.register.passwordStrengthStrong',
  'pages.register.passwordStrengthExcellent',
]

function PasswordStrengthMeter({ password, t }) {
  const str = String(password ?? '')
  if (!str) return null

  let score = 0
  if (str.length >= 8) score += 1
  if (str.length >= 12) score += 1
  if (/[A-Z]/.test(str) || /[0-9]/.test(str)) score += 1
  if (/[^A-Za-z0-9]/.test(str)) score += 1

  const labelKey = PASSWORD_STRENGTH_LABEL_KEYS[Math.max(0, score - 1)]
  const label = labelKey ? t(labelKey) : ''
  const meetsRequirement = str.length >= 12

  return (
    <div className={`password-strength password-strength--score-${score}`} aria-live="polite">
      <div className="password-strength__bar">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`password-strength__segment${step <= score ? ' is-active' : ''}`}
          />
        ))}
      </div>
      <div className="password-strength__meta">
        <small className="password-strength__label">{label}</small>
        {meetsRequirement ? (
          <small className="password-strength__hint password-strength__hint--valid">
            <Check size={12} strokeWidth={2.5} aria-hidden />
            {t('pages.register.passwordStrengthMet')}
          </small>
        ) : (
          <small className="password-strength__hint">
            {t('pages.register.passwordStrengthRequirement')}
          </small>
        )}
      </div>
    </div>
  )
}

function RegisterLiveCredential({ form, t }) {
  const name = form.fullName && form.fullName.trim() ? form.fullName.trim() : t('pages.register.fullNamePlaceholder') || 'Tu nombre y apellido'
  const doc = form.documentId && form.documentId.trim() ? `DNI ${form.documentId.trim()}` : 'DNI —'
  const locationParts = [form.city, form.province, form.country]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  const locationFilled = locationParts.length > 0
  const location = locationFilled
    ? locationParts.join(', ')
    : t('pages.register.credentialLocationEmpty')
  const gymFilled = Boolean(form.gym && form.gym.trim())
  const gym = gymFilled ? form.gym.trim() : t('pages.register.credentialGymEmpty')

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
        <span
          className={`register-live-credential__gym${gymFilled ? '' : ' is-placeholder'}`}
          title={gymFilled ? gym : undefined}
        >
          {gym}
        </span>
        <span
          className={`register-live-credential__location${locationFilled ? '' : ' is-placeholder'}`}
          title={locationFilled ? location : undefined}
        >
          {location}
        </span>
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
    <aside className="register-membership-aside" aria-label={t('pages.register.membershipTitle')}>
      <div className="register-membership-ticket">
        <p className="register-membership-ticket__plan">{t('pages.register.membershipPlanLabel')}</p>
        <p className="register-membership-ticket__validity">{t('pages.register.membershipValidityNote')}</p>
        {athlete?.fullName ? (
          <p className="register-membership-ticket__athlete">{athlete.fullName}</p>
        ) : null}
        <div className="register-membership-ticket__total">
          <span>{t('pages.register.total')}</span>
          <strong>{money(total, locale)}</strong>
        </div>
      </div>
    </aside>
  )
}

function RegisterCompetitionAside({ athlete, form, locale, packageLabel, t, total }) {
  const pending = t('pages.register.competitionSummaryPending')
  const picks = [form.division, form.category, form.estimatedWeight ? `${form.estimatedWeight} kg` : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <aside className="register-competition-aside" aria-label={t('pages.register.competitionTitle')}>
      <div className="register-competition-ticket">
        <p className="register-competition-ticket__athlete">
          {athlete?.fullName?.trim() || pending}
        </p>
        {packageLabel ? (
          <p className="register-competition-ticket__package">{packageLabel}</p>
        ) : null}
        <p className={`register-competition-ticket__picks${picks ? '' : ' is-pending'}`.trim()}>
          {picks || pending}
        </p>
        <div className="register-competition-ticket__total">
          <span>{t('pages.register.total')}</span>
          <strong>{money(total, locale)}</strong>
        </div>
      </div>
    </aside>
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
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationCodeState, setVerificationCodeState] = useState('idle')
  const [verificationCodeError, setVerificationCodeError] = useState('')
  const [cardOpen, setCardOpen] = useState(false)
  // En mobile el destino natural es una historia de Instagram; en desktop,
  // el post cuadrado. Mismo criterio que QrCredentialSection (perfil). El
  // usuario puede cambiarlo dentro del modal.
  const [cardInitialFormat, setCardInitialFormat] = useState('square')
  function openCardModal() {
    const prefersStory = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches
    setCardInitialFormat(prefersStory ? 'story' : 'square')
    setCardOpen(true)
  }
  const [profileStepIndex, setProfileStepIndex] = useState(0)
  const [wizardDirection, setWizardDirection] = useState(1)
  const [profileSubmitAttempted, setProfileSubmitAttempted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [membershipPaymentInProgress, setMembershipPaymentInProgress] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [purchaseType, setPurchaseType] = useState('combo')
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferOrderId, setTransferOrderId] = useState(null)
  const [changingMethod, setChangingMethod] = useState(false)
  const availabilityRequestRef = useRef(0)
  const submissionInFlightRef = useRef(false)
  const emailVerifyRef = useRef(null)
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
    setSubmitting(false)
    setAdvancing(false)
    submissionInFlightRef.current = false
    setSubmitError('')
    setMembershipPaymentInProgress(false)
    setTransferOpen(false)
    setTransferOrderId(null)
    setChangingMethod(false)
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
  const comboAvailability = useMemo(
    () => getEventComboAvailability(event, { hasActiveMembership }),
    [event, hasActiveMembership],
  )
  const comboEnabled = flow === 'competition' && comboAvailability.enabled
  const comboComingSoon = flow === 'competition' && comboAvailability.comingSoon
  const paidCheckoutOpen = isPaidCheckoutOpen(event, env)
  const checkoutFlowsLocked =
    (flow === 'competition' || flow === 'membership') && !paidCheckoutOpen
  const effectivePurchaseType = comboEnabled && purchaseType === 'combo'
    ? 'combo'
    : 'registration'
  const checkoutTotal = effectivePurchaseType === 'combo'
    ? comboAvailability.offer.price
    : total
  const eventPricing = useMemo(() => resolveEventPricing(event), [event])
  const membershipListPrice = Number(eventPricing.membership) || 0
  const registrationListPrice = Number(total) || Number(eventPricing.registration) || 0
  const comboListPrice = comboAvailability.offer ? Number(comboAvailability.offer.price) : 0
  const comboSavings =
    comboAvailability.offer && membershipListPrice + registrationListPrice > comboListPrice
      ? membershipListPrice + registrationListPrice - comboListPrice
      : 0
  const showComboChoice = comboEnabled || comboComingSoon
  const packageLabel = showComboChoice
    ? effectivePurchaseType === 'combo'
      ? t('account.membership.comboTitle')
      : t('account.membership.comboSeparate')
    : ''
  const showEligibilityNote = membershipGatePending && effectivePurchaseType !== 'combo'
  const isPaidCheckout = flow === 'competition' || flow === 'membership'
  const emailVerifiedLocally =
    resendState === 'verified' || verificationCodeState === 'verified'
  const showEmailVerify =
    isPaidCheckout &&
    !emailVerifiedLocally &&
    (emailBlocked || athlete?.emailVerifiedAt === null)

  useEffect(() => {
    if (!emailBlocked) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    emailVerifyRef.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
  }, [emailBlocked])

  useEffect(() => {
    function onVerified() {
      setEmailBlocked(false)
      setResendState('verified')
      setVerificationCodeState('verified')
      setSubmitError('')
    }
    window.addEventListener('plu:email-verified', onVerified)
    return () => window.removeEventListener('plu:email-verified', onVerified)
  }, [])

  useEffect(() => {
    if (flow !== 'competition') {
      setPurchaseType('registration')
      return
    }
    setPurchaseType(comboEnabled ? 'combo' : 'registration')
  }, [comboEnabled, event?.slug, flow])
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
    if (advancing) return
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

    // `ensureStepAvailability` es una llamada a la API: sin estado ocupado el
    // botón quedaba mudo y se podía disparar el chequeo varias veces.
    setAdvancing(true)
    let takenErrors
    try {
      takenErrors = await ensureStepAvailability(step.fields)
    } finally {
      setAdvancing(false)
    }
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

  function applyRegisterSubmitResult(result, { requestedPaymentMethod } = {}) {
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
      }
      setSubmitError(
        result.code === 'PLU08' ? t('pages.register.alreadyRegisteredPaid') : result.error,
      )
      setMembershipPaymentInProgress(Boolean(result.resumeMembershipPayment))
      setEmailBlocked(result.code === 'EMAIL_NOT_VERIFIED')
      setResendState('idle')
      return
    }
    if (flow === 'competition') {
      const method = result?.createdOrder?.paymentMethod ?? result?.payment?.method
      if (method === 'manual_link') {
        setChangingMethod(false)
        setTransferOrderId(result?.createdOrder?.paymentId ?? result?.payment?.id ?? null)
        setTransferOpen(true)
      } else if (requestedPaymentMethod === 'manual_link') {
        setChangingMethod(true)
        setSubmitError(t('pages.register.paymentMethodLocked'))
      } else {
        setChangingMethod(false)
      }
    } else if (flow === 'profile') onNavigate?.('profile')
  }

  async function submit(eventObject) {
    eventObject.preventDefault()
    if (submitting || submissionInFlightRef.current) return
    if (checkoutFlowsLocked) {
      setSubmitError(t('pages.register.checkoutSoon'))
      return
    }
    submissionInFlightRef.current = true
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

      submissionInFlightRef.current = false
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
        submissionInFlightRef.current = false
        return
      }
    }

    // Un reintento reemplaza el estado anterior: el usuario ve el progreso
    // actual y, si vuelve a fallar, el nuevo motivo. Nunca queda un error viejo
    // conviviendo con una operacion que ya esta en curso.
    setSubmitError('')
    setMembershipPaymentInProgress(false)
    setEmailBlocked(false)
    setSubmitting(true)
    let result
    try {
      result = await onSubmit(eventObject, event, {
        purchaseType: effectivePurchaseType,
        paymentMethod: form.paymentMethod,
      })
    } catch (error) {
      result = { error: error?.message ?? t('common.errorMessage') }
    } finally {
      setSubmitting(false)
      submissionInFlightRef.current = false
    }
    applyRegisterSubmitResult(result, { requestedPaymentMethod: form.paymentMethod })
  }

  async function switchToTransfer() {
    if (submitting || submissionInFlightRef.current || checkoutFlowsLocked) return
    submissionInFlightRef.current = true
    onUpdateForm({ target: { name: 'paymentMethod', value: 'manual_link' } })
    setSubmitError('')
    setMembershipPaymentInProgress(false)
    setEmailBlocked(false)
    setSubmitting(true)
    let result
    try {
      result = await onSubmit(
        { preventDefault() {} },
        event,
        { purchaseType: effectivePurchaseType, paymentMethod: 'manual_link' },
      )
    } catch (error) {
      result = { error: error?.message ?? t('common.errorMessage') }
    } finally {
      setSubmitting(false)
      submissionInFlightRef.current = false
    }
    applyRegisterSubmitResult(result, { requestedPaymentMethod: 'manual_link' })
  }

  async function resendVerification() {
    setResendState('sending')
    try {
      const result = await resendAthleteVerification()
      if (result?.alreadyVerified) {
        window.dispatchEvent(new CustomEvent('plu:email-verified'))
        return
      }
      setResendState('sent')
    } catch {
      setResendState('error')
    }
  }

  async function verifyEmailCode(event) {
    event?.preventDefault()
    const code = verificationCode.replace(/\D/g, '').slice(0, 8)
    if (code.length !== 8) {
      setVerificationCodeError(t('account.emailVerification.otpInvalid'))
      return
    }

    setVerificationCodeState('verifying')
    setVerificationCodeError('')
    try {
      await verifyAthleteEmailCode(code)
      setVerificationCodeState('verified')
      setResendState('verified')
      window.dispatchEvent(new CustomEvent('plu:email-verified'))
    } catch (error) {
      setVerificationCodeState('idle')
      const apiCode = error?.body?.code ?? error?.code
      setVerificationCodeError(
        apiCode === 'EMAIL_OTP_LOCKED'
          ? t('account.emailVerification.otpLocked')
          : apiCode === 'EMAIL_OTP_EXPIRED'
            ? t('account.emailVerification.otpExpired')
            : t('account.emailVerification.otpInvalid'),
      )
    }
  }

  const membershipOrderConfirmed = flow === 'membership' && visibleOrder
  const membershipConfirmedActive =
    membershipOrderConfirmed && getStatusMeta(visibleOrder.status, t).tone === 'success'
  const competitionSettling = flow === 'competition' && Boolean(visibleOrder) && !changingMethod
  const mpSettling = competitionSettling && visibleOrder.paymentMethod === 'mercado_pago'

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
        <p className="register-intro__eyebrow">{t('pages.register.profileEyebrow')}</p>
        <h1 className="register-intro__title">{t('pages.register.membershipTitle')}</h1>
        <p className="register-intro__desc">{t('pages.register.membershipDesc')}</p>
        {athlete?.fullName ? (
          <div className="register-intro__meta register-intro__meta--membership">
            <strong className="register-intro__athlete">{athlete.fullName}</strong>
          </div>
        ) : null}
      </header>
    ) : flow === 'competition' ? (
      <header className="register-intro register-intro--competition">
        <p className="register-intro__eyebrow">{t('pages.register.competitionEyebrow')}</p>
        <h1 className="register-intro__title">{event?.title || content[0]}</h1>
        <p className="register-intro__desc">
          {t('pages.register.competitionDescShort', { name: athlete?.fullName ?? '' })}
        </p>
        <div className="register-intro__meta register-intro__meta--competition">
          {athlete?.fullName ? (
            <strong className="register-intro__athlete">{athlete.fullName}</strong>
          ) : null}
          {event?.date ? <span>{formatShortDate(event.date, locale)}</span> : null}
          {(event?.venue || event?.location) ? (
            <span>{event?.venue || event?.location}</span>
          ) : null}
        </div>
      </header>
    ) : (
      <header className={`register-intro${flow === 'profile' ? ' register-intro--profile' : ''}`.trim()}>
        {flow === 'profile' ? (
          <p className="register-intro__eyebrow">{t('pages.register.profileEyebrow')}</p>
        ) : null}
        <h1 className="register-intro__title">{content[0]}</h1>
        <p className="register-intro__desc">{content[1]}</p>
      </header>
    )

  const membershipPaymentHint =
    flow === 'membership' && !visibleOrder
      ? form.paymentMethod === 'manual_link'
        ? t('pages.register.membershipPaymentHintManual')
        : t('pages.register.membershipPaymentHintMp')
      : ''

  // En competencia sin orden el total vive en el aside + footer: el hint vacío
  // solo sumaba ruido al viewport.
  const registerStatus =
    flow !== 'profile' &&
    visibleOrder &&
    flow !== 'membership' &&
    !((mpSettling || changingMethod) && !cardData) && (
      <div className="register-status register-status--settle">
        {visibleOrder ? (
          <div className="register-status__body register-status__body--success">
            {flow === 'competition' ? null : (
              <>
                <span className="register-status__name">{visibleOrder.athleteName}</span>
                <strong>{money(visibleOrder.amount, locale)}</strong>
              </>
            )}
            <p>{visibleOrder.concept}</p>
            <StatusPill value={visibleOrder.status} />
            <code>{visibleOrder.reference}</code>
            {visibleOrder.paymentMethod === 'mercado_pago' ? null : (
              <>
                <p className="manual-note">{t('pages.register.manualNote')}</p>
                {flow === 'competition' ? (
                  <button
                    type="button"
                    className="card-trigger-btn"
                    onClick={() => {
                      setTransferOrderId(visibleOrder.paymentId ?? visibleOrder.id ?? null)
                      setTransferOpen(true)
                    }}
                  >
                    {t('pages.register.transferOpen')}
                  </button>
                ) : null}
              </>
            )}
            {cardData && (
              <>
                <button
                  type="button"
                  className="card-trigger-btn"
                  onClick={openCardModal}
                  id="register-generate-card-btn"
                >
                  <ImageDown className="card-trigger-btn__icon" size={16} aria-hidden />
                  {t('pages.register.generateCard')}
                </button>
                <CardPreviewModal
                  open={cardOpen}
                  onClose={() => setCardOpen(false)}
                  cardData={cardData}
                  initialFormat={cardInitialFormat}
                />
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
      }${flow === 'competition' ? ' register-page--competition' : ''}${
        flow === 'membership' ? ' register-page--membership' : ''
      }${competitionSettling ? ' register-page--settling' : ''}${
        mpSettling ? ' register-page--settling-mp' : ''
      }${changingMethod ? ' register-page--change-method' : ''}`.trim()}
    >
      <div className="auth-immersive-glass auth-immersive-glass--wide register-shell">
        {(flow === 'profile' || flow === 'membership' || flow === 'competition') && onNavigate && (
          <nav className="register-topbar" aria-label={t('pages.register.navAria')}>
            <button
              type="button"
              className="register-topbar__back"
              onClick={() =>
                onNavigate(flow === 'competition' ? 'events' : 'members')
              }
            >
              <ArrowLeft size={15} aria-hidden />
              {flow === 'membership'
                ? t('pages.register.backToPlans')
                : flow === 'competition'
                  ? t('nav.events')
                  : t('pages.register.backMembership')}
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
          {flow === 'competition' && !visibleOrder && (
            <RegisterCompetitionAside
              athlete={athlete}
              form={form}
              locale={locale}
              packageLabel={packageLabel}
              t={t}
              total={checkoutTotal}
            />
          )}
          {registerProgress}
          {registerStatus}
        </aside>

        <div className="register-main">
          <div className="register-mobile-context">
            {registerIntro}
            {flow === 'profile' && !visibleOrder && <RegisterLiveCredential form={form} t={t} />}
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
                onOpenCard={openCardModal}
                showCardAction={Boolean(cardData)}
              />
              {cardData && (
                <CardPreviewModal
                  open={cardOpen}
                  onClose={() => setCardOpen(false)}
                  cardData={cardData}
                  initialFormat={cardInitialFormat}
                />
              )}
            </div>
          ) : checkoutFlowsLocked ? (
            <div className="register-card register-card--launch-gate">
              <LaunchRegistrationTeaser
                event={event}
                onNavigate={onNavigate}
                variant="compact"
                source={flow === 'membership' ? 'register_membership' : 'register_competition'}
              />
            </div>
          ) : competitionSettling ? (
            <div className="register-settle">
              {mpSettling ? (
                <div className="register-settle__toolbar">
                  <div className="register-settle__nav">
                    <button
                      type="button"
                      className="register-topbar__back register-settle__back"
                      onClick={() => setChangingMethod(true)}
                    >
                      <ArrowLeft size={15} aria-hidden />
                      {t('pages.register.changePaymentMethod')}
                    </button>
                    <button
                      type="button"
                      className="register-topbar__link register-settle__alt"
                      disabled={submitting}
                      onClick={() => void switchToTransfer()}
                    >
                      {t('pages.register.payByTransfer')}
                    </button>
                  </div>
                  <RegisterCheckoutBar
                    checkoutTotal={visibleOrder.amount ?? checkoutTotal}
                    flow={flow}
                    hideCta
                    packageLabel={visibleOrder.concept || packageLabel}
                    settle
                  />
                </div>
              ) : null}
              {mpSettling ? (
                <MercadoPagoEmbeddedCheckout order={visibleOrder} presentation="settle" />
              ) : (
                <RegisterCheckoutBar
                  checkoutTotal={visibleOrder.amount ?? checkoutTotal}
                  flow={flow}
                  hideCta
                  packageLabel={visibleOrder.concept || packageLabel}
                  settle
                />
              )}
            </div>
          ) : (
          <form className="register-card athlete-form" onSubmit={submit} noValidate>
            {showEmailVerify ? (
              <div ref={emailVerifyRef} className="register-verify" role="alert">
                <Pill tone="warning">{t('pages.register.emailVerificationPill')}</Pill>
                <p className="register-verify__title">{t('pages.register.emailVerificationTitle')}</p>
                <p className="register-verify__lead">
                  {resendState === 'sent'
                    ? t('pages.register.emailVerificationSent')
                    : resendState === 'error'
                      ? t('pages.register.emailVerificationError')
                      : t('pages.register.emailVerificationLead')}
                </p>
                {athlete?.email ? (
                  <p className="register-verify__email">{athlete.email}</p>
                ) : null}
                <div className="register-verify__otp">
                  <label htmlFor="register-verify-code">
                    {t('account.emailVerification.otpLabel')}
                  </label>
                  <div className="register-verify__otp-row">
                    <input
                      id="register-verify-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{8}"
                      maxLength={8}
                      placeholder="00000000"
                      value={verificationCode}
                      disabled={verificationCodeState === 'verifying'}
                      onChange={(event) => {
                        setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 8))
                        setVerificationCodeError('')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          verifyEmailCode()
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={verificationCodeState === 'verifying' || verificationCode.length !== 8}
                      onClick={() => verifyEmailCode()}
                    >
                      {verificationCodeState === 'verifying'
                        ? t('account.emailVerification.otpVerifying')
                        : t('account.emailVerification.otpSubmit')}
                    </button>
                  </div>
                  {verificationCodeError ? (
                    <p className="register-verify__otp-error" role="alert">
                      {verificationCodeError}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="register-verify__resend"
                  disabled={resendState === 'sending'}
                  onClick={resendVerification}
                >
                  {resendState === 'sending'
                    ? t('pages.register.emailVerificationSending')
                    : resendState === 'sent'
                      ? t('pages.register.emailVerificationResendAgain')
                      : t('pages.register.emailVerificationResend')}
                </button>
              </div>
            ) : emailVerifiedLocally && isPaidCheckout ? (
              <div className="register-verify register-verify--done" role="status">
                <Pill tone="success">{t('pages.register.emailVerificationConfirmedPill')}</Pill>
                <p className="register-verify__lead">{t('pages.register.emailVerificationAlready')}</p>
              </div>
            ) : null}

            {flow === 'profile' && (
              // Contenedor en grilla + mode="sync": los dos pasos comparten
              // celda durante el crossfade, así la tarjeta no colapsa de alto
              // entre "Datos personales" (6 campos) y "Ubicación" (5).
              <div className="register-wizard-swap">
              <MotionContentSwap
                className="register-wizard"
                direction={wizardDirection}
                mode="sync"
                swapKey={activeProfileStep.id}
              >
                {profileStepIndex === 0 && (
                  <FormSection
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
                        <PasswordStrengthMeter password={form.password} t={t} />
                      </div>
                    </div>
                  </FormSection>
                )}

                {profileStepIndex === 1 && (
                  <FormSection
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
              </div>
            )}

            {flow === 'competition' && changingMethod ? (
              <div className="register-competition-form register-competition-form--change-method">
                <button
                  type="button"
                  className="register-topbar__back"
                  onClick={() => {
                    setChangingMethod(false)
                    setSubmitError('')
                  }}
                >
                  <ArrowLeft size={15} aria-hidden />
                  {t('pages.register.backToMercadoPago')}
                </button>
                <FormSection
                  title={t('pages.register.competitionPaymentTitle')}
                  description={t('pages.register.changePaymentLead')}
                >
                  <RegisterSettle
                    onPaymentBlur={blurField}
                    onPaymentChange={changeField}
                    paymentError={errors.paymentMethod}
                    paymentMethod={form.paymentMethod}
                    showPayment
                  />
                </FormSection>
              </div>
            ) : flow === 'competition' ? (
              <div className="register-competition-form">
                {/* Sin `step`: la inscripción tiene una sola sección. El "01"
                    prometía una secuencia que no existe. */}
                <FormSection
                  title={t('pages.register.competitionFormTitle')}
                  description={t('pages.register.competitionFormDesc')}
                >
                  <div className="register-competition-fields">
                    <ChoiceField
                      className="register-competition-choice register-competition-choice--division"
                      error={errors.division}
                      label={t('pages.register.division')}
                      name="division"
                      value={form.division}
                      onBlur={blurField}
                      onChange={changeField}
                      options={formOptions.division}
                    />
                    <ChoiceField
                      className="register-competition-choice register-competition-choice--category"
                      error={errors.category}
                      label={t('pages.register.category')}
                      name="category"
                      value={form.category}
                      onBlur={blurField}
                      onChange={changeField}
                      options={formOptions.category}
                    />
                    <Field
                      className="register-competition-weight"
                      error={errors.estimatedWeight}
                      inputMode="decimal"
                      label={t('pages.register.bodyWeight')}
                      name="estimatedWeight"
                      placeholder={t('pages.register.bodyWeightPlaceholder')}
                      value={form.estimatedWeight}
                      onBlur={blurField}
                      onChange={changeField}
                    />
                  </div>
                </FormSection>

                {showComboChoice || (isPaidCheckout && flow === 'competition') ? (
                  <RegisterSettle
                    comboComingSoon={comboComingSoon}
                    comboEnabled={comboEnabled}
                    comboOffer={comboAvailability.offer}
                    comboSavings={comboSavings}
                    membershipPrice={membershipListPrice}
                    onPaymentBlur={blurField}
                    onPaymentChange={changeField}
                    onPurchaseTypeChange={setPurchaseType}
                    paymentError={errors.paymentMethod}
                    paymentMethod={form.paymentMethod}
                    purchaseType={effectivePurchaseType}
                    registrationPrice={registrationListPrice}
                    showPackage={showComboChoice}
                    showPayment={isPaidCheckout}
                  />
                ) : null}

                {showEligibilityNote && (
                  <div className="register-eligibility-note" role="status">
                    <p>{t('pages.register.membershipRequiredForCompetition')}</p>
                    {onNavigate && !comboEnabled && (
                      <button
                        type="button"
                        className="register-eligibility-note__action"
                        onClick={() => onNavigate('membership')}
                      >
                        {t('pages.register.membershipRequiredAction')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {submitError && !emailBlocked && (
              <div className="form-submit-error" role="alert">
                <p>
                  {membershipPaymentInProgress
                    ? t('pages.register.membershipPaymentInProgress')
                    : submitError}
                </p>
                {membershipPaymentInProgress ? (
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={() => onNavigate?.('membership')}
                  >
                    {t('pages.register.membershipPaymentInProgressAction')}
                  </button>
                ) : null}
              </div>
            )}

            <div
              className={`register-card__footer form-actions${
                flow === 'profile'
                  ? ` register-card__footer--profile register-card__footer--wizard${profileStepIndex > 0 ? ' register-card__footer--wizard-back' : ''}`
                  : isPaidCheckout
                    ? ' register-checkout'
                    : ' register-card__footer--checkout'
              }`}
            >
              {flow === 'membership' ? (
                <RegisterSettle
                  onPaymentBlur={blurField}
                  onPaymentChange={changeField}
                  paymentError={errors.paymentMethod}
                  paymentHint={membershipPaymentHint}
                  paymentMethod={form.paymentMethod}
                  showPayment
                />
              ) : null}

              {flow === 'profile' && profileStepIndex > 0 && (
                <button type="button" className="register-card__back btn btn--outline" onClick={goBackProfileStep}>
                  <ArrowLeft size={15} aria-hidden />
                  {t('pages.register.back')}
                </button>
              )}

              {flow === 'profile' && !isLastProfileStep ? (
                <button
                  type="button"
                  className="btn register-card__submit"
                  onClick={advanceProfileStep}
                  disabled={advancing}
                  aria-busy={advancing || undefined}
                >
                  {advancing ? t('common.loading') : t('pages.register.continue')}
                  {advancing ? (
                    <span className="register-card__submit-spinner" aria-hidden />
                  ) : (
                    <ArrowRight size={16} className="register-card__submit-arrow" aria-hidden />
                  )}
                </button>
              ) : (
                <>
                  {isPaidCheckout ? (
                    <RegisterCheckoutBar
                      checkoutTotal={checkoutTotal}
                      flow={flow}
                      packageLabel={
                        flow === 'membership'
                          ? t('pages.register.membershipPlanLabel')
                          : packageLabel
                      }
                      submitting={submitting}
                    />
                  ) : (
                    <>
                      {flow !== 'profile' && (
                        <div className="register-card__total">
                          <span>{t('pages.register.total')}</span>
                          <strong>{money(checkoutTotal, locale)}</strong>
                        </div>
                      )}
                      <button
                        type="submit"
                        className={[
                          'btn register-card__submit',
                          flow === 'profile' && profileProgress?.complete ? 'register-card__submit--ready' : '',
                          flow === 'membership' ? 'register-card__submit--membership' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        disabled={submitting || (flow === 'profile' && Boolean(visibleOrder))}
                        aria-busy={submitting || undefined}
                      >
                        {submitting ? t('common.loading') : content[2]}
                        {submitting ? (
                          <span className="register-card__submit-spinner" aria-hidden />
                        ) : (
                          <ArrowRight size={16} className="register-card__submit-arrow" aria-hidden />
                        )}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </form>
          )}
        </div>
      </div>
      {transferOpen && athlete && (visibleOrder?.paymentMethod === 'manual_link' || form.paymentMethod === 'manual_link') ? (
        <TransferPayModal
          athlete={athlete}
          amount={visibleOrder?.amount ?? checkoutTotal}
          orderId={transferOrderId ?? visibleOrder?.paymentId ?? visibleOrder?.id ?? null}
          onClose={() => setTransferOpen(false)}
          purpose="competition"
        />
      ) : null}
    </main>
  )
}
