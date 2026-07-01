# Referencia de diseño — Claude Design

Colocá acá el export de Claude Design para implementarlo en PLU-Front.

## Qué subir

Desde [claude.ai/design](https://claude.ai/design), exportá el proyecto y guardá:

- `PLU ARG - Sitio Publico.dc.html` (HTML autocontenido), o
- El ZIP completo del handoff (descomprimido en esta carpeta)

## Estructura esperada

```txt
design-reference/
  README.md
  PLU ARG - Sitio Publico.dc.html   ← archivo principal
  assets/                           ← opcional, si el ZIP trae imágenes sueltas
```

## Después de subir el archivo

En Cursor, pedí:

> Implementá el diseño de `design-reference/PLU ARG - Sitio Publico.dc.html` en PLU-Front.

El agente va a extraer tokens, layout y componentes y mapearlos a `src/` sin pegar HTML monolítico en producción.

## No commitear por error

Si el export pesa mucho o trae datos sensibles, revisá antes de `git add`. Podés agregar archivos grandes a `.gitignore` si solo son referencia local.
