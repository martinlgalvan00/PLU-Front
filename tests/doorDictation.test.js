import { afterEach, describe, expect, it } from 'vitest'
import { createDoorDictation } from '../src/lib/doorDictation.js'

let lastRecognition = null

class FakeRecognition {
  constructor() {
    lastRecognition = this
  }

  start() {
    this.started = (this.started ?? 0) + 1
  }

  stop() {
    this.onend?.()
  }
}

function installRecognition() {
  window.SpeechRecognition = FakeRecognition
}

function transcripts(texts, { isFinal = true } = {}) {
  return {
    results: [
      {
        isFinal,
        length: texts.length,
        ...texts.map((transcript) => ({ transcript })),
      },
    ],
  }
}

describe('dictado del código de puerta', () => {
  afterEach(() => {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    lastRecognition = null
  })

  it('manda a usar el XXX-XXX cuando alguna alternativa cierra', () => {
    installRecognition()
    const accepted = []
    const notes = []
    const dictation = createDoorDictation({
      onAccepted(code) {
        accepted.push(code)
        return true
      },
      onNote(note) {
        notes.push(note)
      },
    })

    dictation.toggle()
    lastRecognition.onresult(transcripts(['el código por favor', 'ka cuatro eme siete cu pe']))

    expect(accepted).toEqual(['K4M-7QP'])
    expect(notes.at(-1)).toBe('')
  })

  it('deja el código escrito si el puesto todavía está ocupado', () => {
    installRecognition()
    const previews = []
    const notes = []
    const dictation = createDoorDictation({
      onAccepted() {
        return false
      },
      onPreview(value) {
        previews.push(value)
      },
      onNote(note) {
        notes.push(note)
      },
    })

    dictation.toggle()
    lastRecognition.onresult(transcripts(['k4m 7qp']))

    expect(previews.at(-1)).toBe('K4M-7QP')
    expect(notes).toContain('ready')
  })

  it('después de tres silencios se puede tipear', () => {
    installRecognition()
    const notes = []
    const dictation = createDoorDictation({
      onNote(note) {
        notes.push(note)
      },
    })

    dictation.toggle()
    lastRecognition.onerror({ error: 'no-speech' })
    lastRecognition.onend()
    lastRecognition.onerror({ error: 'no-speech' })
    lastRecognition.onend()
    lastRecognition.onerror({ error: 'no-speech' })

    expect(notes).toContain('missed')
    expect(lastRecognition.started).toBe(3)
  })
})
