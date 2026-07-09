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
}

export const Active = {}

export const Inactive = {
  args: { membership: { ...membership, status: 'inactiva', expirationDate: null } },
}
