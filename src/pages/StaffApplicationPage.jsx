import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Upload } from 'lucide-react'
import '../styles/pages/institutional-pages.css'
import '../styles/pages/institutional-editorial.css'
import '../styles/pages/staff-application.css'
import StaffApplicationRail from '../components/ui/StaffApplicationRail.jsx'
import InstitutionalPageHero from '../components/layout/InstitutionalPageHero.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import { Field, Select } from '../components/ui/FormFields.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  getStaffProgress,
  SHIRT_SIZES,
  validateStaffApplication,
} from '../lib/staffApplicationValidation.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { useStepBand } from '../motion/useStepBand.ts'
import {
  submitStaffApplication,
  uploadStaffApplicationFile,
  validateStaffApplicationFile,
} from '../services/staffApplicationService.js'

const DRAFT_KEY = 'plu-staff-application-draft'

function emptyForm() {
  return {
    firstName: '',
    lastName: '',
    documentId: '',
    birthDate: '',
    streetAddress: '',
    city: '',
    province: '',
    postalCode: '',
    email: '',
    phone: '',
    staffBody: '',
    technicalTrainingStatus: '',
    shirtSize: '',
    backgroundCheckIssuedAt: '',
  }
}

function readDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    return raw ? { ...emptyForm(), ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // Almacenamiento no disponible (privado/bloqueado): no hay nada que limpiar.
  }
}

