import SeasonComboOffer from './SeasonComboOffer.jsx'

const deal = {
  membershipPrice: 75000,
  registrationPrice: 75000,
  comboPrice: 120000,
  endsAt: '2026-08-28T23:59:59-03:00',
}

export default {
  title: 'UI/SeasonComboOffer',
  component: SeasonComboOffer,
  tags: ['autodocs'],
  args: {
    ...deal,
    onCta: () => {},
    onSecondaryCta: () => {},
    secondaryCtaLabel: 'Solo afiliación',
  },
}

export const Band = {
  args: { variant: 'band' },
}

export const Inline = {
  args: { variant: 'inline' },
}

export const Compact = {
  args: { variant: 'compact' },
}

export const CheckoutLocked = {
  args: {
    variant: 'band',
    ctaDisabled: true,
    ctaLabel: 'Próximamente',
    secondaryCtaDisabled: true,
  },
}
