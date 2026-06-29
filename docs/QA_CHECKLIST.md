# QA Checklist — PLU ARG MVP

## Landing pública

- [ ] Home carga con hero, misión e involucrate
- [ ] Navegación funciona en todas las vistas
- [ ] Responsive en mobile (720px, 1060px)

## Registro

- [ ] Formulario valida campos requeridos
- [ ] Duplicado email/documento muestra error
- [ ] Combo/afiliación/solo evento calcula monto correcto
- [ ] Orden se crea y aparece en panel

## Panel admin

- [ ] Dashboard muestra métricas
- [ ] Cambio de rol afecta permisos (PLU USA no edita)
- [ ] Filtros de inscripciones funcionan
- [ ] Aprobar pago actualiza estados
- [ ] Export CSV admin y PLU USA descargan

## Integraciones (mock)

- [ ] Sin credenciales MP: modo mock sin errores
- [ ] Sin credenciales Brevo: emails en consola dev
- [ ] API `/health` responde 200

## Build

- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin errores
- [ ] `npm run test` pasa
