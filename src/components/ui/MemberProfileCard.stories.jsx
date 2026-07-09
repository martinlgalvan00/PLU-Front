import MemberProfileCard from './MemberProfileCard.jsx'

export default {
  title: 'UI/MemberProfileCard',
  component: MemberProfileCard,
  tags: ['autodocs'],
  args: {
    name: 'Juan Pérez',
    documentId: '30111222',
    email: 'juan@example.com',
    gym: 'Iron Gym',
    status: 'activa',
    memberCode: 'PLU-00123',
    onAction: () => {},
  },
}

export const Default = {}

export const NoAction = {
  args: { onAction: undefined },
}
