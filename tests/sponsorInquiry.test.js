import { describe, expect, it } from 'vitest'
import {
  buildSponsorInquiryMessage,
  normalizeSponsorTier,
  SPONSOR_TIER_UNDECIDED,
} from '../src/lib/sponsorInquiry.js'

describe('sponsorInquiry', () => {
  it('arma un mensaje legible con marca, alcance, nivel y aporte', () => {
    const message = buildSponsorInquiryMessage({
      brand: '  Marca SA ',
      scope: 'season',
      tier: 'official',
      contribution: ' Equipamiento para tarima ',
    })

    expect(message).toBe(
      [
        'Marca: Marca SA',
        'Alcance: Temporada completa',
        'Nivel de interés: Partner oficial',
        '',
        'Qué puede aportar:',
        'Equipamiento para tarima',
      ].join('\n'),
    )
  })

  it('omite el bloque de aporte si viene vacío y cae a "sin definir" con valores inválidos', () => {
    const message = buildSponsorInquiryMessage({
      brand: 'Marca SA',
      scope: 'cualquiera',
      tier: 'inexistente',
      contribution: '   ',
    })

    expect(message).toBe(
      ['Marca: Marca SA', 'Alcance: Sin definir', 'Nivel de interés: A definir juntos'].join('\n'),
    )
  })

  it('normaliza niveles desconocidos al valor a definir', () => {
    expect(normalizeSponsorTier('title')).toBe('title')
    expect(normalizeSponsorTier('x')).toBe(SPONSOR_TIER_UNDECIDED)
    expect(normalizeSponsorTier(undefined)).toBe(SPONSOR_TIER_UNDECIDED)
  })
})
