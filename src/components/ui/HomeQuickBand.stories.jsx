import HomeQuickBand from './HomeQuickBand.jsx'

export default {
  title: 'UI/HomeQuickBand',
  component: HomeQuickBand,
  tags: ['autodocs'],
  args: {
    onNavigate: () => {},
  },
}

export const Default = {}

export const Dock = {
  args: { variant: 'dock' },
}
