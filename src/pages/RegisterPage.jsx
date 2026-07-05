import { useMemo, useState } from 'react'

import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, IdCard, ShieldCheck, Trophy } from 'lucide-react'

import { FORM_OPTIONS } from '../lib/constants.js'

import { formatShortDate, money } from '../lib/format.js'

import { validateAthleteForm, validateCompetitionForm, validateMembershipForm } from '../lib/validation.js'

import FormSection from '../components/ui/FormSection.jsx'

import { Field, Select } from '../components/ui/FormFields.jsx'

import StatusPill from '../components/ui/StatusPill.jsx'

import CardPreviewModal from '../components/ui/CardPreviewModal.jsx'



const PROFILE_PERKS = [

  { icon: IdCard, text: 'Credencial digital y código PLU ARG' },

  { icon: Trophy, text: 'Inscripción a meets oficiales' },

  { icon: ShieldCheck, text: 'Perfil validado por la federación' },

]



const PROFILE_STEPS = [

  {

    id: 'personal',

    step: '01',

    label: 'Datos personales',

    fields: ['fullName', 'documentId', 'birthDate', 'email', 'phone'],

  },

  {

    id: 'location',

    step: '02',

    label: 'Ubicación y equipo',

    fields: ['country', 'province', 'city', 'gym', 'sex'],

  },

]



function isFieldFilled(form, field) {

  const value = form[field]



  if (field === 'phone') {

    return String(value ?? '').replace(/\D/g, '').length >= 8

  }



  return String(value ?? '').trim().length > 0

}



