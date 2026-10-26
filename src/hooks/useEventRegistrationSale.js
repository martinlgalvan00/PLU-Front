import { useMemo } from 'react'
import usePlatformPaymentChannels from './usePlatformPaymentChannels.js'
import { effectiveEventChannelsFor } from '../lib/eventPaymentChannels.js'
import { resolveEventSalesReadiness } from '../lib/eventSalesReadiness.js'
import { platformCellsFor } from '../lib/platformPaymentChannels.js'
import { resolveRegistrationSale } from '../../shared/registrationSaleState.js'

/** Avisos de cobro que no cortan la venta pero hacen fallar un medio de pago. */
const PAYMENT_WARNINGS = new Set([
  'mpProfileMissing',
  'mpProfileNeedsReconnect',
  'transferWithoutDestination',
])

/**
 * Lectura del estado de venta de un evento, con los datos de la plataforma.
 * La comparten el control, la barra rápida y la cabecera del workspace.
 */
export default function useEventRegistrationSale(event) {
  const { platform } = usePlatformPaymentChannels()
  return useMemo(() => {
    const registrationChannels = platform
      ? effectiveEventChannelsFor(
          event?.paymentChannelOverrides,
          'registration',
          platformCellsFor(platform, 'registration'),
        )
      : null
    const sale = resolveRegistrationSale(event, { platform, registrationChannels })
    const warnings = platform
      ? resolveEventSalesReadiness(event, platform).codes.filter((code) =>
          PAYMENT_WARNINGS.has(code),
        )
      : []
    return { ...sale, warnings, platform }
  }, [event, platform])
}

