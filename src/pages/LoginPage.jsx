import Reveal from '../components/ui/Reveal.jsx'
import { ROLES } from '../lib/constants.js'
import SectionHeading from '../components/ui/SectionHeading.jsx'

export default function LoginPage({ onNavigate, role, setRole }) {
  return (
    <main className="page page--login">
      <Reveal className="login-card surface-card">
        <SectionHeading
          eyebrow="Acceso privado"
          title="Panel PLU ARG"
          description="Herramienta operativa para administración, inscripciones, pagos y exportaciones."
        />
        <label className="field">
          Perfil de acceso
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLES).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--block" onClick={() => onNavigate('admin')}>
          Ingresar al panel
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => onNavigate('home')}>
          Volver al inicio
        </button>
      </Reveal>
    </main>
  )
}
