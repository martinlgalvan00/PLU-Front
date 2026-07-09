import { Inbox } from 'lucide-react'
import EmptyState from './EmptyState.jsx'

export default {
  title: 'UI/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  args: {
    icon: Inbox,
    title: 'Sin resultados',
    description: 'No encontramos elementos que coincidan con tu búsqueda.',
  },
}

export const Default = {}

export const WithAction = {
  args: { actionLabel: 'Reintentar', onAction: () => {} },
}
