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

`@ui/old-browser-notice` is what a browser older than the app needs reads at the
top of every page (closing the pilot, PR 26): `OldBrowserNotice` takes a title
and a paragraph each of what to do, and `app/old-browser.tsx` gives it the
app's words (`app.oldBrowser`) for the root layout. It is CSS only, with no
script, since on such a browser the page's script may never run: it carries
Tailwind's `hidden`, which is in a cascade layer, and one rule in
`app/globals.css`, outside any layer, shows it where relative colours are
missing (Chrome and Edge 119, Safari 16.4, Firefox 128; the rule's comment
says why that is the floor). A browser too old for layers never applies
`hidden`, so it shows there too. `shown` draws it in any browser, for the
gallery. It lies in the flow, above the fixed sidebar and floating title
(`z-40`) and never over the page, which scrolls on under it, and its colours
are plain tokens (surface, ink, warning), never one mixed with `color-mix()`
or a relative colour. Its region is named by its title.

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
from where the person put it. A heading or a line gets `tabindex="-1"` first,
and `data-focus-landing`, which `app/globals.css` draws with no ring (it is no
control, and PageHeader's title shows none either).
`useFocusWhenGone(ref, candidates)` (`@ui/use-focus-after`) does it when an
element goes while it holds the focus, after the drawing that removed it, so a
screen's own refocus wins, and without moving the page (`focusWhenGone`): it
lands where what went was, and someone who scrolled on meanwhile stays put.
A candidate that can be far from what went (the row "ביטול" brought back, on a
long list far above it) is wrapped in `inViewWhenFocused(element)`, which
centres it as it takes the focus, only when it is out of view then.
One that goes with a sheet that closes (`inClosingSheet`: Escape with the
focus on a row's button, or on an UndoRow's "ביטול" in the sheet) leaves the
focus to the sheet, which gives it back to what opened it; its candidates
went with it, and the page's title would have taken that place.
An effect that moves the focus to what arrived (a refusal, a card) asks
`arrived(seenRef, value)` first: a screen shown again from a hidden
`<Activity>` runs its effects again with the same value, and the focus stays
where it is then. `ignoreHeldEnter`, a button's `onKeyDown`, lets only a
key's first press count: what takes the focus in a pressed button's place
(StatusToast's action with `focusAction`, UndoRow's "ביטול" with `autoFocus`,
ScanCircle's stop, a Sheet's ✕ as it opens, the clock's buttons) takes no
Enter still held down from that press.

`@ui/undo-wait` (no React) is the one rule for a way back that waits while it
is being reached, StatusToast's and UndoRow's: the keyboard's focus on it with
no limit; a mouse brought over it; a finger held on it; a focus with no ring
after a tap or a screen reader's own press, until a press elsewhere, the focus
leaving, or a minute. After a mouse press a focus with no ring counts, as it
always did. `useUndoWait(root, onChange)` (`@ui/use-undo-wait`) gives the
handlers to spread on the root, and takes up a focus already inside it as it
starts listening (`waitForFocusInside`: an `autoFocus` comes first, and in
dev React runs the effect's cleanup and body again right after the mount).

StatusToast's `quiet` keeps a message out of its live region (`aria-live="off"`)
while it still shows: for one whose words the focus already says, as the
screen put it on a line that says the same (the builder's status line after a
draft saved). Set by the time its words show, a drawing after the message.
`/design` shows it with a line that takes the focus.

`@ui/undo-row` is what was just removed with the way back, where the person is
looking (it was `app/(app)/manage/undo-row.tsx`). Still `role="status"` for the
screens' checks. As it appears it is quiet (`aria-live="off"`) and said once
through the announcer, unless its own focus says it (`autoFocus`) or the
screen brings the focus to it (`quiet`, also for a row that was up already,
drawn again: no news). From its first effect on it is its role's own status:
a change of its words (a way back that failed) is heard wherever the focus
is, and with no `aria-live` of its own a sheet opened over it hides it with
the rest of the page. Its button is named with its words after its word
("ביטול: נועה כהן הוסרה מהצוות", `ui.undoRow.named`) when `autoFocus`,
`quiet` or `buttonRef` is set (`namedByWords`), since its own focus says
them, and described by them otherwise ("ביטול, נועה כהן הוסרה מהצוות"): a
`buttonRef` alone names it, even on a row the announcer says as it appears.
`onWaitingChange` hears the rule above, so a held write pauses as long;
`focusAfter` says where the focus goes when it leaves holding it, the page's
title after them; `buttonRef` is for a screen that brings the focus there
itself (a sheet's `returnFocus`, a refused way back). `autoFocus`
acts once, as the row mounts: a screen that can offer a second undo while the
first is up keys each row by what it undoes (`key={removed.key}`), so each
removal is a row of its own, with the focus, its own wait and its own words.

Button and IconButton with `aria-disabled` dim as `disabled` does and show no
press (no spring, no darker fill), while the focus on them stays; the screen's
`onClick` ignores the press. Button takes `pointer-events: none`; IconButton
doesn't, so the mouse still finds its tooltip (its `title`): `pressable` gives
nothing aria-disabled its spring, and its variants keep their own fill under
the pointer.

## Third party

Some components follow designs from [React Bits](https://reactbits.dev) (MIT + Commons
Clause, © 2026 David Haz), rebuilt here on our tokens and CSS. The licence allows this
as part of an application; it doesn't allow selling or redistributing the components
themselves, so this folder must not become a package of its own. They say so in a comment.
