// Synthetic entry aggregating every storied PLU ARG component for design-sync.
// This repo is an application, not a published component library, so there is
// no dist/ to point the converter at — this file IS the export surface.
export { default as AboutSection } from '../src/components/ui/AboutSection.jsx'
export { default as AuditTimeline } from '../src/components/ui/AuditTimeline.jsx'
export { default as BrandLogo } from '../src/components/ui/BrandLogo.jsx'
export { default as Button } from '../src/components/ui/Button.jsx'
export { default as CTASection } from '../src/components/ui/CTASection.jsx'
export { default as CapacityBar } from '../src/components/ui/CapacityBar.jsx'
export { default as CardPreviewModal } from '../src/components/ui/CardPreviewModal.jsx'
export { BenefitCard, PricingCard, InfoCard } from '../src/components/ui/Cards.jsx'
export { default as CommunitySpotlight } from '../src/components/ui/CommunitySpotlight.jsx'
export { default as ContactForm } from '../src/components/ui/ContactForm.jsx'
export { default as DataTable } from '../src/components/ui/DataTable.jsx'
export { default as DigitalCredential } from '../src/components/ui/DigitalCredential.jsx'
export { default as EmptyState } from '../src/components/ui/EmptyState.jsx'
export { default as ErrorState } from '../src/components/ui/ErrorState.jsx'
export { default as EventCalendar } from '../src/components/ui/EventCalendar.jsx'
export { default as EventCard } from '../src/components/ui/EventCard.jsx'
export { default as EventLiveStream } from '../src/components/ui/EventLiveStream.jsx'
export { default as EventShareCard } from '../src/components/ui/EventShareCard.jsx'
export { default as ExportButton } from '../src/components/ui/ExportButton.jsx'
export { default as FAQAccordion } from '../src/components/ui/FAQAccordion.jsx'
export { default as FilterPills } from '../src/components/ui/FilterPills.jsx'
export { Field, Select } from '../src/components/ui/FormFields.jsx'
export { default as FormSection } from '../src/components/ui/FormSection.jsx'
export { default as HeroStatusCard } from '../src/components/ui/HeroStatusCard.jsx'
export { default as HomeMembershipBand } from '../src/components/ui/HomeMembershipBand.jsx'
export { default as HomeQuickBand } from '../src/components/ui/HomeQuickBand.jsx'
export { default as HomeResultsTeaser } from '../src/components/ui/HomeResultsTeaser.jsx'
export { default as HomeRulebookTeaser } from '../src/components/ui/HomeRulebookTeaser.jsx'
export { default as LanguageToggle } from '../src/components/ui/LanguageToggle.jsx'
export { default as LoadingState } from '../src/components/ui/LoadingState.jsx'
export { FlagAr, FlagUs } from '../src/components/ui/LocaleFlag.jsx'
export { default as LoginButton } from '../src/components/ui/LoginButton.jsx'
export { default as MemberProfileCard } from '../src/components/ui/MemberProfileCard.jsx'
export { default as MembersHeroRail } from '../src/components/ui/MembersHeroRail.jsx'
export { default as MembershipCard } from '../src/components/ui/MembershipCard.jsx'
export { default as PaymentStatusCard } from '../src/components/ui/PaymentStatusCard.jsx'
export { default as PitbullFeatureVisual } from '../src/components/ui/PitbullFeatureVisual.jsx'
export { default as PitbullSpotlight } from '../src/components/ui/PitbullSpotlight.jsx'
export { default as PlatformMap } from '../src/components/ui/PlatformMap.jsx'
export { default as Podium } from '../src/components/ui/Podium.jsx'
export { default as ResultCard } from '../src/components/ui/ResultCard.jsx'
export { default as ResultsArchiveList } from '../src/components/ui/ResultsArchiveList.jsx'
export { default as ResultsArchiveToolbar } from '../src/components/ui/ResultsArchiveToolbar.jsx'
export { default as ResultsEventPanel } from '../src/components/ui/ResultsEventPanel.jsx'
export { default as ResultsSortMenu } from '../src/components/ui/ResultsSortMenu.jsx'
export { default as Reveal } from '../src/components/ui/Reveal.jsx'
export { default as SectionHeading } from '../src/components/ui/SectionHeading.jsx'
export { default as SegmentedSwitch } from '../src/components/ui/SegmentedSwitch.jsx'
export { default as SpotlightCard } from '../src/components/ui/SpotlightCard.jsx'
export { default as StaggerReveal } from '../src/components/ui/StaggerReveal.jsx'
export { default as StatBlock } from '../src/components/ui/StatBlock.jsx'
export { default as StatusPill } from '../src/components/ui/StatusPill.jsx'
export { default as SubNav } from '../src/components/ui/SubNav.jsx'
export { default as ThemeToggle } from '../src/components/ui/ThemeToggle.jsx'
export { default as TicketPurchaseSection } from '../src/components/ui/TicketPurchaseSection.jsx'
export { default as TrustStrip } from '../src/components/ui/TrustStrip.jsx'

export { default as AdminShell } from '../src/components/layout/AdminShell.jsx'
export { default as AdminTopBar } from '../src/components/layout/AdminTopBar.jsx'
export { default as DesignPageHero } from '../src/components/layout/DesignPageHero.jsx'
export { default as Footer } from '../src/components/layout/Footer.jsx'
export { default as HeroSection } from '../src/components/layout/HeroSection.jsx'
export { default as NavbarPublic } from '../src/components/layout/NavbarPublic.jsx'
export { default as PageFrame } from '../src/components/layout/PageFrame.jsx'
export { default as PageTransition } from '../src/components/layout/PageTransition.jsx'

// Context providers every preview needs wrapping — referenced by cfg.provider.
// ThemeProvider resolves 'system' on first mount (getStoredTheme() ??
// getSystemTheme()) — in a headless capture with no stored preference this
// lands on whatever prefers-color-scheme the browser defaults to, which is
// an accident of the capture environment, not a real user choice. PLU ARG's
// flagship/showcase theme is dark (every marketing surface — hero, spotlight,
// membership — is designed dark-first), so previews seed that preference
// before ThemeProvider reads it, the same way a returning user with a saved
// preference would skip system-resolution entirely.
import React from 'react'
import { ThemeProvider as RealThemeProvider } from '../src/providers/ThemeProvider.jsx'

// Every real usage of these components sits inside the app's page canvas,
// which supplies a dark background + light text color that many components
// depend on for contrast (headings/labels in var(--color-text-primary), a
// near-white, are invisible without it). design-sync's own preview-card
// chrome is a neutral white box, so without this wrapper those components
// render with invisible text there — not a framing difference, a real
// contrast bug specific to the isolated-card context. Mirrors the canvas
// .storybook/preview.jsx's own decorator provides for the local Storybook.
function PageCanvas({ children }) {
  return React.createElement(
    'div',
    { style: { background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', padding: '1.5rem', minHeight: '100%' } },
    children,
  )
}

export function ThemeProvider({ children }) {
  if (typeof window !== 'undefined') {
    try {
      if (!window.localStorage.getItem('plu-arg-theme')) {
        window.localStorage.setItem('plu-arg-theme', 'dark')
      }
    } catch {}
  }
  return React.createElement(RealThemeProvider, null, React.createElement(PageCanvas, null, children))
}

export { I18nProvider } from '../src/i18n/I18nProvider.jsx'
export { OAuthProvider } from '../src/providers/OAuthProvider.jsx'
