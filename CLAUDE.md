# ConceptApp v2 — working agreement

Read this before changing anything. Next.js version notes are in @AGENTS.md.
Nightly runs and live sessions also follow @docs/AGENT.md.

## What this is

The operations app for small Israeli businesses of every kind: staff scheduling,
time clock, lists and more. Set up for each business by the ConceptApp team from a
global template, with as little work per business as possible; run daily by managers
and staff on their phones. Hebrew first, RTL.

Plan and decisions: App Design Document and Business Model (links in the
ConceptApp project, `claude/v2-rebuild-plan.md`).

## Principles

1. Every kind of business, through global templates, with minimal work per business
   (Orel, 7 November 2026). Don't write anything new that assumes a restaurant:
   restaurants and cafés are only the first templates. The pilot's scope, by Orel's
   decision of 6 November 2026: scheduling, time clock, lists, a management page, and
   roles with different permissions. Reservations, storefront and notifications wait
   until after it. Nothing from the deferred list gets built before its trigger.
2. Types everywhere. TypeScript strict, Zod at every boundary, generated DB types.
3. Postgres with row-level security. Tenant isolation lives in the database
   and is covered by tests.
4. One design system, in code. Tokens in `app/globals.css`, components in
   `packages/ui`. No page-level CSS, no raw hex in components.
5. Small phases, each with a demo.
6. One system, and everything dynamic (Orel, 7 November 2026). What differs between
   businesses is data, easy to change without touching code: a business is a template
   plus settings, edited from a screen. When settings can't do it, a little new code for
   one business is fine, as a module in the same system that's switched on for it. Never
   a branch, a copy or a rebuild. A new setting is one field in the module's manifest, with
   `.meta()` for who edits it, and its words under `modules.<key>.settings` in the
   messages: `/manage` and the console then draw it (`@domain/settings-form`). A field
   only the team should touch takes `level: "team"`.

## Layout

```
app/                Next.js routes. Route groups: (admin) (app) (public) — added as they arrive
modules/<key>/      one folder per module, each exporting a typed manifest
packages/ui/        components + /design gallery          import "@ui/…"
packages/db/        schema, migrations, queries, RLS tests import "@db/…"
packages/domain/    pure logic with unit tests            import "@domain/…"
messages/           he.json + en.json: every user-facing string (next-intl)
i18n/               locale config and the next-intl request config
supabase/           CLI config, edge functions, seed data
tooling/            repo checks (layer boundaries, Hebrew literals, message parity) with their tests
```

Layer rules, enforced by Biome `noRestrictedImports` (per-folder overrides in
`biome.json`) and `tooling/boundaries.test.ts`, both part of `pnpm check`:
`packages/domain` imports no other layer and no framework; `packages/ui` and
`packages/db` import only `@domain`; `modules/<key>` reaches another module
only through `@modules/<other>/manifest` and its own files by relative path.
Only `app/` imports app code (`@/…`).

## UI rules

- `<html lang="he" dir="rtl">`. Use logical utilities only: `ps-`/`pe-`,
  `ms-`/`me-`, `start-`/`end-`, `text-start`. Never `pl-`, `mr-`, `left-`.
- `rtl:`/`ltr:` are redefined on CSS `:dir()` (see globals.css), so they follow
  the element's real direction even inside a nested `dir` block. Use
  `rtl:-scale-x-100` to mirror arrows and chevrons.
- Time, phone and number inputs get `dir="ltr"` plus `ltrInputClass` (from
  `@ui/text-field`), so digits read LTR but the field still aligns with the
  page. (`text-align: match-parent` would be neater but Chromium lacks it.)
- Colour only through tokens: `bg-bg` (page), `bg-surface` (cards), `bg-elevated`
  (cards in a sheet), `bg-surface-2` (fills), `bg-surface-3` (pressed), `border-line`
  (separators), `border-edge` (edges of controls), `text-ink`, `text-ink-2`,
  `text-ink-3` (placeholders only), `bg-accent`, `text-accent-ink`, `bg-accent-soft`,
  `text-success|warning|danger` with `bg-success-soft` and so on, `text-danger-ink`.
  Every token has light and dark values and follows the device, with no switch in the
  app. `bg-brand` is ConceptApp's own colour: admin console and marketing only.
- Type scale: `text-sm` 13 · `text-base` 15 · `text-md` 17 (body) · `text-lg` 20 ·
  `text-xl` 24 · `text-2xl` 34 (large titles). The device's font on Apple devices,
  Heebo everywhere else. Weights 400/500/600/700. Real content wraps; no `truncate`.
- Cards have no borders: `flat` (soft shadow, the default), `float` (lifted over what
  is under it), `accent` (`bg-accent-soft`) and `hero` (the business's colour, with
  depth), each of the last two at most once per screen. Radius `rounded-control` (14px,
  inputs) / `rounded-card` (24px) / `rounded-sheet` (36px); buttons are pills.
