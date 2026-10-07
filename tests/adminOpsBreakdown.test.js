import { describe, expect, it } from 'vitest'
import {
  isBreakdownAttentionTone,
  selectBreakdownLegendItems,
} from '../src/lib/adminOpsBreakdown.js'

describe('adminOpsBreakdown', () => {
  it('trata gold como atención operativa', () => {
    expect(isBreakdownAttentionTone('gold')).toBe(true)
    expect(isBreakdownAttentionTone('warning')).toBe(true)
    expect(isBreakdownAttentionTone('alert')).toBe(true)
    expect(isBreakdownAttentionTone('success')).toBe(false)
    expect(isBreakdownAttentionTone('default')).toBe(false)
  })

  it('muestra primary + toda la atención sin recortar gold a +N', () => {
    const { visibleItems, hiddenItems } = selectBreakdownLegendItems([
      { status: 'activa', value: 28, tone: 'success' },
      { status: 'expiringSoon', value: 4, tone: 'gold' },
      { status: 'vencida', value: 2, tone: 'alert' },
      { status: 'cancelada', value: 1, tone: 'default' },
    ])

    expect(visibleItems.map((item) => item.status)).toEqual([
      'activa',
      'expiringSoon',
      'vencida',
    ])
    expect(hiddenItems.map((item) => item.status)).toEqual(['cancelada'])
  })

  it('no limita la leyenda a 3 cuando hay más de dos estados de atención', () => {
    const { visibleItems, hiddenItems } = selectBreakdownLegendItems([
      { status: 'aprobado', value: 255, tone: 'success' },
      { status: 'pendiente', value: 6, tone: 'warning', amount: 640000 },
      { status: 'validacion_manual', value: 1, tone: 'alert', amount: 92500 },
      { status: 'otros', value: 2, tone: 'default' },
    ])

    expect(visibleItems.map((item) => item.status)).toEqual([
      'aprobado',
      'pendiente',
      'validacion_manual',
    ])
    expect(hiddenItems).toHaveLength(1)
    expect(hiddenItems[0].status).toBe('otros')
  })

  it('si solo hay atención, el primero ranked es primary visible', () => {
    const { visibleItems, hiddenItems } = selectBreakdownLegendItems([
      { status: 'pendiente', value: 3, tone: 'warning' },
      { status: 'observada', value: 5, tone: 'alert' },
    ])

    expect(visibleItems.map((item) => item.status)).toEqual(['observada', 'pendiente'])
    expect(hiddenItems).toHaveLength(0)
  })
})
