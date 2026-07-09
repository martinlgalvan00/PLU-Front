import ExportButton from './ExportButton.jsx'

export default {
  title: 'UI/ExportButton',
  component: ExportButton,
  tags: ['autodocs'],
  args: {
    label: 'Exportar CSV',
    onClick: () => {},
  },
}

export const Default = {}

export const Gold = {
  args: { variant: 'gold' },
}

export const IconOnly = {
  args: { iconOnly: true },
}

export const Disabled = {
  args: { disabled: true },
}
