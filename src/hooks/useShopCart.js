import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addToCart,
  cartCount,
  cartTotal,
  loadCart,
  reconcileCart,
  removeLine,
  saveCart,
  setLineQuantity,
} from '../lib/shopCart.js'

const browserStorage = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Carrito de la tienda con persistencia local. Al cargar el catálogo se cruza
 * con lo vigente (precio, stock, talle) y deja `notes` con lo que cambió.
 */
export function useShopCart(products, { catalogReady = false } = {}) {
  const [lines, setLines] = useState(() => loadCart(browserStorage()))
  const [notes, setNotes] = useState([])
  const reconciledFor = useRef(null)

  useEffect(() => {
    saveCart(browserStorage(), lines)
  }, [lines])

  // Una sola reconciliación por catálogo cargado: más seguido, el carrito
  // cambiaría debajo de los dedos de quien lo está editando.
  useEffect(() => {
    if (!catalogReady || reconciledFor.current === products) return
    reconciledFor.current = products
    const result = reconcileCart(lines, products)
    const changed =
      result.lines.length !== lines.length ||
      result.lines.some((line, index) => line.price !== lines[index]?.price)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (changed) setLines(result.lines)
    setNotes(result.notes)
  }, [catalogReady, lines, products])

  const add = useCallback(
    (product, options) => setLines((current) => addToCart(current, product, options)),
    [],
  )
  const setQuantity = useCallback(
    (key, quantity) => setLines((current) => setLineQuantity(current, key, quantity)),
    [],
  )
  const remove = useCallback((key) => setLines((current) => removeLine(current, key)), [])
  const clear = useCallback(() => {
    setLines([])
    setNotes([])
  }, [])
  const dismissNotes = useCallback(() => setNotes([]), [])

  return useMemo(
    () => ({
      lines,
      notes,
      count: cartCount(lines),
      total: cartTotal(lines),
      add,
      setQuantity,
      remove,
      clear,
      dismissNotes,
    }),
    [lines, notes, add, setQuantity, remove, clear, dismissNotes],
  )
}
