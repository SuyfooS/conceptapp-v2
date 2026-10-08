# packages/ui

The design system: tokens (in `app/globals.css`), components, and the
`/design` gallery page that shows them all in Hebrew and English.

Components are owned source (shadcn-style, built on Radix primitives and
`class-variance-authority`), not a dependency. They use token utilities only
(`bg-surface`, `text-ink`, `border-line`, `bg-accent`…) and logical
properties only (`ps-`/`pe-`, `ms-`/`me-`, `start-`/`end-`), so they work in
RTL and LTR without changes.

Import as `@ui/<file>`. `cn()` lives in `@ui/cn`.
