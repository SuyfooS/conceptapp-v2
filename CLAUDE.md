# ConceptApp v2 — working agreement

Read this before changing anything. Next.js version notes are in @AGENTS.md.
Autonomous runs (Oct–Nov 2026) also follow @docs/AGENT.md.

## What this is

The operations app for small Israeli restaurants and cafés: staff scheduling,
time clock, table reservations and a public page. Set up for each business by
the ConceptApp team from a template; run daily by managers and staff on their
phones. Hebrew first, RTL.

Plan and decisions: App Design Document and Business Model (links in the
ConceptApp project, `claude/v2-rebuild-plan.md`).

## Principles

1. One wedge, finished. Restaurants and cafés, five modules (scheduling, time
   clock, reservations, storefront, notifications). Nothing from the deferred
   list gets built before its trigger.
2. Types everywhere. TypeScript strict, Zod at every boundary, generated DB types.
3. Postgres with row-level security. Tenant isolation lives in the database
   and is covered by tests.
4. One design system, in code. Tokens in `app/globals.css`, components in
   `packages/ui`. No page-level CSS, no raw hex in components.
5. Small phases, each with a demo.
6. Configuration, never customisation. A business is a template plus
   settings. A business-specific request becomes a setting or a module for
   everyone. Never a per-business branch, flag or fork.

## Layout

```
app/                Next.js routes. Route groups: (admin) (app) (public) — added as they arrive
modules/<key>/      one folder per module, each exporting a typed manifest
packages/ui/        components + /design gallery          import "@ui/…"
packages/db/        schema, migrations, queries, RLS tests import "@db/…"
packages/domain/    pure logic with unit tests            import "@domain/…"
supabase/           CLI config, edge functions, seed data
```

## UI rules

- `<html lang="he" dir="rtl">`. Use logical utilities only: `ps-`/`pe-`,
  `ms-`/`me-`, `start-`/`end-`, `text-start`. Never `pl-`, `mr-`, `left-`.
- `rtl:`/`ltr:` are redefined on CSS `:dir()` (see globals.css), so they follow
  the element's real direction even inside a nested `dir` block. Use
  `rtl:-scale-x-100` to mirror arrows and chevrons.
- Time, phone and number inputs get `dir="ltr"` plus `ltrInputClass` (from
  `@ui/text-field`), so digits read LTR but the field still aligns with the
  page. (`text-align: match-parent` would be neater but Chromium lacks it.)
- Colour only through tokens: `bg-bg`, `bg-surface`, `bg-surface-2`,
  `border-line`, `text-ink`, `text-ink-2`, `bg-accent`, `text-accent-ink`,
  `bg-accent-soft`, `text-success|warning|danger`. `bg-brand` (#9000FF) is
  ConceptApp's own colour: admin console and marketing only.
- Type scale: `text-sm` 13 · `text-base` 15 · `text-md` 17 · `text-lg` 20 ·
  `text-xl` 24 · `text-2xl` 30. Heebo only, weights 400/500/700.
- Cards: flat (border), raised (`shadow-raised`), accent (`bg-accent-soft`,
  at most one per screen). Radius `rounded-control` (10px, buttons and
  inputs) / `rounded-card` / `rounded-sheet`.
- Components live in `packages/ui` and appear on `/design` (Hebrew and
  English, any accent). Add a new component to the gallery in the same change.
  Built so far: Button, IconButton, TextField, PhoneField, Card, ListRow and
  ListGroup, Badge, Spinner, Stat, WeekStrip, AppShell, PageBody/PageHeader/
  PageSection.
- A business accent is applied with `accentStyle(accentTokens(hex))` on a
  wrapper. `accentTokens` darkens unreadable picks; text on light tints stays
  `text-ink`, never `text-accent`.
- Phone numbers are stored as E.164 (`normalizeIsraeliMobile` in
  `@domain/phone`); `PhoneField` submits that form through a hidden input.
- Touch targets at least 44px. Motion 150–200ms on state changes only.
- All user-facing copy in Hebrew; plain words, no exclamation marks.

## Layout: three devices, three layouts

- Breakpoints: phone < 768px (`md`), tablet 768–1279px, desktop ≥ 1280px (`xl`).
- `AppShell` (`@ui/app-shell`) gives each its navigation: bottom tab bar on
  phones, side rail on tablets, full sidebar on desktop. Same items, labels,
  icons and order everywhere. At most five items.
- Screens use `PageBody` + `PageHeader` (`@ui/page`). The page's main action
  goes in `PageHeader actions`: full width under the title on phones, inline
  from tablet up.
- Each screen chooses its own shape per device instead of shrinking one
  layout: phone = one thing at a time (a day, a list); tablet = two columns
  or a compact grid; desktop = the full picture (tables, extra columns).
  Render each shape and switch with `md:hidden` / `hidden md:block xl:hidden`
  / `hidden xl:block`. Data and wording stay identical across shapes.
- Living example: `/design/shell` (mock data). Check new screens at 390,
  820 and 1440px wide before handing them back.

## Easy for anyone

- One main action per screen, in the accent colour, named with a verb that
  says what happens ("פרסום הסידור", not "שמירה").
- Icons never stand alone: nav items have labels, icon buttons have a label
  and tooltip.
- Show status before it is asked for: counts and badges for what needs
  action ("2 משמרות חסרות עובד").
- Every empty screen says what to do next. Destructive actions offer undo
  rather than "are you sure".
- Acceptance test for a screen: the least technical person on the pilot's
  staff completes the task without help.

## Code rules

- No secrets in the repo, ever. Real keys live in `.env.local`, Vercel and
  Supabase settings. `.env.example` lists the names.
- Server-only writes (bookings, invite claims, punch codes, publishing) go
  through server code with the service role; the browser talks to Supabase
  under RLS only.
- Run `pnpm check` (Biome + typecheck) before handing work back; `pnpm build`
  for anything touching routing or config.
- Orel works on Windows PowerShell 5: when giving him commands, one per line,
  never chained with `&&`.

## Commands

```
pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # Biome + typecheck + unit tests
pnpm test         # unit tests only
pnpm build
pnpm lint:fix     # apply Biome fixes and formatting
```
