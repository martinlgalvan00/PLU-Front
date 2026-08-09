import { beforeEach, describe, expect, it } from 'vitest'
import {
  credentialMergeStorageKey,
  hasPlayedCredentialMerge,
  markCredentialMergePlayed,
} from '../src/lib/credentialMerge.js'

describe('credentialMerge one-shot', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('arma una clave estable por atleta y membresía', () => {
    expect(credentialMergeStorageKey('ath-1', 'mem-9')).toBe('plu.credentialMerge.ath-1.mem-9')
  })

  it('marca el ritual como reproducido una sola vez', () => {
    expect(hasPlayedCredentialMerge('ath-1', 'mem-9')).toBe(false)
    markCredentialMergePlayed('ath-1', 'mem-9')
    expect(hasPlayedCredentialMerge('ath-1', 'mem-9')).toBe(true)
  })
})
