import LoginButton from './LoginButton.jsx'

export default {
  title: 'UI/LoginButton',
  component: LoginButton,
  tags: ['autodocs'],
  args: { onClick: () => {} },
}

export const Default = {}

export const Compact = {
  args: { compact: true },
}
