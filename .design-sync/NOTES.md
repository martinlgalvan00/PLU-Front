# design-sync notes — PLU ARG

## Repo shape

This repo is an application (Vite + React SPA), not a published component
library — there is no `dist/` exporting components. `.design-sync/entry.js`
is a hand-written synthetic entry re-exporting every storied component from
`src/components/ui/` and `src/components/layout/`, plus the three context
providers (`ThemeProvider`, `I18nProvider`, `OAuthProvider`) used by
`cfg.provider`. `index.d.ts` at the repo root is a hand-written ambient
declaration file (all `props: any`) that exists ONLY so design-sync's
`.d.ts`-based export-evidence pass can match Storybook titles to real
components — this project ships no real TypeScript. Keep both files in sync
whenever a component is added/removed from the design system:
add/remove its export in `entry.js` AND its `export declare function` line
in `index.d.ts`.

Two re-export files were intentionally left unstoried and excluded from the
sync: `src/components/ui/CTAButton.jsx` (re-exports `Button`) and
`src/components/ui/StatusBadge.jsx` (re-exports `StatusPill`), plus
`src/components/layout/Header.jsx` (re-exports `NavbarPublic`).

Cards.jsx, FormFields.jsx, and LocaleFlag.jsx each export multiple named
components with no matching default — `[TITLE_UNMAPPED]` dropped all of them
until the stories were split one-file-per-export with matching titles
(`UI/BenefitCard`, `UI/PricingCard`, `UI/InfoCard`, `UI/Field`, `UI/Select`,
`UI/FlagAr`, `UI/FlagUs`). Titles must equal an export name — don't
reconsolidate these into one multi-story file without a `cfg.titleMap`.

## Known render warns (triaged — do not re-chase)

- `[RENDER_THIN] FlagAr` / `[RENDER_THIN] FlagUs` — both are small decorative
  SVG flag icons with no text content by design. Confirmed via
  `_screenshots/ui__FlagAr.png` / `ui__FlagUs.png`: the flag renders
  correctly, the check just flags "no text mounted." Not a bug.
- `[TOKENS_MISSING]` — `--plu-gold-300`, `--hero-image`,
  `--color-status-success`, `--color-manual-note-bg`,
  `--color-manual-note-border`, `--color-border-strong`, `--plu-ink-800` are
  referenced in the app's CSS but never actually defined anywhere in
  `src/styles/` (confirmed via grep — these are pre-existing dead/missing
  custom properties in the app itself, unrelated to design-sync). Worth
  fixing in the app's own CSS at some point, but out of scope for this sync.
- `[FONT_MISSING]` for "Poppins" / "JetBrains Mono" — resolved via
  `cfg.runtimeFontPrefixes`, not substituted. The real app loads both
  families from Google Fonts via a `<link>` tag in `index.html` at runtime
  (see `index.html` head) — they are never shipped as static `@font-face`
  files anywhere in this repo, so there is nothing to bundle. This
  accurately reflects how the app actually works; it is not a
  fidelity compromise.

## Re-sync risks

- If new UI/layout components are added, they need a `.stories.jsx` file
  AND an entry in both `.design-sync/entry.js` and `index.d.ts`, or they
  will not be discovered (silently absent, not an error).
- `index.d.ts` is hand-maintained `props: any` — if this project ever adopts
  real TypeScript or JSDoc-based prop types, regenerate it properly instead
  of hand-editing forever.
- The Google Fonts runtime-load assumption (`runtimeFontPrefixes`) breaks
  silently if the app ever switches to self-hosted fonts — re-check
  `index.html`'s `<head>` on re-sync if typography looks different.
- `cfg.provider` wraps every preview in `ThemeProvider > I18nProvider >
  OAuthProvider`. `OAuthProvider` renders in its disabled/stub mode during
  the sync (no Auth0 env vars configured for design-sync builds) — this
  matches local dev without `.env` Auth0 keys, not production.
