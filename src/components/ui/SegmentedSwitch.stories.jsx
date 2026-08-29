import { useState } from 'react'
import SegmentedSwitch from './SegmentedSwitch.jsx'

const options = [
  ['all', 'Todos'],
  ['open', 'Abiertos'],
  ['closed', 'Cerrados'],
]

function Controlled(args) {
  const [active, setActive] = useState(args.active)
  return <SegmentedSwitch {...args} active={active} onChange={setActive} />
}

export default {
  title: 'UI/SegmentedSwitch',
  component: SegmentedSwitch,
  tags: ['autodocs'],
  args: {
    options,
    active: 'all',
    ariaLabel: 'Filtrar',
  },
  render: (args) => <Controlled {...args} />,
}

export const Default = {}

export const WithBadges = {
  args: {
    options: [
      ['all', 'Todos', undefined, 12],
      ['open', 'Abiertos', undefined, { value: 3, tone: 'warning' }],
      ['closed', 'Cerrados', undefined, { value: 1, tone: 'danger' }],
    ],
  },
}
