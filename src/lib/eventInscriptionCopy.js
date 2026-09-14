import { isRegistrationOpen } from './status.js'
import { normalizeEventPublicCopy } from './eventPublicSurface.js'

export const INSCRIPTION_COPY_VARIANTS = Object.freeze({
  pending: 'pending',
  meter: 'meter',
  hidden: 'hidden',
  closed: 'closed',
  full: 'full',
  finished: 'finished',
})

/**
 * Qué debe decir el cupo público, según el estado real del meet.
 *
 * Vacío en `publicCopy.inscriptionMark` / `inscriptionNote` cae al default
 * de i18n. El admin puede overridear título y párrafo sin inventar números.
 */
export function resolveInscriptionCopyVariant({
  status,
  progressPublic = true,
  checkoutLocked = false,
  closedByWindow = false,
} = {}) {
  if (status === 'finalizado') return INSCRIPTION_COPY_VARIANTS.finished
  if (status === 'agotado') return INSCRIPTION_COPY_VARIANTS.full
  if (status === 'cerrado' || closedByWindow) return INSCRIPTION_COPY_VARIANTS.closed
  if (checkoutLocked || status === 'proximamente' || !status) {
    return INSCRIPTION_COPY_VARIANTS.pending
  }
  if (isRegistrationOpen(status)) {
    return progressPublic === false
      ? INSCRIPTION_COPY_VARIANTS.hidden
      : INSCRIPTION_COPY_VARIANTS.meter
  }
  return INSCRIPTION_COPY_VARIANTS.closed
}

export function defaultInscriptionCopy(variant, t) {
  switch (variant) {
    case INSCRIPTION_COPY_VARIANTS.finished:
      return {
        mark: t('pages.pitbull.inscriptionCounterFinishedMark'),
        hint: t('pages.pitbull.inscriptionCounterFinished'),
        aria: t('pages.pitbull.inscriptionCounterFinishedAria'),
      }
    case INSCRIPTION_COPY_VARIANTS.full:
      return {
        mark: t('pages.pitbull.inscriptionCounterFullMark'),
        hint: t('pages.pitbull.inscriptionCounterFull'),
        aria: t('pages.pitbull.inscriptionCounterFullAria'),
      }
    case INSCRIPTION_COPY_VARIANTS.closed:
      return {
        mark: t('pages.pitbull.inscriptionCounterClosedMark'),
        hint: t('pages.pitbull.inscriptionCounterClosed'),
        aria: t('pages.pitbull.inscriptionCounterClosedAria'),
      }
    case INSCRIPTION_COPY_VARIANTS.hidden:
      return {
        mark: t('pages.pitbull.inscriptionCounterHiddenMark'),
        hint: t('pages.pitbull.inscriptionCounterHidden'),
        aria: t('pages.pitbull.inscriptionCounterHiddenAria'),
      }
    case INSCRIPTION_COPY_VARIANTS.pending:
      return {
        mark: t('pages.pitbull.slotsPending'),
        hint: t('pages.pitbull.inscriptionCounterPending'),
        aria: t('pages.pitbull.inscriptionCounterPendingAria'),
      }
    case INSCRIPTION_COPY_VARIANTS.meter:
      return { mark: '', hint: '', aria: '' }
    default:
      return {
        mark: t('pages.pitbull.inscriptionCounterClosedMark'),
        hint: t('pages.pitbull.inscriptionCounterClosed'),
        aria: t('pages.pitbull.inscriptionCounterClosedAria'),
      }
  }
}

export function resolvePublicInscriptionCopy({
  status,
  progressPublic = true,
  checkoutLocked = false,
  closedByWindow = false,
  publicCopy,
  t,
} = {}) {
  const variant = resolveInscriptionCopyVariant({
    status,
    progressPublic,
    checkoutLocked,
    closedByWindow,
  })
  const defaults = defaultInscriptionCopy(variant, t)
  const copy = normalizeEventPublicCopy(publicCopy)
  const mark = copy.inscriptionMark || defaults.mark
  const hint = copy.inscriptionNote || defaults.hint
  return {
    variant,
    mark,
    hint,
    aria: hint || mark || defaults.aria,
    showMeter: variant === INSCRIPTION_COPY_VARIANTS.meter,
  }
}
