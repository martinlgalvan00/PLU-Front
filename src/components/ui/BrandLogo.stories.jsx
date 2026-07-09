import BrandLogo from './BrandLogo.jsx'

export default {
  title: 'UI/BrandLogo',
  component: BrandLogo,
  tags: ['autodocs'],
  args: {
    variant: 'letterhead',
    height: 32,
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['letterhead', 'argentina'],
    },
  },
}

export const Letterhead = {
  args: { variant: 'letterhead' },
}

export const Argentina = {
  args: { variant: 'argentina' },
}

export const WithText = {
  args: { showText: true },
}
