# Agent log

Newest entry on top. One entry per run: date, chunk, what changed, commit,
what is next, defaults applied.

## 2026-11-06 · chat · the daily run becomes a nightly run

- Orel is back. He cancelled the daily run and asked for a run every night: it
  does the work he left the day before; if he left nothing, it guesses from
  earlier conversations and keeps the version from before its changes, in case
  he does not like them.
- Scheduled task renamed `ConceptApp agent — nightly run`, now at 02:00 Israel
  time (Orel named no hour; 02:00 is the default), with the new prompt from
  `docs/agent/RUN_PROMPT.md`.
- `docs/AGENT.md` rewritten for this: "What to work on" (left work first, then a
  guess from what he said, the log's "Next", the backlog), "Restore point" (a tag
  `before-night/<date>`, undone by writing `בטל` on the night's note), and a
  shorter backlog. Stale parts of the first brief are gone; they are in git.
- A run cannot read conversations, so live sessions now add `🤖 **משיחה:**`
  comments to `יומן הסוכן` as things come up, and the run reads those.
- Runs now stay until CI finishes: on 5.11 a run ended its turn to wait for a CI
  event and stalled for a day.
- Corrected: GitHub sends Orel no notification for what the agent writes, since
  it writes through his account. The brief said it did.
- Not tested yet: pushing a tag from a cloud run. The first night tries it, with
  a branch as the fallback.
- Next: the first nightly run. Unless Orel leaves work, it guesses chunk 2d-2b.

## 2026-11-06 · chat · apple-design skill

- Orel is back and asked to install `dickwu/apple-design-skill`. The daily run
  continues as before until he decides otherwise.
- `SKILL.md` and `references/` from upstream `ff4ebdd` copied unchanged to
  `.claude/skills/apple-design/`, by hand, so nothing ran. Left out: its refresh
  script and its files for other agents.
- Checked first: read `SKILL.md`, `AGENTS.md`, `README.md` and
  `references/code-audit.md`, and scanned all 135 files for hidden characters,
  long encoded strings and agent-directed text. Only finding: two zero-width
  spaces in a table in `icons.md`, harmless.
- `CLAUDE.md` gains "Design reviews": its web-app scope, and that `CLAUDE.md`
  wins where they differ.
- Note: upstream has no license and the guideline pages are Apple's text. Fine
  while this repo is private; take the skill out before it goes public.


## 2026-11-05 · run 26 · chunk 2d-1 (shift swaps in the database)

- No open questions or instructions; `main` green at `2505d0a`. Split 2d
  (shift swaps) in two: 2d-1 the database (today), 2d-2 the screens.
- Migration `shift_swaps`: table `shift_swaps` (open → taken → approved /
  declined, or cancelled by the worker) and server-only functions
  `request_shift_swap`, `take_shift_swap`, `cancel_shift_swap`,
  `decide_shift_swap`, each written to `audit_log`. Rules: only your own
  shift of a published week, before it starts (business time zone); one
  live request per shift and person; the colleague is an active member,
  not on the shift and on no other shift at the same time; an active
  manager or owner decides, and on approval every rule is checked again
  and the colleague takes the worker's place in the same position.
- RLS: active members of the business (and "view as") read its swaps;
  other businesses, inactive members and anonymous read nothing; module
  off closes it.
- Tests: pgTAP `shift_swaps.test.sql` (36). Supabase images could not be
  pulled in this run's container, so I ran the migrations and the test on
  a plain Postgres 16 with stand-ins for `auth` and pgTAP: 36/36, and four
  planted bugs (no overlap check, no "already started", wrong person
  moved, open read policy) each turned tests red. `pnpm check`, `pnpm
  build`. First CI run failed: the RLS meta-test keeps a list of tables
  and I had not added `shift_swaps` to it; added. `database.types.ts` edited by hand; CI checks it.
- Commit: squash of PR `agent/2d-1-swaps-db` (see the daily note in #1).
- Next: chunk 2d-2, the screens: "give away" on my shifts, open requests
  for colleagues to take, and the manager's approve/decline list.
- Defaults applied (no question opened): a manager always approves (no
  direct swaps); the colleague does not need to have marked availability;
  publishing changes to a week drops its pending requests (its shifts are
  replaced); owners and managers can also give away and take shifts.

## 2026-11-06 · run 27 · chunk 2d-2a (giving away and taking shifts)

- No open questions or instructions. Run 26 had left PR #32 (2d-1) open
  with CI green and its daily note unwritten; merged it first as
  `0a55efb`. Split 2d-2 in two: 2d-2a the worker's side (today), 2d-2b
  the manager's approve/decline list.
- `/schedule/shifts`: each of "my next shifts" has "מסירת המשמרת"; once
  asked it says the request waits for someone (or who took it, waiting
  for the manager) with "ביטול הבקשה". New section "משמרות שאפשר לקחת":
  colleagues' open requests from today on, with who gives it away and the
  position, "לקיחת המשמרת", a count badge; a shift at the same time as
  one of yours says so instead of the button; a request you took says it
  waits for the manager. Phone: under "my shifts"; tablet: same column;
  desktop: beside "my shifts". Refusals from the database (started,
  closed, busy, asked twice, view as) are explained under the button.
- `@domain/swaps`: `offersFor`, `myRequestFor`, `shiftsOverlap`,
  `swapFailureOf`. `@db/swaps`: `getLiveSwaps` (RLS) and the three steps
  with the secret key. `swapAction` checks the member and "view as"
  first. The published schedule now keeps shift ids and the live swaps.
- Demo: `/design/shell/schedule/shifts` (Noa gives away Friday, can take
  Maya's Wednesday, took Yoav's Saturday night).
- Tests: 8 new unit tests (273 total). Playwright `shift-swaps.spec.ts`:
  Noa gives away her evening, Yoav sees it with her position and takes
  it, Noa sees who took it and cancels; each step checked in the
  database; axe and no horizontal scroll. First CI run failed in
  `sign-in.spec.ts`, which runs next: the spec had signed Noa in last,
  and the auth server refuses a second code to her within 5 seconds.
  Noa now signs in first. Locally: `pnpm check`,
  `pnpm build`, the demo at 390/820/1440 with axe (0 violations, no
  horizontal scroll).
- Not verified locally: no Docker in this run's container, so the
  Playwright spec runs only in CI.
- Commit: squash of PR `agent/2d-2a-swaps-ui` (see the daily note in #1).
- Next: chunk 2d-2b, the manager's list of taken requests to approve or
  decline, and a count on `/schedule`.
- Defaults applied (no question opened): no note field on the request
  yet (the database takes one); "take" is a secondary button, since the
  screen has no single main action.

## 2026-11-04 · run 25 · chunk 2c-3b (my shifts)

- No open questions or instructions; `main` green at `54ee5aa`.
- `/schedule/shifts` "המשמרות שלי", for everyone with scheduling on (and
  "view as"): the person's next shifts from today on, this week and next,
  with the position and the total hours; then each week's published
  schedule for the whole team, day by day, who works each shift and in
  what position, "המשמרת שלך" on the person's own. A week not published
  yet says so; drafts never show (RLS, as in 2c-3a). Phone: one under the
  other; tablet: own shifts beside the team's days; desktop: own shifts,
  then each week with a column a day. Today is marked.
- `/schedule` gains a first row "המשמרות שלי" for everyone: the next
  shift ("המשמרת הבאה: יום ראשון, בוקר ב-09:00") and a count badge, or
  "not published yet". The "coming soon" card for workers is gone.
- `@domain/schedule`: `shiftsOf`, `shiftMinutes`, `shiftsByDay`.
  `@db/team` `getColleagues` (names of active members, readable by every
  member). `week.ts` `currentPublishedSchedule`. No database change.
- Demo: `/design/shell/schedule/shifts` (Noa on Tuesday 3.11, this week
  published, next week not).
- Tests: 6 new unit tests (265 total). Playwright `my-shifts.spec.ts` (first CI run failed: two text checks matched the hidden layout of another screen size too; now only the shown one counts): a
  saved draft shows nothing to a worker; a published week shows Yoav his
  morning as a bartender, 7 hours, who else works, and the evening without
  the "yours" badge; axe and no horizontal scroll. Locally: `pnpm check`,
  `pnpm build`, the demo at 390/820/1440 with axe (0 violations, no
  horizontal scroll).
- Not verified locally: no Docker in this run's container, so the
  Playwright spec runs only in CI.
- Commit: squash of PR `agent/2c-3b-my-shifts` (see the daily note in #1).
- Next: with 2c the scheduling module's core is done (availability, build,
  publish, read). Next chunk: 2d, shift swaps between workers (ask, a
  colleague takes it, the manager approves), unless Orel says otherwise.
- Defaults applied (no question opened): workers see the shifts of the
  current and the next week only; past days of this week stay in the
  team's view but not in "my next shifts".

## 2026-11-03 · run 24 · chunk 2c-3a (publishing the schedule)

- No open questions or instructions; `main` green at `a676cc8`. Split 2c-3
  in two: 2c-3a publishing (today), 2c-3b the worker's own shifts screen.
- Migration `publish_schedule`: `schedule_weeks.schedule_published_at`;
  `publish_week_schedule` saves and publishes in one transaction. The
  rules of 2c-1 moved unchanged into `private.replace_week_schedule`,
  which both `save_week_schedule` and `publish_week_schedule` call.
  Saving a draft into a published week is refused (55000).
- RLS: once a week is published, every active member of the business
  (and "view as" any role) reads all its shifts and who works each;
  drafts stay with managers and owners. Helpers `private.week_published`,
  `private.shift_published`.
- `/schedule/build`: main action "פרסום הסידור", secondary "שמירת
  הטיוטה". Once published, one button "פרסום השינויים"; the screen says
  when it was published, and "יש שינויים שעוד לא פורסמו" while edited.
  `/schedule` entry says "פורסם לצוות". Demo shows the same.
- Tests: pgTAP `publish_schedule.test.sql` (24: who may publish, same
  rules as saving, a published week cannot go back to a draft, who reads
  it, other business, inactive, anonymous, view as, module off).
  Playwright: the manager publishes, the database has it, reload shows
  "published" without the draft button, a change is published again,
  the entry says published. Locally: `pnpm check` (259 unit tests),
  `pnpm build`, the demo at 390/820/1440 with axe (0 violations, no
  horizontal scroll) before and after publishing.
- Not verified locally: no Docker in this run's container, so pgTAP and
  Playwright run only in CI; `database.types.ts` was edited by hand and
  CI checks it against the generated one.
- Commit: squash of PR `agent/2c-3a-publish` (see the daily note in #1).
- Next: chunk 2c-3b, "המשמרות שלי": the worker's published shifts, and
  the whole week's schedule for the team.
- Defaults applied (no question opened): the whole team sees the whole
  published schedule (not only their own shifts); after publishing there
  is no separate draft, changes go out with "פרסום השינויים"; publishing
  is allowed with shifts still short. No notification is sent yet (the
  notifications module comes later).

## 2026-11-02 · run 23 · chunk 2c-2b-2 (positions on the week's shifts)

- No open questions or instructions; `main` green at `9339833`.
- `/schedule/build`: under each person on a shift, a "התפקיד של {name}
  במשמרת" choice with the business's positions (from the scheduling
  settings) and "בלי תפקיד". The shift's card counts who works what
  ("מלצר/ית 2 · טבח/ית 1"). A business with no positions sees no
  choice, as before. Saved through `save_week_schedule`, which already
  took a position per person; no database change.
- A saved week whose position was since removed from the settings loads
  with that person "without a position" (`withKnownPositions`), so the
  week can still be saved; before, it failed as "invalid".
- `@domain/schedule`: `positionCounts`, `withKnownPositions`. Demo
  `/design/shell/schedule/build` has the restaurant's positions, with
  Noa as a waiter and Itay as a cook on Sunday morning.
- Tests: 2 new unit tests (259 total). Playwright `schedule-build.spec.ts`:
  the manager makes Noa a waiter, the shift shows "מלצר/ית 1", the
  database has `waiter`, and it is still chosen after a reload; the other
  test checks people saved without a position. Locally: Docker ran, so
  the whole spec (9 tests, 3 sizes) passed against a local Supabase;
  `pnpm check`, `pnpm build`, the demo at 390/820/1440 with axe (0
  violations, no horizontal scroll).
- Commit: squash of PR `agent/2c-2b-2-positions` (see the daily note in #1).
- Next: chunk 2c-3, publishing the schedule and the worker's own shifts.
- Defaults applied (no question opened): a person added to a shift starts
  without a position; a shift does not say how many of each position it
  needs (only how many people). Both can become settings later.

## 2026-11-01 · run 22 · chunk 2c-2b-1 (changing the week's shifts)

- No open questions or instructions; `main` green at `45d6765`. Split
  2c-2b in two: 2c-2b-1 changing the shifts themselves (today), 2c-2b-2
  positions (a person's role on a shift). 2c-3 publishing after that.
- `/schedule/build`: each shift has "עריכת המשמרת" (pencil): name, start,
  end, people needed (an end before the start is the next day), with a
  message per wrong field. "הסרת המשמרת" takes it off with an undo bar
  ("החזרת המשמרת") instead of "are you sure". Every day has "הוספת
  משמרת" for a shift that is not in the pattern (saved with no pattern
  key). Changed hours move the shift to its place in the day.
- Someone on two overlapping shifts (e.g. after hours changed): both
  lines say "גם במשמרת אחרת באותה שעה", a "עובד בשתי משמרות באותה שעה"
  badge shows, and saving is stopped on the screen with what to do
  (the database refused it before, with a vague error).
- A business with no shift pattern now gets the builder with empty days
  and "add a shift" instead of a dead end; the note says so.
- `@domain/schedule`: `doubleBooked`, `shiftDetailsProblem`, `shiftSlot`.
  No database change: `save_week_schedule` already took any shifts.
- Tests: 11 new unit tests (257 total). Playwright `schedule-build.spec.ts`
  new test: the manager shortens Sunday morning to 2 people until 15:00,
  removes the evening (undo once, then for good), adds "אמצע" (a name is
  required first), puts Noa on two overlapping shifts and is stopped,
  fixes the hours and saves; the database has exactly those shifts and
  the rest of the week's 10; reload; axe and no horizontal scroll.
- Verified locally this time: Docker ran in this container, so the
  whole `schedule-build.spec.ts` (9 tests, 3 sizes) passed against a
  local Supabase. Also `pnpm check`, `pnpm build`, the demo at
  390/820/1440 with axe (0 violations, no horizontal scroll).
- Commit: squash of PR `agent/2c-2b-1-edit-shifts` (see the daily note in #1).
- Next: chunk 2c-2b-2, positions on the week's shifts.
- Defaults applied (no question opened): changes to a week's shifts stay
  in that week; the regular shift pattern is changed only by the
  ConceptApp team in the settings, as before.

## 2026-10-31 · run 21 · chunk 2c-2 (the manager builds the week)

- Question #25 passed its deadline (31.10 10:00) without an answer: the
  default applies, keep building the scheduling module until 12.11.
  Closed. Split 2c-2 in two: 2c-2a putting people on the pattern's shifts
  (today), 2c-2b changing the shifts themselves (add or remove a shift,
  people needed, positions). 2c-3 publishing stays next after that.
- `/schedule/build`, for owners and managers (and "view as" a manager);
  workers get not-found. Next week's shifts: the saved schedule, or a
  draft from the shift pattern (`draftWeek`). Each shift shows its hours,
  "N מתוך M עובדים" and a "חסרים N עובדים" badge; the page shows "N
  משמרות חסרות עובד". "הוספת עובד" lists the team grouped: available
  (their availability covers the shift), have not sent, not available,
  and on another shift at the same time (disabled). People already put
  outside their availability carry a warning line. Phone: the week
  strip (a dot on days with gaps) and one day; tablet: the same, the
  day's shifts in two columns; desktop: the whole week, a column a day.
- "שמירת הטיוטה" saves through `save_week_schedule` (opens the week if
  nobody has); copy says workers see it only after publishing.
  `/schedule` gains a "סידור לשבוע הבא" row for managers with the gaps
  badge; workers still see the "coming soon" card.
- `@domain/schedule` `shiftCandidates`; `@db/availability` `getWeek`
  returns `scheduleSavedAt`; `week.ts` `currentScheduleBuild`.
- Demo: `/design/shell/schedule/build` (restaurant pattern, demo team and
  answers, nothing stored).
- Decisions (defaults, no question opened): people are added without a
  position for now (positions come with 2c-2b); a saved week is shown as
  saved even if it was saved empty.
- Tests: 4 new unit tests (250 total). Playwright
  `schedule-build.spec.ts`: the manager sees Noa among the available and
  Yoav among those who have not sent, puts Noa on Sunday morning, saves
  (the database has exactly that), reloads, takes her off and saves
  again; a worker has no row and gets not-found; axe and no horizontal
  scroll. Locally: `pnpm check`, `pnpm build`, the demo at 390/820/1440
  with axe (0 violations, no horizontal scroll) and a save.
- Not verified locally: no Docker in this run's container, so the
  Playwright spec runs only in CI.
- Commit: squash of PR `agent/2c-2a-build-week` (see the daily note in #1).
- Next: chunk 2c-2b, changing the week's shifts (add, remove, people
  needed, positions).
- Defaults applied: #25 (keep building scheduling); the decisions above.

## 2026-10-30 · run 20 · chunk 2c-1 (the week's schedule in the database)

- Question #25 (what comes next) is open until 31.10 10:00; per its
  default, work continued on the scheduling module. Split chunk 2c in
  three: 2c-1 shifts and assignments in the database (today), 2c-2 the
  manager's screen that builds the week from the shift pattern and the
  availability, 2c-3 publishing and the worker's own shifts.
- Migration `20261030000100_week_schedule.sql`: `schedule_shifts` (a
  week's shift on one day: name, start, end, people needed, the pattern
  key it came from) and `shift_assignments` (a person on a shift,
  optionally in one of the business's positions);
  `schedule_weeks.schedule_saved_at`. RLS: managers and owners (and "view
  as" a manager) read them; workers read nothing until publishing; all
  closes when scheduling is off.
- Secret key only: `save_week_schedule(actor, week, shifts)` replaces the
  whole week in one statement. Active managers and owners only; days
  inside the week; a name, different start and end, 1–50 people; people
  are active members, each once per shift; positions from the settings;
  nobody on two shifts at once (measured from the week's start, so a
  night shift past midnight counts against the next morning). No
  temporary tables, so it needs no TEMP right on the hosted database.
- `@domain/schedule`: `weekSchedule` (Zod, the same rules), `draftWeek`
  (the week's shifts from the pattern, empty), `stillNeeded` /
  `scheduleGaps` (for "N משמרות חסרות עובד") and `availableFor` (a
  person's availability covers a shift; touching ranges join).
  `@db/schedule`: `saveWeekSchedule`, `getWeekSchedule`.
- Decisions (defaults, no question opened): only managers and owners
  edit the schedule (per-person permissions are not wired yet, as with
  availability); a shift may have more people than it needs; an owner
  may be put on a shift.
- Tests: 13 new unit tests (246 total); pgTAP `week_schedule.test.sql`
  (38); `rls_enabled` lists the two tables. Four planted bugs in the
  migration (no overlap check, workers reading shifts, workers saving,
  members of any business on a shift) and two in the domain each turned
  them red. All 14 pgTAP files ran on a local Postgres 16 with real
  pgTAP and stubbed auth; `pnpm check` and `pnpm build` pass.
- Not verified locally: no Docker in this run's container, so the
  Supabase CLI, `db lint` and the type generator run only in CI;
  `database.types.ts` was written to match the generator.
- Commit: squash of PR `agent/2c-1-schedule-db` (see the daily note in #1).
- Next: chunk 2c-2, the manager's "build the week" screen.
- Defaults applied: #25 default (keep building scheduling) while it is
  open; the decisions above.

## 2026-10-29 · run 19 · chunk 2b-3 (who has not sent availability)

- `/schedule/availability/team`, for owners and managers (and "view as"
  a manager); workers get the not-found screen. Two lists: "מי עוד לא
  שלח" (name, role, mobile) with a "חסרות N תשובות" badge, and "מי שלח"
  (when it came in, a "באיחור" badge after the due moment, the hours per
  day, the note). Phone: one under the other; tablet: side by side;
  desktop: one table, a row per person and a column per day.
- `/schedule` gains a row "זמינות הצוות" for managers: "N מתוך M שלחו"
  and the missing badge, or "כולם שלחו".
- `@domain/availability` `teamAvailability(members, answers, dueAt)`:
  who is missing (`missingAvailability`: owners are not waited for),
  who sent (owners included when they did), late, days with hours;
  answers from people no longer on the team are left out.
  `week.ts` reads the week and its answers once per request for both
  the worker's form and the manager's view.
- Demo: `/design/shell/schedule/availability/team` (mock answers: five
  sent, one late, one with no hours; two missing).
- Tests: 3 new unit tests (233 total); a planted bug (on-time answers
  counted late) turned them red. Playwright `team-availability.spec.ts`:
  the manager sees the seeded worker who sent (hours and note) and the
  one who has not, the owner is not listed; a worker has no such row and
  gets not-found; axe and no horizontal scroll. The new e2e helper
  `sendDemoAvailability` ran against a local Postgres 16 with the
  migrations and seed. Locally: `pnpm check`, `pnpm build`, the demo at
  390/820/1440 with axe (0 violations, no horizontal scroll).
- Not verified locally: no Docker daemon in this run's container, so the
  Playwright spec runs only in CI.
- Commit: squash of PR `agent/2b-3-team-availability` (see the daily note in #1).
- Next: chunk 2b ends the brief's backlog. Question #25 opened on
  what comes next; until Orel answers, the default is to keep building
  the scheduling module: 2c, the manager builds next week's schedule
  from the availability (shifts and who works them), then publishing.
- Defaults applied: an answer changed after the due moment counts as
  late; owners who send are listed among those who sent.

## 2026-10-28 · run 18 · chunk 2b-2 (the worker's availability form)

- `/schedule` is no longer a placeholder: a row "זמינות לשבוע הבא" with
  its state up front (a "לשלוח" badge until sent, then "נשלחה" and until
  when it can change). The schedule itself comes later.
- `/schedule/availability`: every day of next week with any number of
  hour ranges ("הוספת שעות", remove per range), a note for the manager,
  the due moment (or "past due, still accepted") and when the last answer
  was saved. "שליחת הזמינות" replaces the earlier answer; no hours means
  not available that week. Phone: days one under another; tablet: two
  columns; desktop: three (four cut the time fields). One form, so the
  grid reflows instead of three rendered shapes.
- Friday and Saturday rules: new scheduling setting `closedOnShabbat`
  (default on; both templates close on Shabbat). When on, Friday shows
  candle lighting and its hours must end by it (no past midnight);
  Saturday shows havdalah and its hours must start from it. Times come
  from the business's coordinates (`@db/availability` `getBusinessPlace`;
  Tel Aviv when missing) in its time zone.
- `@domain/availability-form`: `shabbatLimits`, `shabbatConflict`,
  `parseAvailabilityForm` (one error per range: time, same, outside,
  overlap, friday, saturday; note length), `dayMonth`. The browser and
  the server action run the same checks; the database rechecks all but
  Shabbat. Viewing as a role cannot save; an answer for a week that has
  since begun is refused ("weekChanged"). The week opens in the database
  with its first answer.
- Demo: `/design/shell/schedule/availability` (a fixed week in Tel Aviv,
  nothing stored), for the Vercel preview.
- Decisions (defaults, no question opened): the Shabbat rule above; a
  business without coordinates uses Tel Aviv; candle lighting is 20
  minutes for every business until a per-business setting is needed
  (Jerusalem's 40 is not applied yet).
- Tests: 14 new unit tests (230 total); two planted bugs in the Shabbat
  rule each turned them red. Playwright `availability.spec.ts`: a worker
  sends Sunday, Friday and Saturday hours, Friday past candle lighting
  and Saturday before havdalah are refused, the saved rows match, an
  empty answer replaces them, `/schedule` shows "sent"; axe and no
  horizontal scroll. Locally: `pnpm check`, `pnpm build`, and the demo
  at 390/820/1440 with axe (0 violations, no horizontal scroll).
- Not verified locally: no Docker in this run's container, so the
  Playwright spec runs only in CI.
- Commit: squash of PR `agent/2b-2-availability-form` (see the daily note in #1).
- Next: chunk 2b-3, the manager's "who has not submitted" list.
- Defaults applied: the decisions above.

## 2026-10-27 · run 17 · chunk 2b-1 (availability in the database)

- Split chunk 2b in three: 2b-1 weeks and availability in the database
  (today), 2b-2 the worker's availability form with the Friday and
  Saturday rules, 2b-3 the manager's "who has not submitted" list.
- Migration `20261027000100_availability.sql`: `schedule_weeks` (one per
  business and start date, with the due moment), `availability_submissions`
  (one per person and week, optional note) and `availability_ranges`
  (day, start, end; an end at or before the start runs past midnight).
  RLS: the team reads the weeks; a person reads their own availability,
  managers and owners everyone's; "view as" a manager reads it, as a
  worker does not; everything closes when scheduling is off.
- Secret key only: `open_schedule_week(business, week_start, due_at)`
  (refuses a start on another day than `weekStartsOn`, returns the week
  already open) and `submit_availability(actor, week, ranges, note)`
  (active members only, ranges inside the week, no overlaps on a day,
  replaces the last answer; an empty list means not available).
- `@domain/availability`: week dates (`weekStartOf`, `nextWeekStart`,
  `weekDates`), `availabilityDueAt` (the due day before the week, at the
  due time in the business's zone, clock changes included),
  `availabilitySubmission` (Zod, the same rules as the database) and
  `missingAvailability`. `@db/availability`: `openWeek`,
  `saveAvailability`, `getWeek`, `getWeekAvailability`.
- Decisions (defaults, no question opened): late answers are accepted
  (the manager sees when each came in); owners can submit but are not
  listed as missing.
- Tests: 19 new unit tests (216 total); pgTAP `availability.test.sql`
  (42); `rls_enabled` lists the three tables. Five planted bugs (a worker
  reading everyone's, no week bounds, no overlap check, a worker's view
  reading availability, members of any business saving) each turned it
  red. Unit tests also pass with the server in Los Angeles.
- Not verified locally: no Docker in this run's container. Migrations,
  seed and every pgTAP file ran on a local Postgres 16 with real pgTAP and
  stubbed auth; `database.types.ts` was written to match the generator,
  which CI checks.
- Commit: squash of PR `agent/2b-1-availability-db` (see the daily note in #1).
- Next: chunk 2b-2, the worker's availability form.
- Defaults applied: the two decisions above.

## 2026-10-26 · run 16 · chunk 2a (Shabbat times)

- `@domain/shabbat` on `@hebcal/core` 6.14.6 (new dependency, pure
  calculation, no network): `shabbatTimes(place, date)` gives the Friday,
  candle lighting and havdalah for the Shabbat a date belongs to (Sunday
  to Friday: the coming Friday; Saturday: the day before).
  `shabbatPlace` (Zod): latitude, longitude, time zone (default
  `Asia/Jerusalem`) and candle-lighting minutes (default 20).
  `ISRAELI_CITIES` (Jerusalem 40, Tel Aviv 20, Haifa 30), `timeIn`
  ("HH:MM" in a zone) and `isDuringShabbat` for the availability rules
  in 2b.
- Decision (default, no question opened): the Israeli customs hebcal
  uses: candles 20 minutes before sunset (40 in Jerusalem, 30 in Haifa),
  havdalah at 8.5° (three small stars), both rounded to the minute. A
  per-business setting can come with 2b if a pilot asks.
- Tests: 22 new (197 total): Jerusalem, Tel Aviv and Haifa on a summer
  and a winter Friday, the Friday Israel's summer time starts, a full
  year against hebcal's own Israeli calendar for each city, the same
  answer with the server in UTC, Los Angeles and Kiritimati, bounds of
  "during Shabbat", Zod limits. Two planted bugs (dates built in UTC, the
  wrong havdalah angle) each turned them red. hebcal.com was not
  reachable from the container, so the reference times are hebcal's
  library rather than the website.
- Commit: squash of PR `agent/2a-shabbat` (see the daily note in #1).
- Next: chunk 2b, availability (starting with weeks and availability
  ranges in the database).
- Defaults applied: the Shabbat customs above.

## 2026-10-25 · run 15 · chunk 1e ("view as" and the audit log)

- The console's business page gains "צפייה באפליקציה": three buttons
  open the business's app as its owner, a manager or a worker. A banner
  above every screen says who you are viewing as and that nothing is
  saved, with "סיום הצפייה" back to the business in the console.
  Platform admins and onboarders both may (`businesses.view_as`).
- Migration `20261025000100_view_as.sql`: table `view_sessions` (one
  open per team member, two hours at most, RLS: people read only their
  own). `private.is_viewing(business, min_role)` and
  `private.views_member` add read-only policies on businesses, profiles,
  memberships and modules; invites only when viewing as a manager or
  owner; the audit log stays closed. The viewer is never a member, so
  every write policy and server write function keeps refusing them.
  `start_view_session` / `end_view_session` (secret key only) write
  `view_as.start` / `view_as.end` to the business's audit log.
- App: `getCurrentMember` returns the viewed business and role plus
  `viewing`; the Team actions refuse with "זו צפייה בלבד" before reaching
  the database (`canWrite` in `@domain/view-as`).
- Decision (default, no question opened): a view session lives in the
  database rather than a cookie, so it follows the team member to every
  device until it ends or expires, and a stale cookie can never outlive
  it. Console writes stay allowed while viewing: they are the team's own.
- Tests: 15 new unit tests (175 total); pgTAP `view_as.test.sql` (32):
  only the server opens or ends sessions, X but not Y is readable while
  viewing, worker views read no invites, no rename or invite as any
  role, expired and ended sessions read nothing, audit rows for start
  and end; `rls_enabled` lists the new table. Playwright
  `view-as.spec.ts`: view as a worker (nav, no team screen, axe, end,
  audit counts) and as a manager (team visible, inviting refused,
  nothing stored).
- Not verified locally: no Docker in this run's container. Migrations
  and `view_as.test.sql` ran on a local Postgres 16 with stubbed auth and
  a pgTAP stand-in (32/32, `team_invites` 24/24); three planted bugs
  (invites open to a worker's view, a write policy for viewers, sessions
  not scoped to the business) each turned it red. Playwright and the real
  pgTAP run in CI.
- Commit: squash of PR `agent/1e-view-as` (see the daily note in #1).
- Next: phase 2, chunk 2a (Shabbat times in `@domain/shabbat`).
- Defaults applied: the session-in-the-database decision above.

## 2026-10-24 · run 14 · chunk 1d-2b (inviting from the Team screen)

- `/team` gains the main action "הזמנה לצוות" → `/team/invite`: name,
  mobile (`PhoneField`) and role, then the link with a copy button to send
  on. Nothing is sent from the app; in development the link is also
  logged. "הזמנה של מישהו נוסף" starts a fresh form.
- Each invite nobody claimed (open or expired) has "קישור חדש": a fresh
  link replaces the old one, the invite is open for 14 more days, and the
  screen re-reads its counts (`refresh()` from `next/cache`). Phone and
  tablet: under the row; desktop: a new "קישור" column.
- Rule (default, no question opened): owners and managers invite at their
  own role or below. A manager invites managers and workers and cannot
  send or change an owner's invite; only an owner invites an owner.
  `@domain/team`: `invitableRoles`, `canResendInvite`, `parseTeamInvite`.
- Migration `20261024000100_team_invites.sql`, secret key only:
  `team_invite(actor, business, phone, name, role, hash)` (refuses a
  number already in the team; a number with an unclaimed invite gets that
  invite refreshed; audit `invite.create` / `invite.send`) and
  `team_invite_link(actor, invite, hash)`. Both check the actor's own
  active membership and role in the invite's business.
- `@db/invites`: `inviteToTeam`, `issueTeamInviteLink`. The link-and-copy
  field is shared with the console (`app/copy-link.tsx`), and so is the
  request origin (`app/origin.ts`).
- `/design/shell/team` and the new `/design/shell/team/invite` render the
  real screens with stand-in actions (same checks, a link that leads
  nowhere, nothing stored).
- Tests: 8 new unit tests (160 total); pgTAP `team_invites.test.sql`
  (24); Playwright `team-invite.spec.ts` (a manager invites a worker and
  copies the link, the invite is in the database, a member's number is
  refused; a new link reopens an expired invite and an owner's invite has
  no button for a manager); `team.spec.ts`: a worker gets not-found on
  `/team/invite` too.
- Not verified locally: no Docker in this run's container. Migrations,
  seed and the new pgTAP file ran on a local Postgres 16 with stubbed auth
  and a pgTAP stand-in (24/24; a planted bug in the role check turns it
  red). Demo screens checked in a production build at 390/820/1440, before
  and after submitting, with errors and with a link shown: axe clean, no
  horizontal scroll. Playwright and the real pgTAP run in CI.
- Commit: squash of PR `agent/1d-2b-team-invites` (see the daily note in #1).
- Next: chunk 1e, "view as" a role with the audit log.
- Defaults applied: the invite-role rule above.

## 2026-10-23 · run 13 · fix: Next.js 16.4.1 (security)

- `pnpm build` stopped with a Next.js security notice, and `pnpm audit`
  confirmed it: next 16.4.0 is in range of two critical advisories
  (unauthenticated remote code execution in the Image Optimization API
  with SVGs, GHSA-2464-fhr4-w9xw; and in `use cache` functions returning
  typed arrays, GHSA-673q-mjm6-r5xr) and one high (Server Actions denial
  of service, GHSA-p3m5-59mp-jv5r). Patched in 16.4.1.
- `next` 16.4.0 → 16.4.1 (exact pin, lockfile regenerated by pnpm). No
  code change. `pnpm audit --prod`: no known vulnerabilities. `pnpm
  check` and `pnpm build` pass.
- The PR's first e2e run failed on one test (phone, `invite.spec`): the
  platform admin's code was refused because `admin.spec`, just before it,
  had signed the same number in under 5 seconds earlier (the auth
  server's resend cooldown). A race in the specs that a faster build
  exposed. `e2e/session.ts`: when the form says "ask again in a few
  seconds", the helper waits 5.5 s and asks once more, as a person would.
- Merged before today's chunk so the Vercel preview is patched first
  (PR #17).

## 2026-10-23 · run 13 · chunk 1d-2a (the Team screen)

- Split chunk 1d-2: 1d-2a the Team screen, read only (today); 1d-2b a
  manager invites by phone from it and sends a new link for an expired
  invite.
- `/team` in the app, for owners and managers (`canSeeTeam`); a worker
  gets the not-found screen. Members (owners, managers, workers, by name)
  and invites nobody has claimed, open first, then expired. Phone: two
  lists stacked; tablet: side by side; desktop: one table with a status
  column. The header and the invites section count the invites waiting,
  and expired ones say who can send a new link (the ConceptApp team, until
  1d-2b).
- Home gains "ניהול העסק" with a row to the team for owners and managers,
  showing invites waiting (or the head count). Not a nav item: the nav
  holds home plus four modules, the five-item limit.
- `@domain/team` (`canSeeTeam`, `buildTeam`: order, open/expired, counts);
  `@db/team` (`getTeam`, read under RLS: managers already read their
  business's invites, and members read colleagues' profiles). No
  migration.
- `/design/shell/team` now renders the real screen (`TeamView`) with mock
  people instead of a placeholder; its placeholder copy is gone.
- Tests: 5 new unit tests (153 total); Playwright `team.spec.ts`: the
  owner sees the waiting count on home, opens the team, finds members and
  an open and an expired invite in each layout; a worker has no row and
  no screen. `modules.spec.ts` counts module cards apart from the team row.
- Not verified locally: no Docker in this run's container, so Playwright
  runs in CI. `/design/shell/team` checked in a production build at
  390/820/1440: axe clean, no horizontal scroll.
- Commit: squash of PR `agent/1d-2-team-screen` (see the daily note in #1).
- Next: chunk 1d-2b, inviting from the Team screen.
- Defaults applied: none today.

## 2026-10-22 · run 12 · chunk 1d-1 (invite links and joining)

- Split chunk 1d: 1d-1 the link and joining through it (today), 1d-2 the
  Team screen in the app (members and open invites, a manager invites by
  phone).
- Migration `20261022000100_invite_links.sql`, all three functions for the
  secret key only: `issue_invite_link(actor, invite, hash)` (team only; a
  fresh token replaces the old one and gives 14 more days; audit
  `invite.send`), `invite_by_token(hash)` (the invite, its business and
  open/claimed/expired), `claim_invite(hash, claimant)` (only the invited
  number; membership with the invite's role, an inactive one comes back;
  invite marked claimed; name copied to an empty profile; audit
  `invite.claim`; one transaction). `admin_business` people carry
  `invite_id`.
- Console: on a business's page each invited person has "יצירת קישור
  הזמנה". The link is shown with a copy button for the team member to send
  themselves (WhatsApp or SMS from their phone). Nothing is sent from the
  app; in development the link is also written to the server log.
- `/join/<token>` in the business accent: who invited you and as what, the
  code goes to the invited number (only its last four digits are shown),
  then the server claims the invite and opens home. A number with no
  account gets one first (admin API), since sign-in never creates
  accounts. Used, expired and unknown links each say what to do.
- `@domain/invites` (token shape, link, phone ending); `@db/invites`
  (token + SHA-256, issue, find, ensure account, claim). Sign-in's code
  sending and checking moved to `app/(auth)/otp.ts`, shared by both.
- Local Supabase rate limits for SMS, sign-in and verification raised to
  120 per window: the e2e suite now signs in about fifteen times per size.
- Tests: 7 new unit tests (148 total); pgTAP `invite_links.test.sql` (19)
  and one more in `business_staff.test.sql`; Playwright `invite.spec.ts`
  (the backlog's done-when): a platform admin issues and copies a link,
  the invited number opens it signed out, joins with the code and lands on
  home in the demo restaurant as a manager; the used link and an unknown
  link say so. axe and overflow on every step.
- Not verified locally: no Docker in this run's container. Migrations,
  seed and the two pgTAP files ran on a local Postgres 16 with stubbed
  auth and a pgTAP stand-in (all green). The join page's "link not active"
  state checked in a production build at 390/820/1440 (axe clean, no
  horizontal scroll). Playwright and the real pgTAP run in CI.
- Design-system fix found by the new spec: the primary button's hover
  (`bg-accent/90`) lightened the accent toward white, so white text fell
  to 4.31:1 on the demo blue (axe, tablet and desktop, where the pointer
  stays on the button). New tokens `accent-hover` / `accent-press` in
  `globals.css` move the accent away from its ink (darker under white,
  lighter under dark text), so hover and press only raise the contrast
  `accentTokens` guarantees. Checked on `/design` with blue and yellow
  accents: axe clean while hovered. The join form also renders each step
  as its own form, so the code step's button is never the faded send
  button.
- Known limit: a person already in another business still lands in their
  oldest one until the business switcher exists. Invites past 14 days drop
  off the console's list (1d-2 shows them so a new link can be sent).
- Commit: squash of PR `agent/1d-1-invite-links` (see the daily note in #1).
- Next: chunk 1d-2, the Team screen.
- Defaults applied: none today.

## 2026-10-21 · run 11 · fix: `main` red after 1c-3

- CI on `main` failed at `abdcf64` (the PR's own run was green): the e2e
  test "an onboarder opens a café" failed on desktop only, axe reporting
  `document-title` on the checklist page. Cause: Next.js streams a page's
  metadata in after its body (generateMetadata, "Streaming metadata"), and
  the checklist's title depends on the slug, so after the wizard's
  redirect axe could run before the `<title>` arrived. A race in the test,
  not a missing title: the page sets one.
- `e2e/new-business.spec.ts`: every axe check first waits for a title
  ending in "ConceptApp"; both checklist steps assert the exact title
  (`<slug> · ConceptApp`), which also tests it.
- Not reproduced locally: no Docker in this run's container. `pnpm check`
  (141 unit tests) and `pnpm build` pass; CI runs the e2e job.
- Commit: squash of PR `agent/fix-main-title-race` (see the daily note in #1).
- Next: chunk 1d, invites: send by link (logged, not sent, in dev), claim
  through a server function, and the Team screen.
- Defaults applied: none today.

## 2026-10-20 · run 10 · chunk 1c-3 (staff list and checklist)

- Wizard step 4 "צוות": paste a staff list, one person per line (name and
  mobile in any order; commas, tabs or dashes; an optional role word such
  as בעלים, מנהל/ת, אחמ"ש, owner). A live preview shows who will be
  invited with their role, and names each line to fix by number (no
  number, not an Israeli mobile, no name, a repeated number). Optional;
  at most 60 people. New `TextArea` in `@ui/text-field`, on `/design`.
- `@domain/staff-list` (`parseStaffList`) and `@domain/setup`
  (`setupChecklist`); `parseNewBusiness` gains `staff`.
- Migration `20261020000100_business_staff.sql`: `invites.full_name`; one
  open invite per number in a business (partial unique index);
  `create_business(…, staff jsonb)` invites everyone in the same
  transaction and counts them in the audit log. Each invite gets a random
  token of which only the hash is kept, so sending (1d) issues a fresh one.
  `admin_business(slug)` (team only) returns a business with its members
  and open invites.
- After opening, the console goes to `/admin/businesses/<slug>`: the
  checklist (opened from the template, owner invited, staff invited,
  address), worked out from the database, and the people (list on phone
  and tablet, table on desktop). The business list links to it; the old
  "opened" notice on the list moved here.
- Tests: 10 new unit tests (141 total); pgTAP `business_staff.test.sql`
  (12; dropping the unique index turned 2 red); Playwright: the café test
  now ends on the checklist with nobody invited, and a new test has a
  platform admin open a restaurant, fix a bad line, invite three people
  and check the invites in the database (the backlog's done-when for 1c).
- Not verified locally: no Docker in this run's container. Migrations,
  seed and every pgTAP file ran on a local Postgres 16 with stubbed auth
  and a small pgTAP stand-in (all green). The wizard's staff step and the
  checklist were checked in a production build with a stubbed session at
  390/820/1440: axe clean, no horizontal scroll. Playwright and the real
  pgTAP run in CI; `database.types.ts` was edited to the generator's
  format and CI's diff check confirms it.
- Commit: squash of PR `agent/1c-3-staff-and-checklist` (see the daily
  note in #1).
- Next: chunk 1d, invites: send by link (logged, not sent, in dev), claim
  through a server function, and the Team screen.
- Defaults applied: none today.

## 2026-10-19 · run 9 · chunk 1c-2 (new-business wizard)

- `/admin/new`: a three-step wizard (kind of business → name, slug,
  address → colour with a live preview and a summary), one step at a time
  on phones; a two-column details step on tablets; the summary beside the
  form on desktop. Each step is checked before moving on; the server
  repeats every check. The list's main action "פתיחת עסק חדש" opens it
  (both platform roles); back on the list an accent card says the
  business is open.
- `@domain/business`: `parseNewBusiness` (per step or whole), slug rules
  (same as the DB check, plus reserved app paths such as `admin`,
  `sign-in`), `normalizeSlug`, stored accent = `accentTokens(pick).accent`.
  `ACCENT_PRESETS` in `@domain/color` (eight colours, none adjusted).
- Migration `20261019000100_create_business.sql`:
  `public.create_business(actor, …)`, service role only: refuses an actor
  who is not platform staff, inserts the business, `apply_template`, and
  writes `business.create` to `audit_log`, all in one transaction. A taken
  slug fails with 23505 and the form goes back to the slug.
- First use of the secret key: `@db/supabase/admin` (`createAdminClient`,
  `server-only`), `parseSecretKey` (never echoes the value), and
  `createBusiness` in `@db/admin`. CI's e2e job reads the local stack's
  `SECRET_KEY` from `supabase status` (masked).
- Tests: 20 new unit tests (131 total); pgTAP `create_business.test.sql`
  (14; a planted missing staff check turned 3 red); Playwright
  `new-business.spec.ts` (onboarder opens a café in three steps, empty
  fields caught, a taken slug refused by the server, the result checked
  in the database; a manager gets no access; axe and overflow per step).
- Not verified locally: no Docker in this run's container, so the
  Supabase stack could not start. The migrations and the new pgTAP file
  ran on a local Postgres 16 with stubbed auth and a small pgTAP stand-in;
  the wizard was checked in the dev server at 390/820/1440 (axe clean, no
  horizontal scroll). Playwright and the real pgTAP run in CI.
  `database.types.ts` was edited to the generator's format; CI's diff
  check confirms it.
- Commit: squash of PR `agent/1c-2-new-business` (see the daily note in #1).
- Next: chunk 1c-3, pasting the staff list in the wizard and the
  post-create checklist, with the Playwright test that creates a business
  from the restaurant template.
- Defaults applied: none today.

## 2026-10-18 · run 8 · chunk 1c-1 (admin console: roles and business list)

- Split chunk 1c: 1c-1 roles and the business list (today), 1c-2 the
  new-business wizard (template, name, slug, address, accent, create; the
  admin client with the secret key), 1c-3 staff list paste and the
  checklist, with the Playwright test that creates a business.
- Migration `20261018000100_platform_staff.sql`: enum `platform_role`
  (`platform_admin`, `onboarder`), table `platform_staff` (RLS: people read
  only their own row; no browser writes), `private.is_platform_staff()`,
  and `public.admin_businesses()` (security definer, staff only, raises
  42501 for anyone else): every business with active members and open
  invites. Staff get no extra policies on tenant tables.
- `@domain/platform`: `platformCan(role, action)`. Onboarders read and
  create businesses and invite staff; deleting, templates and billing are
  platform admin only.
- App: `/admin` in route group `(admin)`, AppShell in ConceptApp's brand
  colour (`brandStyle`, new token `--brand-ink`). Business list: a list on
  phones, a two-column grid on tablets, a table on desktop. Off-team people
  get a "no access" screen; team members with no business are sent from
  `/home` to `/admin`. `proxy.ts` guards `/admin`.
- Seed: דנה צוות (050-000-0005, platform admin) and רון צוות
  (050-000-0006, onboarder), in no business.
- Tests: 10 new unit tests (111 total), pgTAP `platform_staff.test.sql`
  (13; a planted open policy turned 3 red), Playwright `admin.spec.ts`
  (signed out, admin, onboarder, a manager without access; axe and
  overflow). `e2e/session.ts` holds the shared sign-in helper.
- Not verified locally: the auth image could not be pulled (registry
  limits), so the Playwright spec ran only in CI. Migrations, seed, pgTAP
  and the generated types ran on the bare `supabase/postgres` image.
- Decision: the console lives at `/admin` for now. An `admin.` subdomain
  becomes a rewrite in `proxy.ts` when the production domain is set up.
- Commit: squash of PR `agent/1c-1-admin-console` (see the daily note in #1).
- Next: chunk 1c-2, the new-business wizard.
- Defaults applied: none today.

## 2026-10-17 · run 7 · chunk 1b (templates)

- Templates are data: migration `20261017000100_templates.sql` writes
  `restaurant` and `cafe-bar` into `templates` (modules on/off, module
  settings, positions, weekly shifts, opening hours, a storefront tagline).
  New columns `businesses.opening_hours` and `template_version`.
- `public.apply_template(business, template)`: one transaction, server only
  (`service_role`); refuses a business already set up, unknown keys and a
  template missing a module, changing nothing. `applyTemplate` in
  `@db/templates` wraps it for the admin client (1c). The seed now sets up
  the demo restaurant with it.
- Domain: `@domain/hours` (times, ranges past midnight, opening hours with
  no overlaps), `@domain/staffing` (positions, shift patterns, `shiftsOn`),
  `@domain/templates` (`validateTemplate`: every module present, settings
  valid with no unknown fields, requirements on). Scheduling settings gain
  `positions` and `shifts`; storefront gains `tagline`.
- Tests: 19 new unit tests (101 total); pgTAP `templates.test.sql` (18);
  new `pnpm test:db` (CI `database` job): every template in the database is
  valid against the real manifests and applying it to a fresh business
  gives back the same valid definition; the seeded demo is valid. Planted
  failures: an execute grant to `authenticated` and an unknown settings
  field both went red.
- Not verified locally: the Supabase CLI images could not be pulled here
  (registry rate limit). Migrations, seed, pgTAP for templates and
  `test:db` ran on the bare `supabase/postgres` image; the full suite runs
  in CI.
- Defaults (no question opened): the restaurant template's shifts are the
  demo shifts (per #3); positions מלצר/ית, ברמן/ית, טבח/ית, מארח/ת. The
  cafe-bar starts with reservations off (walk-in); the owner can switch it
  on. Opening hours and taglines are editable starting values.
- Commit: squash of PR `agent/1b-templates` (see the daily note in #1).
- Next: chunk 1c (admin console and the new-business wizard), probably split.
- Defaults applied: none today.

## 2026-10-16 · run 6 · chunk 1a (module system)

- `@domain/modules`: `ModuleManifest` + `defineManifest`, `enabledModules`
  (row on and every requirement on, transitively; cycles count as off),
  `moduleNav` (by role, ordered, at most 4 next to home), `moduleWidgets`,
  `canOpenModule`, `readModuleSettings` (invalid fields fall back to
  defaults one by one) and `validateModuleSettings` (throws, for writes).
- Five manifests in `modules/<key>/manifest.ts` (folder = DB enum key)
  with Zod settings and defaults, and `modules/registry.ts`. Nav: סידור,
  שעון, הזמנות (worker+), דף העסק (manager+); notifications has no screen.
- App: `@db/modules` reads `business_modules` under RLS; the `(app)` layout
  and home build nav and home cards from the enabled modules. Module routes
  `/schedule`, `/clock`, `/reservations`, `/storefront` show the module's
  entry screen (says it opens in the next stage, link home) or the new
  in-app not-found screen when the module is off or above the role.
  `proxy.ts` guards the new routes.
- Tests: 24 new unit tests (domain logic with fixtures; registry against
  the DB enum, tab-bar limit, defaults, messages; proxy guard, planted a
  missing route and it failed). 82 total. Playwright `modules.spec.ts`:
  owner sees 5 items, switching reservations off in the DB removes the nav
  item and home card and closes the route, back on restores it; a worker
  does not see the storefront. Vitest now resolves the tsconfig aliases.
- First CI run: `sign-in.spec` failed because `modules.spec` had just
  signed in the same worker (the auth server refuses a second code to a
  number within 5 s). Seeded a second demo worker (יואב לוי, 050-000-0004)
  for the modules spec.
- Not verified locally: the Supabase auth image could not be pulled here
  (registry rate limit), so the e2e test ran only in CI.
- `module_enabled` in RLS: no module table exists yet. Rule 5 in
  `modules/README.md`: each module table's policies add it, starting with
  availability (2b).
- Note: `notFound()` after the shell has streamed keeps status 200 (Next.js
  adds noindex); the test checks the screen, not the status.
- Commit: squash of PR `agent/1a-modules` (see the daily note in #1).
- Next: chunk 1b (templates `restaurant` and `cafe-bar` as data, applied in
  one transaction).
- Defaults applied: #8, no answer by 16.10 10:00: migrations stay local
  until Orel is back; 3b waits.

## 2026-10-15 · run 5 · chunk 4 (phone login)

- Skipped 3b (waits on #8, default 16.10 10:00) and did chunk 4 against a
  local Supabase.
- `@supabase/ssr` + `@supabase/supabase-js`; `packages/db`: `env.ts` (Zod,
  publishable key only), `supabase/server.ts`, `supabase/proxy.ts`,
  `session.ts` (`getCurrentMember`). Root `proxy.ts` refreshes the session
  on `/home` and `/sign-in` and redirects each side of the door.
- `/sign-in`: phone, then the 6-digit code, in one form (`useActionState`);
  resend and change-number; clear errors for a malformed number, an unknown
  number, rate limits and a wrong code. `(app)` layout: `AppShell` in the
  business accent, an empty home with sign-out, a "not in a business yet"
  screen. Copy in `messages/` (namespaces `auth`, `app`).
- Decision: no sign-ups from the sign-in screen (`[auth] enable_signup =
  false`). Unknown numbers get "not registered yet" and no SMS is sent;
  accounts come from invites (chunk 1d).
- Dev SMS: `send_sms` auth hook → `dev.sms_codes`, defined in `seed.sql`
  so it never reaches a real project; Twilio enabled with placeholders only
  because the CLI turns phone login off without a provider. Seeded users got
  empty token columns (GoTrue fails on NULL).
- Tests: Playwright (`pnpm e2e`) at 390/820/1440: redirect when signed out,
  sign-in with the hook's code (and a wrong code first), home, axe clean,
  no horizontal scroll, sign-out; unknown and malformed numbers. 12 passed.
  pgTAP `dev_sms.test.sql` (5, planted grant made it fail). Unit tests for
  the env parser and the code format (58 total). New CI job `e2e`.
- Commit: squash of PR `agent/4-phone-login` (see the daily note in #1).
- Next: phase 1, chunk 1a (module system). 3b when #8 is settled.
- Defaults applied: none today.

## 2026-10-14 · run 4 · chunk 3b (stopped, nothing merged)

- Wrote a workflow that applies migrations to `conceptapp-dev` after green
  CI. The run's safety checks blocked an unattended write to a real
  database, so nothing was pushed. Question #8 asks how migrations should
  reach `conceptapp-dev` (default: local only until Orel is back).
- Defaults applied: #2 (assume the pilot agreed, keep building on the demo
  restaurant) and #3 (the demo shifts in `app/design/shell/data.ts` become
  the `restaurant` template defaults). Both closed.

## 2026-10-13 · run 3 · chunk 3a (database: schema, RLS, tests)

- Split chunk 3: 3a local schema and tests (today), 3b apply migrations to
  `conceptapp-dev` from CI with the GitHub secrets, 3c remaining polish if
  any (e.g. template seed with chunk 1b).
- Supabase CLI 2.118.0 as a dev dependency; `supabase/config.toml` from
  `supabase init` (Postgres 17). Scripts `db:start`, `db:test`, `db:reset`,
  `db:types`.
- Migrations: `templates`, `businesses`, `profiles` (created from
  `auth.users` by a trigger, phone in E.164), `memberships` (role
  owner/manager/worker + extra perms), `business_modules`, `invites` (token
  hash only), `audit_log`. Helpers `is_member`, `has_role`, `has_perm`,
  `module_enabled` in a `private` schema the API does not expose.
- RLS on every table; anon has no table privileges. Writes are server-only
  except: owners rename their business, people edit their own name and
  language (column grants).
- pgTAP (39 tests): RLS meta-test, anonymous reads nothing, A cannot read
  or write B, role limits inside a business, inactive members, helpers.
  Each kind of failure was planted (table without RLS, open policy, anon
  grant) and the tests went red. New CI job `database`: start, test,
  `db lint`, and a check that `packages/db/database.types.ts` is current.
- Decision: schema as plain SQL migrations + generated types instead of
  Drizzle (the old `packages/db` README named it). Fewer moving parts; the
  types come from the real schema.
- Commit: squash of PR `agent/3a-database` (see the daily note in #1).
- Next: chunk 3b, a workflow that applies migrations to `conceptapp-dev`.
- Defaults applied: none. Questions #2 and #3 open until 14.10 04:00.

## 2026-10-12 · run 2 · chunk 2c-2 (messages, next-intl)

- next-intl 4.14.9 without locale routing: `i18n/request.ts` always serves
  Hebrew, so every page stays static under `cacheComponents`. `i18n/config.ts`
  lists `he`/`en` and the direction of each; keys are typed from `he.json`.
- `messages/he.json` and `messages/en.json`: every string from `app/` and
  `packages/ui` (home, gallery, shell demo, AppShell labels). Counts use ICU
  plurals; the list of names uses `format.list`. The `/design` gallery
  switches language through its own `NextIntlClientProvider`.
- Checks in `pnpm check`: `tooling/hebrew-literals.ts` (TypeScript AST, so
  comments are ignored) fails on Hebrew in strings or JSX text; verified by
  planting a literal. `tooling/messages.test.ts`: same keys and placeholders
  in both files. Demo data `app/design/shell/data.ts` is allowed (it stands
  in for database rows); weekday names moved to messages.
- Accessibility: axe was not clean before (gallery had no `<main>`, card
  titles jumped from h1 to h3). Gallery root is now `<main>`; `CardTitle`
  takes `as="h2"`. 0 violations at 390/820/1440 on all demo routes and the
  English gallery; no horizontal scroll. 47 unit tests.
- Commit: squash of PR `agent/2c-2-messages` (see the daily note in #1).
- Next: chunk 3 (database), starting with Supabase CLI config and the first
  migrations.
- Defaults applied: none. Questions #2 and #3 open until 14.10 04:00.

## 2026-10-12 · run 1 · chunk 2c-1 (layer boundaries)

- Split chunk 2c in two: 2c-1 layer boundaries (today), 2c-2 next-intl and
  the Hebrew-literal check (next).
- `biome.json`: per-folder `noRestrictedImports` overrides. domain imports no
  other layer and no React/Next/Supabase; ui and db import only `@domain`;
  modules reach other modules only via `@modules/<key>/manifest`; only `app/`
  imports `@/…`.
- `tooling/boundaries.ts` + test: catches relative imports that climb into
  another module at any depth (Biome patterns cannot), and proves with probe
  files that Biome rejects every forbidden import and accepts the allowed
  ones. Verified by disabling a rule: the test fails. 40 unit tests total.
- Commit: squash of PR `agent/2c-1-boundaries` (see the daily note in #1).
- Next: chunk 2c-2, next-intl with `messages/he.json` and `messages/en.json`.
- Defaults applied: none. Questions #2 and #3 open until 14.10 04:00.

## 2026-10-12 · kickoff

- Access: push, issues and PRs on `SuyfooS/conceptapp-v2` confirmed. CI on
  `main` green at `9c6bb8e`.
- Labels `orel` and `urgent` created (`question` already existed). Log issue
  #1 `יומן הסוכן` created and pinned.
- Questions opened: #2 (pilot meeting) and #3 (real shifts), deadline
  14.10.2026 04:00 Israel time.
- Question 3 (Supabase secrets) not opened: Orel confirmed that
  `conceptapp-dev` exists and that `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` are set in GitHub
  (`gh secret list` shows all three). Chunk 3 applies migrations there.
- Brief: the agent's own issues and comments start with 🤖, because they are
  written through @SuyfooS too.
- Next: the first daily run, chunk 2c.

## 2026-10-12 · setup (before the autonomous month)

- State: phase 0 chunks 1, 2 and 2b merged (skeleton, design system, responsive
  app shell with the `/design/shell` demo). CI: Biome, typecheck, 34 unit
  tests, build.
- Added `docs/AGENT.md` (brief), `docs/agent/RUN_PROMPT.md` (scheduled prompt),
  `docs/agent/KICKOFF.md` (one-time setup) and this log.
- Schedule: daily at 09:50 Israel time (`CRON_TZ=Asia/Jerusalem 50 9 * * *`).
- Next: chunk 2c (layer boundaries in Biome, next-intl message files).
- Open on the first run: the three questions listed at the end of the brief.
