import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../src/providers/ThemeProvider.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'
import RegisterPage from '../src/pages/RegisterPage.jsx'
import '../src/styles/index.css'

const params = new URLSearchParams(window.location.search)
const flow = params.get('flow') ?? 'competition'
const theme = params.get('theme') ?? 'dark'
const filled = params.get('filled') === '1'

document.documentElement.setAttribute('data-theme', theme)

const athlete = {
  id: 'ath-1',
  fullName: 'Agustin Di Santo',
  email: 'agus@example.com',
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  credentialToken: 'tok-123',
}

const event = {
  id: 'evt-1',
  slug: 'pitbull-classic-2026',
  title: 'Pitbull Classic',
  date: '2026-12-12',
  venue: 'Maximal Strength Club',
  location: 'Buenos Aires',
  requiresMembership: true,
  price: 85000,
  comboOffer: {
    active: true,
    price: 120000,
    startsAt: null,
    endsAt: null,
  },
}

const initialForm = {
  fullName: 'Agustin Di Santo',
  documentId: filled ? '30111222' : '',
  birthDate: filled ? '1995-04-12' : '',
  email: 'agus@example.com',
  phone: filled ? '1122334455' : '',
  password: '',
  country: 'Argentina',
  province: filled ? 'Buenos Aires' : '',
  city: filled ? 'CABA' : '',
  gym: filled ? 'Maximal' : '',
  sex: filled ? 'M' : '',
  division: filled ? 'OPEN' : '',
  category: filled ? 'RAW' : '',
  estimatedWeight: filled ? '93' : '',
  paymentMethod: params.get('pm') ?? 'mercado_pago',
}

function Preview() {
  const [form, setForm] = useState(initialForm)

  function updateForm(changeEvent) {
    const { name, value } = changeEvent.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  return (
    <div className="app-shell">
      <div id="main-content">
        <RegisterPage
          athlete={athlete}
          createdOrder={null}
          event={event}
          flow={flow}
          form={form}
          memberships={[]}
          registrations={[]}
          total={85000}
          onNavigate={() => {}}
          onSubmit={async () => ({})}
          onUpdateForm={updateForm}
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <MotionProvider>
          <Preview />
        </MotionProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
