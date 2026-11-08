# ConceptApp's logo and icon

Orel chose this design on 8 November 2026. ChatGPT made it; the files here are
it redrawn as vectors. The mark is rebuilt from its shapes, the wordmark traced
from its letters, so every size stays sharp.

## Files

| File | What it is for |
|---|---|
| `logo.svg`, `logo.png` | The mark and the name, on light backgrounds. Transparent. |
| `logo-on-dark.svg`, `logo-on-dark.png` | The same with a white name, on dark backgrounds. |
| `mark.svg` | The mark alone. |
| `app-icon.svg` | The app icon: the mark in white on purple, square and full bleed. The stores and phones round the corners themselves. |
| `app-icon-1024.png` | The App Store icon: 1024×1024, opaque RGB with no alpha channel (App Store Connect refuses one). |
| `app-icon-512.png` | The Google Play icon: exactly 512×512. |
| `app-icon-light.svg`, `app-icon-light-1024.png` | A light variant: the purple mark on white. Not used yet. |

What the app serves is made from the same shapes:

- `app/icon.svg`: the browser tab, rounded and with the mark a little larger.
- `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`: the home screen.
- `public/icon-maskable-512.png`: Android, with the mark inside its safe zone.
- `packages/ui/logo-paths.ts`: the `Logo` and `LogoMark` components (`@ui/logo`).

## Colours

| | In the files | In the app (`@ui/logo`) |
|---|---|---|
| The C | `#9000FF` | `brand`: `#9000FF` in light, `#971CFF` in dark |
| The card behind it | `#AC3BFC` | `brand-2`: the brand mixed with 25% white in sRGB, `#AC40FF` in light |
| The name | `#141318`, or white in the `on-dark` files | `ink`, the text colour |
| The icon's cards | `#CC8EFC` and `#E8CCFC` behind a white C | |

Icons are opaque PNGs (no alpha channel); only the logo PNGs are transparent.

## Rules

- The logo is ConceptApp's own, in ConceptApp's colour: sign-in, the console,
  marketing and the stores. Never inside a business's screens, which carry the
  business's colour.
- Keep clear space around it of at least the height of the C's opening.
- Don't recolour, stretch, outline or add shadows. On a photo or a coloured
  background, use the white-name version on a dark area, or the icon.
