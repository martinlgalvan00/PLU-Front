import { ShieldCheck } from 'lucide-react'
import { FORM_OPTIONS } from '../lib/constants.js'
import { money } from '../lib/format.js'
import FormSection from '../components/ui/FormSection.jsx'
import { Field, Select } from '../components/ui/FormFields.jsx'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'

export default function RegisterPage({
  createdOrder,
  form,
  onApprovePayment,
  onNavigate,
  onSubmit,
  onUpdateForm,
  total,
}) {
  return (
    <main className="page register-page">
      <div className="page__inner">
        <Reveal>
          <SectionHeading
            align="left"
            eyebrow="Inscripción"
            title="Registro de atleta"
            description="Afiliación anual, inscripción a Pitbull Classic o ambos en un solo trámite."
          />
        </Reveal>

        <section className="form-section">
          <form className="athlete-form" onSubmit={onSubmit}>
            <FormSection step="01" title="Datos personales" description="Información básica del atleta.">
              <div className="form-grid">
                <Field label="Nombre y apellido" name="fullName" value={form.fullName} onChange={onUpdateForm} required />
                <Field label="DNI o documento" name="documentId" value={form.documentId} onChange={onUpdateForm} required />
                <Field label="Fecha de nacimiento" name="birthDate" type="date" value={form.birthDate} onChange={onUpdateForm} required />
                <Field label="Email" name="email" type="email" value={form.email} onChange={onUpdateForm} required />
                <Field label="Teléfono" name="phone" value={form.phone} onChange={onUpdateForm} required />
              </div>
            </FormSection>

            <FormSection step="02" title="Ubicación y club" description="Dónde entrenás y competís.">
              <div className="form-grid">
                <Field label="País" name="country" value={form.country} onChange={onUpdateForm} required />
                <Field label="Provincia" name="province" value={form.province} onChange={onUpdateForm} required />
                <Field label="Ciudad" name="city" value={form.city} onChange={onUpdateForm} required />
                <Field label="Gimnasio/equipo" name="gym" value={form.gym} onChange={onUpdateForm} required />
              </div>
            </FormSection>

            <FormSection step="03" title="Competencia" description="Categoría y división para el meet.">
              <div className="form-grid">
                <Select label="Sexo competitivo" name="sex" value={form.sex} onChange={onUpdateForm} options={FORM_OPTIONS.sex} />
                <Select label="División" name="division" value={form.division} onChange={onUpdateForm} options={FORM_OPTIONS.division} />
                <Select label="Categoría" name="category" value={form.category} onChange={onUpdateForm} options={FORM_OPTIONS.category} />
                <Field label="Peso corporal estimado" name="estimatedWeight" value={form.estimatedWeight} onChange={onUpdateForm} required />
              </div>
            </FormSection>

            <FormSection step="04" title="Trámite y pago" description="Elegí qué querés abonar y cómo pagarlo.">
              <div className="form-grid">
                <Select label="Tipo de trámite" name="procedureType" value={form.procedureType} onChange={onUpdateForm} options={FORM_OPTIONS.procedureType} />
                <Select label="Método de pago" name="paymentMethod" value={form.paymentMethod} onChange={onUpdateForm} options={FORM_OPTIONS.paymentMethod} />
              </div>
            </FormSection>

            <div className="form-actions">
              <div>
                <strong>Total estimado: {money(total)}</strong>
                <span>
                  {form.paymentMethod === 'mercado_pago'
                    ? 'Se abre el checkout de Mercado Pago'
                    : 'Validación manual por el equipo PLU ARG'}
                </span>
              </div>
              <button type="submit" className="btn">
                <ShieldCheck size={18} /> Generar orden
              </button>
            </div>
          </form>

          <aside className="order-panel surface-card">
            <h2>Estado del registro</h2>
            {createdOrder ? (
              <div className="order-details">
                <span>{createdOrder.athleteName}</span>
                <strong>{money(createdOrder.amount)}</strong>
                <p>{createdOrder.concept}</p>
                <StatusPill value={createdOrder.status} />
                <code>{createdOrder.reference}</code>
                {createdOrder.paymentMethod === 'mercado_pago' ? (
                  <button type="button" className="btn" onClick={() => onApprovePayment(createdOrder.paymentId)}>
                    Marcar como pagado
                  </button>
                ) : (
                  <p className="manual-note">
                    El atleta usa el link y el admin valida el pago desde el panel.
                  </p>
                )}
                <button type="button" className="btn btn--secondary" onClick={() => onNavigate('admin')}>
                  Ver en panel
                </button>
              </div>
            ) : (
              <p>Al enviar el formulario se crea una orden y queda visible para administración.</p>
            )}
          </aside>
        </section>
      </div>
    </main>
  )
}
