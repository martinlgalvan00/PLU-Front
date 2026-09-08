import { expect, fn, userEvent, within } from 'storybook/test'
import '../../styles/pages/account.css'
import ProfileIncompleteNoticeBanner from './ProfileIncompleteNoticeBanner.jsx'

const athlete = {
  id: 'storybook-athlete',
  fullName: 'Agustín Di Santo',
  profileNotices: [
    {
      id: 'notice-1',
      athleteId: 'storybook-athlete',
      kind: 'profile_incomplete',
      missingFields: ['phone', 'city', 'gym'],
      message: 'Completá teléfono, ciudad y gimnasio para poder inscribirte.',
      createdAt: '2026-09-08T12:00:00.000Z',
      readAt: null,
      dismissedAt: null,
      resolvedAt: null,
    },
  ],
}

export default {
  title: 'Pages/Account/ProfileIncompleteNoticeBanner',
  component: ProfileIncompleteNoticeBanner,
  parameters: { layout: 'padded' },
  args: {
    athlete,
    onComplete: fn(),
    onDismiss: fn(),
    onRead: fn(),
  },
  decorators: [
    (Story) => (
      <div className="page page--design account-page--design">
        <Story />
      </div>
    ),
  ],
}

export const ReceivedNotice = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Datos pendientes')).toBeTruthy()
    await expect(
      canvas.getByText(/Para inscribirte a un evento oficial faltan: Teléfono, Ciudad, Gimnasio o equipo/),
    ).toBeTruthy()
    await expect(
      canvas.getByText('Completá teléfono, ciudad y gimnasio para poder inscribirte.'),
    ).toBeTruthy()
    await userEvent.click(canvas.getByRole('button', { name: 'Completar datos' }))
    await expect(args.onComplete).toHaveBeenCalledOnce()
  },
}
