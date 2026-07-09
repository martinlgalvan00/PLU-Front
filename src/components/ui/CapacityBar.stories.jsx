import CapacityBar from './CapacityBar.jsx'

export default {
  title: 'UI/CapacityBar',
  component: CapacityBar,
  tags: ['autodocs'],
  args: {
    current: 42,
    total: 60,
    label: 'Cupos ocupados',
  },
}

export const Default = {}

export const Compact = {
  args: { compact: true },
}

export const Full = {
  args: { current: 60, total: 60 },
}
