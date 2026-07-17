/**
 * Pill.jsx — primitivo visual compartido detrás de StatusPill.
 *
 * StatusPill resuelve tono+label a partir de un `status` de dominio (ver
 * lib/status.js). Para lo que no es un status de dominio -- disponibilidad
 * de entradas, activo/desactivado de una cuenta -- este es el mismo
 * pill/CSS (status-pill, ya themeado en claro/oscuro) sin esa resolución.
 */
export default function Pill({ tone = 'neutral', className = '', children }) {
  return <span className={`status-pill status-pill--${tone} ${className}`.trim()}>{children}</span>
}
