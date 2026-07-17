import { Select } from './FormFields.jsx'

export default {
  title: 'UI/Select',
  component: Select,
  tags: ['autodocs'],
  args: {
    label: 'Categoría',
    name: 'category',
    options: [
      ['youth', 'Youth'],
      ['open', 'Open'],
      ['master', 'Master'],
    ],
  },
}

export const Default = {}
