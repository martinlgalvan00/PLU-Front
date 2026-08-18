import AdminQrScanner from './AdminQrScanner.jsx'

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
    const manualButton = canvasElement.querySelector(
      '.admin-checkin-scanner__mode-switch button:last-child',
    )
    manualButton?.click()
  },
}
