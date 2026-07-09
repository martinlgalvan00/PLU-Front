import { Field } from './FormFields.jsx'

export default {
  title: 'UI/Field',
  component: Field,
  tags: ['autodocs'],
}

export const TextField = {
  render: () => <Field name="email" label="Email" type="email" placeholder="nombre@pluarg.com.ar" />,
}

export const FieldWithError = {
  render: () => (
    <Field name="email" label="Email" type="email" defaultValue="invalido" error="Ingresá un email válido" />
  ),
}
