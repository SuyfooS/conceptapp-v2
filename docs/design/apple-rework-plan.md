# Apple-style design rework: plan and corrections

**Status: superseded on 6 November 2026.** Orel rejected the look this plan led to, and approved a different one: `docs/design/target-prototype.html`. Keep this document for its analysis of the screens, the accessibility findings and what will break in tests, not for its palette, tokens or order of work.

This is two documents: a plan, and an independent critique that checked it against the code. **Where they disagree, the corrections in part 1 win.** The plan in part 2 has not been rewritten to match them.

## Pilot scope changes this plan

Orel set the pilot on 6 November: scheduling, time clock, a management page, roles with different permissions, and lists (`docs/ROADMAP.md`). The plan predates that:

- **Tabs:** a manager gets היום, סידור, שעון, רשימות, ניהול, and a worker the same without ניהול. This replaces decision 3 and the tab model in R13: the clock stays a tab, because it has a history screen, and reservations and storefront are off.
- **Size:** use the trimmed 19 chunks from the critique ("Oversized"), not 27. Open one phase at a time, and stop for Orel after each (correction 2).
- **Not yet decided by Orel:** section 17, decisions 1, 2, 4 and 5.

## Part 1: Corrections, most serious first

**Verdict.** The token arithmetic holds and almost all code references are right. These parts fail:
- the schedule and the chunk mechanism
- numbers the plan never computed (tints and fills on `bg`)
- the signature element
- the tap claim

All contrast is recomputed with `packages/domain/color.ts:38-54`. Nothing was rendered and no Hebrew widths were measured. The repo is untouched.

### Blocking

**1. The timeline does not fit the pilot.**
- The plan gives 27 of about 49 nights to design and says the modules "need the rest". That leaves 22 nights for four modules, or 5.5 each.
- Scheduling took 12 runs (`docs/agent/LOG.md:77,456`), and 2d-2b is still open (`docs/AGENT.md:188`).
- 3 of 27 logged runs were stops or fixes (`LOG.md:567,675,911`), so 27 chunks take about 30 nights.
- One lost night per phase gate makes 35, ending 10 December. That leaves 14 nights for swaps plus four modules.
- Under Decision 1 the time clock starts about 2 December, not 26 November.

**2. The chunk mechanism contradicts the brief.**
- §14 says "Open each as an `orel` issue" and "Stop after each phase".
- `docs/AGENT.md:41-42,114-117` makes every open `orel` issue an instruction: "do all of it… as much as the night allows".
- `docs/AGENT.md:60` and `docs/agent/RUN_PROMPT.md` step 3 say never wait, and `:17` merges alone.
- So 27 issues mean neither one chunk a night nor any gate. §12 edits only widths and the backlog.
- Fix: open one phase's issues at a time, or have Orel add a hold rule to `docs/AGENT.md`.

**3. R4 is the largest chunk ever, and its "codemod" is not mechanical.**
- `text-base` has 2 production uses. The 15 to 17 jump actually happens at `app/globals.css:110`.
- 43 of 95 production `text-ink-2` lines and 31 of 47 `font-medium` lines have no size class, so they change invisibly to a codemod.
- The 86 production `text-sm` uses split between `subhead` (row subtitles, field labels) and `footnote` by judgment.
- 28 of 52 production `.tsx` files carry a size class. The largest of the last 14 chunks touched 25 files.
- Leftover `text-sm` silently becomes Tailwind's default, 14.875 px at root 17 (own knowledge). Add `--text-*: initial` to `@theme` plus a test.
- R3 fixes only `packages/ui`. 12 production `truncate`s stay until R14, R22 or R24 while text widens 13%: `team-view.tsx:99-100`, `team-availability-view.tsx:115,118,207,210`, `schedule-builder.tsx:453,522`, `admin/businesses/[slug]/page.tsx:288,291`, `new-business-form.tsx:385,401`.
- Split R4 into root and tokens, role migration, and font stack.

**4. The one accent card nearly vanishes on the new page colour.**
- 10% `accent-soft` on `#f1f2f4` is 1.00–1.06:1, with dE 0.012–0.023. On today's `#faf8f5` it is 1.05–1.12, dE 0.020–0.038.
- The plan calls dE 0.013 "identical" and sets its own threshold at 0.03. The Today card is below that for every preset, and `flat` cards lose their borders too.
- Fix for light: 16%. That gives 1.10–1.18 and dE 0.042–0.056 on presets (mustard 1.07, 0.032), ink at least 13.48, accent on tint at least 4.03 (mustard 3.11).
- Undisclosed inputs: the script uses 20% soft and 16% status tints in dark, but §2, §10 and §12 state neither, and `badge.tsx:14-16` uses `/10`. At 10%, dark soft against surface is 1.09–1.10, and at 20% it is 1.22–1.23. Make the percentage a token.

**5. Fills were reported only "on surface", and the worst cases were omitted.**
- `surface-2` on `bg` is 1.08 in light. `surface-2` on `elevated` is 1.08 in dark.
- Today's secondary border is 1.23 on the page. There are 21 production secondary buttons, for example `home/page.tsx:84`, which sits directly on the page.
- A track on `bg` is also 1.08, so a segmented control's track disappears. `hover:bg-surface-2` (9 sites) barely shows on `bg`.
- Bright kitchen: `color.md › Best practices` says "colors look darker and more muted", yet groups drop to 1.12 with no border.
- Increased contrast is "same" for all surfaces. `color.md › Best practices` asks for "a significantly higher amount of visual differentiation", and `liquid-glass.md › Review checklist` item 5 asks for "stronger fills and borders".
- Fix: add `border-edge` under increased contrast to Card, ListGroup and secondary Button. In light, consider `#d9dbe0` for `surface-2` (1.24 on `bg`, ink-2 5.92) with `surface-3` one step darker.
- Keep the border behind a token until it is judged on a mid-range Android.
- Meanwhile 16 production `border border-line` frames keep borders until R14–R24, while `Card` and `ListGroup` lose them in R3–R5.

**6. The week-strip signature fails on its first glance.**
- The empty track is 1.08 on `bg` (Home). The plan checked only fill on track, 4.99.
- The selected cell, today by default, has status marks on accent. Warning is 1.00–1.43 in light and 2.31–2.33 in dark. Danger is 1.08–1.32 and 1.82–1.84. `week-strip.tsx:59` already handles this case, and the new spec drops it.
- The fixed 72 px holds 56 + 8 at root 17, assuming footnote and headline roles. At root 34 it needs 104. R4's gate of "34 px root passes" comes six chunks before R10. Use a minimum height.
- Strip times are fixed at Apple's 11 pt floor, but the cited `typography.md › Conveying hierarchy` speaks only of tab titles.
- Fix: use words, not a 3 px track. `he.json:193` already has `חסר {count}`. Otherwise use ink on an `edge` track (4.62 light, 3.23 dark; edge on page 3.43 and 5.40).

**7. The signature shows wrong Shabbat times.**
- `week.ts:96-99` never passes `candleLightingMinutes`, so the default 20 applies (`shabbat.ts:18,30-34`).
- `create_business` takes no coordinates (`20261019000100_create_business.sql:7-14`), so wizard-created businesses get Tel Aviv times (`week.ts:91-95`).
- On 18 December 2026 Jerusalem's real time is 15:58 and Haifa's is 16:06, while the app shows 16:19 (`shabbat.test.ts:57,59,61`). That is 21 and 13 minutes late, on the home screen of a Shabbat-closed business.
- `closedOnShabbat` defaults to true, and nothing but `modules/scheduling/manifest.ts:29` and `week.ts:96` references it. "Off when false" therefore needs a database edit.
- Principle 6 means this must be a real setting. Fix data and setting before R10.

**8. The headline "183 to 75 taps" is not like for like.**
- 183 is 44×4 + 7, which includes 88 taps for position selects. 75 excludes positions and adds 24 sheet taps that do not exist today.
- Without positions it is 95 to 75, down 21%.
- With positions it is 75 + 2 per person, for example 99 at 12 people. Without position reuse it is 163, down 11%.
- Reuse is a new behaviour with no chunk.
- "Copy from last week" (`he.json:184`, mock only) probably saves more than R14–R17 (own judgment).

**9. Sheets will lose the business colour.**
- Radix portals to `body` by default (own knowledge). That escapes the wrappers at `(app)/layout.tsx:92`, `(admin)/layout.tsx:78` and `gallery.tsx:105`.
- No portal exists yet: only `Slot` is imported, at `button.tsx:2`.
- `Done` and focus inside a sheet would fall back to `:root`, which is blue for everyone, and `.appearance-dark` would not reach it either.
- Fix: pass a Portal `container`, and test it in R6.

