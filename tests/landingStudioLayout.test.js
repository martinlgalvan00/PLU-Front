import { afterEach, describe, expect, it } from 'vitest'
import { dropDelta, studioPreviewScale } from '../src/lib/landingStudioLayout.js'
import {
  clearLandingStudioReopen,
  markLandingStudioForReopen,
  shouldReopenLandingStudio,
} from '../src/lib/landingStudioSession.js'
import { moveBlock } from '../src/lib/eventLandingLayout.js'

const blocks = ['hero', 'facts', 'text-1', 'experience', 'faq'].map((id) => ({ id, type: id }))
const ids = (list) => list.map((block) => block.id)
const drop = (dragId, targetId, after) =>
  ids(moveBlock(blocks, dragId, dropDelta(blocks, dragId, targetId, after)))

describe('dropDelta', () => {
  it('soltar antes o después de otro bloque, hacia arriba y hacia abajo', () => {
    expect(drop('faq', 'facts', false)).toEqual(['hero', 'faq', 'facts', 'text-1', 'experience'])
    expect(drop('facts', 'experience', true)).toEqual(['hero', 'text-1', 'experience', 'facts', 'faq'])
    expect(drop('facts', 'experience', false)).toEqual(['hero', 'text-1', 'facts', 'experience', 'faq'])
  })

  it('soltar sobre sí mismo o en su mismo lugar no mueve nada', () => {
    expect(dropDelta(blocks, 'facts', 'facts', true)).toBe(0)
    expect(dropDelta(blocks, 'facts', 'text-1', false)).toBe(0)
    expect(dropDelta(blocks, 'facts', 'hero', true)).toBe(0)
  })

  it('nada queda antes de la portada', () => {
    expect(drop('faq', 'hero', false)[0]).toBe('hero')
  })

  it('un id que no existe no mueve nada', () => {
    expect(dropDelta(blocks, 'nope', 'faq', true)).toBe(0)
  })
})

describe('studioPreviewScale', () => {
  it('achica el escritorio para que entre y nunca agranda', () => {
    expect(studioPreviewScale(1020, 1280)).toBeCloseTo((1020 - 48) / 1280)
    expect(studioPreviewScale(2000, 390)).toBe(1)
  })

  it('sin medida todavía, escala 1; y nunca por debajo de 0,2', () => {
    expect(studioPreviewScale(0, 1280)).toBe(1)
    expect(studioPreviewScale(100, 1280)).toBe(0.2)
  })
})

describe('landingStudioSession', () => {
  afterEach(clearLandingStudioReopen)

  it('reabre solo para el mismo evento y dentro de la ventana', () => {
    markLandingStudioForReopen('evt-1', 1000)
    expect(shouldReopenLandingStudio('evt-1', 2000)).toBe(true)
    expect(shouldReopenLandingStudio('evt-2', 2000)).toBe(false)
    expect(shouldReopenLandingStudio('evt-1', 1000 + 16_000)).toBe(false)
  })

  it('leer no consume la marca; limpiarla sí', () => {
    markLandingStudioForReopen('evt-1', 1000)
    expect(shouldReopenLandingStudio('evt-1', 1100)).toBe(true)
    expect(shouldReopenLandingStudio('evt-1', 1200)).toBe(true)
    clearLandingStudioReopen()
    expect(shouldReopenLandingStudio('evt-1', 1300)).toBe(false)
  })

  it('sin id (alta nueva) no marca nada', () => {
    markLandingStudioForReopen(null, 1000)
    expect(shouldReopenLandingStudio(null, 1000)).toBe(false)
  })
})
