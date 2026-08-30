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
    },
  },
}

export const MobileProgressiveDisclosure = {
  parameters: {
    viewport: { defaultViewport: 'mobile2' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sportsSummary = canvas.getByRole('button', { name: /Perfil deportivo/ })

    await expect(sportsSummary).toBeTruthy()
    await expect(sportsSummary).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(sportsSummary)
    await expect(sportsSummary).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(canvas.getByLabelText(/Gimnasio o equipo/)).toBeVisible())
  },
}
