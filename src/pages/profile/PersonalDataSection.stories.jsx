import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import '../../styles/pages/account.css'
import PersonalDataSection from './PersonalDataSection.jsx'

const athlete = {
  id: 'storybook-athlete',
  fullName: 'Agustín Di Santo',
  documentId: '44545980',
  birthDate: '2002-11-03',
  country: 'Argentina',
  email: 'agus@example.com',
  phone: '1155551234',
  city: 'Banfield',
  province: 'Buenos Aires',
  gym: 'Maximal Strength Club',
  sex: 'Masculino',
  division: 'Open',
  category: 'Raw',
  estimatedWeight: 90,
  instagramHandle: 'agus.power',
  bestTotalKg: 625.5,
  emergencyContactName: '',
  emergencyContactPhone: '',
}

export default {
  title: 'Pages/Account/PersonalDataSection',
  component: PersonalDataSection,
  parameters: { layout: 'fullscreen' },
  args: {
    athlete,
    onUpdateProfile: fn(async () => ({})),
    onUpdatePhoto: fn(async () => ({})),
    onRemovePhoto: fn(async () => ({})),
  },
  decorators: [
    (Story) => (
      <div className="page page--design account-page--design">
        <div className="account-sections">
          <div className="account-tab-panel">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
}

export const Default = {}

export const LongDocumentId = {
  args: {
    athlete: {
      ...athlete,
      documentId: 'STAFF-660583de-002b-4408-aa10-94fc4f521f0b',
    },
  },
}

export const MissingOfficial = {
  args: {
    athlete: {
      ...athlete,
      country: '',
      birthDate: '',
      phone: '',
      city: '',
      province: '',
      gym: '',
      sex: '',
      division: '',
      category: '',
      estimatedWeight: '',
    },
  },
}

export const MobileProgressiveDisclosure = {
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Open · Raw · 90 kg/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    const sportsSummary = canvas.getByRole('button', { name: /Equipo/ })

    await expect(sportsSummary).toBeTruthy()
    await expect(sportsSummary).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(sportsSummary)
    await expect(sportsSummary).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(canvas.getByLabelText(/Gimnasio o equipo/)).toBeVisible())
  },
}

export const ExclusiveAccordion = {
  args: {
    athlete: {
      ...athlete,
      phone: '',
      city: '',
      province: '',
      gym: '',
      division: '',
      category: '',
      estimatedWeight: '',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const contact = canvas.getByRole('button', { name: /Contacto Email, teléfono y ubicación/ })
    const competition = canvas.getByRole('button', { name: /^Competencia/ })
    const sports = canvas.getByRole('button', { name: /^Equipo/ })

    await expect(contact).toHaveAttribute('aria-expanded', 'true')
    await expect(competition).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(competition)
    await expect(competition).toHaveAttribute('aria-expanded', 'true')
    await expect(contact).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(canvas.getByRole('button', { name: 'Gimnasio o equipo' }))
    await expect(sports).toHaveAttribute('aria-expanded', 'true')
    await expect(competition).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(canvas.getByLabelText(/Gimnasio o equipo/)).toBeVisible())
  },
}
