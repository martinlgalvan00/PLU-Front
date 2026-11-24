/**
 * Pasos del checkout de entradas, en orden. Cada paso reemplaza al anterior en
 * pantalla: se avanza validando lo cargado y se puede volver a cualquiera ya
 * hecho sin perder datos (el estado vive en el formulario, no en el paso).
 */
export const TICKET_CHECKOUT_STEPS = ['tickets', 'buyer', 'payment']
