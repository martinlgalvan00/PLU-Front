import { fireEvent, screen } from '@testing-library/react'

/**
 * Abre los menús «Más acciones» de las filas. Un menú cerrado queda oculto
 * (`hidden`) y por eso fuera del árbol de accesibilidad: sus ítems no se pueden
 * consultar sin abrirlo, igual que le pasa al operador. En los tests que
 * afirman que una acción NO se ofrece hay que abrirlo igual, o la aserción
 * pasa por estar cerrado y no por lo que dice probar.
 */
export function openActionMenus(label = 'Más acciones') {
  for (const trigger of screen.queryAllByRole('button', { name: label })) {
    if (trigger.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger)
  }
}