- `glass` is only for what floats above the content: the tab bar, the floating title
  and sheets. Never on cards or rows. It turns opaque when the device asks for less
  transparency or more contrast.
- Components live in `packages/ui` and appear on `/design` (Hebrew and
  English, any accent). Add a new component to the gallery in the same change.
  Built so far: Button, IconButton, TextField, PhoneField, CodeSlots, FieldGroup, FieldRow, Stepper, Switch,
  ChoiceList, ChoiceMenu, Segmented, Card, ListRow and ListGroup, PersonList, Badge, Avatar
  and AvatarStack, Tile, CoverageBar, ProgressRing, PunchCircle, Sheet, FloatingAction, FloatingDock,
  StatusToast, EmptyState, Ambient, Spinner, PageSkeleton, AppShellSkeleton, WeekStrip, AppShell, PageBody/PageHeader/
  PageSection, AccentPicker and AccentPreview, Logo and LogoMark.
- ConceptApp's logo (`@ui/logo`, files in `docs/brand`) appears only where
  ConceptApp itself speaks: sign-in, the console, marketing.
- A business accent is applied with `{...accentProps(accentTokens(hex))}` on a
  wrapper. `accentTokens` returns a pair for light and for dark, and darkens or lifts
  unreadable picks; text on light tints stays `text-ink`, never `text-accent`.
- Phone numbers are stored as E.164 (`normalizeIsraeliMobile` in
  `@domain/phone`); `PhoneField` submits that form through a hidden input.
- Touch targets at least 44px. Motion on state changes only: 150–200ms, or the spring
  (`ease-spring`, `pressable`) for what moves. Reduced motion turns it off.
- All user-facing copy in Hebrew; plain words, no exclamation marks.
- Copy lives in `messages/he.json` with its English twin in `messages/en.json`
  (same keys, same `{placeholders}`), read with next-intl's `useTranslations`
  / `getTranslations`. Keys are typed from `he.json`. `pnpm check` fails on a
  Hebrew string literal or JSX text in `app/`, `packages/ui` or `modules/`
  (`tooling/hebrew-literals.ts`; mock data files are listed there with a
  reason). Use ICU plurals for counts and `t.rich` with `<ltr>` for embedded
  times and numbers.

## Layout: three devices, three layouts

- Breakpoints: phone < 768px (`md`), tablet 768–1279px, desktop ≥ 1280px (`xl`).
- `AppShell` (`@ui/app-shell`) gives each its navigation: a floating glass tab bar on
  phones and tablets, which shrinks while scrolling down and follows a dragged finger,
  and a full sidebar on desktop. Same items, labels, icons and order everywhere. At
  most five items.
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
  rather than "are you sure". The one exception (Orel, 7 November 2026): what
  nothing can bring back, like the demo reset at `/enter`, asks once and says
  what goes.
- Acceptance test for a screen: the least technical person on the pilot's
  staff completes the task without help.

## Design language

The target is the example Orel approved on 6 November 2026:
`docs/design/target-prototype.html` (the same page: https://claude.ai/artifact/JydhY5gqSfeVikjr2hre2u).
A new or reworked screen should look like it belongs there: large rounded cards with
soft shadows, large titles, one business colour, glass only on what floats, and depth
through overlap. Bordered cards, stat tiles and rows of pills read as generic, so avoid
them.

For new ideas, Orel keeps React Bits: `docs/design/react-bits.md` says what fits which
screen and how to rebuild it here, without its libraries.

`.claude/skills/apple-design` (`dickwu/apple-design-skill` at `ff4ebdd`) is the
reference for reviews and conventions. This file wins where they differ. Never ship SF
font files or SF Symbols; asking the device for its own font is fine.

## Code rules

- No secrets in the repo, ever. Real keys live in `.env.local`, Vercel and
  Supabase settings. `.env.example` lists the names.
- Server-only writes (bookings, invite claims, punch codes, publishing) go
  through server code with the secret key (`SUPABASE_SECRET_KEY`); the browser
  uses the publishable key and talks to Supabase under RLS only.
- Sign-in has two doors (Orel, 8 November 2026), both on `/enter`: real sign-in with
  a phone number and an SMS code (Twilio Verify on the hosted project), and the demo,
  one press on a demo person, kept easy to reach. The demo door reaches only the
  demo people, with RLS unchanged, and anyone can come in and reset those businesses,
  so real people never join a demo business. `PASSIVE_SIGN_IN` in
  `@domain/passive-sign-in` closes the demo door.
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
pnpm test:db      # template checks against the local database (after db:start)
pnpm build
pnpm lint:fix     # apply Biome fixes and formatting
pnpm db:start     # local Postgres via Supabase CLI (Docker): migrations + seed
pnpm db:test      # pgTAP: RLS and tenant isolation
pnpm db:types     # regenerate packages/db/database.types.ts
pnpm exec supabase start   # full local stack incl. auth (needed for sign-in)
pnpm e2e          # Playwright at 390/820/1440 against `pnpm build` + local Supabase
```