/** Primer palabra = nombre; el resto = apellido. Mejor esfuerzo, editable. */
function splitFullName(fullName) {
  const parts = String(fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function FileUploadField({ busy, done, error, hint, label, onFile }) {
  const inputId = `staff-app-file-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <label className="staff-application__file" htmlFor={inputId}>
      <span className="field__label">{label}</span>
      <span className={`staff-application__file-drop${busy ? ' is-busy' : ''}`}>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onFile(file)
          }}
        />
        {done ? (
          <Check size={16} aria-hidden />
        ) : busy ? (
          <span className="plu-spinner" aria-hidden />
        ) : (
          <Upload size={16} aria-hidden />
        )}
        <span>{done ? 'Archivo cargado' : busy ? 'Subiendo…' : 'Elegir archivo'}</span>
      </span>
      <small>{hint}</small>
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  )
}

/**
 * StaffApplicationPage — PLU ARG
 *
 * Siempre visible, logeado o no (pedido explícito): quien no tiene cuenta
 * puede leer y completar el formulario igual, pero el botón de enviar queda
 * reemplazado por un aviso de login/registro hasta que exista una sesión de
 * atleta. El borrador se guarda en localStorage mientras tanto para no
 * perder lo tipeado al ir a loguearse y volver.
 */
export default function StaffApplicationPage({ athletes = [], onNavigate, session }) {
  const { t } = useI18n()
  const isAthleteLoggedIn = session?.role === 'athlete_plu'
  const athlete = isAthleteLoggedIn
    ? (athletes.find((item) => item.id === session.athleteId) ?? null)
    : null

  const [form, setForm] = useState(() => readDraft() ?? emptyForm())
  const [photo, setPhoto] = useState({ status: 'idle', path: null, error: '' })
  const [certificate, setCertificate] = useState({ status: 'idle', path: null, error: '' })
  const [accuracyDeclared, setAccuracyDeclared] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | submitting | sent | error
  const [submitError, setSubmitError] = useState('')
  const prefilledRef = useRef(false)
  const { reducedMotion, tier } = useMotionConfig()
  const sections = getStaffProgress(
    validateStaffApplication({
      form,
      photoDone: photo.status === 'done',
      certificateDone: certificate.status === 'done',
      accuracyDeclared,
      consentGiven,
    }),
    form,
  )
  const ready = sections.every((section) => section.complete)
  const { activeIndex, bind } = useStepBand(sections.length, {
    enabled: !(reducedMotion || tier === 'low'),
    rootMargin: '-30% 0px -50% 0px',
  })

  // Precarga desde el perfil solo una vez, y solo los campos que el
  // borrador todavía no tenía completos — no pisa lo que la persona ya
  // tipeó antes de loguearse.
  useEffect(() => {
    if (!athlete || prefilledRef.current) return
    prefilledRef.current = true
    const { firstName, lastName } = splitFullName(athlete.fullName)
    setForm((current) => ({
      ...current,
      firstName: current.firstName || firstName,
      lastName: current.lastName || lastName,
      documentId: current.documentId || athlete.documentId || '',
      birthDate: current.birthDate || athlete.birthDate || '',
      city: current.city || athlete.city || '',
      province: current.province || athlete.province || '',
      email: current.email || athlete.email || '',
      phone: current.phone || athlete.phone || '',
    }))
  }, [athlete])

  useEffect(() => {
    if (status === 'sent') return
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form))
    } catch {
      // Sin storage disponible, el formulario sigue andando sin borrador.
    }
  }, [form, status])

  function changeField(event) {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'staffBody' && value !== 'tecnico' ? { technicalTrainingStatus: '' } : {}),
    }))
  }

  async function handleFile(purpose, file) {
    const setter = purpose === 'photo' ? setPhoto : setCertificate
    const validation = validateStaffApplicationFile(file)
    if (validation.error) {
      setter({ status: 'error', path: null, error: validation.error })
      return
    }
    setter({ status: 'uploading', path: null, error: '' })
    try {
      const { storagePath } = await uploadStaffApplicationFile(purpose, file)
      setter({ status: 'done', path: storagePath, error: '' })
    } catch (error) {
      setter({
        status: 'error',
        path: null,
        error: error?.message ?? 'No se pudo subir el archivo.',
      })
    }
  }

  const validationInput = {
    form,
    photoDone: photo.status === 'done',
    certificateDone: certificate.status === 'done',
    accuracyDeclared,
    consentGiven,
  }

  function validate() {
    return validateStaffApplication(validationInput)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!athlete || status === 'submitting') return
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setStatus('submitting')
    setSubmitError('')
    try {
      await submitStaffApplication({
        ...form,
        technicalTrainingStatus:
          form.staffBody === 'tecnico' ? form.technicalTrainingStatus : undefined,
        photoPath: photo.path,
        backgroundCheckPath: certificate.path,
        dataAccuracyDeclared: true,
        dataProcessingConsent: true,
      })
      clearDraft()
      setStatus('sent')
    } catch (error) {
      setSubmitError(error?.message ?? 'No se pudo enviar la postulación.')
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <main className="page institutional-page staff-application-page">
        <InstitutionalPageHero
          breadcrumb={t('nav.staffApplication')}
          description="Gracias por postularte. El equipo de PLU va a revisar tu postulación y te va a contactar."
          eyebrow="Postulación enviada"
          index="STAFF / 01"
          onHome={() => onNavigate?.('home')}
          title="Recibimos tu postulación"
        />
        <div className="staff-application-page__inner">
          <Reveal variant="fade">
            <div className="contact-success" role="status" aria-live="polite">
              <div className="contact-success__icon" aria-hidden>
                <Check size={18} strokeWidth={2.5} />
              </div>
              <h2>Tu postulación quedó registrada</h2>
              <p>El Cuerpo de Staff de PLU la va a revisar y te va a contactar a la brevedad.</p>
            </div>
          </Reveal>
        </div>
      </main>
    )
  }

  const submitting = status === 'submitting'

  return (
    <main className="page institutional-page staff-application-page">
      <InstitutionalPageHero
        breadcrumb={t('nav.staffApplication')}
        description="Completá tus datos para postularte al Cuerpo de Staff Operativo o Técnico de PLU. Necesitás tener una cuenta de atleta para poder enviarlo."
        eyebrow="Voluntariado"
        index="STAFF / 01"
        onHome={() => onNavigate?.('home')}
        title="Sumate al Cuerpo de Staff"
      />

      <div className="staff-application-page__inner">
        <div className="staff-application-layout">
          <StaffApplicationRail
            activeId={sections[activeIndex]?.id}
            form={form}
            ready={ready}
            sections={sections}
          />
          <Reveal variant="fade">
            <form className="staff-application-form" onSubmit={handleSubmit} noValidate>
              <section
                className="staff-application-form__section"
                id="staff-datos"
                ref={bind(0)}
                data-state={sections[0].complete ? 'done' : undefined}
              >
                <h2>
                  <span className="staff-application-form__index" aria-hidden>
                    {sections[0].complete ? <Check size={12} strokeWidth={3} /> : '01'}
                  </span>
                  Datos personales
                </h2>
                <div className="staff-application-form__grid">
                  <Field
                    error={errors.firstName}
                    label="Nombre"
                    name="firstName"
                    value={form.firstName}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.lastName}
                    label="Apellido"
                    name="lastName"
                    value={form.lastName}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.documentId}
                    label="DNI"
                    name="documentId"
                    value={form.documentId}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.birthDate}
                    label="Fecha de nacimiento"
                    name="birthDate"
                    type="date"
                    value={form.birthDate}
                    onChange={changeField}
                  />
                  <Field
                    className="staff-application-form__wide"
                    error={errors.streetAddress}
                    label="Dirección personal"
                    name="streetAddress"
                    value={form.streetAddress}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.city}
                    label="Ciudad / localidad"
                    name="city"
                    value={form.city}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.province}
                    label="Provincia"
                    name="province"
                    value={form.province}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.postalCode}
                    label="Código postal"
                    name="postalCode"
                    value={form.postalCode}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.email}
                    label="Email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={changeField}
                  />
                  <Field
                    error={errors.phone}
                    label="Teléfono / WhatsApp"
                    name="phone"
                    value={form.phone}
                    onChange={changeField}
                  />
                </div>
              </section>

              <section
                className="staff-application-form__section"
                id="staff-cuerpo"
                ref={bind(1)}
                data-state={sections[1].complete ? 'done' : undefined}
              >
                <h2>
                  <span className="staff-application-form__index" aria-hidden>
                    {sections[1].complete ? <Check size={12} strokeWidth={3} /> : '02'}
                  </span>
                  Cuerpo de Staff
                </h2>
                <div className="staff-application-form__grid">
                  <Select
                    error={errors.staffBody}
                    label="¿De qué Cuerpo de Staff querés formar parte?"
                    name="staffBody"
                    options={[
                      ['', 'Seleccioná una opción'],
                      ['operativo', 'Operativo'],
                      ['tecnico', 'Técnico'],
                    ]}
                    value={form.staffBody}
                    onChange={changeField}
                  />
                  {form.staffBody === 'tecnico' ? (
                    <Select
                      error={errors.technicalTrainingStatus}
                      label="Estado de capacitación técnica (PDCA)"
                      name="technicalTrainingStatus"
                      options={[
                        ['', 'Seleccioná una opción'],
                        ['aprobada', 'Aprobada'],
                        ['en_curso', 'En curso'],
                        ['no_realizada', 'No realizada'],
                      ]}
                      value={form.technicalTrainingStatus}
                      onChange={changeField}
                    />
                  ) : null}
                  <Select
                    error={errors.shirtSize}
                    label="Talle de chomba oficial"
                    name="shirtSize"
                    options={[
                      ['', 'Seleccioná un talle'],
                      ...SHIRT_SIZES.map((size) => [size, size]),
                    ]}
                    value={form.shirtSize}
                    onChange={changeField}
                  />
                </div>
              </section>

              <section
                className="staff-application-form__section"
                id="staff-documentacion"
                ref={bind(2)}
                data-state={sections[2].complete ? 'done' : undefined}
              >
                <h2>
                  <span className="staff-application-form__index" aria-hidden>
                    {sections[2].complete ? <Check size={12} strokeWidth={3} /> : '03'}
                  </span>
                  Documentación
                </h2>
                <div className="staff-application-form__grid">
                  <FileUploadField
                    busy={photo.status === 'uploading'}
                    done={photo.status === 'done'}
                    error={errors.photo || photo.error}
                    hint="JPG, PNG, WEBP o PDF, hasta 5 MB."
                    label="Foto de perfil"
                    onFile={(file) => handleFile('photo', file)}
                  />
                  <FileUploadField
                    busy={certificate.status === 'uploading'}
                    done={certificate.status === 'done'}
                    error={errors.certificate || certificate.error}
                    hint="JPG, PNG, WEBP o PDF, hasta 5 MB."
                    label="Certificado de antecedentes penales"
                    onFile={(file) => handleFile('certificate', file)}
                  />
                  <Field
                    error={errors.backgroundCheckIssuedAt}
                    label="Fecha de emisión del certificado"
                    name="backgroundCheckIssuedAt"
                    type="date"
                    value={form.backgroundCheckIssuedAt}
                    onChange={changeField}
                  />
                </div>
              </section>

              <section
                className="staff-application-form__section"
                id="staff-declaraciones"
                ref={bind(3)}
                data-state={sections[3].complete ? 'done' : undefined}
              >
                <h2>
                  <span className="staff-application-form__index" aria-hidden>
                    {sections[3].complete ? <Check size={12} strokeWidth={3} /> : '04'}
                  </span>
                  Declaraciones
                </h2>
                <label className="staff-application-form__checkbox">
                  <input
                    checked={accuracyDeclared}
                    type="checkbox"
                    onChange={(event) => setAccuracyDeclared(event.target.checked)}
                  />
                  <span>Declaro que los datos consignados en este formulario son veraces.</span>
                </label>
                {errors.accuracyDeclared ? (
                  <span className="field__error" role="alert">
                    {errors.accuracyDeclared}
                  </span>
                ) : null}
                <label className="staff-application-form__checkbox">
                  <input
                    checked={consentGiven}
                    type="checkbox"
                    onChange={(event) => setConsentGiven(event.target.checked)}
                  />
                  <span>
                    Doy mi consentimiento para el tratamiento administrativo de mis datos personales
                    por parte de PLU.
                  </span>
                </label>
                {errors.consentGiven ? (
                  <span className="field__error" role="alert">
                    {errors.consentGiven}
                  </span>
                ) : null}
              </section>

              {athlete ? (
                <div className="staff-application-form__actions">
                  <button
                    type="submit"
                    className="staff-application-form__submit"
                    disabled={submitting}
                  >
                    <span>{submitting ? 'Enviando…' : 'Enviar postulación'}</span>
                    {submitting ? (
                      <span className="plu-spinner" aria-hidden />
                    ) : (
                      <ArrowRight size={15} strokeWidth={1.25} aria-hidden />
                    )}
                  </button>
                  {submitError ? (
                    <p className="staff-application-form__error" role="alert">
                      {submitError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="staff-application-form__login-gate" role="note">
                  <p>
                    Para enviar tu postulación necesitás tener una cuenta de atleta en PLU. Tu
                    progreso queda guardado en este dispositivo.
                  </p>
                  <div className="staff-application-form__login-gate-actions">
                    <button type="button" onClick={() => onNavigate?.('login')}>
                      Iniciar sesión
                    </button>
                    <button type="button" onClick={() => onNavigate?.('register')}>
                      Crear cuenta
                    </button>
                  </div>
                </div>
              )}
            </form>
          </Reveal>
        </div>
      </div>
    </main>
  )
}
