/**
 * PLU ARG — tokens de marca y rutas públicas.
 * Colores: usá var(--color-*) en CSS o PLU_CSS_VARS en estilos inline.
 */
export const BRAND = {
  /** Powerlifting United — letterhead horizontal (fondo negro) */
  logoUrl: '/brand/plu-official-logo.png',
  logoLetterheadUrl: '/brand/plu-official-logo.png',
  /** Emblema circular PLU Argentina */
  logoArgentinaUrl: '/brand/plu-argentina-emblem.png',
  logoAlt: 'PLU ARG — Powerlifting United',
  logoArgentinaAlt: 'PLU Argentina — emblema oficial',
  faviconUrl: '/brand/plu-favicon.svg',
  appleTouchIconUrl: '/brand/plu-official-logo.png',
}

/** Nombres de custom properties semánticas (referencia para CSS-in-JS) */
export const PLU_CSS_VARS = {
  brandRed: '--color-brand-red',
  brandRedHover: '--color-brand-red-hover',
  brandCeleste: '--color-brand-celeste',
  brandGold: '--color-brand-gold',
  bgPrimary: '--color-bg-primary',
  bgSurface: '--color-bg-surface',
  bgCanvas: '--color-page-canvas',
  textPrimary: '--color-text-primary',
  textMuted: '--color-text-muted',
  textOnLight: '--color-text-on-light',
  borderSubtle: '--color-border-subtle',
  navStripe: '--color-nav-stripe',
  heroGradient: '--color-hero-gradient',
  radiusLg: '--border-radius-lg',
  radiusPill: '--border-radius-pill',
  spaceMd: '--space-md',
  spaceXl: '--space-xl',
  fontFamily: '--font-family',
  fontDisplay: '--font-display',
  fontMono: '--font-mono',
  easeDesign: '--ease-design',
}

/** Paleta raw (hex/oklch) — útil en Storybook, charts o SVG */
export const PLU_PALETTE = {
  red: {
    600: '#b80500',
    500: '#e10600',
    400: '#ff3b36',
    oklch: 'oklch(58% 0.19 25)',
    oklchGlow: 'oklch(56% 0.18 25)',
  },
  celeste: {
    400: '#74acdf',
    300: '#9ec5eb',
    oklch: 'oklch(78% 0.06 230)',
  },
  gold: {
    500: '#c9b978',
    400: '#ddc992',
    600: '#9b8f59',
    oklch: 'oklch(74% 0.11 85)',
  },
  neutral: {
    canvas: '#f7f6f3',
    canvasMuted: '#f0efec',
    ink: '#1a1c22',
    inkMuted: '#6b6f7a',
    dark900: '#121316',
    dark850: '#141518',
    dark800: '#181a1f',
    dark750: '#1e2026',
  },
  success: {
    500: '#3d9a62',
    400: '#8fd4a8',
    bg: 'oklch(96% 0.02 150)',
  },
}

/** Helper: lee un token CSS del documento (client-side) */
export function readCssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