function getProfileProgress(form) {

  const steps = PROFILE_STEPS.map((step) => {

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



function RegisterProgress({ form, flow }) {

  const progress = useMemo(() => (flow === 'profile' ? getProfileProgress(form) : null), [flow, form])



  if (!progress || progress.complete) return null



  return (

    <div className="register-progress" aria-label="Progreso del registro">

      <div className="register-progress__head">

        <span>Progreso del perfil</span>

        <strong>{progress.percent}%</strong>

      </div>

      <div className="register-progress__bar" aria-hidden>

        <span style={{ width: `${progress.percent}%` }} />

      </div>

      <ol className="register-progress__steps">

        {progress.steps.map((step) => (

          <li

            key={step.id}

            className={`register-progress__step register-progress__step--${step.state}`.trim()}

          >

            <span className="register-progress__step-mark" aria-hidden>

              {step.state === 'complete' ? <Check size={12} strokeWidth={2.5} /> : step.step}

            </span>

            <div className="register-progress__step-copy">

              <strong>{step.label}</strong>

              <span>

                {step.state === 'complete'

                  ? 'Completo'

                  : step.state === 'active'

                    ? `${step.filled}/${step.total} campos`

                    : 'Pendiente'}

              </span>

            </div>

          </li>

        ))}

      </ol>

      {progress.currentStep && (

        <p className="register-progress__hint">

          Siguiente: <strong>{progress.currentStep.label}</strong>

        </p>

      )}

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

  const [errors, setErrors] = useState({})

  const [submitError, setSubmitError] = useState('')

  const [cardOpen, setCardOpen] = useState(false)

  const profileProgress = useMemo(

    () => (flow === 'profile' ? getProfileProgress(form) : null),

    [flow, form],

  )



  const content = {

    profile: ['Nuevo atleta', 'Registro de atleta', 'Completá tus datos para crear tu perfil en PLU Argentina.', 'Crear perfil'],

    competition: ['Competencia', `Inscripción a ${event?.title}`, `${athlete?.fullName}, completá tus datos competitivos para este evento.`, 'Generar inscripción'],

    membership: ['Afiliación anual', 'Pagar afiliación PLU ARG', `${athlete?.fullName}, seleccioná cómo querés pagar tu afiliación.`, 'Generar pago'],

  }[flow]

  const visibleOrder = createdOrder?.type === flow ? createdOrder : null

  const activeMembership = memberships.find((item) => item.athleteId === visibleOrder?.athleteId)
  const memberCode = activeMembership?.memberCode



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

            membershipExpiration: formatShortDate(activeMembership?.expirationDate),

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



  function submit(eventObject) {

    eventObject.preventDefault()

    const validation = flow === 'profile'

      ? validateAthleteForm(form)

      : flow === 'competition'

        ? validateCompetitionForm(form)

        : validateMembershipForm(form)

    if (!validation.success) {

      setErrors(validation.errors)

      eventObject.currentTarget.querySelector(`[name="${Object.keys(validation.errors)[0]}"]`)?.focus()

      return

    }

    const result = onSubmit(eventObject, event)

    if (result?.error) setSubmitError(result.error)

  }



  return (

    <main className="page register-page register-page--design">

      {flow === 'profile' && onNavigate && (

        <nav className="register-topbar" aria-label="Navegación del registro">

          <button type="button" className="register-topbar__back" onClick={() => onNavigate('members')}>

            <ArrowLeft size={15} aria-hidden />

            Volver a afiliación

          </button>

          <button type="button" className="register-topbar__link" onClick={() => onNavigate('login')}>

            Ya tengo cuenta

            <ChevronRight size={14} aria-hidden />

          </button>

        </nav>

      )}



      <div className="register-shell">

        <aside className="register-aside">

          <header className="register-intro">

            <span className="register-intro__eyebrow">

              <span className="register-intro__eyebrow-dot" aria-hidden />

              {content[0]}

            </span>

            <h1 className="register-intro__title">{content[1]}</h1>

            <p className="register-intro__desc">{content[2]}</p>



            {flow === 'profile' && (

              <ul className="register-perks">

                {PROFILE_PERKS.map(({ icon: Icon, text }) => (

                  <li key={text}>

                    <span className="register-perks__icon" aria-hidden>

                      <Icon size={15} strokeWidth={1.75} />

                    </span>

                    {text}

                  </li>

                ))}

              </ul>

            )}



            {flow !== 'profile' && (

              <div className="register-intro__meta">

                <strong>{flow === 'membership' ? money(total) : event?.title}</strong>

                <span>{athlete?.fullName}</span>

              </div>

            )}

          </header>



          {flow === 'profile' && !visibleOrder && <RegisterProgress form={form} flow={flow} />}



          <div className="register-status">

            <span className="register-status__label">

              {flow === 'profile' ? 'Estado del perfil' : 'Estado del trámite'}

            </span>

            {visibleOrder ? (

              <div className="register-status__body register-status__body--success">

                <span className="register-status__name">{visibleOrder.athleteName}</span>

                {flow === 'profile' ? (

                  <>

                    <CheckCircle2 size={28} aria-hidden />

                    <strong>Perfil creado</strong>

                    <p>Ya podés acceder a tu área de atleta.</p>

                    {onNavigate && (

                      <button type="button" className="btn btn--small" onClick={() => onNavigate('login')}>

                        Ingresar a mi cuenta

                      </button>

                    )}

                  </>

                ) : (

                  <>

                    <strong>{money(visibleOrder.amount)}</strong>

                    <p>{visibleOrder.concept}</p>

                    <StatusPill value={visibleOrder.status} />

                    <code>{visibleOrder.reference}</code>

                    {visibleOrder.paymentMethod === 'mercado_pago' ? (

                      <button type="button" className="btn btn--outline" onClick={() => onApprovePayment(visibleOrder.paymentId)}>

                        Simular pago

                      </button>

                    ) : (

                      <p className="manual-note">El equipo PLU confirmará la acreditación.</p>

                    )}

                    {cardData && (

                      <>

                        <button

                          type="button"

                          className="card-trigger-btn"

                          onClick={() => setCardOpen(true)}

                          id="register-generate-card-btn"

                        >

                          <span className="card-trigger-btn__emoji">🎉</span>

                          Generar mi card para redes sociales

                        </button>

                        <CardPreviewModal

                          open={cardOpen}

                          onClose={() => setCardOpen(false)}

                          cardData={cardData}

                        />

                      </>

                    )}

                  </>

                )}

              </div>

            ) : (

              <p className="register-status__hint">

                <span className="register-status__live-dot" aria-hidden />

                {flow === 'profile'

                  ? profileProgress?.complete

                    ? 'Listo para crear tu perfil.'

                    : profileProgress?.currentStep

                      ? `Completá ${profileProgress.currentStep.label.toLowerCase()}.`

                      : 'Completá el formulario para activar tu perfil.'

                  : 'Generá la orden para consultar su estado.'}

              </p>

            )}

          </div>

        </aside>



        <div className="register-main">

          <form className="register-card athlete-form" onSubmit={submit} noValidate>

            {flow === 'profile' && (

              <>

                <FormSection step="01" title="Datos personales" description="Información básica para identificarte.">

                  <div className="form-grid">

                    <Field autoComplete="name" error={errors.fullName} label="Nombre y apellido" name="fullName" placeholder="Ej.: Martina Rivas" value={form.fullName} onChange={changeField} />

                    <Field error={errors.documentId} inputMode="numeric" label="DNI o documento" name="documentId" placeholder="Ej.: 40111222" value={form.documentId} onChange={changeField} />

                    <Field error={errors.birthDate} inputMode="numeric" label="Fecha de nacimiento" maxLength={10} name="birthDate" placeholder="DD/MM/AAAA" value={form.birthDate} onChange={changeField} />

                    <Field autoComplete="email" error={errors.email} label="Correo electrónico" name="email" placeholder="nombre@correo.com" type="email" value={form.email} onChange={changeField} />

                    <Field autoComplete="tel" error={errors.phone} inputMode="tel" label="Teléfono" name="phone" placeholder="Ej.: +54 9 11 1234 5678" value={form.phone} onChange={changeField} />

                  </div>

                </FormSection>



                <FormSection step="02" title="Ubicación y equipo" description="Datos de residencia y entrenamiento.">

                  <div className="form-grid">

                    <Field error={errors.country} label="País" name="country" value={form.country} onChange={changeField} />

                    <Field error={errors.province} label="Provincia" name="province" placeholder="Ej.: Buenos Aires" value={form.province} onChange={changeField} />

                    <Field error={errors.city} label="Ciudad" name="city" placeholder="Ej.: La Plata" value={form.city} onChange={changeField} />

                    <Field error={errors.gym} label="Gimnasio o equipo" name="gym" placeholder="Ej.: Maximal Power" value={form.gym} onChange={changeField} />

                    <Select label="Sexo competitivo" name="sex" value={form.sex} onChange={changeField} options={FORM_OPTIONS.sex} />

                  </div>

                </FormSection>

              </>

            )}



            {flow === 'competition' && (

              <FormSection step="01" title={event.title} description="Datos específicos para esta competencia.">

                <div className="form-grid">

                  <Select label="División" name="division" value={form.division} onChange={changeField} options={FORM_OPTIONS.division} />

                  <Select label="Categoría" name="category" value={form.category} onChange={changeField} options={FORM_OPTIONS.category} />

                  <Field error={errors.estimatedWeight} inputMode="decimal" label="Peso corporal" name="estimatedWeight" placeholder="Ej.: 67,5 kg" value={form.estimatedWeight} onChange={changeField} />

                  <div className="field field--readonly">

                    <span>Tipo de trámite</span>

                    <strong>Inscripción a {event.title}</strong>

                  </div>

                  <Select label="Método de pago" name="paymentMethod" value={form.paymentMethod} onChange={changeField} options={FORM_OPTIONS.paymentMethod} />

                </div>

              </FormSection>

            )}



            {flow === 'membership' && (

              <FormSection step="01" title="Método de pago" description="Tu información personal ya está asociada al perfil.">

                <div className="form-grid form-grid--compact">

                  <Select label="Método de pago" name="paymentMethod" value={form.paymentMethod} onChange={changeField} options={FORM_OPTIONS.paymentMethod} />

                </div>

              </FormSection>

            )}



            {submitError && (

              <p className="form-submit-error" role="alert">

                {submitError}

              </p>

            )}



            <div className="register-card__footer form-actions">

              <div className="register-card__summary">

                <strong>{flow === 'profile' ? 'Alta de atleta sin costo' : `Total: ${money(total)}`}</strong>

                <span>

                  {flow === 'profile'

                    ? profileProgress?.complete

                      ? 'Todos los campos están listos.'

                      : 'Completá ambas secciones para continuar.'

                    : 'La orden quedará vinculada a tu perfil.'}

                </span>

              </div>

              <button
                type="submit"
                className={`btn register-card__submit${flow === 'profile' && profileProgress?.complete ? ' register-card__submit--ready' : ''}`.trim()}
                disabled={flow === 'profile' && Boolean(visibleOrder)}
              >
                <span className="register-card__submit-icon" aria-hidden>
                  <ShieldCheck size={17} strokeWidth={2} />
                </span>
                <span className="register-card__submit-copy">
                  <strong>{content[3]}</strong>
                  {flow === 'profile' && (
                    <small>
                      {profileProgress?.complete
                        ? 'Gratis · listo para crear'
                        : `${profileProgress?.percent ?? 0}% completado`}
                    </small>
                  )}
                </span>
                <ArrowRight size={16} className="register-card__submit-arrow" aria-hidden />
              </button>

            </div>

          </form>

        </div>

      </div>

    </main>

  )

}


