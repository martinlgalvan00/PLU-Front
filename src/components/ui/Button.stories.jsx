import Button from './Button.jsx'

export default {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  args: {
    children: 'Button',
    variant: 'primary',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'ghost', 'outline'],
    },
  },
}

export const Primary = {
  args: { variant: 'primary' },
}

export const Secondary = {
  args: { variant: 'secondary' },
}