**10. Accent mechanics are inconsistent.**
- §3's table has four pairs (light, dark, increased contrast light and dark), so 8 variables. The plan says "three" and "six inline variables".
- `color.ts:15` keeps `INK = #1c1b19`, so mustard's dark ink is 4.63, not 4.78, unless the constant changes.
- The hue rotation has no direction. +15° gives `#b62900`, still dE 0.019 from danger and under the 0.03 trigger. −15° gives `#b71646`, dE 0.054.

**11. Android has no working path.**
- §2's opaque conditions are all false on stock Android Chrome, so it gets glass, contradicting §9 and §17.5. Gate glass positively, for example `@supports (-webkit-touch-callout: none)` (own knowledge).
- `@supports (font: -apple-system-body)` may also match desktop Safari and change its root size (own knowledge, verify). Use the same gate.
- Tailwind's preflight also sets `-webkit-text-size-adjust` (own knowledge), so removing `globals.css:105` may not be enough.
- There is no Android text-size mechanism, and `prefers-contrast` on Android is unverified. "200% tested" is a synthetic root only.

### High and medium

**12. Desktop.**
- `body` 15 sits below `callout` 16 and equals `subhead` 15, which inverts the scale. Delete the override.
- A bottom `ActionBar` at 1280+ conflicts with `layout.md › Desktop (macOS)` and `SKILL.md › Lens 2`. Move it to the bar's trailing edge there (`toolbars.md › Actions`).

**13. Wrapping.**
- The 420 px ListRow threshold catches every phone: the container is 358 at 390 and 398 at 430. It also contradicts the §5 wireframes.
- Use a rem threshold such as `@[19rem]` (323 at root 17, 646 at root 34).
- `button.tsx:9` also has `shrink-0`, so removing `whitespace-nowrap` alone will not wrap.

**14. Manifests and principle 6.**
- `moduleWidgets` is derived from `moduleNav` (`modules.ts:157`). `nav.tab: false` or a cap of 2 can silently drop the clock card.
- `MAX_MODULE_NAV` is at `:44`, not `:45`.
- Today must stay manifest-driven (`home/page.tsx:35`). The plan has no state for scheduling off.
- Task paths belong in manifests rather than a central list, since future modules will add tasks (own judgment).

**15. Test claims.**
- `e2e/sign-in.spec.ts:75` clicks sign-out on `/home`, so it breaks in R18. §13 says it inherits.
- 4 of 10 `/design/shell` pages are mocks: home, schedule, reservations, more.
- `/home`, `/schedule`, `/sign-in`, `/join` and `/admin*` never run at root 34, so §15's "200% tested" is overstated.

**16. Keyboard and sheets.**
- `cross-platform.md › Conventions to check` names keyboard avoidance. §5 and §13 omit it.
- "Always in view" is false while typing in `/team/invite`, `/admin/new` or availability time fields.
- "About 100 lines" for detents, drag, focus and back handling is not credible (own judgment), and R6 has one night.

**17. Landscape phone.** 844×390 counts as tablet. A task frame leaves 253 px, or 181 with a sticky strip. `layout.md › Size classes` requires considering all combinations. Add a height rule.

**18. Accent budget versus code.**
- `Badge tone="accent"` has 4 production sites (`schedule/page.tsx:120`, `my-shifts-view.tsx:126,224,402`), and `admin/businesses/[slug]/page.tsx:87` uses an accent card.
- The §12 rewrite bans these, while §10 keeps the tone.
- `branding.md › Best practices` permits status badges, so decide.

**19. Copy.**
- "2/3" and "1/4" read as dates in Israel (own judgment). Dates here are `d.m` (`availability-form.ts:174`). Use words.
- The legend's "Orders" shows `הזמנות` (`he.json:640`) is ambiguous in a restaurant for a reservations module.

**20. Three layouts.**
- "Who is on today" appears only on tablet, against `CLAUDE.md:104`, which §12 keeps.
- There are no desktop wireframes.

**21. Rule conflicts left open.**
- `CLAUDE.md:110` still requires one main action, but Today has none. Change it to "at most one".
- Rewritten `:81` has no exemption for the 41.1 px strip cell at 320.
- `IconButton` stays 44, below the 48 dp in `cross-platform.md › Conventions to check`.
- `liquid-glass.md › Review checklist` item 6 (edge fade) is unaddressed.

**22. Tailwind.**
- Roles work. But `@theme inline` inlines values (own knowledge), so a media-query `--text-body` needs a runtime variable, as `--color-*` does at `globals.css:47-50`.
- The root change also moves `max-w-xl` (13 uses) from 576 to 612 and `max-w-7xl` from 1280 to 1360.
- `app-shell.tsx:169`'s `4rem` becomes 68, and 136 at root 34.

**23. Font decision.**
- The Accessibility row does not separate the fonts on the web. §4's `-apple-system-body` hook is family-independent, and §9 admits there is no Bold Text signal.
- What remains is the look on iPhone, against a face CI never renders.
- "Skip Heebo on Apple" needs no code (`app/layout.tsx:4` has no preload; own knowledge).

**24. Motion.** 6 × 40 = 240 ms leaves under 60 ms for each settle, so the moment is invisible or breaks its own limit.

**25. Low-level status and fill figures.**
- `surface-3` under status text is below 4.5: light warning 4.37, success 4.44; dark danger 4.43.
- Status at 13 px misses the cited 7:1 aim (6.06–6.54 on surface).
- Dark accent press falls to 1.77–1.78 on `surface-2`.
- The 19.0% figure is not in `plan-tokens3.mjs`. I get 16.2–19.7% by grid step.

### Citations and legal

