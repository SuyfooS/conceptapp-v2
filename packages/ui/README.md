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
a press waits, when it failed and when it didn't load. After "בדיקה מחדש",
which goes with the failure, its line takes the focus and says the try (started,
then passed, or the tick it asks for), and a failure again gives the button back
the focus. `align="center"` sets its retry and Cloudflare's box in the middle of
a centred card (the locked file's `EmptyState`). A form sends through
`holdSubmit` (a press made too soon waits and goes by itself), a send in code
through `take()`. The script has 15 seconds from when a box is up, never from
the screen's first drawing, and a screen whose language changes gets a new
widget in it. Its controller, `@ui/captcha-control`, has no React and is
tested on its own. The script is Cloudflare's, never copied here; the gallery
shows the stand-in only.

When it asks for a tick while a press waits, the pressed button is busy, so the
line takes the focus that fell to the page, and the next stop is Cloudflare's
box.

## For a screen reader and the keyboard

`@ui/announcer` is the page's one announcer: `<Announcer />` is drawn first in
the root layout's `<body>`, one polite and one assertive region, each with its
own `aria-live` from the first drawing, so an open or closing Sheet (Radix
hides what is outside it, live regions aside) never hides them, and a line said
just before a navigation is heard on the next screen. `announce(text, {
politeness, lang })` says a line with nothing on screen: a switch of business,
a number stepped, an undo row as it appears. Each call is a line of its own,
the same words twice within 250 ms are said once, and every line goes after 7
seconds. Never a code, an ID number or anything secret: CodeSlots and
MaskedValue say theirs in their own region, where they show. Its store,
`@ui/announcer-store`, has no React.

`@ui/focus-after` (no React) says where the focus goes once what held it went:
`focusLost()` (nothing, the body, an element gone, hidden, disabled while it
waits, in a closing sheet, or a sheet's own frame), `onScreen` (the Sheet's
rule), `firstOnScreen(candidates, root)`, and `focusFirst(candidates)`, which
focuses the first that can take it, else the page's title (`main h1`, reached
without moving the page), and only when the focus is lost, so it never takes it
from where the person put it. A heading or a line gets `tabindex="-1"` first.
`useFocusWhenGone(ref, candidates)` (`@ui/use-focus-after`) does it when an
element goes while it holds the focus, after the drawing that removed it, so a
screen's own refocus wins.

`@ui/undo-wait` (no React) is the one rule for a way back that waits while it
is being reached, StatusToast's and UndoRow's: the keyboard's focus on it with
no limit; a mouse brought over it; a finger held on it; a focus with no ring
after a tap or a screen reader's own press, until a press elsewhere, the focus
leaving, or a minute. After a mouse press a focus with no ring counts, as it
always did. `useUndoWait(root, onChange)` (`@ui/use-undo-wait`) gives the
handlers to spread on the root.

`@ui/undo-row` is what was just removed with the way back, where the person is
looking (it was `app/(app)/manage/undo-row.tsx`). Still `role="status"` for the
screens' checks, with `aria-live="off"`: it is said once through the
announcer, unless its own focus says it (`autoFocus`) or the screen brings the
focus to it (`quiet`). Its button is described by its words.
`onWaitingChange` hears the rule above, so a held write pauses as long;
`focusAfter` says where the focus goes when it leaves holding it, the page's
title after them; `buttonRef` is for a sheet's `returnFocus`.

## Third party

Some components follow designs from [React Bits](https://reactbits.dev) (MIT + Commons
Clause, © 2026 David Haz), rebuilt here on our tokens and CSS. The licence allows this
as part of an application; it doesn't allow selling or redistributing the components
themselves, so this folder must not become a package of its own. They say so in a comment.
