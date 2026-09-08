import { expect, userEvent, waitFor, within } from 'storybook/test'
import AdminQrScanner from './AdminQrScanner.jsx'
import '../../styles/pages/admin.css'
import '../../styles/pages/checkin-app.css'

export default {
  title: 'Admin/AdminQrScanner',
  component: AdminQrScanner,
  tags: ['autodocs'],
  args: {
    onScan: (value) => console.log('scan:', value),
  },
}

export const Default = {}

export const Busy = {
  args: { busy: true },
}

export const Manual = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: /manual|código/i }))
    await waitFor(() => expect(canvas.getByLabelText(/código o url/i)).toBeVisible())
  },
}

export const Compact = {
  args: { compact: true },
}

export const CompactManual = {
  args: { compact: true },
  decorators: [
    (Story) => (
      <div className="checkin-app">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: /manual|código/i }))
    const input = await waitFor(() => canvas.getByLabelText(/código o url/i))
    expect(input).toHaveFocus()
    expect(Number.parseFloat(getComputedStyle(input).fontSize)).toBeGreaterThanOrEqual(16)
    expect(Number.parseFloat(getComputedStyle(input).minHeight)).toBeGreaterThanOrEqual(48)
  },
}