- `toolbars.md › Titles` says "under 15", so `סידור לשבוע הבא` at 15 is over, not at the limit.
- `liquid-glass.md › Tauri and Electron` mentions macOS and Linux webviews, not iPhones. Label that inference as judgment.
- `SKILL.md › Lens 3`'s template is "warm cream with a high-contrast serif and a terracotta accent". The app matches one of three parts.
- `#f1f2f4` versus `#f2f2f7` (Apple's value from own knowledge) is dE 0.0044, so §8's "own steel" is not a real departure.
- `sidebars.md › Desktop` warns against the bottom of a sidebar, where the user block sits (`app-shell.tsx:108`).
- "2 px extra leading" is +2 on 2 rows, +1 on 3 and 0 on the rest. Apple's Title 3 is 20/25.
- The embed quote is verbatim and the SF Symbols reading is accurate. `branding.md` says "app name or images", so "marketing" is the plan's extension.
- `sf-symbols.md`'s prohibition covers app icons, logos and trademarked use. Keep hand-drawn glyphs untraced, and keep `app/icon.svg` clear of symbols.
- `icons.md`, `app-icons.md` and `sf-symbols.md` warn on hardware replicas, which matters for gallery phone frames.
- The references only link the actual terms, so the plan's legal call stays judgment.
- The repo is private, per `gh`. Keep the verbatim HIG pages out of anything public (own judgment).

### Oversized

| Item | Correction |
|---|---|
| 10 type roles | 6. `title-1`'s only production source that survives the plan is `stat.tsx:29` (deleted, along with `app/page.tsx:26`). `text-lg` has 1 use. `callout` and `caption` have no named consumers |
| `nearStatus` rotation | Delete it and keep the wizard warning. The collision is light-only (dark nearest is at least 0.159). `variant="danger"` is only at `gallery.tsx:215`, and real delete is ghost (`schedule-builder.tsx:504`) |
| Accent increased-contrast pairs | Defer, going from 8 variables to 4. This is a trade-off against `color.md › Best practices`; neutrals and status keep theirs |
| Sheet | Large detent first. `sheets.md › Mobile` only says "consider" medium |
| R17 | A feature, not design. Autosave also collides with the clash block at `schedule-builder.tsx:244-249` |
| R16, R22, R24–R27 | After the pilot. Merge R8 and R9 down to `error.tsx`, `SelectField` and `TimeField` |

Result: 27 chunks become about 19, about 24 nights with losses and three gates, ending about 29 November. That leaves about 25 nights for swaps plus four modules, still under half of scheduling's rate per module. Orel must also choose which modules the pilot needs.

### Call sites

| Class | All | Production (excluding `app/design`) |
|---|---:|---:|
| `text-sm` | 106 | 86 |
| `text-base` | 3 | 2 |
| `text-md` | 12 | 9 |
| `text-lg` | 3 | 1 |
| `text-xl` | 7 | 6 |
| `text-2xl` | 8 | 6 |
| `text-[Npx]` | 5 | 3 |
| `rounded-card` | 20 | 18 |
| `rounded-control` | 14 | 13 |
| `rounded-sheet` | 0 | 0 |
| `bg-surface` | 31 | 26 |
| `bg-surface-2` | 31 | 21 |
| `border-line` | 50 | 40 (22 frames, 18 separators) |
| `divide-line` | 11 | 11 |
| `shadow-raised` | 2 | 2 |
| `font-bold` | 33 | 26 |
| `font-medium` | 56 | 47 |
| `text-white` | 2 | 2 |
| `text-accent` | 3 | 3 |
| `truncate` | 19 | 17 |

`accentStyle` has 4 importers, not 5.

### Confirmed correct

- Every §2 and §3 ratio, and the status-tint minimums, recompute correctly given the undisclosed 16% and 20% inputs.
- Bar figures hold: 85% gives 5.81 and 5.42, 80% gives 4.49. Strip widths and the 3.64 floor also hold.
- 12 shifts and 44 slots are right. So are `lg` 19, `raised` 10, `leading=` 12, `PageHeader` 17, 33 relative-import files, 40 role and 13 label calls, and 31 heading uses.
- Axe runs in all 13 specs.
- E2e budget is fine: 9.4 of 20 minutes, Playwright 6.7.

### Not verified

- tailwind-merge and preflight behaviour, because `node_modules` is absent
- `--text-*: initial`
- the `@supports` gates
- Radix portal defaults
- Android `prefers-contrast`
- Hebrew widths
- the deferred list (`CLAUDE.md:19`), which is not in the repo, so R27's manifest stays an open risk

## Part 2: The plan

**How the numbers were made.**
- Nothing was rendered, because `node_modules` is absent. Contrast is computed from hex values with the formula in `packages/domain/color.ts:38-54`. Sizes are class arithmetic.
- Hebrew widths were not measured. A Google sign-in popup open in the browser pane paused scripting, and I left it alone. Heights and tap counts come from the screens review and are marked as such.

**Citations.** HIG citations are paraphrased as `file.md › Heading`. Anything else is marked (judgment).

### 1. Ground it in the product

ConceptApp runs small Israeli restaurants and cafés: who works when, and later the clock, reservations and a public page. Three people decide this plan.

| Person | Situation | Single job |
|---|---|---|
| Worker | Phone in one hand, mid-service, about 20 seconds (judgment) | When do I work next, and what do I owe the manager |
| Manager | Building next week: 12 shifts and 44 slots in the restaurant template (`supabase/migrations/20261017000100_templates.sql:29-32`) | Fill the week and publish it. Today that is 183 taps, with Publish about 1,583 px down (review arithmetic) |
| Least technical staff member | The acceptance test in `CLAUDE.md:118-119` | Finish without help |

**Visual world.** A restaurant's week is one printed sheet taped near the kitchen door, starting Sunday at the right, with names in marker. Its other materials are steel and white order tickets. So the page is cool steel grey, content sits on white, and the only colour is the business's own.

The current `#faf8f5` with burgundy (`app/globals.css:24,34`) sits close to the warm-cream look that `SKILL.md › Lens 3` calls a generated default. The burgundy is not even the real default, which is `#2563EB` (`supabase/migrations/20261013000100_tenancy.sql:31`).

**Thesis, kept.** A calm utility in Hebrew. The week is the hero and the business's colour is the only colour.

**The rule that resolves "Apple" against "this product".** Familiar components carry navigation and controls. Identity lives in the accent, the week and the Hebrew (`branding.md › Best practices`).

### 2. Token system (`app/globals.css`)

The values are mine, not Apple's. Apple's are images in `color.md › Specifications`, and `color.md › System colors` says not to hard-code them anyway.

| Token | Role | Light | Dark | Increased contrast L / D |
|---|---|---|---|---|
| `bg` | Page, grouped background | `#f1f2f4` | `#0e0f11` | same |
| `surface` | Groups, cards | `#ffffff` (1.12 on bg) | `#1a1b1e` (1.11) | same |
| `elevated` new | Groups inside a sheet | `#ffffff` | `#25262a` (1.14 on surface) | same |
| `surface-2` | Fills, tracks | `#e8e9ed` (1.21) | `#2b2c31` (1.24) | same |
| `surface-3` new | Pressed | `#d9dbe0` | `#3a3b41` | same |
| `accent` | Business colour | `#2563eb` fallback | `#2d6cf4` | see section 3 |

The sheet background is `bg` in light and `surface` in dark (`dark-mode.md › Mobile`).

| Foreground | Light hex | On surface / bg / surface-2 | Dark hex | On surface / elevated / surface-2 | IC light (on surface) | IC dark (on surface) |
|---|---|---|---|---|---|---|
| `ink` | `#17181b` | 17.75 / 15.85 / 14.63 | `#f3f4f6` | 15.65 / 13.73 / 12.66 | `#000000` 21.00 | `#ffffff` 17.22 |
| `ink-2` | `#4c4f56` | 8.20 / 7.32 / 6.76 | `#b5b7bd` | 8.59 / 7.54 / 6.95 | `#33353a` 12.27 | `#d6d8dd` 12.08 |
| `ink-3` new (placeholder only) | `#6b6e75` | 5.11 / 4.56 / 4.21 | `#94979e` | 5.89 / 5.17 / 4.76 | `#4c4f56` 8.20 | `#b5b7bd` 8.59 |
| `success` | `#1c6f46` | 6.16 / 5.50 / 5.07 | `#4fc48c` | 7.88 / 6.91 / 6.37 | `#145a38` 8.24 | `#7fdcae` 10.46 |
| `warning` | `#8f5500` | 6.06 / 5.41 / 4.99 | `#e8ad58` | 8.65 / 7.59 / 7.00 | `#6f4200` 8.55 | `#f3c987` 11.08 |
| `danger` | `#b3261e` | 6.54 / 5.84 / 5.39 | `#ff7b72` | 6.83 / 5.99 / 5.53 | `#8e1c15` 9.02 | `#ffa39c` 9.00 |
| `edge` new (field boundary) | `#7f828a` | 3.84 / 3.43 / 3.17 | `#85888f` | 4.85 / 4.26 / 3.92 | `#5a5d64` 6.59 | `#a5a8af` 7.23 |
| `line` (separators only) | `#dcdee3` | 1.35 / 1.20 / 1.11 | `#33353a` | 1.40 / 1.23 / 1.14 | `#7f828a` 3.84 | `#85888f` 4.85 |

`danger-ink` (new) is `#ffffff` on danger at 6.54 in light and `#17181b` at 7.04 in dark.

**Rules that follow from the numbers.**
- `ink-2` meets the 7:1 aim for small custom text on `bg`, `surface` and `elevated` in both appearances (`dark-mode.md › Dark Mode colors`).
- `ink-3` never sits on `surface-2` (4.21).
- Status badges never sit on `surface-2`. On their own tint they reach 4.36 in light and 4.24 in dark there. They are 5.25 or more on `surface` and 4.70 or more on `bg` in light, and 5.28 or more on `surface` in dark.
- `edge` replaces `line` as the field border. That fixes the 1.30:1 finding (`packages/ui/text-field.tsx:7`). The 3:1 figure is WCAG 1.4.11.

**Bar material.**
- Token: `--bar: color-mix(in srgb, var(--surface) 85%, transparent)`, plus `backdrop-filter: blur(24px) saturate(1.4)` with the `-webkit-` prefix.
- At 85% fill, `ink-2` over solid worst-case content is 5.81 in light and 5.42 in dark. At rest it is 8.06 and 8.77.
- At 80%, dark drops to 4.49 and fails. The skill's 60-80% is only a starting point, so 85% is the pick.
- Glass goes on the tab bar, the navigation bar when scrolled, and sheet chrome. Nowhere else (`materials.md › Liquid Glass`, `liquid-glass.md › Review checklist`).
- Opaque under `@supports not`, `prefers-contrast: more` and `prefers-reduced-transparency`. iPhones send no reduced-transparency signal (`liquid-glass.md › Tauri and Electron`), so the fill must stay legible with no blur, which 85% does.

**Other tokens (judgment, the skill gives no numbers).**
- `--radius-control` 12, `--radius-card` 16, `--radius-sheet` 24.
- `--shadow-raised` becomes `--shadow-float`, used on floating layers only and dropped in dark.
- `--spacing: 4px` (see section 4).

**Also needed.**
- `color-scheme: light dark` on `:root`.
- Two `themeColor` entries (`app/layout.tsx:21`).
- `accent-soft` mixes with `var(--surface)` instead of `white` (`app/globals.css:57`).
- `text-white` becomes `text-danger-ink` (`packages/ui/button.tsx:22`, `packages/ui/app-shell.tsx:40`).
- Follow the system appearance with no in-app switch (`dark-mode.md › Best practices`). A `.appearance-dark` class exists for the `/design` gallery only, so Orel can see both side by side on one phone.

### 3. The business accent

Per-business accents survive unchanged in the database. `accentTokens` (`packages/domain/color.ts:88-106`) grows from one pair to three.

| Tier | Rule | Method |
|---|---|---|
| Light | 3:1 on `bg`, `surface`, `surface-2`, ink 4.5:1. The floor is 3.64:1 on white, up from 3:1 (`color.ts:84`) | Darken, as today |
| Dark | 3:1 on all dark surfaces, ink 4.5:1 | Raise OKLab lightness and keep hue and chroma. A plain mix to white turned burgundy into dusty `#b2707a`; this gives `#bc535d` |
| Increased contrast | 4.5:1 on `surface-2`, ink 7:1 | Same methods |

| Preset | Light hex (ink, lowest surface) | Dark hex (ink, lowest surface) | IC light | IC dark (dark ink) | Nearest status, dE |
|---|---|---|---|---|---|
| blue, default | `#2563eb` (5.17, 4.26) | `#2d6cf4` (4.60, 3.03) | `#104cd3` | `#61a5ff` | 0.270 |
| teal | `#0f766e` (5.47, 4.51) | `#23827a` (4.62, 3.02) | `#00645d` | `#5ab2a9` | 0.058 success |
| green | `#15803d` (5.02, 4.13) | `#1f8643` (4.62, 3.02) | `#006725` | `#56b670` | 0.059 success |
| orange | `#c2410c` (5.18, 4.27) | `#cb4a1a` (4.63, 3.01) | `#a92800` | `#ff7d51` | 0.060 danger |
| burgundy, replaces red | `#8b2635` (8.65, 7.13) | `#bc535d` (4.63, 3.01) | `#8b2635` | `#f1828a` | 0.088 danger |
| pink | `#be185d` (6.04, 4.98) | `#d5356f` (4.60, 3.03) | `#b10053` | `#ff74a6` | 0.087 danger |
| purple | `#7c3aed` (5.70, 4.70) | `#894cfe` (4.64, 3.00) | `#6f25dc` | `#bf8bff` | 0.321 |
| brown | `#92400e` (7.09, 5.84) | `#b35e32` (4.60, 3.03) | `#92400e` | `#e68c60` | 0.053 warning |

Dark keeps white ink on all eight, with hue shift under 0.35°. A custom pick also works: mustard `#e0a800` becomes `#a87e00` with dark ink at 4.78 and 3.06 on `surface-2`. Over a coarse RGB grid, 19.0% of colours the old rule accepts fall under 3:1 on the new `surface-2`, and the new floor catches them.

**Red goes.** `#b91c1c` against danger is dE 0.013, so the primary button, delete and the count badge look identical (`color.md › Best practices`). Burgundy takes its slot in `ACCENT_PRESETS`. The message keys change in `messages/he.json:733` and its `en.json` twin.

**`nearStatus` (thresholds are judgment).** Under dE 0.03, rotate hue 15° and set `adjusted`. Under 0.05, warn in the wizard. The review's 0.08 would have flagged four of our own presets. Teal, green, orange and brown stay because status always carries words (`accessibility.md › Vision`).

**Applying it.** `accentProps(tokens)` returns `{ style, "data-accent": "" }`, with six inline variables. `[data-accent]` rules in `globals.css` choose by media query. Inline `light-dark()` would be shorter but raises the browser floor to Safari 17.5, which would leave phones stuck on iOS 16 behind (my knowledge of browser support, verify).

**Budget (`branding.md › Best practices`, `color.md › Liquid Glass color`).** Accent appears on:
- the main action
- the selected tab icon
- the selected WeekStrip cell
- the focus ring
- one `accent-soft` card per screen

It is removed from the sidebar and rail logo tile (`app-shell.tsx:69-74,124-129`) and from "today" in the team schedule (`my-shifts-view.tsx:354`). Text on tints stays `ink`.

### 4. Type

**Decision: system font on Apple devices, Heebo everywhere else.**

`--font-sans: -apple-system, BlinkMacSystemFont, "Heebo Variable", ui-sans-serif, sans-serif` replaces `app/globals.css:76`. I avoid `system-ui` so Android and Windows keep Heebo.

| Ground | Finding |
|---|---|
| Hebrew coverage | SF Hebrew is part of the system family (`typography.md › Using system fonts`). Heebo is built for Hebrew (own knowledge) |
| iPhone | Only the system stack gives real SF and Apple's optical sizing. Heebo's Latin is Roboto (own knowledge), so it never reads as Apple |
| Android | The system fallback for Hebrew varies by vendor (own knowledge). Heebo is one known face and already feels at home there |
| Accessibility | System fonts answer Dynamic Type and Bold Text; custom fonts must do it themselves (`typography.md › Using custom fonts`). `branding.md › Best practices` leans the same way for body text |
| Cost | Two sets of metrics. CI cannot test SF, because Playwright WebKit on Linux has no SF (own knowledge). The wrapping work in R3 absorbs the difference; iPhone checks are by hand. Apple devices should skip downloading Heebo (own knowledge) |

**May Apple's fonts and symbols be used?** Not as shipped assets.
- `typography.md › Using system fonts` says, in a developer note, "don't embed system fonts in your app or game."
- `sf-symbols.md` (intro) tells you to understand the SF Symbols terms and names a prohibition on symbols, or confusingly similar images, in app icons, logos and trademarked use.
- Neither page mentions the web or Android (I searched both).

*My legal judgment, not legal advice, and I have not read the licences:* asking a device for its own font with `-apple-system` ships nothing and is fine. Self-hosting SF files, or exporting SF Symbols as SVG into a web app that also runs on Android, is not safe to assume. So Lucide stays. Also keep Apple's names out of the product and marketing (`branding.md › Best practices`).

**Scale.** Apple's default row (`typography.md › Specifications`) with 2 px of extra leading on text styles for Hebrew (judgment, test on device). Utilities are `text-<role>`.

| Role | Size/leading, weight | Replaces |
|---|---|---|
| `large-title` | 34/41, 700, tab roots only | `text-xl`/`2xl` in `page.tsx:34` |
| `title-1` | 28/34, 700 | `text-2xl` (Stat numbers go) |
| `title-2` | 22/28, 700 | `text-xl` |
| `title-3` | 20/26, 600 | `text-lg` |
| `headline` | 17/24, 600 | `font-bold text-md` |
| `body` | 17/24, 400 | `text-base` (15 today) |
| `callout` | 16/22, 400 | new |
| `subhead` | 15/21, 400 | row subtitles, field labels |
| `footnote` | 13/18, 400 | `text-sm` |
| `caption` | 12/16, 400 | new |
| Fixed px | Tab label 12, count 11, strip time 11 | `typography.md › Conveying hierarchy` accepts tabs not growing |

Add weight 600. At 1280 px and up with `pointer: fine`, `body` drops to 15 (judgment). The pointer condition keeps a 1366 px iPad at 17. Fields use `max(16px, var(--text-body))`, which stops iOS focus zoom (own knowledge, verify).

**Text-size mechanism.**
- `html { font-size: 106.25% }`, so 1rem is Body at 17.
- Under `@supports (font: -apple-system-body)`: `html { font: -apple-system-body }` and `body { font-family: var(--font-sans) }`. iPhone Larger Text then reaches rem (own knowledge, verify).
- Sizes are in rem with unitless leading. `--spacing: 4px`, so gutters do not balloon when text grows.
- Icons in rows use `em` (`typography.md › Supporting Dynamic Type`). Titles cap with `min(2rem, 48px)`.
- 200% means a 34 px root, close to AX2 Body at 33 (`accessibility.md › Vision`).
- Test whether `-webkit-text-size-adjust: 100%` (`globals.css:105`) blocks Android Chrome's scaling (unverified).

**A gotcha that fails silently.** `cn` is plain `twMerge` (`packages/ui/cn.ts:9`). It likely reads `text-footnote` as a colour and drops it beside `text-ink` (own knowledge of tailwind-merge). R4 must use `extendTailwindMerge` with the new sizes and add a test.

No global +2 pt for Hebrew: `right-to-left.md › Controls` applies it only beside Latin capitals, which are rare here.

### 5. Layout

**One sentence.** Tab roots show what needs you, tasks that can lose work take over the screen with one action at the bottom, and every screen that has a week shows the same week.

**Navigation by space (`layout.md › Size classes`).**
- Phone: bottom tab bar.
- 768-1279 px: one bar at the top holding tabs and the view's controls (`tab-bars.md › Tablet`, `toolbars.md › Tablet`). The 88 px rail goes, so content gains 88 px and the landscape-phone clipping finding disappears.
- 1280 px and up: sidebar.

**The task rule, the plan's biggest simplification.** A task that can lose work opens in `TaskFrame`: no tab bar, close at the leading edge, main action in a bottom `ActionBar`.
- `tab-bars.md › Best practices` allows a modal to cover the tab bar, and `toolbars.md` (intro) allows a bottom toolbar. The review's invented "bar pinned above the tab bar" is no longer needed.
- It also removes the tab tap that silently loses work.
- Applies to `/schedule/build`, `/schedule/availability`, `/team/invite`, `/admin/new`.
- Implementation: `AppShell` takes an exact list of task paths and does not render its nav there. It is already SSR-safe through `usePathname`. I rejected route groups because 33 files under `app/(app)` use relative imports.

Drawings use English so they survive bidi rendering, but positions are real RTL: start is the right edge and Sunday is rightmost. Back points right, and row chevrons point left (`right-to-left.md › Controls`).

Legend: Today היום, Schedule סידור, Orders הזמנות, Team צוות, Business עסק, Publish schedule פרסום הסידור, Needs you דורש פעולה.

**Home, phone 390, worker** (a manager also gets missing answers, swaps to approve and short shifts, and five tabs)
```
+--------------------------------------------+
| (N)                                  Today |  account button; large title 34/41
|                       Sun 1 Nov - Cafe Noa |  subhead 15/21, ink-2
|                                            |
|  Sat   Fri   Thu   Wed   Tue   Mon  [Tdy]  |  WeekStrip, cell 51x72
|   7     6     5     4     3     2   [ 1 ]  |
| 17:24 16:26                                |  havdalah, candle lighting, 11px
|         ::          ::          ::   [::]  |  :: = you have a shift
|                                            |
| .----------------------------------------. |
| | <                 Next: Morning, today | |  the one accent-soft card, text in ink
| |                09:00-16:00 - Bartender | |
| |                         With Noa, Itay | |
| '----------------------------------------' |
|                                            |
|                                  Needs you |  headline 17/24
| .----------------------------------------. |
| | <              Availability, next week | |  row 17/24, wraps, never truncates
| |                          Due Wed 18:00 | |  15/21 ink-2
| |----------------------------------------| |
| | <                      A shift to take | |
| |                      Thu evening 16:00 | |
| '----------------------------------------' |
+============================================+
|     Orders       Schedule      [Today]     |  56 + safe area; filled glyph when selected
+============================================+
```

**Home, tablet 820**
```
+------------------------------------------------------------------------------+
| (N)              Business  Team  Orders  Schedule  [Today]                   |  icon beside label
+------------------------------------------------------------------------------+
|                                                                        Today |  large title
|                                                         Sun 1 Nov - Cafe Noa |
|                                                                              |
|    Sat        Fri        Thu        Wed        Tue        Mon      [Today]   |  same strip, cell 110
|     7          6          5          4          3          2        [ 1 ]    |
|   17:24      16:26                                                           |
|               ::                    ::                    ::        [::]     |
|                                                                              |
|  Who is on today                                      < Next: Morning, today |  start column on the right
|  .---------------------------------.                 09:00-16:00 - Bartender |
|  | Morning  Noa, Itay, Yoav        |                          With Noa, Itay |
|  | Evening  Shiran                 |                                         |
|  '---------------------------------'                               Needs you |
|                                                    < Availability, next week |
|                                                                Due Wed 18:00 |
+------------------------------------------------------------------------------+
```

**Schedule day, phone 390: the manager's task.** The worker's day is the same strip with rows of who works.
```
+============================================+
| [...]           Next week              [X] |  X leading, ... trailing; no tab bar
|  Sat   Fri   Thu   Wed   Tue   Mon  [Sun]  |  strip sticks under the bar
|   7     6     5     4     3     2   [ 1 ]  |
| 17:24 16:26                                |
|   --    --    --    --    --    --  [==.]  |  coverage fills from the right
+============================================+
|                              Sunday, 1 Nov |  first row near y 174, was 332
| .----------------------------------------. |
| | < 2/3              Morning 09:00-16:00 | |  row opens the shift sheet
| |                  Noa, Itay - 1 missing | |
| |----------------------------------------| |
| | < 1/4              Evening 16:00-23:30 | |
| |                     Shiran - 3 missing | |
| '----------------------------------------' |
|                                + Add shift |  plain, 48 high
+============================================+
| [ Publish schedule ]        6 shifts short |  always in view, was about 1,583 px down
+============================================+
```

**Shift sheet, phone** (medium and large, `sheets.md › Mobile`). A swipe with changes asks through an action sheet.
```
+============================================+
|                     __                     |  grabber
| [Done]         Morning, Sun       [Cancel] |  Cancel leading, Done trailing
+--------------------------------------------+
|                          On this shift 2/3 |
| (x)  [Waiter v]                  Noa Cohen |  native select as pop-up
| (x)  [Cook   v]                  Itay Levi |
|                                  Available |  one tap adds, sheet stays open
| +  09:00-17:00                   Yoav Levi |
|                              No answer yet |
| +                              Shiran Amar |
|                           On another shift |  shown, not addable, reason in words
|     Evening                    Dana Peretz |
+--------------------------------------------+
|<                   Hours and people needed |  Stepper with a field
|                               Delete shift |  danger text and trash icon, then undo
+============================================+
```
Taps: 12 x 2 sheet open/close + 44 adds + 6 days + publish = 75, plus up to 2 per person for a first position (review's estimate, reusing the position already chosen in this draft). Today it is 183. Copy from last week is a separate feature and would cut it further; it exists only in mock copy (`messages/he.json:184`).

**Schedule day, tablet 820: the whole week.** A cell opens a centred form sheet (`sheets.md › Mobile`). Desktop adds a people-and-hours panel (`hidden xl:block`).
```
+==============================================================================+
| [...]                       Next week's schedule                         [X] |
+==============================================================================+
|   Sat     Fri     Thu     Wed     Tue     Mon     Sun                 Shift  |  header cells are the strip
|    7       6       5       4       3       2      [1]                        |
|  17:24   16:26                                                               |
|   ---     ==.     ===     ==.     ===     ==.     ==.                        |
+------------------------------------------------------------------------------+
|    -      2/3     3/3     2/3     3/3     2/3     2/3         Morning 09-16  |  cell 94: count, names, +n
|           Noa     Noa     Itay    Noa     Noa     Noa                        |
|           Itay    Itay    Dana    Itay    Dana    Itay                       |
+------------------------------------------------------------------------------+
|    -       -      4/4     3/4     4/4     3/4     1/4         Evening 16-23  |  - = no shift that day
|                   Yoav    Yoav    Yoav    Yoav    Shiran                     |
|                   +3      +2      +3      +2                                 |
+------------------------------------------------------------------------------+
|   1/4      -       -       -       -       -       -          Night          |
|                                                                 + Add shift  |
+==============================================================================+
| [ Publish schedule ]                         8 shifts short  -  saved 14:02  |
+==============================================================================+
```
Cell width: (820 - 48 - 110) / 7 = 94.6 px. On desktop this matrix also removes the 41 px card overflow at 1280.

### 6. The signature: the week strip

The element is one `WeekStrip`, Sunday at the right, in the same shape on every screen that has a week: Today, My shifts, team schedule, availability and the builder. It is the printed sheet from the kitchen door, in one line.

**What only this product can put in it:**
- For a business closed on Shabbat, the Friday and Saturday cells carry that week's candle-lighting and havdalah times, for example 16:26 and 17:24 (`availability-form.test.ts:12-19`). Those two times end Friday's last shift and open Saturday night, so they are working data, not decoration. Off when `closedOnShabbat` is false (`app/(app)/schedule/week.ts:96-117`).
- For a manager, a 3 px coverage track that fills from the start edge (`right-to-left.md › Controls`). Short is `warning` at 4.99 on the track, and a clash adds a `danger` mark and a spoken label.
- Today's first line reads היום in words, which also fixes "today by colour alone". The cell's label is spoken in full, for example day, date and "6 of 12 places filled".

Size: 72 px high, gap 0, width (w - 32) / 7. That is 51.1 px at 390, 46.9 at 360 and 41.1 at 320. Only 320 is under 44, and it stays above the 28 pt minimum (`accessibility.md › Mobility`).

Everything else stays quiet (`SKILL.md › Lens 3`, spend boldness in one place).

### 7. Motion

- State changes: 150 ms colour only, no scale (`motion.md › Providing feedback`). `active:` gets added everywhere (`buttons.md › Best practices`).
- Sheets: present in 280 ms with `--ease-calm`, dismiss in 200 ms, dim fade 200 ms (values are judgment). Cancellable by drag.
- Large title to bar title: a 150 ms fade driven by one scroll sentinel, which also turns the bar's material on.
- **One orchestrated moment:** on publish, the seven coverage tracks settle one after another from Sunday, 40 ms apart and under 300 ms in total, then הסידור פורסם appears. It happens about once a week, so it is not a frequent interaction, and it blocks nothing. The status text carries the meaning, so motion stays optional (`motion.md › Best practices`). This is the app's one defining moment (`design-principles.md › Delight`).
- Reduced motion: slides become fades and the publish moment drops out (`accessibility.md › Cognitive`). Exempt the spinner from the safety net (`globals.css:117-128`), with a slow opacity pulse instead (`progress-indicators.md › Best practices`).
- No page transitions, no custom edge gestures (`gestures.md › Custom gestures`), and no haptics.

### 8. Critique of the plan against generic defaults

Would this plan fit any brief that says "make it Apple"? My first pass would have: `#f2f2f7`, white groups, blue, large titles, a capsule, glass, and a sheet for everything.

| Default in the first pass | Problem | Revision |
|---|---|---|
| Copy Apple's greys | Provenance we cannot cite and should not hard-code (`color.md › System colors`). It is also just Settings.app | Own steel neutrals, tuned so `ink-2` passes 7:1 on `bg` |
| Large title everywhere | At 34/41 it pushes the builder's work down again | Tab roots only. Tasks and sub-screens get a 17 px bar title |
| Main action top trailing, as Apple does | A top-corner action is out of thumb reach (`designing-for-ios.md › Best practices`), and `CLAUDE.md:97-99` is wrong the same way | Quick actions on the bar. Tasks use a bottom `ActionBar` (`toolbars.md` intro and `› Actions`) |
| A sheet for everything | A week is a prolonged flow (`sheets.md › Best practices`, `modality.md › Best practices`) | Full-screen task, with a sheet only for one shift |
| A pinned bar above the tab bar (from the review) | Not an Apple pattern | Removed by the task rule |
| Floating capsule tab bar | In a Safari tab it stacks over the browser's own bottom bar (reviews, unverified) | Attached bar with a one-token switch. Orel judges on a phone (decision 5) |
| Glass at 60-80% everywhere | Fails at 12 px, costs Android, no iPhone signal | 85%, three surfaces, Apple devices first |
| Week strip as a generic calendar row | Apple Calendar has one too | Shabbat times, coverage and today in words make it this product's |

After the revision: navigation and controls still use the familiar components (`branding.md › Best practices`). What is specific is Sunday at the right, Shabbat times, coverage in Hebrew words, and the business's colour on exactly one action. A Tel Aviv café owner would recognise that as made for them. Keep it.

### 9. What does not translate to the web

| Apple | Web reality | Substitute |
|---|---|---|
| Liquid Glass | No refraction, morphing or adaptive luminance (`liquid-glass.md › Cross-platform translation`) | `backdrop-filter` at 85% |
| Dynamic Type, Bold Text | Partial WebKit hook for text size; no Bold Text signal (own knowledge) | rem plus `-apple-system-body`, 200% tests |
| SF fonts, SF Symbols | Not shippable (section 4) | System stack on Apple devices; Lucide plus 5 hand-drawn filled tab glyphs |
| Dynamic system colours | No API | CSS tokens in three appearances (`cross-platform.md › Vocabulary`) |
| Swipe back | Belongs to the browser | Visible Back button; no custom edge gesture |
| Sheet detents, grabber, swipe | Hand-written | Radix Dialog plus about 100 lines (estimate), always with buttons (`accessibility.md › Mobility`) |
| Row swipe actions | Clash with browser back (own judgment) | Tap, then action sheet |
| Haptics | No iOS web route (own judgment) | None |
| Menu bar, window chrome | Do not exist in a tab | Not applicable |
| Capitalisation, SF tracking | Not Hebrew | No letter-spacing |
| iPad tab-to-sidebar | Approximate | Fixed top bar, sidebar from 1280 |

**Android, stated explicitly (`cross-platform.md › Conventions to check`).** One shared tab bar, navigation bar, sheet and action sheet on both platforms. Native per OS for select, time and keyboard. Android's back button closes a sheet (own judgment; needs a history entry on open). Heebo. Opaque bars first (`liquid-glass.md › React Native`, applied to Chrome as my judgment).

### 10. `packages/ui` change list

| Component | Change |
|---|---|
| `cn.ts` | `extendTailwindMerge` with the new text sizes, plus a test |
| `button.tsx` | `min-h-12` replaces `h-11`; remove `whitespace-nowrap`. `lg` first aliases `md`, then goes (19 uses; `buttons.md › Style`). `secondary` becomes `bg-surface-2` with no border. `danger` becomes `destructive`: `text-danger` plus trash icon, no fill (`buttons.md › Role`). All get `active:bg-surface-3`; primary keeps `active:bg-accent-press`. Sets use a 12 px gap |
| `icon-button.tsx` | `active:` state; drop the `secondary` border; keep required `label` and 44 px |
| `text-field.tsx` | `min-h-12`, `border-edge`, `max(16px, body)`, `placeholder:text-ink-3`, one focus style (2 px solid accent), label 15, message 13. Add `enterKeyHint` and optional trailing clear (`text-fields.md › Mobile`). Keep `ltrInputClass` |
| `phone-field.tsx` | Inherits the frame; add `enterKeyHint`. E.164 unchanged |
| `card.tsx` | `flat` loses its border. `raised` aliases `flat` (10 uses), then goes. `accent` stays. Title becomes `headline` |
| `list-row.tsx` | v2: title and subtitle wrap, no `truncate`. Trailing drops under the text below about 420 px via container query. Add `below`, `actions`, `as="li"`, pressed state, `min-h-12`. `leading` only for people and status glyphs (the 40 px tile goes). `ListGroup` renders `ul`, no border, inset separators, optional header and footer (`lists-and-tables.md › Style`) |
| `badge.tsx` | `min-h-6`, may wrap, 13 medium. Never on `surface-2` |
| `spinner.tsx` | Exempt from the reduced-motion net, with opacity pulse |
| `stat.tsx` | Delete. Only the gallery and the mock `shell/page.tsx` use it |
| `week-strip.tsx` | Rewrite per section 6. Props add `today`, `note`, `coverage` or `mine`, `clash`. Pure mapping goes in `packages/domain` with tests. Keep `aria-pressed` |
| `app-shell.tsx` | Split into `tab-bar.tsx` and a sidebar. No pill; filled selected glyph; medium label in `ink`; bar material; top bar at `md`; `tasks` paths; `matches` on `NavItem`; `useLinkStatus` for instant feedback; hide nav with one item. Sidebar user block opens the account sheet (`sidebars.md › Desktop`); accent tile goes. Symmetric side safe areas |
| `page.tsx` | `PageHeader` stays the API (17 files use it) and gains `back`, `large`, `actions`, rendering the navigation bar. Exactly one `h1`; the small bar title is `aria-hidden`. Remove the full-width phone actions and fix the wrong comment at `:24-25`. `PageBody` padding from safe areas |
| `accent.ts` | `accentProps` replaces `accentStyle`; 5 importers. `brandStyle` follows: `#9000ff` lifts to `#a436ff` in dark, ink 4.62 |

**New components, each added to `/design` in the same change (`CLAUDE.md:71-72`):**
- `sheet.tsx`: Radix Dialog, already a dependency; medium and large, grabber, Cancel and Done, form sheet from 768, back closes it, dirty guard, one at a time
- `action-sheet.tsx`: destructive first, Cancel last, no scrolling (`action-sheets.md › Best practices`)
- `segmented-control.tsx`: Radix ToggleGroup, at most 5, nouns
- `stepper.tsx`: with a field (`steppers.md › Best practices`)
- `select-field.tsx`: native select on the field frame
- `time-field.tsx`: native, `step=900` (`pickers.md › Best practices`)
- `skeleton.tsx`
- `share-button.tsx`: `navigator.share`, falling back to `app/copy-link.tsx` behaviour with a handled error (`activity-views.md › Best practices`)
- `task-frame.tsx` and `action-bar.tsx`, with an `UndoBar` slot in view
- `tab-glyphs.tsx`: outline and filled pairs for the five tabs

Switch is deferred until a settings row needs it (`toggles.md › Mobile`). No new dependency anywhere in this plan.

Icon swaps (`icons.md › Standard icons`): `Menu` to `Ellipsis`, `Save` to `Check`.

### 11. Screens

"Inherits" means tokens and components only, with no structural change.

| Route | Verdict | What changes | Chunk |
|---|---|---|---|
| `/schedule/build` | **Rework** | Task frame, day rows, shift sheet, week matrix, autosave. Split `schedule-builder.tsx` | R14-17 |
| `/home` becomes Today | **Rework** | Next shift plus only what needs action; data already exists (`upcomingShifts`, `scheduleGaps`, `week.mine`). Sign-out moves to the account sheet | R18 |
| `/schedule` | **Rework** | Worker lands on My shifts with an availability status row. Manager sees this week's status and entries | R19 |
| `/schedule/availability` | **Rework on phone** | Task frame, one row per day, day sheet with quick choices, Send in the bar (was about 1,717 px down), focus to first error. Grid stays from tablet | R20 |
| `/schedule/shifts` | **Rework** | Segments שלי and כל הצוות, the strip one day at a time, actions behind a row, take asks once. `PublishedWeek` needs `shabbat` (`week.ts:219-226`) | R21 |
| Navigation | **Rework** | Tabs, back, Team, account | R11-13 |
| `/schedule/availability/team` | Inherits | Back, `tel:`, share reminder, phone disclosure | R22 |
| `/team` | Inherits | Becomes a tab; grouped rows; one count | R22 |
| `/team/invite` | Inherits | Task frame, share as main action; URL stays | R22 |
| `/clock` | Inherits | Off the tab bar, becomes an action on Today when built; plain copy (`he.json:300`) | R13 |
| `/reservations` | Inherits | Empty state in plain words, no Home button | R13 |
| `/storefront` | Inherits | Reached from the new `/business` tab | R13 |
| `/sign-in`, `/join/[token]` | Inherits | No card on phones, large title, same-height buttons 12 px apart, `שלחנו` becomes `נשלח` | R23 |
| `/` | Inherits | Phase-0 page redirects to `/home` or `/sign-in` | R23 |
| `/admin` | Inherits | Whole row clickable | R24 |
| `/admin/new` | Inherits | Task frame, preset names visible | R24 |
| `/admin/businesses/[slug]` | Inherits | Bar back, one view-as row with pop-up. Todo rows need edit screens that do not exist (feature gap) | R24 |
| View-as banner | Inherits | Sticky one line of 44 px on a warning tint; keep the `complementary` landmark | R24 |
| `not-found`, new `error.tsx` | Inherits | Hebrew error boundary (none exists today) | R9, R23 |
| `/design`, `/design/shell/*` | Rebuilt | Real presets, states, both appearances. Mock pages go | R1, R26 |

### 12. Exact `CLAUDE.md` changes

Orel's to approve; no agent should make these on its own. Line numbers are the current file.

**`:62-65` becomes:**
```
- Colour only through tokens: `bg-bg` (page), `bg-surface` (groups), `bg-elevated`
  (groups in a sheet), `bg-surface-2` (fills), `bg-surface-3` (pressed), `border-line`
  (separators only), `border-edge` (field edges, 3:1), `text-ink`, `text-ink-2`,
  `text-ink-3` (placeholder, never on `surface-2`), `bg-accent`, `text-accent-ink`,
  `bg-accent-soft`, `text-success|warning|danger`, `text-danger-ink`. Every token has
  light, dark and increased-contrast values. Follow the system appearance; no in-app
  switch. Badges never on `surface-2`. `bg-brand` (#9000FF) is ConceptApp's own
  colour: admin console and marketing only.
```
**`:66-67` becomes:**
```
- Type by role: `text-large-title` 34/41 · `text-title-1` 28/34 · `text-title-2` 22/28 ·
  `text-title-3` 20/26 · `text-headline` 17/24 · `text-body` 17/24 · `text-callout` 16/22 ·
  `text-subhead` 15/21 · `text-footnote` 13/18 · `text-caption` 12/16. Tab labels 12 and
  counts 11 in fixed px. 1rem is body; sizes in rem, spacing in px. From 1280px with a
  fine pointer body is 15. System font on Apple devices, Heebo elsewhere; weights
  400/500/600/700. Real content wraps; no `truncate`.
```
**`:68-70` becomes:**
```
- Lists are grouped: `ListGroup` on `bg-bg`, no outer border, separators inset to the
  text. Cards: flat (`bg-surface`), accent (`bg-accent-soft`, at most one per screen).
  Shadow only on floating layers. Radius `rounded-control` 12 / `rounded-card` 16 /
  `rounded-sheet` 24.
```
**`:73-75`:** update "Built so far" to the list in section 10.

**`:76-78` becomes:**
```
- A business accent is applied with `accentProps(accentTokens(hex))` on a wrapper.
  `accentTokens` returns light, dark and increased-contrast pairs, darkens or lifts
  unreadable picks and flags picks near a status colour. Accent only on the main action,
  the selected tab icon, the current selection and focus. Text on tints stays `text-ink`,
  never `text-accent`.
```
**`:81` becomes:**
```
- Touch targets at least 44px; 48px for rows, buttons and tabs. 12px between bezelled
  controls. Motion 150–200ms on state changes; sheets present in 280ms; one orchestrated
  moment, when a schedule is published. Reduced motion replaces slides with fades.
```
**`:94-99` becomes:**
```
- `AppShell` (`@ui/app-shell`): bottom tab bar on phones, tab bar at the top on tablets,
  sidebar on desktop. Same items, labels, icons and order everywhere. At most five. Tabs
  navigate, they never act.
- Screens use `PageBody` + `PageHeader` (`@ui/page`). `PageHeader` renders the navigation
  bar: back at the leading edge on every sub-screen, large title on tab roots only, at
  most one trailing action. Exactly one h1.
- A task that can lose work opens in `TaskFrame`: no tab bar, close at the leading edge,
  main action in the bottom `ActionBar`.
```
**`:100-104`:** keep, and add `Keep state above the shapes, so rotating a tablet loses nothing.`

**`:105-106` becomes:**
```
- Living example: `/design/shell`. Check new screens at 360, 390, 820, 1280 and 1440px,
  in light and dark and at 200% text, before handing them back.
```
**`:112-113` becomes:**
```
- Icons never stand alone: nav items have labels, icon buttons have a label and tooltip.
  Exceptions in bars only: back (with the parent's title when it fits), close and more;
  each keeps an accessible name.
```
**`:116-117` becomes:**
```
- Every empty screen says what to do next. Common undoable actions offer undo. Uncommon
  ones that cannot be undone (a new invite link that kills the old one, publishing with
  gaps, taking a shift) ask once through an action sheet that names the consequence.
```
**`:121-128` becomes:**
```
## Design language

The app follows Apple's Human Interface Guidelines, by Orel's decision of 6 November
2026, including platform conventions: tab bar, navigation bar, sheets, action sheets,
grouped lists, materials. Reference: `.claude/skills/apple-design` (`dickwu/apple-design-skill`
at `ff4ebdd`). This file wins where the two differ, and each difference is listed here:
- Web substitutes: glass is a blur at 85% fill, only on the tab bar, navigation bar and
  sheet chrome, opaque when asked. Sheet gestures are hand-written and always have a
  button. No row swipes, no custom edge gestures, no haptics.
- One shared design on iPhone and Android for tab bar, navigation bar, sheets and action
  sheets; native per OS for select, time and keyboard.
- Never ship SF font files or SF Symbols. No Apple names in the product or its copy.
```
Also: `CLAUDE.md:156` (widths), `docs/AGENT.md:97-98` (widths), `app/globals.css:12-20,30-31` (stale comments), and the `docs/AGENT.md` backlog.

### 13. What will break, and how to keep it green

**Good news first.**
- Specs read strings from `messages/he.json` by key and the repo's `tsconfig.json` includes `**/*.ts`, so a removed key fails `pnpm check` and a copy change passes.
- Assertions on the database (`scheduleAssignments`, `scheduleShifts`) stay the real proof and do not change.
- Every spec calls `AxeBuilder` and checks horizontal overflow.

| Spec | Breaks | Fix | Chunk |
|---|---|---|---|
| `session.ts` (all specs) | Nothing, if labels and exact button names stay | Keep the keys; landing stays `/home` | R23 |
| `modules.spec.ts` | Exact `navItems` arrays (`:44-50,80-85,98-103`); `cards` locator and count (`:52-54,86-87`) | New arrays; assert modules through nav and Today | R13, R18 |
| `schedule-build.spec.ts` (40 role, 13 label) | Region holding the add select (`:86-101`), optgroup checks, editor inside region (`:166-169`), save button in a menu (`:113,140,207,223,282`), `/schedule` entry (`:74-79`) | Add `e2e/builder.ts`: `openShift`, `addPerson`, `setPosition`, `saveDraft`. Port once; keep DB assertions | R14-15, R19 |
| `availability.spec.ts` | `group` per day and `addRange` on phone (`:57-83`); entry link | `dayEditor(page, day)` opens the sheet on phone, returns the group elsewhere | R19-20 |
| `my-shifts.spec.ts` | Team regions behind a segment (`:93-102`), literal `7 שעות` (`:90`), entry and URL (`:54-57,80`) | Click the segment; update the literal; `/schedule` redirects workers to `/schedule/shifts` | R19, R21 |
| `shift-swaps.spec.ts` | Extra taps: row, then action sheet | Add the steps | R21 |
| `team.spec.ts`, `team-invite.spec.ts` | Home link to `/team` (`team.spec.ts:54`) | Use the tab. `/team/invite` keeps its URL | R13, R22 |
| `view-as.spec.ts` | `manageTitle` key (`:75`), banner | Keep the landmark and name | R18, R24 |
| `new-business.spec.ts` | Probably nothing: keep `title` on presets (`:97`); teal stays | None | R24 |
| `admin`, `invite`, `sign-in`, `team-availability` | Should inherit | Keep labels and links | - |

**Shared hazards, solved once in R11.**
- **Sticky bars intercept clicks.** Add `scroll-padding-block` for the bar heights. It also keeps keyboard focus visible (own knowledge).
- **Two h1s** would trip every `getByRole("heading", { level: 1 })` (31 heading uses). One h1; the bar title is `aria-hidden`.
- **Shapes** stay hidden with `display: none`, so role queries and `filter({ visible: true })` (`modules.spec.ts:29`) keep working. Keep the `mainNav` label.

**Axe.**
- Dialogs need names; Radix `Title` is required in `Sheet`.
- Keep document scroll in `TaskFrame`, so no scrollable-region rule fires.
- Axe usually reports text on translucent bars as incomplete rather than a failure (own knowledge), so it proves nothing about glass. Add `tooling/tokens.test.ts`: parse `app/globals.css` and assert the section 2 matrix and the bar composite with `contrastRatio`. It runs in `pnpm check`. It also proves the `.appearance-dark` block and the media-query block hold the same names.

**Layout at 390, 820, 1440.**
- 15 to 17 widens text 13%, so R3 (wrapping) must land before R4 (type).
- Overflow inside cards escapes the document-level check, so add `expectNoClipping` to a shared `e2e/clean.ts` and move the repeated `expectCleanPage` copies there.

**New coverage without blowing the budget.** The e2e job has a 20-minute limit (`.github/workflows/ci.yml:74`) and one worker, so do not multiply the suite. Add `e2e/design.spec.ts` on `/design` and `/design/shell/*`, running only in extra projects:
- 360 and 1280 wide
- 844x390 landscape
- `colorScheme: dark`
- increased contrast
- reduced motion
- a 34 px root at 390 and 360

WebKit, if approved, runs this spec only. It cannot test SF or iOS zoom, so a real iPhone stays necessary.

### 14. Phases and nightly chunks

Each chunk is one branch and PR, with `pnpm check`, `pnpm build`, and tests changed in the same PR. Open each as an `orel` issue. Stop after each phase until Orel has looked on a phone.

**Phase 0, Orel, no night.** Answer section 17, approve section 12, reorder the `docs/AGENT.md` backlog.

**Phase 1: Foundations, 5 nights. Demo: `/design` on a phone, light and dark side by side.**
- R1 Tokens, appearances, material token, `tooling/tokens.test.ts`, `e2e/design.spec.ts`. Done when axe is clean in both appearances.
- R2 Accent tiers, floor, `nearStatus`, presets, `accentProps`, `color.test.ts`. Gallery shows the 8 presets plus one adjusted pick.
- R3 Wrapping: ListRow v2, ListGroup, Button, Badge. Remove `truncate` from real rows.
- R4 Type: root, `--spacing`, role tokens, codemod, `cn`, font stack. Done when a 34 px root passes at 390 and 360.
- R5 States and fields: pressed, focus, `edge`, gaps, destructive, spinner; delete Stat. Gallery gets a state matrix.

**Phase 2: Primitives, 5 nights. Demo: `/design`.**
- R6 Sheet.
- R7 ActionSheet, SegmentedControl.
- R8 SelectField, TimeField, Stepper; migrate raw inputs in place.
- R9 Skeleton, shell-frame fallback, `error.tsx`, ShareButton, tab glyphs.
- R10 WeekStrip v2 with the domain mapper.

**Phase 3: Shell, 3 nights. Demo: `/design/shell`, the first time it looks like the new app.**
- R11 Navigation bar in `PageHeader`, back on every sub-screen, scroll padding, safe areas.
- R12 Tab bar, top bar, sidebar, account sheet, material with its guard, tab counts. Counts add server reads to the layout, so stream them.
- R13 Tab model: `nav.tab: false` on `modules/time_clock/manifest.ts:8` and `modules/storefront/manifest.ts:8` (not `nav: null`, because `minRole` is what lets a role open the screen, `packages/domain/modules.ts`). `MAX_MODULE_NAV` becomes 2 (`:45`). Team and `/business` in the layout. `TaskFrame`, `ActionBar`, `tasks` paths.

**Phase 4: Screens, 11 nights. Demo: each screen's real view on `/design/shell/...`.**
- R14 Builder phone: rows and ActionBar.
- R15 Shift sheet: spec rewrite and helper.
- R16 Tablet and desktop matrix; add a 1280 check.
- R17 Guards: debounced draft autosave while unpublished, local copy after publish (own judgment), leave-with-changes action sheet, gap count on publish.
- R18 Today.
- R19 Schedule tab.
- R20 Availability.
- R21 My shifts. Swap approvals (2d-2b) goes right after this, so it is built once on the new parts.
- R22 Team, invite, team availability.
- R23 Auth, not-found, root redirect.
- R24 Admin and view-as.

**Phase 5: Polish, 3 nights.**
- R25 Glossary and copy pass (`messages/he.json`, `messages/en.json`), including short bar titles (`toolbars.md › Titles`). סידור לשבוע הבא is 15 characters, at the limit.
- R26 Demos render real views; delete mock pages; final gallery.
- R27 Manifest and standalone test, WebKit project, and a device fix list.

**Timing, at one chunk a night, starting tonight (estimate).** Phase 3 ends about 18 November, R21 about 26 November, all of it about 2 December. That is 27 of about 49 nights before a late-December pilot, and the four remaining modules need the rest.

### 15. Critique again

**One thing to remove:** the 40 px round icon tile at the start of list rows (`packages/ui/list-row.tsx:41`, 12 `leading=` uses). It repeats the tab icons, costs 52 px of text width on the narrowest screens, and carries no information except for people's initials. Remove it. Stat, `lg` buttons, `raised` cards, the logo tile, and the intro paragraphs on build and availability go as well.

**Quality floor.**
- Width: works to 320, with a strip cell of 41.1 px; everything else is 44 or more from 360.
- Focus: 2 px accent ring, guaranteed 3:1 by the new floor on `bg`, `surface` and `surface-2`.
- Reduced motion: answered.
- Reduced transparency: answered on Chromium; on iPhone the 85% fill reads with no blur (5.81 worst case).
- Increased contrast: answered, including the accent.
- Largest text: 200% tested. AX3 to AX5 (235-312%) are capped on titles and tall, but not asserted.
- Colour: never the only carrier, including the selected tab, whose icon drops to 2.35-2.92 in dark and as low as 2.63 in light over worst-case content but also has a filled glyph and a heavier label. At rest it is 3.65 or more in light and 3.80 or more in dark, custom picks included.

### 16. Unverified

- **Device behaviour:**
  - iOS zoom under 16 px
  - `-apple-system-body` and Bold Text
  - `-webkit-text-size-adjust` on Android
  - Android back closing a sheet under Next's router
  - `type=time` in RTL on iPhone
  - which Hebrew face iPhone actually renders
  - blur cost on mid-range Android
  - the tab bar beside Safari's bottom bar
- Hebrew text widths in the new sizes, SF Hebrew metrics, and Heebo's weight range and tabular numerals.
- The 2 px leading allowance and all hex values need Orel's eye under real light (`color.md › Best practices`).
- Browser baseline: `:dir()` and relative colours appear to put the floor near Safari 16.4 and Chrome 120 (from memory). Real staff phones are unknown, and no browserslist exists.
- Radix ToggleGroup's roles, and whether a Tailwind `text-*` token named like a colour collides, need checking once dependencies are installed.
- Tap and height figures are review arithmetic, not measurements.

### 17. Decisions for Orel

1. **Approve the `CLAUDE.md` rewrite and the order of work.** The current text forbids this rework (`CLAUDE.md:121-128`), and the nightly runs obey it. *Recommendation:* approve it. Run R1 to R21 before the time clock, so new modules are built once on the new parts. R22 to R27 can interleave with modules if the pilot date gets tight.

2. **Font.** *Recommendation:* the system font on Apple devices and Heebo elsewhere, for real SF on iPhone and one known face on Android. The alternative is Heebo everywhere: identical rendering and simpler testing, but it never reads as Apple.

3. **Navigation.** *Recommendation:* a manager gets היום, סידור, הזמנות, צוות, עסק; a worker gets היום, סידור, הזמנות. The clock becomes an action on Today, because tabs navigate rather than act. Tablets use a top tab bar and the rail goes. Reservations stays as a tab with a plain empty state until it is built.

4. **Look.** *Recommendation:* neutral steel surfaces instead of warm paper, and burgundy replaces the red preset. Warm reads as a template default here and has no root in the product. The alternative is keeping warm neutrals with the same structure: contrast must be recomputed, and the distinctive look is lost to no gain.

5. **Bars on real phones.** *Recommendation:* start with an attached tab bar in the browser, glass on Apple devices only, and judge a floating capsule on your own iPhone at the Phase 3 demo. Test one mid-range Android before enabling glass there. Approve downloading WebKit in CI for `e2e/design.spec.ts` only. Add a home-screen manifest in R27, unless it is on your deferred list, which I could not read.
