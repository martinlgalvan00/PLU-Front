import DigitalCredential from './DigitalCredential.jsx'

const athlete = {
  fullName: 'Juan Pérez',
  documentId: '30111222',
  birthDate: '1994-05-12',
  gym: 'Iron Gym',
  city: 'CABA',
  province: 'Buenos Aires',
  sex: 'M',
}

const membership = {
  status: 'activa',
  memberCode: 'PLU-00123',
  expirationDate: '2027-01-01',
}

export default {
  title: 'UI/DigitalCredential',
  component: DigitalCredential,
  tags: ['autodocs'],
  args: { athlete, membership },
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(100vw - 32px, 400px)' }}>
        <Story />
      </div>
    ),
  ],
}

export const Active = {}

export const Inactive = {
  args: {
    membership: { status: 'inactiva', memberCode: null, expirationDate: null },
  },
}

export const LongName = {
  args: {
    athlete: {
      ...athlete,
      fullName: 'María Fernanda Rodríguez de la Fuente',
      gym: 'Centro de Alto Rendimiento Powerlifting United Quilmes',
      city: 'San Miguel de Tucumán',
      province: 'Tucumán',
    },
  },
}
