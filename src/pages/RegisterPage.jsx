import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, ImageDown } from 'lucide-react'
import FormSection from '../components/ui/FormSection.jsx'
import { DateField, Field, Select } from '../components/ui/FormFields.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import CardPreviewModal from '../components/ui/CardPreviewModal.jsx'
import RegisterMembershipConfirmation from '../components/ui/RegisterMembershipConfirmation.jsx'
import MotionContentSwap from '../motion/MotionContentSwap.tsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { getFormOptions } from '../lib/formOptions.js'
import { formatShortDate, money } from '../lib/format.js'
import { getStatusMeta } from '../lib/status.js'
import {
  validateAthleteFields,
  validateAthleteForm,
  validateCompetitionForm,
  validateMembershipForm,
} from '../lib/validation.js'

function getProfileSteps(t) {
  return [
    {
      id: 'personal',
      step: '01',
      label: t('pages.register.stepPersonal'),
      fields: ['fullName', 'documentId', 'birthDate', 'email', 'phone'],
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
      return str.length >= 6
    case 'birthDate':
      return /^\d{4}-\d{2}-\d{2}$/.test(str)
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
  onApprovePayment,
  onNavigate,
  onSubmit,
  onUpdateForm,
  total,
}) {
  const { locale, t } = useI18n()
  const formOptions = useMemo(() => getFormOptions(t), [t])
  const profileSteps = useMemo(() => getProfileSteps(t), [t])

  const [errors, setErrors] = useState({})
  const [profileErrorStepIndex, setProfileErrorStepIndex] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [cardOpen, setCardOpen] = useState(false)
  const [paymentApprovedModal, setPaymentApprovedModal] = useState(null)
  const [profileStepIndex, setProfileStepIndex] = useState(0)
  const [wizardDirection, setWizardDirection] = useState(1)
  const [profileSubmitAttempted, setProfileSubmitAttempted] = useState(false)
  const profileProgress = useMemo(
    () => (flow === 'profile' ? getProfileProgress(form, profileSteps) : null),
    [flow, form, profileSteps],
  )
  const isLastProfileStep = profileStepIndex >= profileSteps.length - 1
  const activeProfileStep = profileSteps[profileStepIndex]

  useEffect(() => {
    setProfileStepIndex(0)
    setErrors({})
    setProfileErrorStepIndex(null)
    setProfileSubmitAttempted(false)
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
  const activeMembership = memberships.find((item) => item.athleteId === visibleOrder?.athleteId)
  const memberCode = activeMembership?.memberCode
  const hasActiveMembership = memberships.some((item) => item.athleteId === athlete?.id && item.status === 'activa')
  const competitionBlocked = flow === 'competition' && !hasActiveMembership
  const visibleErrors =
    flow === 'profile'
      ? profileErrorStepIndex === profileStepIndex && (profileStepIndex === 0 || profileSubmitAttempted)
        ? errors
        : {}
      : errors

  const cardData =
    visibleOrder && flow === 'competition'
      ? {
          athleteName: visibleOrder.athleteName,
          athleteCode: memberCode,
          eventTitle: event?.title,
          eventDate: event?.date,
          eventVenue: event?.venue,
          eventLocation: event?.location,
          category: form.category,
          division: form.division,
          eventSlug: event?.slug,
          variant: 'event',
        }
      : visibleOrder && flow === 'membership'
        ? {
            athleteName: visibleOrder.athleteName,
            athleteCode: memberCode,
            membershipExpiration: formatShortDate(activeMembership?.expirationDate, locale),
            variant: 'membership',
            eventSlug: 'afiliacion',
          }
        : null

  function changeField(event) {
    const field = event.target.name
    onUpdateForm(event)
    if (errors[field]) setErrors((current) => ({ ...current, [field]: '' }))
    setSubmitError('')
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
    setProfileErrorStepIndex(null)
    setProfileSubmitAttempted(false)
    setSubmitError('')
  }

  function advanceProfileStep() {
    const step = profileSteps[profileStepIndex]
    const validation = validateAthleteFields(form, step.fields, t)
    if (!validation.success) {
      setErrors(validation.errors)
      setProfileErrorStepIndex(profileStepIndex)
      focusFirstError(validation.errors)
      return
    }

    setErrors({})
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
    setProfileErrorStepIndex(null)
    setProfileSubmitAttempted(false)
    setSubmitError('')
  }

  function submit(eventObject) {
    eventObject.preventDefault()
    if (flow === 'profile') setProfileSubmitAttempted(true)

    if (competitionBlocked) {
      setSubmitError(t('pages.register.membershipRequiredForCompetition'))
      return
    }

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
        if (errorStepIndex >= 0) setProfileStepIndex(errorStepIndex)
        if (errorStepIndex >= 0) setProfileErrorStepIndex(errorStepIndex)
      }

      return
    }

    const result = onSubmit(eventObject, event)
    if (result?.error) setSubmitError(result.error)
    else if (flow === 'profile') onNavigate?.('profile')
  }

  async function approveVisiblePayment() {
    if (!visibleOrder?.paymentId) return
    await onApprovePayment(visibleOrder.paymentId)
    setPaymentApprovedModal({
      concept: visibleOrder.concept,
      amount: visibleOrder.amount,
      method: visibleOrder.paymentMethod,
    })
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
      <header className="register-intro">
        {flow === 'profile' && (
          <span className="register-intro__eyebrow">{t('pages.register.profileEyebrow')}</span>
        )}
        <h1 className="register-intro__title">{content[0]}</h1>
        <p className="register-intro__desc">{content[1]}</p>

        {flow !== 'profile' && (
          <div className="register-intro__meta">
            <strong>{event?.title}</strong>
            <span>{athlete?.fullName}</span>
          </div>
        )}
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
            <button
              type="button"
              className="btn btn--outline"
              onClick={approveVisiblePayment}
            >
              {t('pages.register.simulatePayment')}
            </button>
          ) : (
            <>
              <p className="manual-note">{t('pages.register.manualNote')}</p>
              <button
                type="button"
                className="btn btn--outline"
                onClick={approveVisiblePayment}
              >
                {t('pages.register.simulatePayment')}
              </button>
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
      className={`page register-page register-page--design register-page--premium${
        flow === 'profile' ? ' register-page--profile' : ''
      }${flow === 'membership' ? ' register-page--membership' : ''}`.trim()}
    >
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
              <ChevronRight size={14} aria-hidden />
            </button>
          )}
        </nav>
      )}

      <div className="register-shell">
        <aside className="register-aside register-aside--desktop">
          {registerIntro}
          {flow === 'membership' && !visibleOrder && (
            <RegisterMembershipAside athlete={athlete} locale={locale} t={t} total={total} />
          )}
          {registerProgress}
          {registerStatus}
        </aside>

        <div className="register-main">
          <div className="register-mobile-context">
            {registerIntro}
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

          {membershipOrderConfirmed ? (
            <div className="register-card register-card--confirmation">
              <RegisterMembershipConfirmation
                memberCode={memberCode}
                membershipExpiration={
                  cardData?.membershipExpiration ??
                  formatShortDate(activeMembership?.expirationDate, locale)
                }
                order={visibleOrder}
                onApprovePayment={async (paymentId) => {
                  await onApprovePayment(paymentId)
                  setPaymentApprovedModal({
                    concept: visibleOrder.concept,
                    amount: visibleOrder.amount,
                    method: visibleOrder.paymentMethod,
                  })
                }}
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
                        error={visibleErrors.fullName}
                        label={t('pages.register.fullName')}
                        name="fullName"
                        placeholder={t('pages.register.fullNamePlaceholder')}
                        value={form.fullName}
                        onChange={changeField}
                      />
                      <Field
                        error={visibleErrors.documentId}
                        inputMode="numeric"
                        label={t('pages.register.documentIdLabel')}
                        name="documentId"
                        placeholder={t('pages.register.documentPlaceholder')}
                        value={form.documentId}
                        onChange={changeField}
                      />
                      <DateField
                        error={visibleErrors.birthDate}
                        label={t('pages.register.birthDate')}
                        name="birthDate"
                        value={form.birthDate}
                        onChange={changeField}
                      />
                      <Field
                        autoComplete="email"
                        error={visibleErrors.email}
                        label={t('pages.register.email')}
                        name="email"
                        placeholder={t('pages.register.emailPlaceholder')}
                        type="email"
                        value={form.email}
                        onChange={changeField}
                      />
                      <Field
                        autoComplete="tel"
                        error={visibleErrors.phone}
                        inputMode="tel"
                        label={t('pages.register.phone')}
                        name="phone"
                        placeholder={t('pages.register.phonePlaceholder')}
                        value={form.phone}
                        onChange={changeField}
                      />
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
                        label={t('pages.register.country')}
                        name="country"
                        value={form.country}
                        onChange={changeField}
                        options={formOptions.country}
                      />
                      <Field
                        error={visibleErrors.province}
                        label={t('pages.register.province')}
                        name="province"
                        placeholder={t('pages.register.provincePlaceholder')}
                        value={form.province}
                        onChange={changeField}
                      />
                      <Field
                        error={visibleErrors.city}
                        label={t('pages.register.city')}
                        name="city"
                        placeholder={t('pages.register.cityPlaceholder')}
                        value={form.city}
                        onChange={changeField}
                      />
                      <Field
                        error={visibleErrors.gym}
                        label={t('pages.register.gym')}
                        name="gym"
                        placeholder={t('pages.register.gymPlaceholder')}
                        value={form.gym}
                        onChange={changeField}
                      />
                      <Select
                        error={visibleErrors.sex}
                        label={t('pages.register.sexCompetitive')}
                        name="sex"
                        value={form.sex}
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
                title={event.title}
                description={t('pages.register.competitionDataDesc')}
              >
                {competitionBlocked && (
                  <div className="register-eligibility-alert" role="alert">
                    <strong>{t('pages.register.membershipRequiredTitle')}</strong>
                    <p>{t('pages.register.membershipRequiredForCompetition')}</p>
                    {onNavigate && (
                      <button type="button" className="btn btn--small" onClick={() => onNavigate('membership')}>
                        {t('pages.register.membershipRequiredAction')}
                      </button>
                    )}
                  </div>
                )}
                <div className="form-grid">
                  <Select
                    label={t('pages.register.division')}
                    name="division"
                    value={form.division}
                    onChange={changeField}
                    options={formOptions.division}
                  />
                  <Select
                    label={t('pages.register.category')}
                    name="category"
                    value={form.category}
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
                    onChange={changeField}
                  />
                  <div className="field field--readonly">
                    <span>{t('pages.register.procedureType')}</span>
                    <strong>{t('pages.register.procedureRegistration', { event: event.title })}</strong>
                  </div>
                  <Select
                    label={t('pages.register.paymentMethod')}
                    name="paymentMethod"
                    value={form.paymentMethod}
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

            {submitError && (
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
                  disabled={(flow === 'profile' && Boolean(visibleOrder)) || competitionBlocked}
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
      {paymentApprovedModal && (
        <div className="register-payment-modal" role="dialog" aria-modal="true" aria-labelledby="register-payment-modal-title">
          <div className="register-payment-modal__card">
            <CheckCircle2 size={38} aria-hidden />
            <span>{t('pages.register.paymentApprovedEyebrow')}</span>
            <h2 id="register-payment-modal-title">{t('pages.register.paymentApprovedTitle')}</h2>
            <p>{t('pages.register.paymentApprovedDesc')}</p>
            <dl>
              <div>
                <dt>{t('pages.register.paymentApprovedConcept')}</dt>
                <dd>{paymentApprovedModal.concept}</dd>
              </div>
              <div>
                <dt>{t('pages.register.paymentApprovedAmount')}</dt>
                <dd>{money(paymentApprovedModal.amount, locale)}</dd>
              </div>
            </dl>
            <button type="button" className="btn" onClick={() => setPaymentApprovedModal(null)}>
              {t('pages.register.paymentApprovedClose')}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
