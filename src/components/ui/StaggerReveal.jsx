import { Children, cloneElement, isValidElement, useRef } from 'react'
import { useInView } from '../../hooks/useMotion.js'

export default function StaggerReveal({
  as: Tag = 'div',
  children,
  className = '',
  stagger = 80,
  variant = 'up',
}) {
  const ref = useRef(null)
  const visible = useInView(ref)

  return (
    <Tag
      ref={ref}
      className={`stagger-reveal stagger-reveal--${variant} ${visible ? 'is-visible' : ''} ${className}`.trim()}
      style={{ '--stagger-step': `${stagger}ms` }}
    >
      {Children.map(children, (child, index) => {
        if (!isValidElement(child)) return child

        return cloneElement(child, {
          style: {
            ...child.props.style,
            '--stagger-index': index,
          },
        })
      })}
    </Tag>
  )
}
