# packages/ui

The design system: tokens (in `app/globals.css`), components, and the
`/design` gallery page that shows them all in Hebrew and English.

Components are owned source (shadcn-style, built on Radix primitives and
`class-variance-authority`), not a dependency. They use token utilities only
(`bg-surface`, `text-ink`, `border-line`, `bg-accent`…) and logical
properties only (`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`), so they work in
RTL and LTR without changes.

Import as `@ui/<file>`. `cn()` lives in `@ui/cn`.

## Third party

Some components follow designs from [React Bits](https://reactbits.dev) (MIT + Commons
Clause, © 2026 David Haz), rebuilt here on our tokens and CSS. The licence allows this
as part of an application; it doesn't allow selling or redistributing the components
themselves, so this folder must not become a package of its own. They say so in a comment.
