import { useState } from 'react'
import FilterPills from './FilterPills.jsx'

const options = [
  ['all', 'Todos'],
  ['open', 'Inscripción abierta', 'Abierta'],
  ['closed', 'Cerrada'],
]

function Controlled(args) {
  const [active, setActive] = useState(args.active)
  return <FilterPills {...args} active={active} onChange={setActive} />
}

export default {
  title: 'UI/FilterPills',
  component: FilterPills,
  tags: ['autodocs'],
  args: {
    options,
    active: 'all',
    ariaLabel: 'Filtrar eventos',
  },
  render: (args) => <Controlled {...args} />,
}

export const Default = {}

export const Segmented = {
  args: { segmented: true },
}
