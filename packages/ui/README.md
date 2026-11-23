# packages/ui

The design system: tokens (in `app/globals.css`), components, and the
`/design` gallery page that shows them all in Hebrew and English.

Components are owned source (shadcn-style, built on Radix primitives and
`class-variance-authority`), not a dependency. They use token utilities only
(`bg-surface`, `text-ink`, `border-line`, `bg-accent`…) and logical
properties only (`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`), so they work in
RTL and LTR without changes.

Import as `@ui/<file>`. `cn()` lives in `@ui/cn`.

`@ui/captcha` is the "אני לא רובוט" check before every SMS code (Cloudflare
Turnstile, P9b): `useCaptcha(setup, action)` keeps one check for a screen, and
`CaptchaBox` draws it right above the press it is for, nothing while it asks
nothing, Cloudflare's own box only when it asks for a tick, and its lines while
a press waits, when it failed and when it didn't load. A form sends through
`holdSubmit` (a press made too soon waits and goes by itself), a send in code
through `take()`. Its controller, `@ui/captcha-control`, has no React and is
tested on its own. The script is Cloudflare's, never copied here; the gallery
shows the stand-in only.

## Third party

Some components follow designs from [React Bits](https://reactbits.dev) (MIT + Commons
Clause, © 2026 David Haz), rebuilt here on our tokens and CSS. The licence allows this
as part of an application; it doesn't allow selling or redistributing the components
themselves, so this folder must not become a package of its own. They say so in a comment.
