import { describe, expect, it } from 'vitest'
import { classifyFrameDurations, getLowerMotionTier } from '../src/motion/deviceTier.ts'

describe('deviceTier runtime classification', () => {
  it('keeps smooth 60fps samples in the high tier', () => {
    expect(classifyFrameDurations(Array(36).fill(16.7))).toBe('high')
  })

  it('degrades consistently slow frames to low', () => {
    expect(classifyFrameDurations(Array(36).fill(33.3))).toBe('low')
  })

  it('detects a sustained share of dropped frames', () => {
    const sample = [...Array(24).fill(16.7), ...Array(12).fill(34)]
    expect(classifyFrameDurations(sample)).toBe('low')
  })

  it('never upgrades a tier after runtime degradation', () => {
    expect(getLowerMotionTier('low', 'high')).toBe('low')
    expect(getLowerMotionTier('mid', 'low')).toBe('low')
    expect(getLowerMotionTier('high', 'mid')).toBe('mid')
  })
})
