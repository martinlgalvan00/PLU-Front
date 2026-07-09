import { Select } from './FormFields.jsx'

export default {
  title: 'UI/Select',
  component: Select,
  tags: ['autodocs'],
  args: {
    label: 'Categoría',
    name: 'category',
    options: [
      ['sub-junior', 'Sub-Junior'],
      ['open', 'Open'],
      ['master', 'Master'],
    ],
  },
}

export const Default = {}
