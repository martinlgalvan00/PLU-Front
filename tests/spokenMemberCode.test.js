import { describe, expect, it } from 'vitest'
import {
  memberCodeLookupCandidates,
  parseSpokenMemberInput,
  spokenMemberCode,
} from '../shared/spokenMemberCode.js'

describe('código corto de la credencial', () => {
  it('deja el número de socio en año y serial, para cantarlo', () => {
    expect(spokenMemberCode('PLU-ARG-2026-00000865')).toEqual({
      display: '26 865',
      compact: '26865',
      utterance: 'dos seis, ocho seis cinco',
      canonical: 'PLU-ARG-2026-00000865',
    })
    expect(spokenMemberCode('PLU-ARG-2026-00000865', 'en').utterance).toBe('two six, eight six five')
  })

  it('entiende el código corto y el histórico de 3 dígitos', () => {
    expect(parseSpokenMemberInput('26 865')?.display).toBe('26 865')
    expect(parseSpokenMemberInput('26-865')?.display).toBe('26 865')
    expect(parseSpokenMemberInput('26865')?.display).toBe('26 865')
    expect(memberCodeLookupCandidates('26 14')).toEqual([
      'PLU-ARG-2026-00000014',
      'PLU-ARG-2026-014',
      'PLU-ARG-2026-14',
    ])
  })

  it('no se come un código de entrada ni un token', () => {
    expect(parseSpokenMemberInput('262345')).toBeNull()
    expect(parseSpokenMemberInput('K4M-7QP')).toBeNull()
    expect(memberCodeLookupCandidates('PLU-ARG-2026-014')).toEqual(['PLU-ARG-2026-014'])
  })
})
