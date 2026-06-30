import { useState } from 'react'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { FORM_OPTIONS } from '../lib/constants.js'
import { money } from '../lib/format.js'
import { validateAthleteForm, validateCompetitionForm, validateMembershipForm } from '../lib/validation.js'
import FormSection from '../components/ui/FormSection.jsx'
import { Field, Select } from '../components/ui/FormFields.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'

export default function RegisterPage({ athlete, createdOrder, event, flow, form, onApprovePayment, onSubmit, onUpdateForm, total }) {
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const content = {
    profile: ['Nuevo atleta', 'Registro de atleta', 'Completá tus datos personales para crear tu perfil en PLU Argentina.', 'Crear perfil'],
    competition: ['Competencia', `Inscripción a ${event?.title}`, `${athlete?.fullName}, completá tus datos competitivos para este evento.`, 'Generar inscripción'],
    membership: ['Afiliación anual', 'Pagar afiliación PLU ARG', `${athlete?.fullName}, seleccioná cómo querés pagar tu afiliación.`, 'Generar pago'],
  }[flow]
  const visibleOrder = createdOrder?.type === flow ? createdOrder : null

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
    <main className="page register-page">
      <div className="page__inner">
        <Reveal>
          <section className="section-heading section-heading--left">
            <span className="section-heading__eyebrow">{content[0]}</span>
            <h1 className="section-heading__title">{content[1]}</h1>
            <p className="section-heading__desc">{content[2]}</p>
          </section>
        </Reveal>

        <section className="form-section">
          <form className="athlete-form" onSubmit={submit} noValidate>
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
                  <div className="field field--readonly"><span>Tipo de trámite</span><strong>Inscripción a {event.title}</strong></div>
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

            {submitError && <p className="form-submit-error" role="alert">{submitError}</p>}
            <div className="form-actions">
              <div>
                <strong>{flow === 'profile' ? 'Alta de atleta sin costo' : `Total: ${money(total)}`}</strong>
                <span>{flow === 'profile' ? 'Luego podrás afiliarte o inscribirte a eventos.' : 'La orden quedará vinculada a tu perfil.'}</span>
              </div>
              <button type="submit" className="btn"><ShieldCheck size={18} /> {content[3]}</button>
            </div>
          </form>

          <aside className="order-panel surface-card">
            <h2>{flow === 'profile' ? 'Estado del perfil' : 'Estado del trámite'}</h2>
            {visibleOrder ? (
              <div className="order-details">
                <span>{visibleOrder.athleteName}</span>
                {flow === 'profile' ? (
                  <><CheckCircle2 size={38} /><strong>Perfil creado</strong><p>Ya podés acceder a tu área de atleta.</p></>
                ) : (
                  <><strong>{money(visibleOrder.amount)}</strong><p>{visibleOrder.concept}</p><StatusPill value={visibleOrder.status} /><code>{visibleOrder.reference}</code>{visibleOrder.paymentMethod === 'mercado_pago' ? <button type="button" className="btn" onClick={() => onApprovePayment(visibleOrder.paymentId)}>Simular pago</button> : <p className="manual-note">El equipo PLU confirmará la acreditación.</p>}</>
                )}
              </div>
            ) : <p>{flow === 'profile' ? 'Completá tus datos para crear el perfil.' : 'Generá la orden para consultar su estado.'}</p>}
          </aside>
        </section>
      </div>
    </main>
  )
}
