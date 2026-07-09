import StatusPill from './StatusPill.jsx'

export default {
  title: 'UI/StatusPill',
  component: StatusPill,
  tags: ['autodocs'],
  args: { value: 'activa' },
  argTypes: {
    value: {
      control: 'select',
      options: ['activa', 'pendiente_pago', 'vencida', 'inscripcion_abierta', 'cerrado'],
    },
  },
}

export const Success = {
  args: { value: 'activa' },
}

export const Warning = {
  args: { value: 'pendiente_pago' },
}

export const Danger = {
  args: { value: 'vencida' },
}
