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
