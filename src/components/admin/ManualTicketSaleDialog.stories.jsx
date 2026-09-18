import '../../styles/pages/admin.css'
import ManualTicketSaleDialog from './ManualTicketSaleDialog.jsx'

const EVENTS = [
  {
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic 2026',
    ticketTypes: [
      { id: 'tt-general', name: 'General', active: true },
      { id: 'tt-vip', name: 'VIP', active: true },
      { id: 'tt-descontinuada', name: 'Preventa (cerrada)', active: false },
    ],
  },
  {
    slug: 'plu-open-2026',
    title: 'PLU Open 2026',
    ticketTypes: [{ id: 'tt-open-general', name: 'General', active: true }],
  },
]

export default {
  title: 'Admin/ManualTicketSaleDialog',
  component: ManualTicketSaleDialog,
  parameters: { layout: 'fullscreen' },
}

export const AltaEnBlanco = {
  args: {
    events: EVENTS,
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const Enviando = {
  args: {
    events: EVENTS,
    busy: true,
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const ErrorDelServidor = {
  args: {
    events: EVENTS,
    error: 'Entradas agotadas para General.',
    onCancel: () => {},
    onConfirm: () => {},
  },
}

export const SinEventosConEntradas = {
  args: {
    events: [],
    onCancel: () => {},
    onConfirm: () => {},
  },
}
