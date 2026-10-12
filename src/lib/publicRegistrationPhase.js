import { getStatusMeta, isRegistrationOpen } from './status.js'

/** Fases públicas de inscripción a un meet (landing). */
export const PUBLIC_REGISTRATION_PHASE = Object.freeze({
  coming_soon: 'coming_soon',
  open: 'open',
  closed: 'closed',
  full: 'full',
  finished: 'finished',
})

function toValidDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toNowMs(now) {
  return now instanceof Date ? now.getTime() : Number(now)
}

/**
 * Fase pública de inscripción alineada a la idea de "live" del admin:
 * abierto solo si el status permite altas, la ventana no venció, no está
 * agendada a futuro y los cobros de registration están habilitados.
 *
 * @param {object|null|undefined} event
 * @param {{ checkoutEnabled?: boolean, now?: Date|number }} [options]
 * @returns {{
 *   phase: string,
 *   status: string,
 *   closedByWindow: boolean,
 *   scheduled: boolean,
 *   canRegister: boolean,
 *   softLaunch: boolean,
 * }}
 */
export function resolvePublicRegistrationPhase(
  event,
  { checkoutEnabled = true, now = new Date() } = {},
) {
  const status = event?.status ?? 'proximamente'
  const nowMs = toNowMs(now)
  const opensAt = toValidDate(event?.registrationOpensAt)
  const closesAt = toValidDate(event?.registrationClosesAt)
  const scheduled = Boolean(opensAt && nowMs < opensAt.getTime())
  const closedByWindow = Boolean(closesAt && nowMs > closesAt.getTime())

  let phase = PUBLIC_REGISTRATION_PHASE.closed

  if (status === 'finalizado') {
    phase = PUBLIC_REGISTRATION_PHASE.finished
  } else if (status === 'agotado') {
    phase = PUBLIC_REGISTRATION_PHASE.full
  } else if (status === 'cerrado' || closedByWindow) {
    phase = PUBLIC_REGISTRATION_PHASE.closed
  } else if (status === 'proximamente' || !checkoutEnabled || scheduled) {
    phase = PUBLIC_REGISTRATION_PHASE.coming_soon
  } else if (isRegistrationOpen(status)) {
    phase = PUBLIC_REGISTRATION_PHASE.open
  }

  return {
    phase,
    status,
    closedByWindow,
    scheduled,
    canRegister: phase === PUBLIC_REGISTRATION_PHASE.open,
    softLaunch: phase === PUBLIC_REGISTRATION_PHASE.coming_soon,
  }
}

/**
 * Labels / tonos de badge y CTA para la superficie pública (Pitbull).
 * El status global `cerrado` sigue diciendo "Cerrado" en admin; acá se
 * presenta como "Inscripción cerrada".
 *
 * @param {{ phase: string, status: string }} resolved
 * @param {(key: string) => string} t
 */
export function getPublicRegistrationPresentation(resolved, t) {
  const { phase, status } = resolved

  switch (phase) {
    case PUBLIC_REGISTRATION_PHASE.coming_soon:
      return {
        badgeLabel: t('pages.pitbull.badgeComingSoon'),
        badgeTone: 'neutral',
        primaryCtaLabel: t('pages.pitbull.ctaComingSoon'),
        primaryDisabled: true,
        showRegistrationFee: false,
        showJoinSecondary: false,
        shellLeadKey: 'coming_soon',
      }
    case PUBLIC_REGISTRATION_PHASE.open: {
      const meta = getStatusMeta(status, t)
      return {
        badgeLabel: meta.label,
        badgeTone: meta.tone,
        primaryCtaLabel: null,
        primaryDisabled: false,
        showRegistrationFee: true,
        showJoinSecondary: false,
        shellLeadKey: 'open',
      }
    }
    case PUBLIC_REGISTRATION_PHASE.closed:
      return {
        badgeLabel: t('pages.pitbull.badgeClosed'),
        badgeTone: 'danger',
        primaryCtaLabel: t('pages.pitbull.ctaClosed'),
        primaryDisabled: true,
        showRegistrationFee: false,
        showJoinSecondary: true,
        shellLeadKey: 'closed',
      }
    case PUBLIC_REGISTRATION_PHASE.full: {
      const meta = getStatusMeta('agotado', t)
      return {
        badgeLabel: meta.label,
        badgeTone: meta.tone,
        primaryCtaLabel: t('pages.pitbull.ctaClosed'),
        primaryDisabled: true,
        showRegistrationFee: false,
        showJoinSecondary: true,
        shellLeadKey: 'full',
      }
    }
    case PUBLIC_REGISTRATION_PHASE.finished: {
      const meta = getStatusMeta('finalizado', t)
      return {
        badgeLabel: meta.label,
        badgeTone: meta.tone === 'neutral' ? 'info' : meta.tone,
        primaryCtaLabel: t('pages.home.viewResults'),
        primaryDisabled: false,
        showRegistrationFee: false,
        showJoinSecondary: false,
        shellLeadKey: 'finished',
      }
    }
    default: {
      const _exhaustive = phase
      void _exhaustive
      return {
        badgeLabel: t('pages.pitbull.badgeClosed'),
        badgeTone: 'danger',
        primaryCtaLabel: t('pages.pitbull.ctaClosed'),
        primaryDisabled: true,
        showRegistrationFee: false,
        showJoinSecondary: true,
        shellLeadKey: 'closed',
      }
    }
  }
}
