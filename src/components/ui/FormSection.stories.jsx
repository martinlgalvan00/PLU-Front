import FormSection from './FormSection.jsx'
import { Field } from './FormFields.jsx'

export default {
  title: 'UI/FormSection',
  component: FormSection,
  tags: ['autodocs'],
  args: {
    step: '01',
    title: 'Datos personales',
    description: 'Completá tus datos para continuar con la inscripción.',
  },
  render: (args) => (
    <FormSection {...args}>
      <Field name="fullName" label="Nombre completo" placeholder="Juan Pérez" />
    </FormSection>
  ),
}

export const Default = {}
