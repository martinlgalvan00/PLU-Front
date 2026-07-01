import { ShieldCheck, UserCircle } from 'lucide-react'
import Reveal from '../components/ui/Reveal.jsx'
import SectionHeading from '../components/ui/SectionHeading.jsx'

export default function LoginPage({ onLogin, onNavigate }) {
  function enter(type) {
    const session = onLogin(type)
    onNavigate(session.role === 'athlete_plu' ? 'profile' : 'admin')
  }

  return (
    <main className="page page--login">
      <div className="page__inner">
        <SectionHeading eyebrow="Acceso privado" title="Ingresar a PLU Argentina" description="Seleccioná el tipo de perfil para continuar en esta demostración." />
        <div className="access-grid">
          <Reveal className="access-card surface-card"><ShieldCheck size={34} /><h2>Admin PLU</h2><p>Atletas, afiliaciones, competencias, pagos y exportaciones.</p><button type="button" className="btn btn--block" onClick={() => enter('admin')}>Ingresar como administrador</button></Reveal>
          <Reveal className="access-card surface-card" delay={100}><UserCircle size={34} /><h2>Atleta PLU</h2><p>Perfil, carnet digital, afiliación y competencias disponibles.</p><button type="button" className="btn btn--block" onClick={() => enter('athlete')}>Ingresar como atleta</button></Reveal>
        </div>
      </div>
    </main>
  )
}
