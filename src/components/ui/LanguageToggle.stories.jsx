import LanguageToggle from './LanguageToggle.jsx'

export default {
  title: 'UI/LanguageToggle',
  component: LanguageToggle,
  tags: ['autodocs'],
}

export const Default = {}

export const Compact = {
  args: { compact: true },
}

export const Segment = {
  args: { compact: true, variant: 'segment' },
}

export const Glyph = {
  args: { compact: true, variant: 'glyph' },
}
