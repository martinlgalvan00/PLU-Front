import { useEffect, useRef, useState } from 'react'

const EXIT_MS = 200
const ENTER_MS = 450

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function PageTransition({ children, viewKey, direction = 'forward' }) {
  const [state, setState] = useState(() => ({
    key: viewKey,
    node: children,
    phase: prefersReducedMotion() ? 'idle' : 'enter',
  }))
  const pendingRef = useRef(null)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setState({ key: viewKey, node: children, phase: 'idle' })
      return
    }

    if (viewKey === state.key) {
      if (children !== state.node) {
        setState((current) => ({ ...current, node: children }))
      }
      return
    }

    pendingRef.current = { key: viewKey, node: children }
    setState((current) => ({ ...current, phase: 'exit' }))
  }, [viewKey, children, state.key, state.node])

  useEffect(() => {
    if (state.phase !== 'exit' || prefersReducedMotion()) return undefined

    const timer = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending) return
      setState({ key: pending.key, node: pending.node, phase: 'enter' })
      pendingRef.current = null
    }, EXIT_MS)

    return () => window.clearTimeout(timer)
  }, [state.phase])

  useEffect(() => {
    if (state.phase !== 'enter' || prefersReducedMotion()) return undefined

    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, phase: 'idle' }))
    }, ENTER_MS)

    return () => window.clearTimeout(timer)
  }, [state.phase, state.key])

  const phaseClass = `page-transition--${state.phase}`
  const dirClass = `page-transition--dir-${direction}`

  return (
    <div className={`page-transition ${phaseClass} ${dirClass}`.trim()}>
      {state.node}
    </div>
  )
}
