# packages/db

Typed access to the database: generated types now, server queries as the
screens that need them arrive. Import as `@db/<file>`.

- The schema is plain SQL in `supabase/migrations/` (one file per change,
  never edited after it is merged).
- `database.types.ts` is generated from the local database with
  `pnpm db:types`. Never edit it by hand; CI fails if it is out of date.
- The RLS tests (pgTAP) live in `supabase/tests/database/` and run with
  `pnpm db:test`.

## Access rules

Every tenant table carries `business_id`. Row-level security filters on it
through helpers in the `private` schema (not exposed by the Data API):

| Helper | True when the signed-in user… |
| --- | --- |
| `private.is_member(business)` | has an active membership in the business |
| `private.has_role(business, min_role)` | has at least that role (owner > manager > worker; an accountant ranks as a worker) |
| `private.has_perm(business, perm)` | holds the permission, as `private.holds_perm` says (owners hold all) |
| `private.is_staff_member(business)` | is an active member on the staff (any role but accountant) |
| `private.is_viewing_staff(business)` | is on the ConceptApp team viewing the business as a staff role (read policies only) |
| `private.viewing_payroll(business)` | is on the ConceptApp team viewing the business as an accountant: the one view that reads pay |
| `private.reads_pay_of(person)` | holds `clock.payroll`, or views as an accountant, in a business that person is or was in |
| `private.reads_member_name(business, person)` | may read the business's name for that person (`public.member_names`): as their profile is read, in that business: its members and the team viewing it while the person is active in it, and its pay holders (and a view as an accountant) also once they left |
| `private.module_enabled(business, key)` | (any user) the module is switched on for the business |
| `private.order_taking_on(business)` | (any user) taking orders is switched on for the business (the menu's policies) |
| `private.runs_orders(business, person)` | (that person) runs the business's menu: holds `order_taking.edit` (`private.holds_perm`), so an active member only; "sold out" for any item, and the orders to come (P3) |
| `private.sets_up_menu(business, person)` | (that person) sets the business's menu and places up: `private.runs_orders`, or is on the ConceptApp team (P2, for the console); the six writes that set the menu up ask it |
| `private.is_viewing(business, min_role)` | is on the ConceptApp team with an open "view as" session in the business, at that role or above (read policies only; a view as a role the business named ranks as its base) |
| `private.can_manage_lists(business, person)` | (that person) holds `lists.manage` (`private.holds_perm`: an owner always, managers by default, a role an owner raised, or one given it; since R5) |
| `private.sees_list(list, person)` | (that person) is an active member of the list's business who holds it, sent it, was given it, is in the department that asked for it or one it passed through, or holds `lists.manage` |
| `private.chat_reads_from(conversation, person)` | (that person) reads the chat, and from when: one of a private chat's two people while on the staff, the active staff in the team's group from when each came onto the staff this time (`memberships.staff_since`, which moves when someone comes back after leaving or from being an accountant), a live department's members on the staff from when each was added or came back, whichever is later, and moderators (`chat.moderate`) all of every group; null for anyone else, with chat off, and for a view session |
| `private.is_private_action(action)` | (any user) a log row about chats, documents or the hiring file (`chat.*`, `document.*`, `employee.*`), which no view session reads |
| `private.log_perm(action)` | (any user) the permission a log row is read with besides `manage.view`: its own area's (`clock.edit`, `schedule.edit`, `lists.manage`, `team.view`, `chat.moderate`), `manage.view` for the management page's own families, and null for a family it doesn't name, which no one reads through it (`tooling/log-families.test.ts` makes each family the migrations write name its area) |
| `private.held_perms()` | the rows (business, permission) of every key they hold as an active member, for a policy's `(business_id, key) in (select …)` |
| `private.viewed_perms()` | the same for their open view session: what the viewed role holds by role (a role the business named: its own rules, else its base's), every key but pay as the owner, pay only as an accountant |
| `private.holds_files(business, person)` | (that person) holds `people.files` (`private.holds_perm`: owners always, accountants by their grant, anyone an owner gave it; active members only) |
| `private.file_ready_holder(business, person)` | (that person) holds the files and confirmed the duties screen in its wording now (`private.file_acknowledgements`) |
| `private.viewing_business(business)` | has an open view session in the business, as any role: every file read refuses it |
| `private.keeps_demo_files(business)` | (any user) a demo business whose definition doesn't open its files (`"fileWrites": true`, which no definition says in H4) |
| `private.file_open_for(business)` | (any user) null when the business takes file writes, else why not: `off`, `demo` (a closed demo) or `not_open` (not a demo while `private.file_settings.real_values` is false) |

Writes to businesses' structure (memberships, modules, invites, templates,
audit log) go through server code with `SUPABASE_SECRET_KEY`. So do a
business's own details: `public.set_business_details(actor, business, patch)`
saves its name, colour, address and Shabbat city for whoever holds
`manage.edit` (owners and managers by default, since the roles plan's R7) or the
team, and logs what changed. So does a profile (`20261109000400_profile_about.sql`):
`public.set_own_profile(actor, patch)` changes the signed-in person's own name
(from "השם שלי" on `/me`, kept as the team keeps names: `parseTeamName`;
demo people keep theirs, 55000), language, line about themselves, cover and
form of address, and
`public.clear_profile_bio(actor, business, person, seen)` lets whoever edits
the team (`team.edit`, since the roles plan's R6) delete a hurtful line of
their own role or one below it, the one they read (`seen`; a line rewritten
since stays, with 40001), logged as `profile.bio_cleared` without the text.
From the browser, reads follow the policies and nothing writes a profile.

Profile photos (`20261107000200_profile_photos.sql`, read by the server only
since `20261127000300_files_server_only.sql`) live in the private bucket
`avatars` at `<user id>/<key>.<jpg|png|webp>`, which `profiles.avatar_path`
points at. No bucket has a policy, so no session downloads, lists or signs a
link to a file. `@db/profile-photos` `profilePhotoBytes` serves the app's
`/photos` route: `public.sees_profile_photo(photo_path)` under the reader's
own session (true only while the folder's profile points at that photo, for
the person and their active colleagues, `private.shares_business`; no branch
for a view session), and only then the secret key's download.
`setProfilePhoto` uploads under a new random key and points the profile at
it with `public.set_avatar_path(person, new_path)` (the secret key's: under the
row's lock, it returns the photo it replaced, to remove; P0002 for no such
person, 23514 for a path out of their folder, 55000 for a demo business that
keeps its people); `removeProfilePhoto` calls it with no `new_path`. A removal
is tried twice and logged by code. `cleanProfilePhotos` removes, a batch at a
time, the files a day old that no profile points at
(`public.expired_avatars(at_time, max_rows)`, the secret key's), from the daily
`/cron/list-photos`, which `private.list_photos_tick` now also asks while one
is due. `profilePhotoUrls` (signed links under the session) is gone. Covered by
`storage_server_only.test.sql` and `profile_photos.test.sql`.

Changing the team (`20261114000100_team_changes.sql`; Orel, 14 November 2026)
goes by the rule of inviting: whoever may invite to a role may take someone off
the team from it and change someone from it and to it, so an owner acts on
everyone and a manager on managers and workers (`private.gives_role`, the twin
of `invitableRoles`; never the enum's order; since R6 whoever edits the team,
by rank, below), never on oneself (22023), never
leaving the business without an owner (23P01, under a lock on the business's
row), never in a demo closed to invites (55000, hint `demo`) and never for
someone clocked in (55000, hint `clocked_in`). All three are the secret
key's, for `actor`. `public.remove_member(actor, business, person, at_time)`
keeps the membership, inactive, with `memberships.left_at` (cleared when the
row is made active again) and its personal permissions cleared, and keeps every
record: hours, pay, periods (the trigger closes the open one), past and begun
shifts, availability, chat, documents, the log. `private.leave_staff` takes the
person off their shifts still to start in published weeks and drafts (after
locking the weeks, in `publish_week_schedule`'s order), cancels the live swaps
they asked for on them, opens again a colleague's swap they took that still
waits for approval (Orel, 15 November 2026: `status = 'open'`, no taker), and
takes them out of their departments, open lists and lists' times.
Their own lines there are read and kept off the phone; the schedule's other
builders get `schedule.unfilled` (a count per published week, never who;
counted again by publishing the week, which settles it when no shift ahead
lacks anyone and otherwise lowers its count to what is left, never raising it,
without telling anyone again, and settled by the minute job once none does,
`private.settle_unfilled` from
`private.settle_done_reminders`),
the other side of a swap cancelled `swap.removed`, and the asker of one open
again `swap.reopened` (its approval settled, and offered again as a new request
is, `swap.offered`). `public.set_member_role(actor,
business, person, new_role, seen_role, at_time)` does the same to someone made
an accountant (decision 2 for the shifts, where `claim_invite` refuses),
clears personal permissions for an owner or an accountant, keeps them between
manager and worker, refuses an accountant on another staff (23505), reads a
demoted person's lines for a role above theirs, writes nothing for the same
role, and says 40001 when the role moved from `seen_role` (an undo). Both
return how many published shifts, draft shifts and swaps came off, and how many
swaps opened again (`reopened`).
`public.team_invite_cancel(actor, invite, at_time)` follows
`team_invite_link`'s rule, and the row stays for the log: `claimed_at` closes
it for every reader of open invites, `invites.cancelled_at` says why, and a
fresh hash of no token ends its link. The log rows are `member.remove`,
`member.role`, `member.name` and `invite.cancel`, with ids, roles, counts
and the shifts' days and times, never a name. `public.own_departures()` (granted to
`authenticated` alone, for `auth.uid()`) names the businesses someone was
taken off, since the policies show them nothing else of those. `@db/team`
(`removeMember`, `setMemberRole`, `cancelTeamInvite`, `ownDepartures`,
`shiftsAhead`) calls them, and reads under the manager's session what the
person's page says first: `isClockedIn` (an open entry refuses the change)
and `getFormerMember` (the inactive row, for a page that says they left
instead of "not found"; the name only for a pay holder). A builder opened
before someone left fails its save with 22023 or 42501, which
`scheduleTeamChanged` in `@db/schedule-errors` tells apart (by the two
sentences, pinned in pgTAP). `save_week_schedule` now locks its week first,
as `publish_week_schedule` does, so a draft saved and a removal take turns
on it instead of deadlocking or putting the person back on the draft; and
`request_shift_swap` and `take_shift_swap` lock the actor's membership first
(for share, where a team change locks it for update), so a request or a take
under way while someone leaves is either seen and settled by the removal or
refused after it (42501), never left behind on a shift they are off.
`team_changes.test.sql` and `team-changes.db.test.ts` (the rule against
@domain/team) cover it.

Fixing a name (`20261117000700_member_names.sql`; ROADMAP "תיקון שם") goes
by the same rule: `public.set_member_name(actor, business, person, new_name,
seen_name, at_time)`, with the secret key, keeps the name the business shows
for someone in `public.member_names`, its own for them, in that business only;
their own name (`profiles.full_name`, one per login across every business they
are in) is never touched. Team.edit and `private.gives_role` (42501), never
oneself (22023), only an active member (P0002), never in a demo closed to
invites (55000, hint `demo`). The name is one line, its spaces collapsed, of 1
to 80 characters (22023, hint `name`); their own name, or none, keeps no row,
so the business shows theirs again; `seen_name` is the name the screen showed
(null for none), 40001 when it moved; the same name writes nothing (`changed`
false). It locks the business, then the membership, then the name, as a role
change does. The log row is `member.name` with the person only, which tells
nobody. Rows go with the membership (`on delete cascade`), so a demo's reset
takes them; taking someone off the team keeps theirs, for the pay holders who
still read them. `public.admin_business` lists members by it. `@db/team`'s
`setMemberName` calls it; `@db/member-names`' `memberNames` reads the names
under the caller's client (empty before the migration), and `nameIn` puts each
over the profile's (`shownName` in @domain/people): the team, colleagues, a
person and a former member, activity, notifications, chat's directory and
authors, departments for the console, pay people and access, roles, the
clock's people and the session's own name all read it. `member_names.test.sql`
and `team-changes.db.test.ts` cover it. Joining writes one too
(`20261127000500_invite_names.sql`): `public.claim_invite` keeps the invite's
name as the business's own for the person, read as the app keeps a name
(`private.team_name`, parseTeamName's rule: what nobody sees dropped, letters
composed, spaces collapsed, on the invite's name and on their own before they
are compared; `tooling/team-names.test.ts` keeps its character lists equal to
the app's); their own name keeps no row, and one kept from before goes; an
owner keeps none, as their name there is their own; an invite with no
name leaves the business's. Someone with no name takes the clean name as
their own. The same migration holds both rules beyond the claim:
`public.set_member_name` decides whether a fix is their own name with
`private.team_name` on both sides, so an own name that still holds a mark,
saved clean from `/team/[person]` or brought back by an undo, keeps no row
(the screen's `unchangedMemberName` in @domain/team, by `TeamPerson.memberName`,
offers no such save); and a member whose role becomes the owner's, by
`public.set_member_role` or otherwise, loses the business's name for them
(the trigger `memberships_owner_keeps_no_name`, `private.drop_owner_name`),
after the membership, as the name's other writers lock. Nor does the fix
give an owner one: `public.set_member_name` refuses an owner, whoever asks,
another owner included (42501, hint `owner`; `canFixName` in @domain/team
offers none), so an owner always appears by their own name, and the
migration drops, once, any name kept for an owner on a team. The screen
holds every change to owner for its undo (`roleChangeClears`), so the undo
lets go of the write before the trigger takes the name. `/me` says which
business keeps a name of its own for them: the session's `memberName` is the
business's row, even one equal to their own name, which stays when they
rename themselves, and the row says it beside their own where it differs
(`keptNameOf` in @domain/profile). `invite_names.test.sql` covers it.

Invites nobody got a link for yet (`20261128000200_invite_links_pending.sql`;
inviting from a list, part 2; Orel, 25 November 2026: each person's link is
made at the moment of sending): `invites.link_pending` is true while no link
was ever made for an invite. `public.create_business`, the console's wizard,
now saves its staff so (its hash is of no token anyone holds, as before);
every other writer of a new invite returns its link and keeps the default
false. The invites saved before were marked once from the audit log
(`private.mark_links_pending`: an open invite with no `invite.create` or
`invite.send` of its own business naming it; every function that ever made a
link logs one), and the trigger `invites_link_given`
(`private.invite_link_given`) clears the flag whenever an open invite gets a
new `token_hash`, so `public.team_invite_link`, `public.team_invite`'s
refresh, `public.issue_invite_link` and `public.admin_invite`'s renewal all
clear it and none of them was redefined; `public.team_invite_cancel` writes a
hash of no token but closes the row in the same update, and leaves it.
Nothing sets it back. Both private functions are revoked from public, anon
and authenticated. Read under the invites' policy as before: `@db/team`'s
`openInvites` reads it (a step more of `isMissingColumn`, false before the
migration), `TeamInvite.linkPending`, and `buildTeam` gives such an invite
the state `pending` whatever its date, first by name, counted apart
(`counts.pending`; `open` and `expired` count only invites with a link). The
Team screen lists them under "עוד לא קיבלו קישור", where each one's link is
made with `team_invite_link` (`resendInviteAction`), then sent on WhatsApp to
that number (`whatsappToHref` in @domain/share) or copied; the app sends
nothing. `invite_links_pending.test.sql` covers it.

A week is written shift by shift (`20261115000100_week_in_place.sql`; Orel's
answers of 15 November 2026). `public.week_shifts(week)` reads a week's shifts
under the reader's policies, each with what was seen of it (`seen`, from
`private.shift_digest`: its day, name, hours, people needed, pattern and people
with their positions, through casts, so "07:00" and "07:00:00" agree; a stored
position the settings no longer have counts as none, as the builder shows it,
through `private.known_people`), in one statement; `getWeekSchedule` in
`@db/schedule` reads through it (the table as before on a project without the
migration). A save or a publish sends it back as
`basis`, each shift read carrying its `id`: a shift sent as it was read is left
alone, whatever happened since (a swap approved, someone off the team); one
changed is written in place while it is still as it was read, its id kept and
only the people who changed taken off or put on; one read and not sent is
deleted while it is still as it was read; otherwise 40001 with hint `moved` and
the ids in DETAIL (`movedShifts` in `@db/schedule-errors`), and nothing is
written: the builder's action then reads those shifts again, and the screen
puts them back as they are now, marked, with the rest of its work kept. A shift added meanwhile stays, and one deleted meanwhile is skipped
when sent unchanged. An id must be one the screen read, of the week, sent once
(22023). Only who this write puts on a shift must be an active member, and the
overlap check covers everyone on a shift new or moved and everyone put on one.
Without a basis (the demo's renewal, the tests' helpers, and a builder drawn
before the week was first saved, which the action refuses once someone has
saved it) the week is replaced as before, and no ids are sent with it. A clash
the database finds past the action's own check is with something changed
meanwhile (`scheduleClashedMeanwhile`). A waiting swap request ends only when
its shift is deleted, its day or hours change or its asker comes off it
(cancelled, both told `swap.removed`); one taken by someone who may no
longer take it opens again (`swap.reopened`, offered again); every other one
waits on, offered only to whoever may still take it. `swapsEndedBy` in
`@domain/swaps` reads the same rule off the builder's screen for the warning
before publishing, with unit tests that mirror `week_in_place.test.sql`'s
cases one for one, all but those with nothing to say about requests (refused
payloads, drafts and positions); the SQL stays the authority, so a change to
it changes both. Who builds the schedule is one helper, `private.builds_schedule`
(since the roles plan's R3, whoever holds `schedule.edit`; below).
`week_in_place.test.sql` covers it.

A swap request outlives its shift (`20261115000200_swap_history.sql`):
`shift_swaps.shift_id` is `on delete set null`, and `shift_swaps.shift` keeps
the shift as it was when the request was made (`private.shift_brief`, taken by
`request_shift_swap` and never rewritten), so approved and declined requests
stay with who took them and who decided after their shift is published away.
A request still waiting always has its shift (`shift_swaps_live_shift`): the
write ends it first, and a delete by hand is refused (23514), which is why
`clearSchedule` in e2e/db.ts deletes the demo's requests before its shifts; a
business deleted takes its requests with it. A cancelled request says why,
`cancelled_because`: `withdrawn` (`cancel_shift_swap`), `schedule`
(`private.write_week_schedule`) or `team` (`private.leave_staff`). The policy
is unchanged. `swap_history.test.sql` covers it. `getEndedSwaps` in
`@db/swaps` reads the requests that no longer wait, under the same policy, by
the day of the shift each asked for (`shift->>day`, from today on), so the
shifts screens say what became of them: "מה קרה לבקשות שלך" for whoever asked
or took one (`pastRequestsFor`), a line on the person's own shift for one not
approved or cancelled by the schedule (`outcomeOnShift`), and "כבר לא מחכות
להחלטה" on the swap board with who decided (`noLongerWaiting`).

What has begun stays as it was (`20261115000300_running_week.sql`; Orel's
answer of 15 November 2026: a shift that has begun only takes more people).
In a published week, a shift whose start (its day and start on the business's
clock, where `private.shift_span` starts it for the swaps' rules, read from the
shift itself so that one the spring change turns inside out holds up no write)
is at or before the write's `at_time` (never null: 22023) is never
rewritten: not read, sent as it was read, or left out of a week replaced with
nothing read, it keeps its id, its people (someone who left since, or became
the accountant, included) and its swap requests, which the write neither ends
nor opens again; sent changed, or read and not sent (a removal), the write is
refused with 55006, hint `started`, the ids in DETAIL (`startedShifts`). So a
screen that shows a shift as begun leaves it out of both the shifts and the
basis. People go on a shift under way only through the last argument of
`save_week_schedule` and `publish_week_schedule`, `joins`
(`[{"shift", "user", "position"}]`): a shift of the week that has begun and
not ended (one that has: 55006, `ended`, `endedShifts`), someone not on it
yet, a known position or none, an active member on the staff, no clash. In a
published week, a new shift, or one still to start written again, starts after
`at_time` (22023, `past`, DETAIL `[{id|null, day, start}]`, `pastShifts`),
and a week wholly over (at or past both its next week's first midnight in the
business's zone and the end of its last shift, so a night shift on its last
day takes people until it ends) no longer changes (55000, `over`,
`scheduleWeekOver`); a
save of a published week still ends in 55000 with no hint, after these
rules. A week never published is free, mid-week included: its first publish
publishes it as it stands. The log row says whether the week had begun
(`running`) and who joined which shift (`joined`, ids). `schedule_shifts.opens_lists_from`
is from when a shift's lists count: set to `at_time` when a write adds a
shift, moves it in its day or hours or gives it another pattern, raised to
`at_time` on every shift at a week's first publish, and read by
`private.list_occurrences`, which opens nothing due before it (null counts
from the start) and lets the day's list follow the earliest shift of the
pattern whose list is not late, so a late one never takes it from a later
shift's on time; a hosted demo's reset ages
it with its times (`private.seed_demo_lists`). The builder opens the running
week too (`?week=`): it leaves a begun shift out of both the shifts and the
basis, sends the people added to it as `joins`, and maps the refusals
(`shiftStarted`, `shiftEnded`, `past`, `weekOver`). Every pgTAP file that writes a published week again
passes `at_time`. `running_week.test.sql` covers it.

Nobody works two shifts at once across the week's edge either
(`20261115000600_running_week_edge.sql`, the running-week plan's X). The
people a save or a publish puts on shifts (those its check inside the week
covers: on a shift it adds or moves, put on one, or joining one) are checked
against their own shifts in the business's weeks either side (those starting
up to seven days before or after it, from the week's own first day, whatever
day the business's week starts on), drafts and published alike, by the moments
the shifts run on the business's clock (`private.shift_span`'s, past midnight
included, read from the shifts so one the spring change turns inside out holds
up nothing); only shifts on days next to each other can meet, so only the
neighbours' shifts from the day before the week to the day after it are read.
Touching is fine, and someone kept where they were is not checked again. A
clash inside the week is refused first, as before; one across the edge is
22023 with hint `clash` and DETAIL `[{user, name, day, start, week}]` (the
shift next door, `week` 'previous' or 'next'), which `edgeClashes` in
`@db/schedule-errors` reads and the builder names ("… כבר במשמרת … של יום …",
the phone showing the day of the week it meets).
Both writes lock, as their first statement (`private.lock_week_edges`), the
weeks either side with their own, one at a time in ascending order of their
first day (their own for update, as before, the others for share), the same
order `private.leave_staff` takes weeks in, so a save, a publish, a team change
and a write of a week next door take turns instead of deadlocking; the demo's
renewal takes the same locks before its publish, and leaves whoever works the
weeks next door out of a shift that runs into theirs (the night before the
first morning, and the morning after the last night). After the week's own
requests, a write also locks the requests taken on those shifts next door, so
an approval of one (which locks its request, then checks and puts its taker
on) and the write take turns, and neither misses whom the other put on. A
publish then opens again, with no taker, a request next door whose taker may
no longer take it, logged in `reopened` and told as the week's own are; a
draft saved, which is neither logged nor told, leaves it taken, its approval
refused until the week is published. `running_week_edge.test.sql` covers it,
and `tooling/running-week-edge.test.ts` pins the locks' order.

The audit log is the business's activity log. Only server functions write it,
each for its own action (`business.details`, `module.settings`, `clock.correct`,
`clock.confirm` from `confirm_time_entry`, `clock.code.locked`,
`schedule.publish`, `swap.approve` and the rest). Those who hold `manage.view`
read their own business's rows, each only while they also hold its own area's
permission (since the roles plan's R7, below; owners and managers by default,
as before), and so does the team while viewing it as a role that does, but for
the pay rows (`wage.*`, `payroll.*`): only pay holders read those, and a pay
holder reads the clock's and the permissions' rows too. The hiring file's rows
(`employee.*`) are read by holders of `people.files` alone, through a side of
their own, and never by a view session; `member.emergency` is the team's.
Publishing a week's schedule logs its first day, the number of shifts, whether it
was the first time, and how many waiting swap requests it ended
(`activity_log.test.sql`), and, for notifications, whose shifts changed
and the requests it ended; and, since the week is written in place, the ids of
the shifts it kept, edited, added and removed, the requests it opened again, and
when (`at`). A swap's lines name its shift as the request keeps it
(`shift_swaps.shift`, read by `getBusinessActivity`), so they read the same
after the shift moves or goes. A week published again while it runs also logs,
for each person whose shifts changed, the nearest shift that did (`nearest`:
its id, 'moved', 'added', 'removed' or 'edited' (a name or position alone,
named only when nothing else changed), its day, name and hours, when the change
counts from, and when a push about it is too late), never a name.

The running week's lines (`20261115000400_running_week_notices.sql`, Orel's
answers 4 and 5 of 15 November 2026): `schedule.published` and
`schedule.changed` of a week that had begun at the publish's `at` carry
`running` and count the person's shifts still to start (`private.shifts_ahead`);
a first publish mid-week tells only those with one; a change names the nearest
shift it changed (`private.nearest_change`, from `private.week_people` before
and after, which lists each person's shifts by id), or keeps naming a nearer
one their unread line names, whose push hasn't gone, while it still holds.
Such a line reaches the phone only before that shift starts, or ends once begun
(a join), or for a first publish before the person's first shift still to start
(`push_before`): quiet hours hold a push as before and it never goes late,
while the line is in the app at once. Every `schedule.changed` push waits two
minutes, which choices saved meanwhile keep (`set_notification_preferences`),
and a publish of the week before then replaces it
(`running_week_notices.test.sql`).

Notifications are written from the audit log: a trigger
(`private.notify_from_log`, which never blocks the write it follows) reads
each row and writes `public.notifications` through `private.notify`, one line
per person per thing (`dedupe_key`), replaced and unread again when the same
thing happens again. Once what a line asks for is handled (a request decided,
hours confirmed), `private.resolve_notifications` settles its lines for
everyone: read, with `resolved_at`. People read their own lines while they
are active members at the line's `audience_role` (or, for a line with an
`audience_perm`, while they hold that permission: the roles plan's R3, below)
and its modules are on; nobody else reads them,
the team viewing included. `public.read_notifications(actor, business, ids)`
marks lines read, with the secret key; `@db/notifications` reads the inbox
and calls it (`notifications.test.sql`).

Lines reach phones too (Web Push, `20261109000500_push.sql`), with no payload:
the phone's service worker asks `/push/inbox` what to show. `private.push_plan`
queues a line when its person has a device in `public.push_subscriptions` and
it is from any business of theirs that isn't a demo and has notifications on
(`private.push_business_ok`, since `20261110000900_several_businesses.sql`;
before it, only the oldest one). The server, with the secret key, saves (at most ten
devices each, a new one forgetting the one seen longest ago) and forgets
devices, claims what is due once per line and device (`claim_due_pushes`, rows
in `public.push_deliveries`, which only the server touches) and says how each
push went (`finish_pushes`: gone devices forgotten, refusals counted, retries
in 1, 5 and 25 minutes, then counted too). The browser reads only a few plain columns of its own
devices, never their endpoints or keys. `@db/push/*` signs VAPID with
`node:crypto` and sends; pg_cron's minute job asks the app to send while
something is due (`push.test.sql`).

What reaches each person's phone is theirs to choose
(`20261112000100_notification_preferences.sql`). `public.notification_preferences`
holds one row per person, across their businesses: the groups kept off the
phone (`push_off`), quiet hours on the clock of `time_zone`, whether the lock
screen shows the line (`previews`), and when they were offered notifications
on the phone (`push_asked_at`). No row means everything reaches the phone, no
quiet hours, details shown. The person alone reads it (select own); anon, the
secret key and a view session read nothing, and nothing writes a log row.
It is written only through `public.set_notification_preferences` (one change
at a time, 22023 for what can't be) and `public.see_push_ask`, both for
`auth.uid()` and granted to `authenticated` alone, refused during a view session:
`@db/notification-preferences` calls them under the person's own session and
takes no person id. `private.push_plan` asks those choices too: nothing for a
group in `push_off` (the line still reaches the app, with `push_state` 'none'),
and the end of quiet hours (`private.quiet_until`) for a line inside them, which
the minute job then sends; the test is never held. `claim_due_pushes` asks them
again at every send: a push going again after a failure stops when its group is
kept off the phone now (`private.push_kept_off`), and one that comes due inside
quiet hours stays queued until a send after they end (`private.push_held`,
which the minute job asks too, so it doesn't wake the app for it). A change
re-plans what waits, retries included. The lines about pay (`access.pay_granted`,
`pay.wage_set`, and the office's `pay.after_close` and `pay.month_due`) are in no
group, as payroll left them, and always reach the phone; the settings screen
says so. `private.notification_group` mirrors `@domain/notifications` for every
kind, so a new kind is a row in `private.notification_kind_groups` too
(`notification_preferences.test.sql`, and `notification-preferences.db.test.ts`
for the groups and for `private.quiet_end` against `quietEnd` across both clock
changes).

Taking orders' lines (waiter mode P8b,
`20261125000100_order_taking_notifications.sql`) are the group `orders`, last
on the settings screen, for the staff alone (`'order_taking'` among
`private.notify`'s staff-only modules). `order.ready` goes to a round's
sender when a ticket turns ready (`private.notify_order_ready`, from
`set_order_ticket_ready` and `station_set_ticket_ready`, never to whoever
marked it), with the place, the department and the live count of
`private.order_notice_facts`, no price; its push waits 10 seconds and goes no
more half an hour on. `public.read_order_ready(actor, business, tickets)`, with
the secret key, reads the ready lines a sync showed their sender and skips
their push (`@db/orders`' `readOrderReady`, which `/orders-sync` calls).
`order.unseen` comes from `private.run_order_notices` in the minute job: once
per ticket that a running prep screen of its department, or of every one,
hasn't fetched 2 minutes after it was sent or called (only within 10), to the
sender and whoever runs orders on the clock. Two triggers settle them
(`order_tickets_settle_notices` when a ticket leaves "ready", is fetched or is
no longer new; `orders_settle_notices` when an order is cancelled), and the
minute job settles what is left before it writes. During a shift (with the
time clock on) `orders` reaches the phone in quiet hours too, its switch
still first (`private.shift_groups`, `private.push_skips_quiet`, and
`private.push_held_in`, which `claim_due_pushes` and the minute job ask in
place of `push_held`). The daily clean-up deletes `order.*` lines after 2
days. `private.order_notice_rules` and `private.shift_groups` are kept equal
to `@domain/notifications` by `notification-preferences.db.test.ts`; the rest
by pgTAP `order_notifications.test.sql`.

Lists (`20261109000600_lists.sql`) work the same way as the rest. A
business's departments are its own data, read by every member;
`public.set_departments` and `public.set_department_members` save them for
whoever holds `manage.edit` (owners and managers by default, since R7) or the
team, archiving what is left out. List templates with their items and times, and
the lists sent with their items, people and passes, are read under the
policies above (the module off closes them) and written only by
`save_list_template`, `archive_list_template`, `restore_list_template`,
`send_list`, `set_list_item`, `finish_list`, `cancel_list` and `reopen_list`
(secret key, for `actor`), each with its own `lists.*` audit row except an
item's tick. Lists tell people through a trigger of their own,
`private.notify_for_lists`, and their lines reach phones like any other.
`public.my_open_lists(actor, business)` counts what a person holds, for the
tab. `@db/departments` and `@db/lists` read and call them
(`departments.test.sql`, `lists.test.sql`, `lists_notifications.test.sql`).
`20261109000700_lists_on.sql` switches the module on in every template and
business (where its tab fits), gives businesses opened before lists their
template's departments and lists (`private.backfill_lists`), adds
`public.cancel_unstarted_list`, the undo right after sending (`cancel_list`
only while nobody has started the list), and fills `private.seed_demo_lists`:
the demo reset ends with two example lists sent by the demo's manager, and
from L5 an order (`lists_on.test.sql`).
`@db/departments` `getDepartmentsForTeam` reads them for the console with the
secret key, since the team is no member.
Templates and the full send (L3) need no migration. `saveListTemplate` calls
`save_list_template` with the version the editor read (40001 when it moved)
and then reads, with the secret key, the template's version and its items'
ids in order, which the editor needs for its next save (a version that moved
on in between reads as "changed"). Once the function has saved, a failure of
that read carries the template's id (`saved` on the failure), so an editor
that was making a new one opens it at its own address rather than making it
twice. `getListTemplate(business, id)` reads one
template only in the business the person is in now (someone in several reads
the others' too, under RLS); `getListTemplatesForTeam` and
`getListTemplateForTeam` read them, removed ones and their times too, for the
console with the secret key. `getSentLists` reads what a person sent in a
window (RLS lets a sender read their own), and `@db/schedule`
`getPublishedShifts` the published shifts of some days with their people, the
shifts `send_list` takes; `hasPublishedWeek` whether the business ever
published a week, for the owner's first steps (a publish is never taken back). The app binds the template and send writes to the
business the screen was drawn for (payroll P3b), so a save from a tab left
open never lands in another business.

Lists' times (L4, `20261110001300_list_schedules.sql`) run in the database:
`private.lists_tick`, every minute (the pg_cron job `lists`, pure SQL, no
secret; off locally and in CI) and at the end of a demo reset, opens for each
business with lists on, in its own block, what its templates' times have
opened by then and are not more than 12 hours past their due time, once each
(`unique (schedule_id, occurs_on)`), to the time's recipient or the managers
when nobody is there to take it; closes as missed a scheduled list whose next
one opened or that is 24 hours past its due time, never one opened again by
hand (`lists.reopened_at`, which L4's `reopen_list` sets); and marks reminders
and late lists once each, logging `lists.open`, `lists.missed`, `lists.due` and
`lists.late` with no actor. When a time opens comes from one function,
`private.list_occurrences(schedule, from, to)`: the business's own clock, or
minutes around a published shift of its pattern, nothing before the time's
`list_schedules.opens_from` (when it was saved, and again when L4's
`save_list_template` gives it other days or hours or switches it back on, or
`restore_list_template` brings its template back; every time there was when
the migration ran counts from then), and Shabbat for a business closed on it,
a time of the day and one around a shift alike (`private.closes_on_shabbat`,
`private.shabbat_span` over `private.shabbat_times`, a row a Friday for each
city, which `tooling/shabbat-table.test.ts` keeps equal to
`@domain/shabbat-times`). `public.next_list_openings(actor, template)`
(secret key, list managers and the team) gives the editor each saved time's
next three openings from the same function, without a day that already has
its list; `@db/lists` `nextListOpenings`
reads it, and `saveListTemplate` returns it with the saved times' ids. `set_list_item`
logs `lists.out_of_range` when a reading moves outside its range (with its
range and unit), and `private.notify_for_lists` tells the list's people of a
reminder and of a late list, and its managers of a late list and of a reading
out of range, with the reading.
`getListReadings(lists)` reads the number items of some lists with their
readings, under RLS, for the manager's day (`lists_schedule.test.sql`).
One more step goes to the owners (`20261115000500_lists_owners_late.sql`;
Orel, 15 November 2026): a scheduled list still open the lists setting
`tellOwnersAfterMinutes` after it became late (60 unless the business chose
30, 120 or 0 for never; another value stored reads as 60; counted from the
minute of `late_at`) is stamped `lists.owners_told_at` and logged once as
`lists.late_owner`, after the late lists and never during a closed business's
Shabbat, never for a list sent once or one opened again by hand after it was
late (one undone before it was late is told like any other);
`private.notify_for_lists` tells the business's active owners who don't hold
it (`lists.late_owner`, audience `owner`) and marks their managers' late line
of the list read, not settled, so Home counts the list once; finishing,
cancelling or missing the list settles it (`lists_owners_late.test.sql`). The
activity log leaves the row out, as it does the reminder.

Lists between departments (L5, `20261110001400_lists_pass.sql`):
`public.pass_list(actor, list, department, pass_note, at_time)` (secret key)
passes an open list to another live department of its business, for whoever
holds it or manages lists (42501 otherwise, P0002 for a list that isn't
theirs to know, 22023 for the department holding it already, a removed one,
another business's or a note over 200, 55000 once it is closed). It writes a
`list_passes` row (from where, to where, who, when, the note), makes the list
the department's, and logs `lists.pass` with whether a note came, never the
note. Whoever held it as a person or a shift keeps reading it through
`list_people`, and a department through its pass row (`private.sees_list`);
someone who held it only by their role no longer reads it unless they sent
it, manage lists, or are in the department that asked. None of them fills it
any more. `private.notify_for_lists`
tells the new department's people (`lists.passed`, with the department's
name) and settles the list's lines for everyone who no longer holds it.
Orders' counts were there from L1: `send_list` takes `quantities` by the
template's item, and `set_list_item` takes `given`. `private.seed_demo_lists`
also sends the template's first order, by someone of the department that
asks, its first item given where it goes, in a block of its own that runs
whatever became of the examples before it. `@db/lists` `passList` calls it,
and `getMyLists` returns, beside what the person holds, the open orders their
departments asked for that wait elsewhere (`lists_pass.test.sql`,
`demo_reset.test.sql`).

Photos on lists (L6, `20261110001500_list_photos.sql`) live in the private
bucket `list-photos`, a JPEG or WebP of at most 400 KB at
`<business>/<list>/<key>.<webp|jpg>` (the rule `list_items.photo_path` keeps).
Storage has no policy for it (`20261127000300_files_server_only.sql` dropped
its read policy and `private.can_read_list_photo`): nothing lets the browser
read, upload, replace or remove a file, as with avatars. `@db/list-photos`
`setListItemPhoto` checks the file the browser re-encoded
(`@domain/list-photos` `checkListPhoto`), uploads it with the secret key under
a random key, then calls `public.set_list_item_photo(actor, item, new_path,
at_time)` (secret key; whoever holds the open list or manages lists, the item a
photo, the path in its own list's folder; no log row), which returns the file
it replaced for the server to remove; a refused save removes the upload again.
`removeListItemPhoto` clears it (no `new_path`). `listPhotoBytes` serves the
app's `/list-photos` route: the item pointing at the file, its photo still
kept, read under the reader's own session (the lists' RLS: a list they see,
lists on), and only then the secret key's download. A
demo business takes none unless its definition says `"photos": true`
(`public.list_photos_closed` for the server, which the list screen and the
editors ask through `listPhotosAllowed`, so a photo item there is never
required; the trigger `list_items_demo_photo` in the database, 55000; clearing
stays allowed). Photos are kept the lists setting `photoDays` (90 unless the
team chose 30, 180 or 365; the app holds it to the team, `level: "team"`,
since `set_module_settings` has no lists branch): once a day the job
`list-photos` (`private.list_photos_tick`, off locally and in CI) asks the
app's `/cron/list-photos` while one is due, and `cleanListPhotos` lists them
(`public.expired_list_photos`), removes the files and marks their items
(`public.forget_list_photos`, `list_items.photo_removed_at`): the item stays
done and says its photo is no longer kept (`list_photos.test.sql`; the route,
its bearer and the whole clean-up in `e2e/list-photos.spec.ts`).

Hours stay (`20261110000100_hours_kept.sql`, payroll P1). `time_entries`,
`time_breaks` and `audit_log` refer to their business, person and entry with
`on delete restrict`, so deleting a person, their account or a business with
hours fails (23503): people leave by being made inactive. A trigger on each
refuses every delete (42501), the database's owner's included, but two, each
named for the transaction by a setting the Data API can't set:
`private.purge_business_records(business)` (`ca.records_purge`; breaks, then
entries, then the log; the reset locks the business and runs it first, so a
visitor's write under way finishes before it and none lands after; test
clean-ups run it as postgres, and nobody else may) and the trim of an entry's
own breaks (`ca.fit_breaks`). The log never changes but for its actor going to
null when their account goes, and only its owner updates, deletes or truncates
it; nobody else truncates hours or breaks either.
`private.seed_demo_pay(business)` is a stub the reset ends with; later payroll
parts replace it and the purge, never the reset. `add_time_entry` and
`correct_time_entry` refuse a missing reason (22023, "A correction needs its
reason") and log it as `note`; the entry keeps the newest. A correction that
cuts or removes breaks writes one `clock.break_fit` row by the corrector, each
break `from` and `to` (null when removed) and the entry's corrected `clock_in`,
which names the shift's day as `clock.correct` does; a clock-out that ends an
open break writes none (`hours_kept.test.sql`). `@db/time-clock` reads each
entry's `created_at` with its edit: a shift a manager added is edited as it is
written, so an `edited_at` more than a second later means it was corrected
since, and its line says so (`ShiftRecord.correction.kind`).

Pay access (`20261110000200_accountant_role.sql` and
`20261110000300_payroll_access.sql`, payroll P2). `accountant` is a fourth
`member_role`, appended: a member at a worker's rank who is never on the staff
(`private.is_staff_role`). A trigger on `time_entries`, `shift_assignments`,
`availability_submissions`, `department_members` and `list_people`
(`private.refuse_non_staff`), and one on `list_schedules` for its person, refuse
an accountant (42501); `private.list_recipient` already takes no accountants as
a role, `private.check_can_take` refuses them a swap (so they never take one,
have one approved or are offered one), and `private.notify` sends them nothing
about the schedule or lists. The schedule, swaps, availability, departments and
list templates read through `private.is_staff_member` and
`private.is_viewing_staff`, and `private.holds_list`, `private.sees_list` and
`private.list_holders` count only the staff, so an accountant, and a view as
one, reads none of them, while the roster and names stay open.
Every permission a manifest declares, and the team screen's and the
management page's (`CORE_PERMISSIONS` in `@domain/permissions`), is a row of
`public.permission_keys` (`default_roles`: the staff roles other than the
owner at or above its `defaultRole`; `by_owner`: an owner gives it;
`modules/permissions.db.test.ts` keeps them the same). `clock.payroll` is the
one an owner gives: everyone's hours, and later wages, details and estimates.
Owners and accountants (`private.accountant_perms()`) always hold it; managers
don't until the owner gives it to the role (Orel, 9 November 2026), a row of
`public.role_permissions`; one person gets it in `memberships.perms`.
`private.holds_perm(business, person, perm_key)` says who holds what (owner;
accountant for theirs; on the staff, given it, or held by their role: the
role's row of `public.role_permissions` when there is one, granted or denied,
else a default role of a key that isn't the owner's to give, and only while
they also hold what the key `requires`), `private.has_perm` asks it for the
caller, and `public.my_permissions(business)` lists the caller's, sorted, for
the screens (a view: what its role holds by the same rule,
`private.role_holds`, and `clock.payroll` only as an accountant); permissions
by area, below, says more. `public.set_role_permission(actor, business,
grant_role, perm_key, granted)` and `public.set_member_permission(actor,
business, person, perm_key, granted)` change grants for an owner or the team
(secret key), never for
oneself, an owner or an accountant, each change logged as `permission.grant`
or `permission.revoke` and a call that changes nothing logging nothing. Pay
holders and a view as an accountant read every hour and break of the business,
and the names of everyone who worked there (`private.reads_pay_of`). Only an
owner invites an accountant or touches their invite (`team_invite`,
`team_invite_link`; the console's `admin_invite` may), and someone who comes
back as one must have no open entry, shift or taken swap from the business's
today on (`claim_invite`, 55000), leaving their departments, permissions, place
on open lists and any list's times for them (lists done keep them on their
record). `getClockPeople` marks who is on the staff, so the team's hours list
an accountant only for a month they worked in. The demo
shop's managers hold pay access (`rolePermissions` in its definition, put back
by `private.seed_demo_pay`). `payroll_access.test.sql`, `team_invites`,
`view_as`, `helpers`, `create_business`, `demo_reset` and `rls_enabled` cover it.

Permissions by area (`20261115000700_roles_catalogue.sql`, the roles plan's
R1; Orel, 15 November 2026), with nothing changed for anyone yet. Every row of
`public.permission_keys` has its `area` (its module's: scheduling,
time_clock, lists, chat, reservations, storefront; or team or manage), what it
`requires` (`schedule.publish` needs `schedule.edit`), and `settable`, whether
owners switch it per role, off for every key until its area's phase moves the
area's checks onto it (`clock.payroll` keeps its own switch). The team
screen's and the management page's keys belong to no module (`module_key`
null): `team.view`, `team.edit` (needs `team.view`), `manage.view` and
`manage.edit` (needs `manage.view`), managers' by default, as `CORE_PERMISSIONS`
in `@domain/permissions` declares them; nothing reads them yet. A row of
`public.role_permissions` now grants or denies (`allowed`, true by default):
when there is one it decides, and the key's default roles count only without
one. Nothing writes a denial yet, and a key an owner gives is still added and
removed, never denied (`private.refuse_by_owner_denial`, 22023), so
`getPayRoles` reads the rows as they are. `private.holds_perm` adds the rows'
answer and what a key requires: on the staff, a key given personally holds as
before; one the role gives (`private.role_gives`: its row, else its default
roles) holds only while the person also holds what it requires. A view in
`public.my_permissions` holds what its role holds by the same rule
(`private.role_holds`, the role down the chain of what each key requires), a
key an owner gives only as an accountant. The app keeps no defaults of its own:
`holdsPermission` is "an owner, or the key is in what the database answered",
and `getOwnPlace` (chat-sync) reads `my_permissions` too, only when asked
(`permissions(catalogue)`); while the function is missing on a project,
today's rules come from the declarations (`permissionsByDefault`).
`tooling/role-checks.test.ts` fails a migration after this one that writes a
rule by rank (`has_role(`, `role in ('owner', 'manager')`, `is_viewing(…,
'manager')`, `members_in(…, '{owner,manager}')` or its array, a line's
`audience` of `'manager'` in `private.notify`) outside the rules that stay by
role and those its areas' phases have yet to move, which they take out as they
do. `roles_catalogue.test.sql` covers it, with the previous `holds_perm`
frozen and compared for every role, personal key and role row, and a role's
pay row reaching its members but never a view as the role;
`payroll_access.test.sql` counts the new keys.

The setter (`20261115000800_roles_setter.sql`, the roles plan's R2), with
still nothing changed for anyone: no key is `settable` until its area's phase
(R3 to R8) turns it on. `public.set_role_permission` switches a settable key
per role: granted or denied writes the row's `allowed`, and the key's default
for the role removes the row, so rows stay few and "back to default" is the
undo; granting a key whose `requires` the role doesn't hold by role
(`private.role_holds`) is refused (22023, hint `requires`, the key it needs
as the detail), and denying one leaves the keys that require it as they are
(`private.holds_perm` drops them). Managers and workers only, as before; a
key an owner gives (`clock.payroll`) is added and removed exactly as before,
logged `permission.grant` / `permission.revoke`, with no demo refusal, and any
other key is refused (22023). It locks the business (for no key update)
before the row, as `public.set_member_role` does, so it never deadlocks with
a demo reset, which locks the business for update and then deletes the rows.
`public.set_role_permissions` writes several keys of one role in one
transaction, each as `set_role_permission` (22023 for a key without its
answer): a refusal of any leaves them all as they were. Each change of a
settable key is one `role.permission` row of the log (`role`, `perm`, `area`,
`from`, `to`; a call that changes nothing writes nothing, and nor does
removing a row that only said the default), never `permission.*`, which pay
holders and accountants read: its readers are those of `module.settings`
(owners and managers, and a view as one), with the log's policies unchanged
until R7 gates the log by area. `private.check_permission_giver` takes a settable key from the
same givers as pay, an active owner of the business or the ConceptApp team,
never a manager (Q5), and `public.set_member_permission` still gives a person
only a key an owner gives. A demo business is changed by its visitors, as its
pay is, and its reset deletes the business and its rows with it (on delete
cascade). The rows of `public.role_permissions` are read by the business's
owners and a view as its owner (`/manage/access`), no longer by every member:
they say who set each rule and when, which the log keeps from the rest of the
staff, who learn what they hold from `public.my_permissions`.
`public.role_permission_matrix(business)` (the secret key only) answers, for
managers and workers, every key with its `area`, `requires`, `settable`,
`by_owner`, whether the role holds it by default (`by_default`), the role's
own rule (`given`, `private.role_gives`) and what it holds by it (`held`,
`private.role_holds`); `@db/roles` reads it for the console
(`getRoleMatrixForTeam`; before the migration, the declarations' defaults and
the business's pay rows, nothing open) and, the same read, for the owner's
own screen (`getRoleMatrixForOwner`, /manage/roles, the roles plan's R9),
once the session's person is known to own the business (or the team views
it as its owner): it says nothing about any person, and owners already read
the rows it comes from, so no policy is widened and no function added for
it. It writes one area of a role
(`setRoleArea`: the rules read again, and the keys whose rule differs written
in one call to `set_role_permissions`, in the order `areaWrites` in
`@domain/role-access` gives: denials first, grants after what they require,
and a grant whose requirement goes taken back, so an undo leaves no row),
with the owner or the team member as `actor`, whom the database checks again.
`getPayRoles` and the console's pay reads count only a row that gives pay
(`allowed`), reading every row on a project without the column.
`roles_setter.test.sql` covers it, with two keys made settable inside the
test.

Scheduling by its permissions (`20261115000900_roles_scheduling.sql`, the
roles plan's R3; Orel's answers of 15 November 2026), the first area open for
changes: `schedule.edit` and `schedule.publish` are `settable`, and nothing
changes until an owner or the team switches them (managers hold both by
default, workers neither, owners always both). The floor is view: the weeks,
the published shifts and assignments, the swaps and one's own availability
stay every staff member's, as before. `private.builds_schedule` is
`private.holds_perm(…, 'schedule.edit')`; saving and publishing
(`private.write_week_schedule`) and deciding a swap (`public.decide_shift_swap`,
whose own owner-or-manager check it replaces: whoever builds the schedule
approves, Q6) ask it. Deciding asks it before the swap is locked (an unknown
request is still P0002), and a swap's own asker or taker decides it only if
they publish too (42501): approving it changes a published week. `public.publish_week_schedule` asks
`private.publishes_schedule` (building and `schedule.publish`) before anything
else: its week's business read plainly (an unknown week P0002, as the write
says it), and someone who doesn't publish refused (42501) before
`private.lock_week_edges` and the reads for update, so they take no lock and
learn nothing. Someone who builds without publishing saves drafts only: a
published week is only published again. The demo's renewal publishes as an
owner first, as before. The draft shifts and assignments and everyone's
availability are read by those who build (policies renamed "the schedule's
builders read …"): `business_id in (select private.businesses_holding('schedule.edit'))`,
the businesses where the signed-in person holds the key as a member, or views
as a role that holds it by role (or as the owner), asked once per query. A
notification can be for those who hold a permission
(`public.notifications.audience_perm`, `private.notify`'s new last argument
`holders_of`; its old signature is dropped, every call passing fewer
arguments): written to the recipients who hold it, whatever their rank, read
only while they do (the read policy asks `private.has_perm` for such a line
and the rank for every other), its push skipped once they don't
(`public.claim_due_pushes`), and settled by `public.set_member_role` when
the new role doesn't hold it. `swap.waiting` and `availability.missing` go to
`private.members_holding(business, 'schedule.edit')` (a swap's asker left out
when they don't publish), and `schedule.unfilled`, only ever of a published
week, to those who publish it (`private.publishes_schedule`, holders of
`schedule.publish`), with `audience_role` still 'manager' (the lowest role that
holds the key by default, which nothing decides by any more). The lines of
the three kinds already in the table were moved to their key by the
migration, so a manager lowered after it stops reading them too. The workers'
own lines are as before. Only owners and the team change who holds a
permission (Q5): `private.role_holds_beyond(business, role, person)` says
whether a role holds by role a settable key the person doesn't, and
`public.set_member_role`, `public.team_invite` and `public.team_invite_link`
refuse a manager such a role (42501, hint 'held': the Team screen says
`beyondHeld`, an invite its "notAllowed"), which happens only where an owner
set workers above managers. The app reads the same answer: `buildsSchedule` and
`publishesSchedule` in `@domain/schedule` over `my_permissions` gate the
builder, the team's availability, swap approvals and Today's builder parts;
the builder offers no "פרסום" without `schedule.publish` and says why, and a
published week opens read only; Today and the schedule tab send such a
builder to fill no published week (`changesWeek`), and offer them only
colleagues' requests to decide (`decidesSwap` in `@domain/swaps`). `roles_scheduling.test.sql` covers it with
one matrix over today's defaults, workers raised (with and without
publishing) and managers lowered: reads, writes (one's own swap included),
notices (availability missing too), views, the push skipped, and publishing
asked before any lock; then, with workers set above managers, a manager
giving a role, and no line of the three kinds left by rank.

The management page by its permissions (`20261115001000_roles_manage.sql`,
the roles plan's R7; Orel's answers of 15 November 2026): `manage.view` and
`manage.edit` are settable, so owners and the team put a role at edit, view
or none there, and nothing changes for anyone until they do.
`private.can_edit_settings` is the ConceptApp team or whoever holds
`manage.edit` (`private.holds_perm`), where it was owners and managers by
role; its callers are unchanged: `set_module_settings`,
`set_business_details`, `set_departments`, `set_department_members`, and,
beside `private.can_manage_lists`, the list templates' writers
(`save_list_template`, `archive_list_template`, `restore_list_template`,
`next_list_openings`), which until the lists' phase let a role raised to
`manage.edit` save, archive and restore templates without `lists.manage`;
R5 (below) put the team alone in place of each of their
`or private.can_edit_settings(…)`. `public.set_module_settings`
also asks, of anyone not on the team, the module's own edit
(`private.settings_perm`: `schedule.edit`, `clock.edit`, `lists.manage`,
`chat.moderate`, none for notifications, reservations and storefront; 42501
with hint `module` and the permission as its detail); owners hold every key,
and the fields' levels (owner, team) are as before. The settings, the
business's details and its departments are read by every member, as before.
The activity log is read at `manage.view`, each row also by its own area
(`private.log_perm`): `clock.*` at `clock.edit`; `schedule.*`, `swap.*` and
`availability.*` at `schedule.edit`; `lists.*` at `lists.manage`; `invite.*`,
`member.*`, `team.*` and `profile.*` at `team.view`; `chat.*` at
`chat.moderate`; the management page's own (`module.*`, `business.*`,
`departments.*`, `wording.*`, `role.permission`, `permission.*`,
`view_as.*`) at `manage.view` alone; and a family named in none of them by
no one there (`tooling/log-families.test.ts` fails for a family the
migrations write that has no place). The pay rows and documents' are the pay holders' alone, exactly as
before. The members' policy is renamed "members read the log by area, pay
holders the pay rows"; "a view reads the log as its role would" reads as the
viewed role holds by role (`private.role_holds`), never `chat.*` or
`document.*`. Both ask once per query, `(business_id, key) in (select …)`
over `private.held_perms()` (every key the signed-in person holds, by
business) and `private.viewed_perms()` (every key their open view holds),
where they asked `has_role` and `has_perm` per row. On the app's side,
`manageAccess` opens /manage and its screens at `manage.view`
(`manageReach` in `@domain/manage-access`) and saves at `manage.edit`, a
module's settings only with its own edit too (`manageReadOnly`), and Today's
row follows. `roles_manage.test.sql` covers it, with an equivalence over the
seed's rows and a fixture of every family: on today's defaults every member
and every view as each role reads exactly what the old policies gave.

The time clock by its permission (`20261115001100_roles_clock.sql`, the
roles plan's R4; Orel's answers of 15 November 2026), the second area open
for changes: `clock.edit` is `settable`, and nothing changes until an owner
or the team switches it (managers hold it by default, workers don't, owners
always do). The floor is view: everyone on the staff punches in and out,
takes breaks, undoes a clock-out and reads their own hours, as before.
`private.can_edit_clock` is `private.holds_perm(…, 'clock.edit')`, and its
callers ask it unchanged: `issue_punch_code`, `punch_code_showing`,
`approve_station_pairing` and `set_clock_station_stopped` (the code screen
and the stations), `confirm_time_entry`, `add_time_entry` and
`correct_time_entry`. What stays the owner's is as it was: an owner needs no
punch code, and hours someone set for themselves (a manager's correction of
their own included, `'self'`) only an owner confirms. The team's hours and
breaks and the stations are read by those who edit the clock (the policies
renamed "people read their own entries, editors and pay holders all" and "the
clock's editors read the business's stations", each within a name's 63
bytes): `business_id in (select
private.businesses_holding('clock.edit'))`, members by `holds_perm` and views
by their role's rule or as the owner, asked once per query, where the
manager's rank, a view's rank and a personal `clock.edit` were three
branches; one's own hours, pay holders (`clock.payroll`) and a view as an
accountant read as before, at every level. `clock.confirm` (hours without a
code) and `clock.overdue` (an entry open too long) go to
`private.members_holding(business, 'clock.edit')` as lines for that
permission (`holders_of`, `audience_role` still 'manager'), so R3's rules
hold for them: read only while their reader holds it, the push skipped once
they don't, settled by a change of role, or at the next event of their hours
once the reader no longer holds it (`still_for`); hours someone set for
themselves stay an owner's line, by rank (critique 24), and a clock-out
undone turns such a line back into one for `clock.edit` when only an arrival
without a code waits. The lines already written were
moved to the key by the migration. The demo's correction
(`private.seed_demo_hours`) is made by its first manager who edits the
clock, else its owner. A manager gives nobody a role that holds `clock.edit`
by role while they don't (`private.role_holds_beyond`, R3's, asks every
settable key). The app reads the same answer: `editsClock` in
`@domain/time-clock` over `my_permissions` gates the team's hours and their
actions, the code screen and its route, the fixes on the pay screens,
`canConfirm`, and the clock's rows on the clock and on Today; `groupsFor`
offers the clock's approvals by it. `roles_clock.test.sql` covers it with one
matrix over today's defaults, workers raised and managers lowered: reads
(one's own, others' hours and breaks, stations, wages, the lines) for
members, the accountant and views as a worker, a manager and an accountant;
the clock's seven writes; who is told, hours set for oneself staying with
owners, and a demoted manager's line; the push skipped; a lowered manager's
line settled at the next event of its hours, not by the switch; the line of
a clock-out undone; then only an owner
confirming hours set for oneself, a manager giving a role, the demo's
corrector, today's rule frozen against the new one for every membership,
and no line of the two kinds left by rank.

Lists by their permissions (`20261115001200_roles_lists.sql`, the roles
plan's R5; Orel's answers of 15 November 2026), the third area open for
changes: `lists.manage` (running the lists: templates and their times, every
list) and `lists.send` (sending, a switch under it, on by default) are
`settable`, and `lists.send` now requires `lists.manage`, so a role holds
it only while it runs the lists (one given to a person holds whatever it
requires, as `holds_perm` has it). Nothing changes until an owner or the team
switches them (managers hold both by default, workers neither, owners always
both). The floor is view: everyone on the staff fills the lists sent to them,
their department, their shift or their role, sends their department's own
orders and passes on what they hold, as before.
`private.can_manage_lists` is `private.holds_perm(…, 'lists.manage')`; its
callers ask it unchanged (`save_list_template`, `archive_list_template`,
`restore_list_template`, `next_list_openings`, `set_list_item`,
`set_list_item_photo`, `finish_list`, `pass_list`, `reopen_list`,
`cancel_list`). `private.can_send_lists` is `holds_perm(…, 'lists.send')`,
or a person given `lists.manage` themselves, as before; `send_list` asks it
unchanged. The four template writers no longer take
`private.can_edit_settings` (R7's handover, critique 4): the ConceptApp team
stands alone in its place, so `manage.edit` no longer reaches the templates
and their times. Every list is read by those who run the lists
(`private.sees_list`'s branch for them is `holds_perm`); the archived
templates, the templates' times and every list through the policies'
`business_id in (select private.businesses_holding('lists.manage'))`,
members and views alike, asked once per query, where a view needed the
manager's rank; a list's photos the same (through their items, since
20261127000300; critique 5). Departments stay on the staff's reads, as lists and chat share
them. A list still late (`lists.late_team`) and a reading out of its range
(`lists.out_of_range`) go to `private.list_managers` (now
`lists.manage` holders) as lines for that permission (`holders_of`,
`audience_role` still 'worker', as written), so R3's rules hold for them:
read only while their reader holds it, the push skipped once they don't,
settled by a change of role; the lines already written were moved to the
key. The owners' late line (`lists.late_owner`) stays theirs by rank. The
demo's lists are sent by its first manager who may send them, else its
owner (`private.seed_demo_lists`). A list of a template's times with nobody
there to take it goes to the managers while their role runs the lists, else
to the owners (`private.lists_tick_business`), where it went to the
managers by role, lowered or not. Departments stay at `manage.edit`: whoever
is in one fills its lists, so the roles screen's hint for it says that
whoever they add, themselves included, gets that department's lists; and
the templates' times stay with `lists.manage` (times are edit), so the
hint for sending says that without it the times still send lists. The app
reads the same answer: `canManage` and `canSend` in
app/(app)/lists/lists.ts are `holdsPermission` of each key over
`my_permissions`, so a worker raised to lists edit sees the templates, the
business's day and every list, and one without `lists.send` has no
"שליחת רשימה" (nor "send it now" in the template editor, but on an order
of a department they are in, as `sendable` has it) and a line that says who
sends (`othersSend`, the rest when their department's order is theirs);
`lists.late_team` and `lists.out_of_range` carry `perm: "lists.manage"` in
`NOTIFICATION_KINDS`.
`roles_lists.test.sql` covers it with one matrix over today's defaults,
workers raised with and without sending, managers without sending and
managers lowered: reads (templates, times, every list, a photo, the lines)
for members, the accountant, two given a key of their own and views as a
worker, a manager and an accountant; saving, archiving and restoring a
template, its openings, sending and cancelling another's send; who is told
and a demoted manager's line; the push skipped; then the handover (manage
edit alone refused, the team allowed), sending refused to a role that
doesn't run the lists, a manager giving a role, a time with nobody there
(the managers while they run the lists, else the owners), the demo's
sender, today's rules frozen against the new ones for every membership and
list, and no line of the two kinds left by rank.

The team by its permissions (`20261115001300_roles_team.sql`, the roles
plan's R6; Orel's answers of 15 November 2026): `team.view` and `team.edit`
(which needs `team.view`) are `settable`, edit, view or none per role, and
nothing changes until an owner or the team switches them (managers hold both
by default, workers neither, owners always both), but for pay (below).
Every member still reads everyone's name and photo (the memberships and
profiles policies, through `private.shares_business`, on purpose, critique
15): team "none" hides the screen, the numbers, the minors and the invites,
not the names. The invites (one policy now, "the team's viewers read its
invites", for members and views alike; the view twin is dropped),
`public.team_phones` and `public.team_youth` (which also answers whoever
builds the schedule, critique 14) ask `business_id in (select
private.businesses_holding('team.view'))`, once per query. `public.team_away`
(days away, below) asks `schedule.edit` or `clock.edit` the same way. Inviting and
inviting again (`public.team_invite`, `public.team_invite_link`), cancelling
(`public.team_invite_cancel`), removing (`public.remove_member`), changing a
role (`public.set_member_role`) and clearing a line
(`public.clear_profile_bio`) ask `private.holds_perm(…, 'team.edit')` of the
actor where they asked for an owner or a manager. The one rule by role left
is the rank rule, `private.gives_role(giver, role)`: an owner gives every
role, anyone else a role of the staff other than owner at or below their own
(owner 3 > manager 2 > worker 1), so a worker raised to edit the team acts on
workers; an accountant and an owner stay an owner's to give, and clearing a
line keeps its rank comparison (an accountant's, at a worker's rank, only from
above: a manager, an owner). Pay stays the owner's to give (Orel,
8 November 2026; critique 17): `private.role_holds_pay(business, role)` says
whether a role holds a key only an owner gives (pay, `clock.payroll`) through
a row of `public.role_permissions`, and someone other than an owner is refused
such a role by an invite, a fresh link or a change of role (42501, hint
'pay': `givesPay` on the Team screen, in an invite and a link too). This one
changes today's behaviour: where an owner gave managers pay (the demo shop), a
manager inviting or promoting someone to manager passed pay on, and no longer
can. Nor does an invite sent before: `private.invite_closed` also closes an
invite to a role that holds pay that neither an owner nor the ConceptApp team
sent, so `public.claim_invite` answers P0002 and `public.invite_by_token`
reads it as expired, until an owner's fresh link (`public.team_invite_link`)
or the team's (`public.issue_invite_link`, which then makes it the team's)
opens it again. `team.joined` goes to `private.members_holding(business, 'team.view')`
with `holders_of` (read while its reader holds the key, its push skipped
once they don't, settled by a role change; the lines already written were
moved to the key), `audience_role` still 'manager'. The app reads the same:
`canSeeTeam` and `canEditTeam` in `@domain/team` over `my_permissions`
open the team screen, its person pages, its invite page and its actions,
Today's team row, the management page's team row and chat's profile links;
`invitableRoles`, `canRemoveMember`, `mayChangeRole`, `roleChoices` and
`mayClearBio` add the rank rule (`givesRole`). Someone at team view reads
the screen with a line saying so and changes nothing. Whether someone is on
the clock stays the clock's (`time_entries`' policy): the person's page asks
it only of someone who reads the team's hours; anyone else is told the change
waits for clocking out, and is refused at it while the person is clocked in
(`clockedIn`). The roles only an owner gives (`ownerOnlyRoles`: those that hold
pay by a row, read with the secret key by `getPayRolesForTeam`) aren't offered
to anyone else: not in the invite form, the role sheet or a new link, and a
change away from one is held for its undo, as changing back would be refused.
The notifier's clock lines are R4's (`20261115001100_roles_clock.sql`), the
version this one replaces. `roles_team.test.sql` covers it with one matrix
over today's defaults, workers raised to team view and edit, managers lowered
to view and none, and workers who build at team none: reads (invites,
numbers, minors, names, the joined line), writes within the rank rule, who
hears of someone joining, views as each role; then today's answers against
the old rules, the lowered manager's push skipped, a worker at edit kept off a
manager's invite and an accountant's line, pay never passed on by anyone but
an owner (an invite sent before included), the clock's lines still R4's, and
how it is built.

Chat by its permissions (`20261115001400_roles_chat.sql`, the roles plan's
R8; Orel's answers of 15 November 2026): `chat.moderate`, `chat.announce`
and `chat.send_documents` are `settable`, and nothing changes until an owner
or the team switches them (managers hold all three by default, workers none,
owners always all). Chat already asked its permissions rather than the role:
the newest version of every chat and documents function and policy asks no
rank, and no policy is replaced. The floor is view: everyone on
the staff writes in their own chats and groups, as before. Moderating is
chat's edit: every department's group with all of every group's history
(`private.chat_reads_from`, `private.chat_members`), removing others'
messages in groups, pinning and unpinning others' announcements, who
confirmed one, the log's `chat.*` rows (R7's `private.log_perm`) and chat's
settings (R7's `private.settings_perm`); putting a removed message back
stays with whoever removed it, within its 10 minutes. Announcing and
sending documents are switches under it: both now `require` `chat.moderate`,
so a role holds them by its role only while it moderates by its role
(`private.holds_perm`, `private.role_holds`), and granting one to a role
that doesn't is refused (22023, hint `requires`); given to a person, each
holds as before, whatever it requires, and the office (`clock.payroll`)
sends documents whatever chat says (`private.sends_documents`). Pinning an
announcement again tells the group again, so its author pins their own
again only while they hold `chat.announce`, and unpins it whatever they
hold (`public.pin_announcement`, replaced). A private
chat stays its two people's alone, and a view session reads no chat, as
before. No line of chat or documents is for a rank (their lines go to a
chat's members and to the office), but those in a department's group who
aren't in the department are there by `chat.moderate` alone, so their
`chat.group` and `chat.announcement` lines are lines for it
(`notifications.audience_perm`: read only while they hold it, and its push
skipped once they don't), as `private.notify_chat` and
`private.notify_announcement` (replaced) write them and as the lines already
written were moved for those who moderate. A manager gives nobody a
role that holds a chat key by role while they don't
(`private.role_holds_beyond`, R3's, asks every settable key). The demo's
messages and documents still pick their writers by role
(`private.seed_demo_chat`, `private.seed_demo_documents`): the reset makes
the business again before them, so its manager holds all three. The app
reads the same answer (`chatAccess` and `documentsAccess` over
`my_permissions`); anyone who doesn't announce has no "פרסום הודעה
מההנהלה" on /chat/announcements and a line saying who posts them, and reads
who writes in an announcers-only team group by the rule, not as
"management"; chat's who-sees words name the owners and whoever runs the
chat; a sender whose `chat.send_documents` is off keeps "שלחת" on
/chat/documents. `roles_chat.test.sql` covers it with one
matrix over today's defaults, workers raised (with and without the two
switches) and managers lowered: reads (the chats, the team's group and its
history with a removed message and a pinned announcement, two departments'
groups, a private chat, who confirmed, the log's chat rows, what each
holds) for members, the accountant and views as a worker and a manager; the
writes (removing and putting back, unpinning, announcing, a document to
people, a group of another department, a private chat, chat's settings,
the team's group where only announcers write); then the console's matrix,
the office sending documents when lowered, the switches refused without
moderating by role, personal grants, giving a role, a lowered author's own
announcement unpinned but not pinned again, the lines of a department's
group for moderators outside it (hidden and their pushes skipped once
lowered), today's rule frozen against the new one for every membership, and
no chat or documents function or policy asking a rank.

Roles a business names itself (`20261115001500_named_roles.sql`, the roles
plan's R11a; Orel's answers of 15 November 2026, 1 and 5): an owner or the
team adds a role with a name of its own, built on a manager or a worker, with
its own permissions; nobody holds one until R11b gives it, so nothing changes
for anyone yet. `public.business_roles` holds them: the name (trimmed, its
spaces single, 1 to 40 characters, one live role a name in a business
whatever its case: `business_roles_live_name_idx`), an optional English one,
the base (manager or worker: its rank, and its rules where it has none of its
own), its place in the list (`sort`), who made it and when, and when it was
archived. Members and view sessions read them (a colleague's role name is no
secret); nothing writes them but the functions below, not even the secret
key. `memberships.named_role` is the one a person holds, always built on
their role: a foreign key over (business_id, named_role, role) to the role's
(business_id, id, base), and a trigger (`private.clear_named_role`) leaves it
behind when the role changes to another base, whoever changes it
(`public.set_member_role`, `public.claim_invite`), unless the same update
sets a named role; another (`private.refuse_archived_named_role`) refuses
putting anyone in an archived role of the business (22023, hint `archived`),
whoever writes it, locking the role's row as the foreign key's check does so
an archive under way is waited for. A named role's rules are rows of `public.role_permissions`
with `named_role` set and `role` its base (the same foreign key, on delete
cascade); the primary key (business_id, role, perm) can't take the nullable
column, so a unique index nulls not distinct over (business_id, role,
named_role, perm) replaced it (`role_permissions_rule_idx`) and
`set_role_permission`'s upsert names it (the demo's seed and the pay branch say
`on conflict do nothing`, which needs no target). Someone in a named role
holds by role what its row decides, else its base's rule (the base's row,
else the key's default roles), with `requires` and personal grants as
before (`private.role_gives` and `private.role_holds` take the named role as
a last, defaulted argument; `private.holds_perm` passes the person's). A
named role never holds pay by role: `private.role_gives` says no for a key an
owner gives, `private.refuse_named_role_pay` refuses such a row (22023, hint
`pay`), and its people are given pay one by one on "מי רואה שכר". A view
session still views the built-in roles. `public.set_role_permission` and
`set_role_permissions` take `grant_named` (defaulted, so every caller before
is unchanged): the role must be live, in the business, on `grant_role` (22023,
hint `base`; P0002 for one that isn't), never pay; its default is its base's
rule, so "back to default" removes its row and it follows its base again;
its `role.permission` log row adds `named_role` and `name`.
`public.create_business_role(actor, business, base_role, role_name,
role_name_en, copy_from, copy_role)` (owners and the team,
`private.check_role_changer`, as `check_permission_giver`) copies its base, the
other built-in role (`copy_role`) or another live named role (`copy_from`):
rows only for the keys owners switch where that one's rule differs from the
base's, so it starts holding exactly what the source holds, never pay. It
refuses a live name (23505, hint `taken`), a twenty-first live role (54000,
hint `limit`), a bad name (22023, hint `name` or `name_en`), base or copy;
a demo business takes them as it takes its rules, its reset deleting them
with the business. `public.rename_business_role` (an English name of null
kept, empty removed), `public.archive_business_role` (refused while anyone
active holds it: 55000, hint `held`, the count as its detail; those who left
with it lose it, so nobody comes back in an archived role; its rules kept)
and `public.restore_business_role` (the archive's undo, refused for a name
taken or the twentieth) complete it; each is logged (`role.create`,
`role.rename`, `role.archive`, `role.restore`), read as `role.permission` is
(`private.log_perm`: `manage.view`). `public.role_permission_matrix` adds
`named_role`, `role_name` and `role_name_en`: managers' and workers' rows as
before, then each live named role's, its base as `role`, its default its
base's rule (never pay). `@db/roles` reads them (`RoleMatrix.named`, and
`addsRoles` while the function has the columns: before the migration nothing
is added) and the people in each role (`getRolePeopleForOwner` with photos,
under RLS as "מי רואה שכר" reads them, which already shows a member and a
view their business's `named_role`; `getRolePeopleForTeam` without, with
the secret key, as the team is no member; both tolerating a missing column), writes a
named role's area with its id (`setRoleArea`), and adds, renames, archives
and restores one (`createBusinessRole`, `renameBusinessRole`,
`archiveBusinessRole`, `restoreBusinessRole`), the last three only for a role
of the business the screen was drawn for. `roles_named.test.sql` covers it,
with R1's resolver frozen and compared before any named role exists, and
everyone's answers before and after for every membership without one.

Giving a named role (`20261115001600_named_roles_give.sql`, the roles plan's
R11b; Orel's answers of 15 and 16 November 2026: owners and the team change
permissions, and someone other than an owner never gives a role that holds
pay, or more than they hold). `public.invites.named_role` is the one an
invite gives, built on its role by the same foreign key as memberships'
(business_id, named_role, role), with memberships' two triggers on it too:
`private.clear_named_role` leaves it behind when the invite's role changes
to another base, and `private.refuse_archived_named_role` refuses an
archived one (22023, hint `archived`). `public.team_invite` takes
`invite_named` (defaulted: today's calls are unchanged; the invite's role is
its base, 22023 hint `base` for any other); `public.set_member_role` takes
`new_named` (a role change to a named role sets `role` to its base and
`named_role`; to a built-in role clears it; another named role of the same
base, or the base itself, is a change too) and `seen_named`, the named role
the screen showed with `seen_role` (either changed meanwhile is 40001).
`public.team_invite_link` takes nothing new: a fresh link is for the invite
as it is. Each asks of the named role through `private.live_named_role`
(of the business, else P0002; live, else 22023 hint `archived`; on that
base, else 22023 hint `base`; its row locked `for key share` so an archive
waits and then counts what was written), then the giver's rule: an owner
gives any live one; anyone else who edits the team one whose base passes the
rank rule (`private.gives_role`), holding by role nothing settable they don't
(`private.role_holds_beyond(business, r, person, named)`: 42501, hint
`held`) and never pay (`private.role_holds_pay(business, r, named)`, false
for any named role, as R11a's trigger keeps it: 42501, hint `pay`). The logs
name it (`invite.create`/`invite.send`, `invite.claim`, `invite.cancel`,
`member.role` and `member.remove` add `named_role` and `role_name`, the last
two from `public.team_invite_cancel` and `public.remove_member`, replaced for
it; `member.role` adds the one left, `was_named` and `was_role_name`), and
the activity log says its name with its base.
`public.claim_invite` puts the person in the invite's named role, on a rejoin
too, locking the role's row first (and, since
`20261127000500_invite_names.sql`, keeps the invite's name as the business's
own for them, unless it is their own or they join as an owner);
`public.invite_by_token` says its id and
names (`named_role`, `role_name`, `role_name_en`, only for an invite that
names one, so any other reads as before) for the join screen.
`public.archive_business_role` counts open invites to the role (unclaimed,
unexpired) with the people holding it (55000, hint `held`, both in the
detail). An expired invite to a role archived since is closed
(`private.invite_closed(business, role, inviter, named)`): the join screen
reads it as expired, claiming it is P0002, and a fresh link for it, the
team's (`public.issue_invite_link`) or the business's, is 22023 hint
`archived` until the role is restored; nor is it closed any more for pay its
base holds. The console invites to the built-in roles (`public.admin_invite`):
its fresh invite to a number with an open one clears that one's named role.
`@db/invites` passes `invite_named` (`inviteToTeam`), reads the names
(`findInvite`: `namedRole`) and says a console renewal refused for a role
archived since (`issueInviteLink`: `roleGone`), `@db/team` reads each
member's and invite's named role with the business's roles under RLS
(`getTeam`, `getTeamPerson`, `getFormerMember`'s `namedRole`, one role by its
id with `namedRoleIn`; a project before the columns reads none) and passes
`new_named`/`seen_named` (`setMemberRole`, each only when set), `@db/session`
gives the signed-in person's own (`membership.namedRole`, for /me and the
shell), and `@db/roles`'s `getGivableNamedRoles` gives the team's screens the
live named roles with the settable keys each holds by role, read with the
secret key, none until `invites.named_role` exists (the screens strip those
keys before a browser gets them), and `getRoleInvitesForOwner` /
`getRoleInvitesForTeam` count the open invites to each, for "תפקידים
והרשאות". `roles_named_give.test.sql` covers it.

Telling a role's people what it does changed (`20261115001700_roles_changes.sql`,
the roles plan's R10; Orel's answers of 16 November 2026): every
`role.permission` row of the log (a role's rule for a key changed, from the
owner's screen or the console) goes through its own trigger,
`audit_log_notifies_roles`, to `private.notify_role_change`, which tells the
active members whose rule it changed: for a named role those holding it; for
a built-in role those in it with no named role, and those in a live named
role on it with no row of its own for the key (it follows its base there).
Never an owner or an accountant (in no role the screen changes), nor the
actor, whom `private.notify` leaves out.
The line, `role.changed`, is one a person, a role and an area (dedupe
`role.changed:<manager|worker|named role id>:<area>`), its facts the role, a
named role's name, the area and what the role held of the area's keys where
the line began and now (`from`, `to`: `private.area_rules` gives the role's
rule for each key, `private.role_gives`'s, and `private.area_holds` what it
holds by them with `requires`, every settable key requiring only one of its
own area). While it is unread a later change of the same area goes on from
where it began, so an undo that puts the area back deletes it; a line read
keeps its place in the inbox (its `dedupe_key` cleared) and the next change
starts its own; a change that moves nothing the role holds tells nobody. In
the app alone: written through `private.notify`, then `push_state` 'none'
(the reminders' lines in the app alone do the same), so no send takes it, and
in no group (`private.notification_kind_groups`, the latest version with one
row more), about the area's module. A demo business's people get theirs in the
app; with notifications off nobody does. `@db/roles`'s `setRoleAreas` writes
several areas of a role in one `set_role_permissions` call ("חזרה להתחלה" and
its undo; `setRoleArea` is its one-area case). `roles_changes.test.sql` covers
it (26, ids c4…, numbers 050-084-xxxx), and `roles_chat.test.sql` leaves the
new line out of its count of a lowered manager's chat lines.

Viewing the app as a role a business named (`20261115001800_named_roles_view.sql`,
the roles plan's R11c; Orel's answers of 15 and 16 November 2026). A view
session can be as one: `public.view_sessions.named_role`, built on the
session's role by the same foreign key as memberships' and invites'
(business_id, named_role, role) to the role's (business_id, id, base), on
delete cascade (a role goes only with its business, and a view never falls
back to its base), and never an archived one
(`private.refuse_archived_named_role` on the table too: 22023, hint
`archived`). `public.start_view_session` takes `view_named` (defaulted, so
today's calls are unchanged): of the business (else P0002), live (else 22023,
hint `archived`) and on `view_role` (else 22023, hint `base`), checked before
the open session ends, so a refused start leaves it; its `view_as.start` row
adds `named_role` and `role_name`, which the activity log says with the base.
The session's role stays its rank: `private.is_viewing`, `is_viewing_staff`
and `viewing_payroll` read a view as a named role as one as its base,
unchanged. What it reads by what it holds asks the named role:
`public.my_permissions`' view branch, `private.businesses_holding`'s (the
drafts, everyone's availability, the team's hours, the stations, the lists,
the invites, the numbers and the rest of R3 to R8's policies) and
`private.viewed_perms` (the log's view policy) each call
`private.role_holds(business, v.role, key, v.named_role)`, so a view as a
named role holds exactly what someone in it holds by role (its own rules,
else its base's, with `requires`, never pay) and still writes nothing: the
team member is no member, so every write's own check refuses them.
`public.end_view_session` is unchanged. `@db/view-as` passes `view_named`
only when there is one (`startViewing(actor, business, choice)`: a role
archived since is `roleGone`) and gives the console the business's live
named roles (`getViewableNamedRoles`, with the secret key, none until
`view_sessions.named_role` exists); the console's action sends an id no
longer among them to `roleGone` before it calls (`readViewAsChoice` in
`@domain/view-as`); `@db/session` reads the open session's
`named_role` (a project before the column reads none) and its names under the
policy that lets a view read them, for the banner and the shell
(`viewing.namedRole`, `membership.namedRole`). `roles_named_view.test.sql`
covers it (14, ids a3…, numbers 050-083-xxxx): the table's foreign key and
trigger, the privileges, a built-in view as before (R1's view branch frozen),
the view as a shift lead (started as the service role, as the app starts it;
its session and log row, its names read by the team member), every refusal
by the function (as the service role) and by the table, no write
through the secret key or the browser, and for a shift lead who builds, a
clock lead, an office role on the management page and the team, and a floor
lead on managers who doesn't build where managers see pay: what each holds
(the same as someone in it, its base's and its own rules and nothing more)
and reads (drafts, hours, the log, invites), its rank and no pay.

Lists sent to a named role (`20261115001900_named_roles_lists.sql`, the roles
plan's R11d). `recipient_named_role` on `public.lists`, `public.list_templates`
and `public.list_schedules` is the role a list "to a role" goes to, built on
its `recipient_role` by a foreign key over (business_id, recipient_named_role,
recipient_role) to the role's (business_id, id, base), only on a role (a
check), and never an archived one, whoever writes it
(`private.refuse_archived_recipient_role` on each: 22023, hint `archived`,
the role's row locked `for key share` so an archive waits); null is the role
itself, as before. A list to a named role is for exactly the active people on
the staff holding it (`private.holds_list`, `private.list_holders`, and
through them `private.sees_list`, the lists' policy, `public.my_open_lists`,
the writers and every list notification); a list to the role itself still
reaches everyone in it, those in a role named on it among them, so "to the
workers" reaches a shift lead built on worker as it always did. A recipient's
JSON takes `namedRole` beside `role` (`private.list_recipient`: of the
business, else 22023; live, else 22023 hint `archived`; on that role, else
22023 hint `base`; only on a role), so `public.send_list` sends to one (its
`lists.send` row adds `recipient.named_role` and `recipient.role_name`) and
`public.save_list_template` keeps one on a template's default and on each of
its times (`private.list_schedule_fields`, which gains `for_named`). The
minute job (`private.lists_tick_business`) opens a time's list to its named
role while it is live, and once it was archived (its template archived first,
then restored) treats it as nobody there: the managers while they run the
lists, else the owners, never the whole base. `public.pass_list` clears it
with the role. `public.archive_business_role` is refused while a live template
goes to the role or a time of one sends to it, on or paused (55000, hint
`lists`, their count in the detail), after its people and open invites (hint
`held`); a list already sent stays as it was. `public.set_member_role` settles
the `list:`, `list.due:` and `list.late:` lines of someone moved off a named
role, still on the staff, for the lists they no longer see
(`private.sees_list`), as `public.pass_list` settles a list's former holders'.
`@db/lists` reads each list's,
template's and time's named role beside the rest (`namedRolesOf`: none on a
project before the column, so every screen reads as before; `ListHolder` and
`TemplateRecipient` gain `namedRole`), takes the person's in `getMyLists`, and
gives the business's roles, archived ones too, to the lists' screens
(`getListRoles` under RLS, `getListRolesForTeam` with the secret key; none
until `lists.recipient_named_role` exists); `@db/roles` says the new refusal
(`archiveBusinessRole`: `lists`) and counts, for "תפקידים והרשאות", the live
templates that send lists to each named role, by default or by a time, each
once (`getRoleListsForOwner`, `getRoleListsForTeam`, with the secret key as
the matrix; none before the column), so the screen holds the role back
before it is tried; `@db/team`'s `getColleagues` gives each member's
`namedRole`, which the send screen counts each role's people by.
`roles_named_lists.test.sql` covers it (18, ids d4…, numbers 050-087-xxxx).

Out of a department, out of its lists' lines
(`20261116000100_lists_department_lines.sql`, R11d's open item). Someone
still on the staff who is taken out of a department no longer holds its lists
(`private.holds_list`) and is no longer among those who asked for its orders,
so their lines of the lists they are no longer among are read, settled and
off the phone if not sent yet, as `public.pass_list` settles a list's former
holders (`private.settle_former_list_lines(business, person, at_time)`, for
someone active on the staff only): the `list:`, `list.due:` and `list.late:`
lines of a list they no longer hold, and the `list.finished:` line of one
they neither sent nor are in the department that asked for. By holding, not
by seeing: whoever runs the lists sees every list but is settled like anyone,
as by `pass_list`, so the bell agrees with the Lists tab
(`public.my_open_lists`); R11d's block in `public.set_member_role` still asks
`private.sees_list`. A trigger on `public.department_members`
(`department_members_settle_lines`, after delete or an update of
`department_id` or `user_id`, for each row, through
`private.settle_lines_off_department`) does it for every writer:
`public.set_department_members`, which deletes only the people not kept, so
a re-save settles nothing, and the paths that take someone off the staff,
which make them inactive or an accountant first, so their lines are put away
as before (read and off the phone, not settled). The lines of lists they
still hold stay: another department of theirs, a list to them, to their shift
or to their role; so does the finished line of a list they sent or a
department of theirs asked for, and every line for those who run the lists or
the owners. It is one way: put back in the department, they hold its lists
again, but a settled line stays settled and a skipped push skipped (the due
and late lines are never written again). A business being deleted (the demo
reset) is skipped, and a failure is a warning, never what stops the change.
No function is replaced. `lists_department_lines.test.sql` covers it (12, ids
d5…, numbers 050-088-xxxx).

Each item's history (`20261116000200_list_history.sql`, the L6 plan's L6a;
Orel, 16 November 2026). `public.list_item_changes` keeps one row per real
change of a list item, oldest first by (`changed_at`, `id`, an identity): who
(`changed_by`, on delete set null) and when, which of checked, given, reading,
answer, comment and photo changed (`changed`), and the item after it, held to
`list_items`' own checks. Earlier answers and comments stay in the rows
before (Orel's default on the plan's Q3); `photo` says only whether it had
one, since a replaced file is deleted at once. A key on `list_items` (`id`,
`list_id`, `business_id`) keeps each row on an item of its own list and
business, and the row goes with it (cascade). `public.list_reopens` keeps the
close each reopen undid (`was`, finished or cancelled, `was_by`, `was_at`) and
who opened it again and when, as `public.reopen_list` nulls it on the list.
Both follow their list (the policies "changes follow their list" and "reopens
follow their list": whoever reads the list, which is the audience of the done
line) and are select only: nothing writes them but the functions below, not
even the service role, and `private.refuse_history_change()` before update
(42501) lets through only its person columns going to null, an account
deleted; rows go only with their list. `private.record_item_change(item_before,
item_after, actor, at_time)` writes a row when a field differs (the photo by
its path). `public.set_list_item` (same signature and grants) writes nothing
for a save that changes nothing, and moves `done_by` and `done_at` only with
the item's value (checked, given, reading, answer): a comment alone, or the
same value again, keeps who did it; clearing nulls them, and a photo item
keeps them, as before. `public.set_list_item_photo` records each photo set,
replaced or removed (the daily clean-up none), and `public.reopen_list`
writes its `list_reopens` row first. `private.backfill_list_item_changes()`
gave every item already done one row, by `done_by` at `done_at`, naming its
result's fields, its comment kept but not named. The history tells nobody of
its own: it adds no log row and no line. A reading a change puts out of its
range still writes `lists.out_of_range` and tells those who run the lists, as
before, a second person's change included. `@db/lists` `getList` reads both
under RLS, the newest 900 rows of each, oldest first (`ListDetail.changes`
and `.reopens`, each row checked by `@db/list-history`): the API answers at
most 1000 rows and would drop the newest, so a list changed more than that
loses only its oldest. None before the migration, so a list still opens.
`list_history.test.sql` covers it (54, ids b1…, numbers 050-052-xxxx).

Fixing a closed list in place (`20261116000300_lists_fix.sql`, the L6 plan's
L6b-1; Orel, 16 November 2026). A finished list is fixed where it is: it
stays finished, and `finished_by`, `finished_at`, `late_at` and the
`lists.finish` row with its `late` flag don't change; there is no
`lists.sent` again and nothing left open. Missed and cancelled lists are
never fixed. A fix has functions of its own, `public.fix_list_item(actor,
item, result, at_time)` and `public.fix_list_item_photo(actor, item,
new_path, at_time)`, the server's alone, while `public.set_list_item` and
`set_list_item_photo` keep their signatures and grants and still refuse a
finished list (55000), so an out-of-date screen never turns a tick into a
fix. Both pairs are now `language sql` wrappers over one body each,
`private.write_list_item` and `private.write_list_item_photo` (L6a's bodies,
moved, with a `fixing` flag; not fixing, every rule is as it was). Fixing:
first what filling asks, holding the list or running the lists (42501), so
nobody else learns from a fix whether a list is finished; then a finished
list (55000 otherwise, which the app reads as "opened again meanwhile"); then
those `private.can_fix_list(l, actor, at_time)` allows
(42501): for now whoever runs the lists, at any time, the one place L6b-2
widens to a role's switch and window. A required item is changed or noted,
never emptied (23514, hint `required`), and a required photo replaced,
never removed. While the item stays done, `done_by` and `done_at` stay
(readings over time are counted by `done_at`); one a fix makes done is the
fixer's, and one it empties is nobody's. The fix is marked three ways: `list_item_changes.fixed`
(`private.record_item_change` sets it for a change to a finished list),
`list_items.fixed_at` and `lists.fixed_at`; an item or a list reads as fixed
while its `fixed_at` is after the list's `finished_at`, so a reopen and a new
finish clear the mark without touching the column. Each fix logs one
`lists.fix` row (the list, its name, the item, its label, kind and unit,
which fields changed, and `from` and `to` of checked, given and reading; no
text) and tells nobody (`private.notify_for_lists` has no arm for it); a fix
that puts a reading out of its range still logs `lists.out_of_range` and
tells those who run the lists. A fix that changes nothing writes nothing.
`@db/lists` `setListItem(…, {fixing})` and `@db/list-photos`
`setListItemPhoto`/`removeListItemPhoto(…, fixing)` call the fix functions,
and `@db/list-failures` (`listFailureOf`, `itemFailureOf`) reads 23514 with
hint `required` as "keepRequired" and a fix's 55000 as "reopened". The
three new columns are read beside the rest (`fixed_at` of lists through
their own small query, of items through `itemRows`' fallback, `fixed` of
changes through a second read without it), so the app reads none fixed
before the migration, and a fix before it says the lists aren't ready yet
("notYet"). `lists_fix.test.sql` covers it (47, ids b2…, numbers
050-053-xxxx).

The switch "תיקון רשימות שנסגרו" for any role (`20261116000400_lists_fix_switch.sql`,
the L6 plan's L6b-2; Orel, 16 November 2026: can a role like "עובד בכיר"
fix the shared lists that reach it, after one person closed them for all).
A new key, `lists.fix`, in the lists area: managers by default, settable
in the same statement (a key of an area that owners can't switch would
close the whole area on the roles screen), and `requires` null, since edit
covers it, not the chain: the roles screen draws it held at edit and grants
it with a raise to edit, and `private.can_fix_list` lets `lists.manage`
fix at any time. It is the first key that works at
view: whatever reads the catalogue takes it by itself
(`role_permission_matrix`, `set_role_permission(s)`, `my_permissions`,
`role_holds_beyond`, R10's area rules and lines). A new lists setting,
`fixHours` (owner level, as the punch code is; 2, 12, 24 or 72 hours, 24 by
default), in `private.list_settings` (replaced from
`20261115000500_lists_owners_late.sql` with only that) and read by the new
`private.list_fix_hours(business)`: a value the manifest offers, compared
as jsonb as the tick reads `tellOwnersAfterMinutes`, so a stored `"12"`
reads as 24 and `72.0` as 72, as `readModuleSettings` reads them.
`private.can_fix_list` (same parameters) now lets, besides whoever runs the
lists at any time, someone who holds `lists.fix` (`private.holds_perm`: a
named role's rule, its base's, the key's default or a grant of their own)
fix a finished list that reaches them now (`private.holds_list`) until
`fixHours` after it closed, that moment included. A list passed to another
department leaves its former holders; seeing every list stays edit's.
`private.write_list_item` and `write_list_item_photo` are replaced from
L6b-1's bodies with one refusal more: a fix refused to someone who holds
`lists.fix` and the list is refused for the time alone, 42501 with hint
`fix_window`, which `@db/list-failures` reads as "fixOver" ("הזמן לתקן את
הרשימה הזאת נגמר"); anyone else is refused as before, with no hint.
`lists.fix` never reopens a list: reopening is as it was (the finisher
within five minutes, or `lists.manage`). Every `lists.manage` rule set before this gets a `lists.fix` rule of the
same value from the migration's `private.backfill_lists_fix()` (run once,
revoked from everyone), as the roles screen writes a raise or a lower now,
so fixing follows the role's own lists level: a base role where that
differs from the key's default (managers lowered are denied it, workers
raised given it), a named role always, whatever its base. Straight into the
rules, as the seed writes them: no role's holding changes, so nothing is
logged and nobody is told. `private.backfill_lists_fix_lines()` completes
the R10 lists lines still open that were written without the key (each
side's `lists.fix` is its `lists.manage`), so a role put back where its
line began still takes the line away. `private.role_holds_beyond` (replaced
from `20261115001600_named_roles_give.sql`) counts a giver who runs the
lists as fixing closed ones.
That covers managers lowered while Vercel had the key and the database
didn't (`setRoleAreas` left `lists.fix` out) too. `private.area_holds`
(R10, replaced from `20261115001700_roles_changes.sql`) counts `lists.fix`
held while `lists.manage` is, as the roles screen draws it ("כלול
בעריכה"), so switching it beside edit, for the role or for the base of a
named role at edit, tells nobody instead of leaving a line that says
nothing. No rule by rank, no new log family. `@db/lists`
`getMyLists(…, fixableSince)` also reads the finished lists a person holds
that opened before today and closed within the business's window, for "עוד אפשר לתקן" on
`/lists`. `@db/roles` `setRoleAreas` asks `areaOpen` with the matrix's
keys and never writes a key the matrix doesn't list, so the roles screen
stays open before Migrate. `lists_fix_switch.test.sql` covers it (40, ids
b3…, numbers 050-054-xxxx, times on 14 to 21 December 2026).

A reading back inside its range settles the line about it
(`20261117000100_lists_range_settles.sql`; Orel, 17 November 2026, the third
question left from L6). `private.write_list_item` (replaced from L6b-2's body
with two blocks more) settles the item's `list.range:<item>` line when the
reading it saves is new and inside the item's range, filling an open list or
fixing a closed one alike, as `private.resolve_notifications` settles a line
(read, an earlier read kept, settled, and its push skipped while still
queued), for everyone it reached, and marks it `backInRange: true` in its
params. `@domain/notifications` reads the mark as the line's `backInRange`,
and the inbox then says the reading is back in range
(`kinds.lists.out_of_range.settledTitle`) instead of the reading that was
outside. A reading emptied leaves the line; one outside again writes
`lists.out_of_range` as before and `private.notify` realerts the line with
new params, without the mark; since notify leaves out whoever read it
outside, the same step takes the mark off every line of the item, so the
line of someone who runs the lists and read it outside themselves no longer
says it is back (it stays the earlier reading it was about, with its reader
and time); back inside, every line of the item is settled and marked,
theirs too, keeping when it settled. The inbox's title is `outOfRangeTitle`
(`app/(app)/notifications/range-words.ts`, with its test). Lines left open before it stay until the next
new reading inside the range. No new log row or key.
`lists_range_settles.test.sql` covers it (17, ids b4…, numbers
050-055-xxxx, times on 11 January 2027).

The pay screens (`20261110000400_payroll_screens.sql`, payroll P3).
`public.note_payroll_access(business, pay_month, view_kind)` notes that the
caller opened a pay screen (`view_kind`: month, person or access; 22023 for
anything else): one `payroll.view` row a day per person, by the business's
own clock, and only for someone holding `clock.payroll` or viewing as an
accountant (nothing, and no error, for anyone else). The person's own session
calls it (`notePayrollAccess` in `@db/payroll`), from a server action the screen
calls after it mounts, never while a page renders: a prefetch logs nothing. The
row is a pay row, so only pay holders read it, and the activity list leaves it
out as routine. `private.notify_for_payroll`, on its own trigger
(`audit_log_notifies_payroll`, the lists pattern), tells a person given
`clock.payroll` personally (`access.pay_granted`, no facts in the line, the
giver as its actor) and settles the line when it is taken back; a role's grant
tells nobody. A settled `access.pay_granted` line leads to the inbox, since the
pay screens are then closed to its reader: `getNotification` in
`@db/notifications` reads `resolved_at` for `linkFor`. The demo: the shop has
an accountant (Galit, door account `accountant`, in no department and on no
shift; on the hosted project `supabase/hosted-demo.sql` starts a demo business
again when someone its definition names has an account but no membership, so
she joins once the demo step makes hers), and `private.seed_demo_pay`
now ends with `private.seed_demo_hours`, which writes last month's hours from a
definition's `hours` (`{"fridays": …, "cases": [{"user_id", "case", "note"}]}`):
every active member on the staff but the owner works Sunday to Thursday
09:00–17:00 with a half-hour break (unpaid when the business's breaks are),
one weekday off by their place, Fridays 08:00–14:00 for workers when
`fridays`, and the cases on the people they name (`corrected` by the first
manager, since R4 the first who edits the clock, else the owner, with its
`clock.correct` row, `evening`, `without_code`, `night`,
`friday_late`, `saturday_night`), each on its own weekday, in the business's
time zone, none left open; a plan that fails writes no hours and the reset
stands. `@db/payroll` reads the pay people (everyone who was ever a member,
with name, photo and form of address), the roles given pay access, the access
screen's people and the times corrected entries had before (from the log's
`clock.correct` rows), and writes the grants for an owner. The session's
`membership.perms` now comes from `public.my_permissions`. Covered by
`payroll_screens.test.sql`.

Hourly wages (`20261110000500_hourly_wages.sql`, payroll P4). Money is whole
agorot, as integers, everywhere. `public.minimum_wages` holds Israel's minimum
wage by the day it took effect, every figure as published (the adult hour on
182 hours, cut, not rounded: 35.40 from 1.4.2026; the statute's 186-hour
figure; the youth bands and the apprentice's), read by anyone signed in and
written only by migrations; `youth_published` is false for 1.4.2025, whose
youth figures were worked out and must be checked before a business pays a
minor from them. `packages/db/minimum-wages.db.test.ts` keeps it equal to
`MINIMUM_WAGES` in `@domain/minimum-wage` (`pnpm test:db`).
`private.minimum_wage_on(on_day)` reads the adult hour of a day.
`public.member_wages` is a person's wage from a day (`effective_from`), 0.01 to
1,000.00, with an optional note; append-only: the wage on a day is the latest
`effective_from` on or before it, then the latest `set_at`
(`private.wage_on`), so a typo is fixed by a new row for the same day and both
stay. Its key to the membership is `restrict`, so a person or business with
wages stays (23503); a trigger refuses every update and delete (42501) but a
purge that names the business and the setter going to null when their account
goes, and nobody but its owner writes or truncates it. The person reads their
own while a member; pay holders and a view as an accountant read the
business's; nobody reads any with the time clock off.
`public.set_hourly_wage(actor, business, person, agorot, from_day, wage_note,
at_time)` (secret key) sets one for a pay holder: never their own (42501), an
owner's only by an owner (42501), never an accountant's (22023), someone who
left allowed, from the first of last month to a year ahead by the business's
day (22023), under the minimum saved all the same; it logs `wage.set` with the
wage before on that day, after, the day, the adult minimum of the day and the
note, and `private.notify_for_payroll` tells the person (`pay.wage_set`, with
`since` and never an amount, one line per person). The purge deletes wages
before the log. `private.seed_demo_pay` ends with `private.seed_demo_wages`,
from a definition's `wages` (`{"manager": 4500, "worker": 3800, "cases":
[{"user_id", "case": "raise", "agorot"} | {"user_id", "case": "none"}]}`): the
role's wage from the first of last month for every active manager and worker,
a raise on the 15th, or none; set by the definition's owner, with no log rows.
`@db/wages` reads wages under the person's session (`getWages`) and sets one
with the secret key (`setHourlyWage`, refusals read by `wageFailureOf` in
`@domain/wages`). Covered by `wages.test.sql`, `demo_reset` and
`rls_enabled`.

Details for payroll (`20261110000600_payroll_details.sql`, payroll P5),
reconciled with the hiring file's design: no ID number, address, bank account
or birth date here (they are the hiring file's, below; since H4 its
`set_payroll_details` takes a birth date while the file holds none or takes no
writes (the module off, a demo keeping its made-up files, real values not
open), under the file's lock, and refuses one once the file holds one and takes
writes: 22023, hint `in_file`). `public.member_payroll_details` (one row per person, the
table's defaults standing for none) holds the payroll system's number
(`^[0-9A-Za-z-]{1,20}$`, one person's in a business), the weekly rest day
(6 Saturday, 5 Friday or 0 Sunday: a day, never a religion), whether the Hours
law applies (`applies`, `trust` for s.30(א)(5), `unsupervised` for
s.30(א)(6)), a minor's 18th birthday (`youth_until`, null for an adult) and
whether a minor is at school (`compulsory_education`, the 20:00 limit).
`public.employment_periods` holds when each person worked here
(`started_on`, `ended_on` null while it goes on, `last_paid_on` once it
ended), never overlapping (`employment_periods_no_overlap`, a gist exclusion
on a closed day range), `source` `joined` for a start copied from the
membership and `set` for one a pay holder entered. Both are records: their
keys to the membership are `restrict`, a trigger refuses every delete (42501)
but a purge that names the business (`private.refuse_payroll_record_delete`),
nobody but the owner writes or truncates them, and they are read like wages
(the person while a member, pay holders and a view as an accountant, with the
time clock on). `private.backfill_employment_periods()` gave every staff
membership without one a `joined` period from the business's day it began,
ended on its last change when inactive; the trigger `memberships_track_employment`
(`private.track_employment`, after insert or update of `active`, `role`) opens
a `joined` period on the business's day a staff membership starts or comes
back, closes the open `joined` one when it stops (inactive, or an accountant
now), goes on with the same one when someone is back the day it closed, and
never moves a holder's `set` period (a membership write never fails over a
period). `public.set_payroll_details(actor, business, person, patch, at_time)`
(secret key) takes only the keys to change (`payroll_number`, `rest_day`,
`hours_law`, `compulsory_education`, `birth_date`; anything else 22023) by the
wage's rules (a pay holder, never their own, an owner's only by an owner, never
an accountant's); a birth date only from an active owner or the accountant
(42501), a real day in the last 100 years, read once and kept only as
`youth_until` (29 February + 18 years is 28 February); a call that changes
nothing writes no log row, and `payroll.details` names the fields that changed
(`youth_until` for a birth date), never a value. `public.set_employment_period(actor,
business, person, from_day, to_day, paid_until, period_id, at_time)` adds a
period or changes one of the person's (P0002 for another's), by the same rules,
an overlap 23P01 ('Periods overlap'), a start in the last 100 years and at
most a year ahead, the end on or after the start, a last payment only once it
ended; the period is `set` from then on, and
`payroll.period` names the fields that changed, whether it was added, and
whether a `joined` one was confirmed, never a day. `public.set_hourly_wage` now
refuses a wage before the first period's start once a holder set it (22023
'Before they started'); a `joined` start limits nothing. Its `wage.set` row
now keeps the minimum of the person's age band on the wage's first day
(`private.minimum_wage_for(business, person, on_day)`: under 16, 16, 17 by
`youth_until`, else the adult hour), so a minor's legal wage isn't logged as
under the minimum. `public.team_youth(business)` gives whoever sees the team
or builds the schedule (`team.view`, `schedule.edit`, and a view as a role
that holds one; since R6) who on the staff is a minor today and until when,
with the time clock on, and nobody else anything. The purge deletes
details and periods before the log. `private.seed_demo_pay` ends with
`private.seed_demo_details`, from a definition's `details` (`{"since": "2026-03-01",
"numbers": 101, "cases": [{"user_id", "case": "youth" | "no_number" |
"rest_friday" | "started"}]}`): payroll numbers in the definition's order for
managers and workers, the reset's open periods from `since`, still `joined`,
and the cases (a minor until the first of the month six months on, no number,
rest on Friday, a start on the 10th of three months ago set by the owner); no
log rows. `@db/payroll-details` reads details and periods under the person's
session and `team_youth`, and writes both with the secret key (refusals read by
`detailsFailureOf` in `@domain/payroll-details`). Covered by
`payroll_details.test.sql`, `demo_reset`, `hours_kept`, `wages`, `lists` and
`rls_enabled`.

The hiring file (`20261126000200_employee_files.sql`, profile H4, #82): what
a business needs of a worker to pay them, in the database with no screen yet
(H5 is the worker's, H6 the owner's and the accountant's). The module
`employee_files` is off in every business, the demos included, and its key
`people.files` (area `employee_files`) is an owner's to give, never switched
per role: owners always hold it, accountants by `private.accountant_perms`
(`{clock.payroll,people.files}`).

- **Tables.** `public.employee_details` (one file per business and person:
  the legal names, birth date, the ID's kind, country, expiry and hint, the
  city, the bank's code, branch, hint and holder kind, the instruction's time
  and wording, `bank_review` (`new`, `warned`, `disputed`), the pension's
  answer and fund, `direct_groups` ("נמסר ישירות לשכר"), `submitted_at` in
  the clear; `id_enc`, `id_name_enc` (another document's name, apart),
  `address_enc`, `email_enc`, `work_language_enc`, `bank_account_enc`,
  `bank_holder_enc` sealed), `public.employee_tax_years` (each year's 101:
  `handed_in`, `accepted`, `returned` with a reason, `change_due` with its
  day, never what changed) and `public.member_emergency_contacts` (sealed
  `{"name","phone"}`, kept apart so managers needn't hold the files). RLS on,
  no policy, and every privilege revoked, `service_role`'s included: nothing
  selects them, every read goes through a logged function. In `private`:
  `person_keys` (each person's data key wrapped, `kek_id`, `shredded_at`
  for H8), `file_acknowledgements`, `step_ups`, `phone_changes`,
  `file_denials`, `file_settings`, `audit_guard_runs`. Keys to the
  membership `restrict`; a trigger refuses deleting a file or a key but in
  the purge (`private.refuse_file_record_delete`).
- **Sealed.** In server code alone (`@db/crypto`): AES-256-GCM, `0x01 ‖ IV
  12 ‖ tag 16 ‖ ciphertext` with the AAD `ca|v1|<table>|<column>|<business>|<user>`;
  one data key per business and person, wrapped with the key
  `EMPLOYEE_DATA_KEKS` names (`id:base64`, the active one
  `EMPLOYEE_DATA_KEK_ACTIVE`; AAD `ca|dek|<business>|<user>`, 61 bytes),
  parsed by `parseEmployeeDataKeys` (`./env`), which throws naming the setting,
  never a value. Without both, every read and write of a file is `keys`
  before the database, and only the status reads. A trigger
  (`private.check_file_sealed`, `check_contact_sealed`) refuses any sealed
  column but `0x01` for someone with a key, or `0x00` (a demo's made-up
  UTF-8) in a demo business (22023 'Not sealed').
- **Writes**, with the secret key for `actor`, each refused with the module
  off (42501 `off`), in a demo that keeps its files (55000 `demo`), and in a
  business that isn't a demo while real values aren't open (55000
  `not_open`): `employee_data_key` (the first key offered is kept and comes
  back), `set_employee_details` (a patch of groups; the person their own, a
  ready holder the names, birth date and identity, 42501 `own` for the rest,
  an owner's only an owner, `owner`; an accountant's 22023 `not_staff`; the
  bank the person's, a new account or the one there withdrawn (`bank: null`),
  after `note_step_up` within 10 minutes, 55000 `step_up`,
  used once, never in the 7 days after a phone change, 55000 `phone_hold`
  with the day it opens as DETAIL; every new account `new`, `warned` when its
  check warned; a name, ID or address that replaces one makes this year's 101
  `change_due` 7 days after `change_on`; the birth date writes
  `member_payroll_details.youth_until`; a constraint's error raised again
  without its DETAIL, which would print the row), `set_emergency_contact`,
  `submit_employee_file`, `note_step_up`, `acknowledge_bank` (a holder,
  never their own, as read: 40001), `dispute_bank_change`, `set_direct_groups`
  and `set_tax_year_status`. The log names groups and reasons, never a value
  or a hint (`employee.details`, `employee.tax_year`, `employee.submit`,
  `employee.bank_ack`, `employee.bank_disputed`, `employee.direct`,
  `member.emergency`).
- **Reads**, under the person's own session, security definer and volatile:
  `employee_file`, `reveal_employee_fields` (`id`, `bank_account`; 30 other
  people an hour for a holder, counted under an advisory lock per holder and
  business, so parallel calls can't pass it), `export_employee_files` (ready
  holders with a live step-up on this sign-in, else `step_up`; an
  unconfirmed account held back; one `employee.export {people, recipient,
  held}` first), `acknowledge_file_duties` (`employee.ack`),
  `employee_file_status` (holders the details, `team.view` a count and the
  101 as in or not: a returned one not in, one due again in; owners left out)
  and `team_emergency_contacts` (`team.view` or `people.files`, never a
  view). Who reads a file (`private.file_reader`): a view session never
  (`viewing`), the person their own in any state (unlogged: a former worker
  reads theirs, revealed numbers included, at `/me/past/<business>`, H5c),
  then an active holder who confirmed the duties and has a live step-up on
  this sign-in (`employee.view` once a day per person; a reveal every call),
  else `not_member`, `not_holder`, `ack` or `step_up` (a ready holder without
  one, whoever the person is, so a lapsed session can't ask who is on the
  staff). A refusal is
  returned, never raised, and logged as `employee.view_denied` (20 a day per
  caller in each business, then one `many` there; none for nobody signed in, the module off, or a
  person who isn't in the business; someone outside is told `not_member`).
- **The holders' gate** (`20261126000500_file_holder_state.sql`, H6a):
  `public.file_holder_state(business)`, under the session and not logged,
  says whether the signed-in person may read the business's files as a
  holder now: null for nobody signed in, `off`, then
  `private.file_holder_gate`'s `viewing`, `not_member`, `not_holder` or
  `ack`, else `ready`. A holder's screen asks it before any file is read
  (`getFileHolderState`), so the duties show without an
  `employee.view_denied` row. Covered by
  `employee_files_holder_state.test.sql`.
- **What a holder writes** (H6b-1): `acknowledgeBank` with the moment the
  screen read, exactly as the database gave it (40001 when it changed
  since); `markDirectGroup` with one part and whether it is marked, which
  `set_direct_groups` (since `20261126000600_file_started_and_changed.sql`)
  adds or takes off reading the stored set under the file's lock, so two
  holders' presses at once each keep the other's, and answers whether the
  file changed (false, writing nothing, when the part already was so). The
  screen offers "ביטול" only for a change. A part the business doesn't ask
  is refused for a mark, never for taking one off.
- **What happened in a file** (`@db/file-history`, H6b-1): the person's
  `employee.*` rows read from `audit_log` under RLS (holders read them,
  a view never does), a number's reveal included and the daily read of the
  file (`fields` exactly `["file"]`) left out, the newest 40 with the
  actors' names in the business. Field names only: the rows never held a
  value.
- **The current period and the last change**
  (`20261126000600_file_started_and_changed.sql`, H6b-2):
  `private.file_answer` gives `started_on`, the current employment period's
  first day (the newest not ended by the business's today, so a fixed-term
  job with its end ahead counts, and `private.pension_due_on` reads the
  same period), for a minor's checklist; `employee_file_status` gives a
  holder `detail.changed_at`, the newer of the file's `updated_at` and
  its 101s' (never a read, never the emergency contact), for the team's
  desktop. The schemas default both to null, so the app reads a database
  before it. Covered by `employee_files_changes.test.sql`.
- **The step-up** (H6a; in the database since
  `20261127000400_file_step_up.sql`). For the screens, a signed cookie
  `ca_file_open` (`@db/file-step-up`: `v1.<business>.<holder>.<ms>.<mac>`, an
  HMAC with a key HKDF derives from `SUPABASE_SECRET_KEY`, as the punch key
  is; `path=/team`, httpOnly, strict, 15 minutes from the last activity),
  read first. For the database, `private.file_step_ups`: one row per holder
  and sign-in (the access token's `session_id`), for one business, written
  only by `open_file_step_up` after a right SMS code for the holder's own
  `auth.users.phone` (`checkCode`), slid by `keep_file_step_up` (a live one
  only; it never opens one) and deleted by `close_file_step_up` at
  "נעילת התיק" and signing out, all three the secret key's.
  `private.file_step_up_live` counts one for 15 minutes after `active_at`
  and not more than a minute ahead, as `FILE_IDLE_MS` and
  `FILE_CLOCK_SKEW_MS` (`tooling/employee-files-guard.test.ts`). A holder's
  read, reveal or export without one is `step_up`, logged. A holder's write
  (`acknowledge_bank`, `set_direct_groups`, the secret key's) goes only once
  the server slid this sign-in's row (`keep_file_step_up` true), never on
  the cookie alone, which a lock or signing out can't take back from a
  copy. Opening is
  refused with the module off, before the duties, for anyone but an active
  holder, without a sign-in (22023) and for 7 days after a phone change
  (55000 `phone_hold`, the day as DETAIL). Covered by
  `employee_files_step_up.test.sql`.
- **A sign-in number** (`20261127000400_file_step_up.sql`): the trigger
  `on_auth_user_phone_change_asked` (BEFORE UPDATE OF `phone`,
  `phone_change` on `auth.users`, `public.refuse_own_phone_change`) refuses
  any change of `phone` and any new `phone_change` (42501) unless the
  transaction names that person in `ca.phone_change`, the team's step in
  `supabase/README.md`. So the auth server's own "change my number", with
  phone confirmations on or off, and the admin API's (the dashboard's edit)
  are refused; a first number comes with the account (an insert), and an
  update that leaves both as they were passes.
- **Real values.** `private.file_settings.real_values` stays false until Orel
  opens it on the production project, after the lawyer:
  `update private.file_settings set real_values = true, changed_at = now();`.
- **The log's guard.** The nightly job `audit-guard` (02:41 UTC, off locally)
  writes `private.audit_guard_runs`: `private.audit_guard_problems()` names a
  missing or disabled `audit_log_kept`, `audit_log_unchanged` or file "kept"
  trigger, an update, delete or truncate on the log for `service_role`,
  `authenticated` or `anon`, and RLS off or any privilege on the file tables
  and the keys. `public.audit_guard_status()` (secret key; `@db/audit-guard`)
  gives the newest run, for H6c's console card.
- **Locks.** `private.file_lock` (an advisory lock per business and person)
  first, then `employee_details`, `member_payroll_details`,
  `employee_tax_years`, `private.person_keys`, by every writer of a file and
  by payroll's birth date.
- **The demo.** `private.seed_demo_files`, last in the reset, gives every
  active manager and worker of a definition with `"files"` a file of made-up
  `0x00` values (IDs from the test range, emails at `demo.conceptapp.invalid`,
  Hapoalim accounts that check valid), with its cases (`no_file`, `no_bank`,
  `bank_new`, `bank_warned`, `passport`, `direct_pension`,
  `form101_missing`, `form101_returned`, `form101_change_due`, `emergency`),
  no log row and no key. The purge deletes the file's rows before the log.
- **Server.** `@db/employee-files` parses every reply with
  `@domain/employee-file`'s schemas, opens the sealed values, and seals what a
  write sends (a sealed group typed again as stored is left out of the
  person's own write); refusals read by `fileFailureOf`, and in the week
  after a phone change a bank write's says the day it opens again
  (`opensOn`, from the refusal's DETAIL, a date only: H5a's bank step says
  it). `checkBankChange` tries a bank write before its SMS goes, dated past
  any code's ten minutes (`at_time`), so it always stops at the code and
  keeps nothing; dated that far on, it would miss a week after a phone
  change that ends in between, so that week is read on its own, now
  (`public.bank_change_hold(business, person)`,
  `20261126000300_bank_change_hold.sql`, the secret key's: when it ends and
  its day, or null; `phoneChangeHold`, which a holder's file code asks too,
  before any SMS goes or a code is spent), and holds with the day and the
  moment it opens (`opensAt`). The step-up code goes to
  `auth.users.phone` (read with the secret key), never `profiles.phone`,
  which a phone change doesn't reach yet. Covered by
  `employee_files.test.sql`, `employee_files_writes.test.sql`,
  `employee_files_demo.test.sql`, `employee-files.db.test.ts` (the real
  sealing against the database), `payroll_access`, `roles_catalogue`,
  `rls_enabled` and `roles_manage`.
- **What each business asks** (`20261126000400_employee_files_settings.sql`,
  H5b). The module's eleven settings are an owner's and the team's alone:
  `public.set_module_settings`' `employee_files` branch refuses anyone else
  (42501), any key outside the manifest's, and each value the manifest
  wouldn't output (22023: `private.file_setting_line`,
  `private.file_setting_link`, the phone as E.164, the deductions file).
  `private.employee_files_settings` defaults as the manifest does, and
  `private.file_groups` reads `askAddress` and `askBank` through
  `private.file_asks` (a stored value that isn't a boolean is the default),
  so what a file counts missing follows them everywhere. Covered by
  `employee_files_settings.test.sql` and
  `modules/employee_files/settings.db.test.ts`, which holds the database to
  the manifest. `getBusinessModulesForTeam` is also read right after a
  join, for where the person lands.

The pay rules (`20261110000700_pay_rules.sql`, payroll P6). No new table: the
hours engine is pure code (`@domain/payroll`), and its rules are time clock
settings. `public.set_module_settings` (sealed's, replaced) keeps the punch
code for an owner or the team, adds the pay rules (`workWeek`, `shortDay`,
`restStart`, `restStartTime`, `workersSeeEstimate`: 42501 'Only an owner or the
team changes the pay rules') and the pay estimate for the team alone
(`payEstimate`: 42501 'Only the team switches the pay estimate'), and checks
each for its type (22023 'Not a pay rule setting': a week of `unset`, `five` or
`six`, a short day 0 to 4, a start at `candleLighting` or `fixed`, a time as
`HH:MM`, yes or no for the two switches). `private.seed_demo_pay` (P5's) first
lays a definition's `settings` (`{"time_clock": {"payEstimate": true}}`, by
module key, a key that is no module skipped) over what the template gave, so
both demo businesses show the estimate and a real one starts without it; the
hosted definitions are patched by id and their settings set at once, with no
reset. The pay screens read the engine's month with `currentPayrollMonth` and
`currentOwnPay` (app code), through the reads above, and drop every amount
while `payEstimate` is off. Covered by `pay_rules.test.sql`. `getTimeEntries`
reads page by page (`allPages` in `pages.ts`, ordered by `clock_in` then
`id`): PostgREST returns at most `max_rows` (1000, here and on hosted
Supabase) without an error, and payroll reads a whole business's entries over
four months.

The file for payroll (`20261110000800_payroll_export.sql`, payroll P8). No
table: the app builds the month's XLSX from the reads above and keeps it
nowhere. `public.note_payroll_export(business, pay_month, person_count,
shift_count, engine_version)` (the person's own session, `authenticated` only)
logs each file as `payroll.export` before it goes out: `{month, format:
"xlsx", people, shifts, ids: false, engine}`, every file its own row. Only a
`clock.payroll` holder or the team viewing as an accountant, with the time
clock on, takes one (42501 otherwise); no month, a count under zero or none,
or no engine version is 22023. A pay row, so only pay holders read it, and the
activity log shows it. `@db/payroll` calls it (`notePayrollExport`, which
throws when the row isn't written, so no file goes out without it) and reads
when a month's newest file went out (`getLastPayrollExport`), for the screen's
"changed since the last file". Covered by `payroll_export.test.sql`.

One login in several businesses (`20261110000900_several_businesses.sql`,
payroll P3b; Orel, 8 November 2026). `public.memberships_one_staff_idx`, a
unique index on `user_id` where `active and role <> 'accountant'`: one active
place on a staff per login, any number as an accountant, so also one business
per owner (branches wait). The migration first counts the logins that would
break it and stops with how many, deactivating nobody. `claim_invite` refuses
a staff invite to someone on another business's staff in words (23505,
"Already in another business's team"), before anything is written, and turns
a race the index catches into the same; `@db/invites` reads it as `elsewhere`,
and `activeElsewhere(phone, business, role)` says it before a link goes out
(false for an accountant's invite, and when every other place is an
accountant's). `admin_invite`, `team_invite` and `create_business` write
invites only, so the index never meets them. The console asks before its
two: `activeElsewhere` on the business page, and `onAnotherStaff(entries)`
(the staff list's numbers in a staff role already on a staff, in one read)
in the new-business wizard, which sends the list back with them named before
anything is written. The Team screen doesn't ask (#80): an owner or manager
gets the same link for any number and never learns where else it works;
/join tells the person themselves. It asks `invitesOpen(business)` instead
(`public.closed_to_invites`, `20261110001200_invites_open.sql`; true before
the migration reaches a project), and offers no invite in a demo business
closed to them. The phone:
`private.push_business_ok(person, business)` (active member, not a demo,
notifications on) decides `push_plan` and what `claim_due_pushes` still
sends; `private.push_business(person)` is now the first such business they
joined (whether a device can be saved, `push_allowed`, and where a test line
goes otherwise); `note_push_fetch` answers one row per such business, the
same `since` on each; `send_test_push(actor, at_time, business)` writes the
test line in `business` when it reaches the phone (dropped and made again for
the new argument). Which business the app opens is not the database's: the
`ca_business` cookie, checked by `@db/session` against the person's active
memberships on every request; someone in several businesses has their unread
lines read and counted in each one on its own, so one business's lines never
crowd out another's count. The demo's Galit is the accountant of both demo
businesses, by their definitions, so each reset keeps her. Covered by
`several_businesses.test.sql`, with `push.test.sql`, `availability.test.sql`
and `hours_kept.test.sql` moved to one staff place per login.

Closing a month (`20261110001000_payroll_months.sql`, payroll P9).
`public.payroll_months` (`business_id`, `month` its first day, `closed_by`,
`closed_at`, `reopened_by`, `reopened_at`, `reopen_reason`, `snapshot`,
`engine_version`; primary key on the business and month): read by pay holders
and a view as an accountant, written only by the two functions below, kept
like the other payroll records (`private.refuse_payroll_record_delete`), and
purged by the demo reset (`private.purge_business_records` now deletes the
months before the log). `snapshot` is what the hours engine gave when the
month closed, without amounts, with the pay rules, the business's place (its
Shabbat city and time zone) and each person's details, periods and wages it
was worked out by (`closedSnapshot`, `readSnapshot` and `closedReads` in
`@domain/payroll-diff`). `public.close_payroll_month(actor, business,
for_month, closed_snapshot, with_engine, at_time)` and
`public.reopen_payroll_month(actor, business, for_month, why, at_time)`, with
the secret key for `actor`: an active owner or accountant only
(`private.closes_payroll`; 42501 for a manager or another pay holder), a month
that has ended by the business's clock (22023), not closed already (23505; a
reopened month closes again, its reopening cleared), and a reason to reopen
(22023 without; P0002 for a month that isn't closed); each logs
`payroll.close` `{month, engine}` or `payroll.reopen` `{month, reason}`.
`private.month_closed(business, on_day)` is what the rest asks:
`set_hourly_wage` refuses a wage from a day of a closed month (55000, "The
month is closed"); `add_time_entry` and `correct_time_entry` still take a
shift of one (hours are facts) and their log rows gain `closed_month`
(`YYYY-MM`: the new day's month when it is closed, else the old day's), and
`closed_from_month` too (the old day's) for a shift moved from one closed
month into another. `private.notify_for_payroll` then tells each such month's
closer and the accountants (`pay.after_close`, one line per month, dedupe
`pay.after_close:<month>`), and `payroll.close` settles the month's reminder;
its trigger takes `payroll.close` and only the clock rows that carry
`closed_month` or `closed_from_month`. `private.payroll_tick(at_time)`, the daily job `payroll` at
06:00 UTC (off in `seed.sql`, as the notifications' jobs are): on a business's
2nd, for one with the time clock on, not a demo, and last month holding hours
and not closed, its pay holders get `pay.month_due` with how many shifts wait
and are open (dedupe `payroll.month:<month>`, never told twice). `@db/payroll-months`
reads a month (`getPayrollMonthRecord`) and the closed ones (`getClosedMonths`)
under the person's session, and closes and reopens (`closePayrollMonth`,
`reopenPayrollMonth`, refusals by `closeFailureOf` in `@domain/payroll-close`).
Covered by `payroll_months.test.sql`, with `rls_enabled.test.sql`.

Cancelled shifts (`20261117000200_cancelled_shifts.sql`, the clock plan's PR1).
A wrong shift is marked cancelled, never deleted: `time_entries` keeps
`cancelled_at`, `cancelled_by` (`on delete set null`, its time kept, as
`confirmed_by`), `cancel_reason` (1 to 200 characters, trimmed, set with
`cancelled_at` and only with it), `cancelled_open` and `restored_at`, and its
breaks stay. A cancelled shift always has an end (a check), so every reader of
`clock_out is null` (the punches, the breaks, the team's guards, the
reminders) is right as it was. `time_entries_no_overlap`, the same name, holds
for live shifts only (`where cancelled_at is null`): the right shift goes over
a cancelled one. `public.cancel_time_entry(actor, entry, note, at_time)` and
`public.restore_time_entry(actor, entry, at_time)`, with the secret key for
`actor`: someone who edits the clock (`private.can_edit_clock`, 42501
"Managers and owners only"), never their own shift unless they are an owner
(42501 "Only an owner cancels or changes your own hours", which reads as
`ownHours`), P0002 for an unknown entry. A cancel needs a reason (22023 "A
cancel needs its reason") and a shift not cancelled already (55000 "The shift
is cancelled"); one still open is ended by it, at `at_time` or a day after it
began, whichever is first (`out_proof` 'manager', `cancelled_open`), under
`ca.correcting`, so a break it ends or cuts writes `clock.break_fit` as a
correction's does. A shift still open with a break starting, or ending, at
or after that end (a break after its first day) is refused (55000 "The shift
has breaks after its first day", hint `breaks_after_day`): its end is
corrected first, so a cancel never cuts or loses a break it can't give back.
It logs `clock.cancel` `{entry, person, clock_in,
clock_out (null when open), ended_at (when open), note}`. A restore takes a
cancelled shift (55000 "The shift is not cancelled" otherwise) and no reason,
opens again one the cancel ended, with the break it ended (the only one ending
at the cancel's end), only for someone on the staff now (55000 "The person
is no longer on the staff", hint `not_on_staff`: whoever left is never at
work), sets `restored_at`, and is refused by the constraint
(23P01) over a live shift of the same person, an open one included; it logs
`clock.restore` `{entry, person, clock_in, clock_out, reopened}`. Both add
`closed_month` when the shift's day by the business's clock is in a closed
month, and then tell its closer and the accountants (`pay.after_close`,
`private.notify_for_payroll` and its trigger). `correct_time_entry`,
`confirm_time_entry` and `undo_clock_out` refuse a cancelled shift (55000 "The
shift is cancelled"). A cancel settles the shift's `clock.confirm` for
everyone (`private.notify_for`) and its `clock.open` and `clock.overdue`
(`private.resolve_reminders_for`); a restore goes through `notify_for`'s rule
again, so a confirmation still waiting comes back, unread, to all but whoever
brought it back, while a reminder stays settled. `private.payroll_tick` counts
live shifts only. The server role still holds its table privileges on the
hours (`time_breaks.test.sql` writes a break directly as it). The person's
page on the team's hours calls the two (below). Covered by
`cancelled_shifts.test.sql`, with `time_clock.test.sql`, `hours_kept.test.sql`
and `demo_reset.test.sql`.

Break edits (`20261117000300_break_edits.sql`, the clock plan's PR2). A
shift's breaks are fixed one at a time, and a break is marked removed, never
deleted: `time_breaks` keeps `removed_at` and `removed_by` (`on delete set
null`, its time kept, as `confirmed_by`), and a removed break has always ended
(a check), so whatever looks for an open break (`start_break`, `end_break`, a
clock-out's fit) never meets one. `time_breaks_no_overlap`, the same name and
still deferrable, holds for live breaks only (`where removed_at is null`): the
right break goes over a removed one. `public.add_time_break(actor, entry,
new_start, new_end, note, at_time)`, which returns the new break's id,
`public.change_time_break(actor, time_break, new_start, new_end, note,
at_time)` and `public.remove_time_break(actor, time_break, note, at_time)`,
with the secret key for `actor`, take the access of a cancel (42501 "Managers
and owners only"; 42501 "Only an owner cancels or changes your own hours";
P0002 "Unknown entry" or "Unknown break"), never a cancelled shift (55000 "The
shift is cancelled") and always a reason (22023 "A break edit needs its
reason"). `private.check_break_fits` asks for both times (22023 "A break needs
its start and end"), the end after the start ("A break must end after it
starts"), nothing in the future ("A break cannot be in the future") and a
break inside its shift, up to now while it is open ("A break must be inside
its shift", hint `break_outside`); a live break over another is the
constraint's (23P01). A break still running is neither changed nor removed
(55000 "The break has not ended", hint `break_open`), nor is a removed one
(55000 "The break is removed"). A new break is paid or not by the setting now,
as `start_break`'s; a changed one keeps its `unpaid`.
`public.restore_time_break(actor, time_break, at_time)` takes a removal back,
with no reason: a removed break (55000 "The break is not removed" otherwise),
by whoever removed it, within ten minutes (55000 "Too late to bring it back",
hint `too_late`), as it was, and only while it still fits its shift (22023)
beside the live breaks (23P01). Each locks the shift, then the break, and
stamps the shift's `edited_by`, `edited_at` and `note` (a restore,
`edited_at` only), so it reads as corrected and `undo_clock_out` refuses it.
Each logs `clock.break_edit` `{entry, person, clock_in, break, change (add,
change, remove or restore), from, to (each {start, end} or null), unpaid,
note (but a restore's)}`, with `closed_month` only for an unpaid break of a
closed month, which then tells its closer and the accountants
(`pay.after_close`, `private.notify_for_payroll` and its trigger). A removed
break keeps its times: `private.fit_breaks_to_entry` moves, cuts and deletes
live breaks only, `undo_clock_out` and `restore_time_entry` open live ones
again only, and `cancel_time_entry`'s `breaks_after_day` asks about live ones
only. The person's page on the team's hours calls the four (below). Covered by
`break_edits.test.sql`, with `time_breaks.test.sql`, `hours_kept.test.sql` and
`demo_reset.test.sql`.

The reads of both (`time-clock.ts`, the clock plan's PR3). RLS reads cancelled
shifts and removed breaks as any others, so the readers leave them out:
`getTimeEntries` and `getEntriesToConfirm` return live shifts only
(`cancelled_at is null`), and every entry read (`entryOf`) leaves its removed
breaks out (`removed_at`), so every sum, the hours engine, pay, holiday pay,
the file for payroll, Today and who is at work or overdue count neither,
`PAYROLL_ENGINE_VERSION` unchanged. Each entry carries `restoredAt`, which a
file made before sees as a change (`changedSinceExport`). The few screens
that show a cancelled shift read it apart: `getCancelledEntries(business,
from, to, userId?)`, the shifts starting in [from, to), oldest first, as
`@domain/time-clock`'s `CancelledEntry` (the entry as it was, with
`cancelledAt`, `cancelledBy`, `reason` and `wasOpen`, from `cancelled_open`),
for the person's page on the team's hours and their own history
(`monthRecords` lists them among the live ones, counting for nothing), the
person's pay page (listed under the days), whether the month changed since its
file, and the reasons beside a closed month's differences in the next file.
`getCorrections` stays on `clock.correct` rows: a cancel or a break edit moves
no times of the shift. Covered by `time-clock.test.ts`.

The writes of a cancel (`time-clock.ts`, the clock plan's PR4), with the secret
key, for the person's page on the team's hours: `cancelTimeEntry(actor, entry,
note)` and `restoreTimeEntry(actor, entry)`. Their refusals read through
`@domain/time-clock`'s `clockFailureOf`, which now takes the error's hint too:
`cancelled` and `notCancelled` (55000 "The shift is cancelled" / "is not
cancelled"), `breaksAfterDay` and `notOnStaff` (55000, by their hints),
`ownHours` (42501 "Only an owner cancels or changes your own hours"),
`reasonNeeded` (22023), `times` for a live shift over the hours of one brought
back (23P01) and `noAccess` (42501 "Managers and owners only", P0002). The
clock screen's `punchFailureOf` reads `cancelled` (taking back a clock-out of
a shift cancelled meanwhile) as `notIn`, as it read before, and the others as
`failed`. Covered by `@domain/time-clock`'s tests and `e2e/clock-team.spec.ts`.

The writes of a break edit (`time-clock.ts`, the clock plan's PR5), with the
secret key, for the same page: `addTimeBreak(actor, entry, {start, end,
note})`, which returns the new break's id, `changeTimeBreak(actor, break,
{start, end, note})`, `removeTimeBreak(actor, break, note)` and
`restoreTimeBreak(actor, break)`, the times as instants. `getTimeEntry(business,
entry)` reads one shift with its live breaks under the person's session
(RLS, cancelled or not; null when they may read none), for
`@domain/time-clock`'s `parseBreakTimes` to read the typed HH:MM against:
the start the first moment at or after the clock-in with that time, the end
the first after the start, so a break past midnight takes no date. The
refusals read through `clockFailureOf`: `breakOutside` (22023, hint
`break_outside`), `breakTimes` (`check_break_fits`'s other 22023s),
`breakOverlap` (23P01 on `time_breaks_no_overlap`; another 23P01 stays
`times`), `breakOpen` (55000, hint `break_open`), `tooLate` (55000, hint
`too_late`), `breakGone` (55000 "The break is removed", or P0002 "Unknown
break": cut away by a correction), `notRemoved` (55000 "The break is not
removed", which the page counts as brought back), and, as a cancel's,
`cancelled`, `ownHours`, `reasonNeeded` and `noAccess`. The clock screen's
`punchFailureOf` reads the six new kinds as `failed`: a punch never meets
them. Covered by `@domain/time-clock`'s tests, `time-clock.test.ts` and
`e2e/clock-team.spec.ts`.

### Sample availability in the hosted demo

Filling the schedule from availability, part 6
(`20261128000100_demo_sample_availability.sql`; Orel's yes of 25 November 2026
to the plan's question 3). A demo definition may name `sampleAvailability`:
`[{user_id, ranges: [{weekday, start, end}]}]`, weekday 0 = Sunday, an end at
or before the start on the next day. Only `supabase/hosted-demo.sql`'s
restaurant does (its manager and two workers, on each day they can work the
hours the form suggests from the restaurant's shifts); `supabase/seed.sql`
names none, so the local browser tests send their own.
`public.renew_demo_availability()`, service_role only, for each demo business
whose definition has the key, with scheduling on: next week by its settings
and clock (`private.availability_rules`, `private.week_start_after`), unless
that week is published (checked under the week's `for share` lock). For each
named person active on its staff as a manager or a worker (never an owner,
an accountant or someone who left) who sent nothing for that week, it opens
the week (`public.open_schedule_week`, due by `private.availability_due_at`)
and sends their ranges through `public.submit_availability` with no note, so
that function's rules hold (a sample it refuses fails the whole call, as it
would refuse a worker's). Every named person's answer is claimed first, in
one statement (`on conflict do nothing`), and only the rows it claimed are
sent, so an answer someone sent, an empty one too, or sends at the same
moment, is never replaced. For a business closed on Shabbat
(`private.closes_on_shabbat`) `private.demo_sample_ranges` cuts each range as
the form's suggestion is cut: Friday ending by candle lighting, Saturday
starting from havdalah (`private.shabbat_span`); a range left with nothing,
or on a Friday or Saturday past the Shabbat table's last week, is left out,
and a person with nothing left gets no answer. Returns how many answers it
wrote, 0 when called again. No row of the log, no notification and no push:
the answer's one trigger (`availability_submissions_resolve`) only settles
reminders, which demo businesses never get. Locks: the business (`for key
share`, a demo reset first), then the week, then every answer in that one
statement, and only once it is done the week's reminders lock
(`private.lock_availability_week`, the advisory lock that trigger holds to
the end of the transaction), so it never holds that lock while it waits on
an answer the form is sending, whose trigger may be waiting for it.
`reset_demo_business` is unchanged: a reset takes the week, and the next entry
or Today writes the sample again. The wrapper, `renewDemoAvailability()` in
`@db/demo`, answers 0 before the migration reaches the project
(`isMissingFunction`), and is called by the door's `enterAs` after sign-in
and by Today's `renewDemoWeek` (`app/(app)/demo.ts`) in either demo business,
for whoever stayed signed in past the week's turn, each behind
`demoDoorOpen()` and in its own try/catch (`tooling/demo-door.test.ts`).
Covered by `demo_availability.test.sql`, `demo.test.ts`,
`demo-availability.db.test.ts` (beside an answer the form sends at the same
moment, each in a session of its own), `tooling/demo-availability.test.ts`
(the hosted sample against the restaurant's shifts and the fill) and
`tooling/running-week-edge.test.ts` (its lock on the week, and its answers
claimed in one statement).

### Days away

Vacation, sick leave, reserve duty and another absence (known issue 19,
`20261127000700_absences.sql`). `public.absences` holds whole days, `from_day`
to `to_day` included, at most 366 days a record, one kind (`vacation`,
`sick`, `reserve`, `other`) and a note of 1 to 200 characters, trimmed, or
none. Two live records of one person never share a day
(`absences_no_overlap`, 23P01); a removed one (`removed_at`, `removed_by`)
stays and makes way. Read as hours are ("people read their own absences, the
clock's editors and pay holders all": the person while a member,
`businesses_holding('clock.edit')`, `clock.payroll` and a view as an
accountant), with the time clock on. Kept as hours are: `restrict` keys to
the membership, and `absences_kept` refuses a delete
(`private.refuse_absence_delete`) but the demo reset's purge, which takes
them after the hours and before the memberships.

The writes, with the secret key, for `actor`: `public.record_absence(actor,
business, person, absence_kind, first_day, last_day, absence_note,
at_time)`, which returns the id, `change_absence(actor, absence, …)`,
`remove_absence(actor, absence, at_time)` and `restore_absence(actor, absence,
at_time)`. Each asks `private.can_edit_clock` first (42501 "Managers and
owners only", the same words for an unknown record), then the time clock on
(42501), never one's own but an owner's (42501, hint `own`), the person on
the staff now (55000, hint `not_on_staff`; a removal doesn't ask), the values
(`private.absence_note_of`, 22023 with a hint: `kind`, `dates`, `order`,
`too_long`, `too_far` from a year back to a year ahead of the business's day,
`note`), and no month closed for payroll (`private.absence_closed_month`,
55000, hint `month_closed`, the month in the detail) among the days whose
state changes: all of a new or removed one's, and all of a change's when its
kind changes, else only the days it adds or drops, none for a note alone (a
run that began in a closed month still ends sooner). A change or removal of
a removed one is `removed`; bringing back one that isn't is `not_removed`,
and only whoever removed it, within ten minutes, brings it back (`too_late`);
it stamps `changed_at`. A change with nothing different writes nothing. The
log: `clock.absence_add` `{absence, person, kind, from, to, noted}`,
`clock.absence_change` `{absence, person, from, to, note_changed}`,
`clock.absence_remove` and `clock.absence_restore` `{absence, person, kind,
from, to}`, never the note; no trigger on the log takes them. Locks, after
the access checks: the business (`for key share`, which waits on any `for
update` of it: the demo reset's, `set_business_details`, `apply_template`,
none of which locks a membership first), the person's membership (`for
share`), then the record, so a write and a reset never wait on each other.
A business a reset replaced while a write waited is refused before the new
one's membership is locked: a new record as an unknown business (P0002,
`failed`, so the phone sends again), a change, removal or return as an
unknown record (42501), the reset having taken it.

`public.team_away(business, first_day, last_day)` answers whoever builds the
schedule or edits the clock (`businesses_holding`, members and views alike)
with who on the staff is away and when, over at most 62 days, never the kind
or the note. The wrappers (`absences.ts`): `getAbsences(business, from, to,
{ userId? })`, the live ones, under the session, paged, and `getTeamAway`,
paged, each answering none before the migration (`isMissingTable`,
`isMissingFunction`); `getAbsenceWrites(business, since)`, the log's
`clock.absence_*` rows after an instant, oldest first, paged, each record
before and after (`absenceWriteOf`; a row it can't read left out), for
whether a month's days away changed since its file (`absencesChangedSince`,
over the month's whole weeks, which the hours engine reads: a record moved
out of the month counts, a day away in its first or last week outside it
too, a note alone doesn't);
`recordAbsence`, `changeAbsence`, `removeAbsence` and
`restoreAbsence` with the secret key, their refusals read by
`@domain/absences`'s `absenceFailureOf` (a closed month with its month).
Covered by `absences.test.sql`, `rls_enabled.test.sql`,
`demo_reset.test.sql`, `absences.test.ts` and `e2e/absences.spec.ts`.

Clock stations from a signed-in tablet (`clock-stations.ts`, #78 phase 5;
Orel's lock of 17 November 2026), on the functions of
`20261108000200_qr_clock.sql` with no migration. `lockStation(actor, business,
name)` makes a device the business's station: a 32-byte secret
(`newStationToken`, base64url) whose SHA-256 is the station's `token_hash`
(`hashStationToken`), paired with `start_station_pairing` and approved at once
with `approve_station_pairing` (the pairing's QR and digits are never shown:
the digits' hash is of bytes nobody keeps); it returns the secret for the
device's cookie (`ca_station`, `@domain/clock-station`). The table of devices
pairing is shared by every business and refuses everyone at a thousand rows,
and a pairing the database refuses to approve stays in it for its five
minutes with nothing to delete it. So ten running (counted with the secret
key) refuse a lock before it pairs, the caller checks the rest of what the
database would refuse, and a lock pairs only on one of its business's own
three hashes (`lockPairingHash`, an HMAC with the server's key, the next on
23505): however often it is repeated, a business leaves at most three rows
there. `stationByToken(token)`
reads the station by its secret (`station_by_token`, stopped or not, or null),
`issueStationCode(token, business)` a fresh code for it (`issue_station_code`,
the digits hashed with the station's business as a worker's typed digits are,
one retry on 23505, stamped with the database's now() as a manager's code),
and `setStationStopped(actor, station, stopped)` stops one or takes a stop back
within two minutes (`set_clock_station_stopped`). All four with the secret key.
`getRunningStations(business)` lists the running ones under the person's session
(RLS: whoever edits the clock, with the clock on), never their secrets. The
refusals read through `@domain/clock-station`: `lockFailureOf`
(`tooManyStations` for 54000 "At most ten stations", ten of every kind
together since P8a, `managerOnly` and `noAccess` for 42501, `off` for its
hint, `name` for 22023, `department` for hint 'route'), `stationCodeFailureOf` (`notStation`,
`stopped`, `clockOff`, `managerOnly`, all 42501 by their words) and
`stationStopFailureOf` (`gone` P0002, `tooLate` 55000, `noAccess` 42501).
`hasSessionCookie()` (`supabase/server.ts`) says whether the browser holds any
piece of a session cookie (`sessionCookieName`, `isSessionCookie` in
`supabase/cookies.ts`), valid or not: a station never shows codes beside one.
The activity log reads the names of the stations a stop or a restart names
(`lookups.stations`, under RLS: anyone else reads the line without the name).
Covered by `@domain/clock-station`'s, `clock-stations.test.ts`'s and
`supabase/cookies`'s tests and `e2e/clock-station.spec.ts`.

Chat (`20261111000100_chat_module.sql`, `20261111000200_chat.sql`, chat C1), in
the database first, with the module off everywhere until C2 (below). `public.chat_conversations`
holds a business's chats: its team's group (made with the business, by the
trigger `businesses_open_team_chat`), a group for each department (made with it,
`closed_at` while it is removed and cleared when it comes back) and a private chat
per pair on the staff (`person_a < person_b`, made by the first message). Who is in
one is derived, never synced (`private.chat_reads_from`, above, and
`private.chat_members` for who a message tells): owners and managers hold
`chat.moderate` and `chat.announce` by default (`public.permission_keys`, with
`chat.send_documents` for C6; since the roles plan's R8 switched per role,
the two under moderating, above), so they are in every department's group and read
all of it; someone new reads a group from when they joined it, and a pinned
announcement whenever; someone who comes back reads it from their return, since
`public.memberships.staff_since` (its `created_at` at first, set again by the
trigger `memberships_staff_since` whenever the row comes back onto the staff:
active again, or from an accountant to a staff role; a change of permissions
or between staff roles keeps it); an accountant is in no chat (`chat_reads` and
`chat_acks` refuse them, `private.refuse_non_staff`). `public.chat_messages`
keeps every message (Orel), its text 1 to 2000 characters, an announcement
`pinned`; a removed
one keeps its row with its text, file and pin moved to `private.chat_removed`,
which nobody reads, for an undo of 10 minutes. `public.chat_reads` (how far each
person read each chat, and `muted`) and `public.chat_acks` ("קראתי") are read by
their own person only. A private chat has no branch for owners, managers, the
ConceptApp team or a view session in any policy or function: a view session reads
no chat at all, and the server role has no privilege on these tables, so no
console page or script with the secret key reads them; only the functions do. The
screens read with the person's own session `public.chat_inbox(business)` (each
chat with its last message's first 120 characters, what waits unread, muted,
closed, pinned announcements waiting; each chat's gate asked once, and never for
other people's private chats), `public.chat_page(business, conversation,
before_at, before_id, after_at, after_id, page_limit)` (a page of a chat, newest
first, at most 50: the gate asked once, and it and the cursor bound the index
scan, so a page stops at the reader's start instead of walking the older
history; pinned announcements from before it are read under the policy),
`public.chat_version(business)` (an opaque "anything new?" for the sync),
`public.chat_seen(conversation)` (how far the
other person of a private chat read it, for its two people) and
`public.announcement_readers(message)` (who of the group confirmed, for its author
and the moderators). The server, with the secret key for `actor`:
`public.send_chat_message(actor, business, draft, words, conversation, to_person,
announce, at_time)` (a conversation they read or someone else on the staff, a
draft id the browser made so a retry sends nothing twice, announcements for
`chat.announce` holders in groups; 42501 off the staff, P0002 for a chat they
don't read, 55000 for chat off, a closed group or a private chat whose other
person left, 22023 for no text or more than 2000 characters, 54000 for a 31st in
a minute or a demo business's 101st visitors' message in an hour; every rule
checked before the row is written, so a refused message never reaches the
Postgres log), `read_chat(actor, conversation, up_to, at_time)`,
`mute_chat(actor, conversation, mute)`, `remove_chat_message` (one's own
anywhere, a moderator's in a group), `restore_chat_message` (the remover, within
10 minutes), `confirm_announcement` and `pin_announcement` (55000 for pinning
in a closed group; unpinning, removing and the undo still work there). Only a
moderator's removal of someone else's message, and its undo, write the log (`chat.remove`,
`chat.restore`, ids only): sending, opening a private chat, reading and muting
write nothing, and `private.is_private_action` keeps every `chat.*` and
`document.*` row from a view session ("a view reads the log as its role would",
altered). A message tells its chat's members through `private.notify_chat`, one
line per person per conversation (`chat.direct`, `chat.group`, params
`{conversation, from, count}` and never text), its push 15 seconds late, waiting
a minute (private) or 10 (group) after one unread, none from a muted chat; an
announcement is its own line (`chat.announcement`) through `private.notify`,
settled by its reader's "קראתי" (`private.settle_own_line`) and for everyone by
removing or unpinning it. The job `chat` (`private.chat_tick`, every 10 minutes,
pure SQL, off in `seed.sql`) runs `private.clean_chat`: removed texts past their
undo, and a demo business's visitors' messages after an hour. The demo reset ends
with `private.seed_demo_chat` (C2 fills it, below); chats go with the business by
cascade. Orel's defaults of the plan's §17 are one function each
(`private.chat_history_from_joining`, `private.chat_read_marks`,
`private.chat_demo_keeps`, `private.chat_demo_per_hour`; `CHAT_RULES` in
`@domain/chat`, kept equal by `modules/chat/settings.db.test.ts`, which also
keeps `private.chat_settings` equal to the manifest's defaults). `@db/chat` reads
and calls them (`chat.test.sql`, `chat_notifications.test.sql`, with
`isolation`, `demo_reset` and `rls_enabled`).

Chat on (`20261111000300_chat_on.sql`, chat C2): every template switches chat on, a
version up each (the fourth module tab, so the bar is full), and every business has it
on where its tab fits, which is all of them. `public.chat_notices` keeps when each
person first read chat's notice, who sees what, per business (own rows only, under
RLS; written once by `public.see_chat_notice(actor, business)`, the server's, for
someone on the staff with chat on: 42501 otherwise, 55000 with chat off; no log row).
`private.seed_demo_chat`, which the reset ends with, writes the demo's conversations
through the chat functions, all `seeded` and at times relative to now: the owner's
thanks and the manager's two morning messages (read by the first two workers) in the
team's group (the second an announcement from C3, below), the
first worker's message and the
manager's answer in that worker's first department, and the manager's private chat with
that worker (the question read, the answer not yet). It picks people by role in the
order the definition names them, in both definitions alike
(`tooling/demo-chat.test.ts`), and moves the demo people's `staff_since` and
`added_at` a month back, so they read that history. `@db/chat` adds `getChatDirectory`
(names, photos and departments the screens title chats with, nothing of any chat),
`getChatList` (the inbox, titled), `getConversation` (now with its title, whether one
may write in it and the names its messages show), `getConversationStamp` (its kind and, from
C3, its `changed_at`) and `getChatAuthors` (for `/chat-sync`), `getMessages`'s `since` (the sync's second look, a moment before its cursor, for a
message stamped earlier but written later), `withOwnDrafts` (the draft each of the reader's own
messages was sent with, read under their session: how the screen knows its own message on its
way), `chatNoticeSeen` and `seeChatNotice`; `getOwnPlace` in `@db/session`
reads who is signed in and their business in one round, for the sync. Covered by
`chat_on.test.sql`, with `isolation`, `demo_reset`, `templates`, `create_business` and
`rls_enabled`.

Chat's announcements on screen (`20261111000400_chat_announce.sql`, chat C3), which
replaces only `private.seed_demo_chat`: the manager's 08:10 line in the team's group is
an announcement now, pinned, and the first two workers confirm it as they read it
(`public.confirm_announcement`), so their own lines about it are settled and the
owner's and any other worker's wait. Every other part is C1's: `@db/chat` adds
`getOwnConfirmations` (which announcements the reader confirmed, their own rows under
RLS), `getPinnedState` (a conversation's pinned announcements as the reader sees them,
with whether they confirmed each and, for its author and management only, how many of
the group did, from `public.announcement_readers`, which is asked only for those),
`getMarkedMessages` (C4's name; C3's `getRemovedMessages`) and `getMessagesById` (what
`/chat-sync` reads again of what a screen holds when the conversation's stamp moved: the
removed messages from its oldest to its newest, however far up, and from C4 those whose
file is no longer kept, and those it shows as removed, to put back one restored), `getWaitingAnnouncements` (the
pinned ones waiting for the reader's "קראתי", for Today) and `getAnnouncements` (every
announcement in the reader's groups, pinned first, for `/chat/announcements`); the
writes it calls (`confirmAnnouncement`, `pinAnnouncement`, `removeChatMessage`,
`restoreChatMessage`, `muteChat`) were there since C1. `getOwnPlace` reads the
membership's `perms` too, so the sync knows who holds `chat.moderate`. Covered by
`chat_announce.test.sql`, with `chat_on.test.sql`'s seed checks.

Chat's files (`20261111000500_chat_files.sql`, chat C4): pictures, kept 90 days. The
private bucket `chat-files` (10 MiB, JPEG, WebP and, from C5, PDF) holds a picture at
`<business>/<conversation>/<32 hex>.<webp|jpg>` and its thumbnail beside it at
`…-s.<ext>`; nothing in the browser writes or reads it (no policy at all since
`20261127000300_files_server_only.sql`, which dropped its read policy and
`private.can_read_chat_file`). The server, with the secret key:
`public.chat_files_closed(business)` (a demo business takes no files unless its definition
says `"chatFiles": true`, the local seed's restaurant only; the trigger
`chat_messages_demo_file` refuses one too, 55000), `public.reserve_chat_upload(actor,
business, upload_kind, upload_type, upload_size, conversation, to_person, upload_name,
at_time)` (the sending's own checks, opening a private chat as a first message does; 22023
for a kind, type, size or name it doesn't take, 55000 in a closed demo, 54000 for a 31st in a
minute, and 54000 with hint `storage` once the project's Storage holds 900 MB,
`private.storage_used` and `private.files_guard_bytes`), which writes
`private.file_uploads` (nobody reads it but the functions) and returns
`{upload, path, thumb, conversation}`; and `public.send_chat_message` with `upload`, last
(dropped and made again, the same grants), which checks the reservation
(`private.attach_chat_upload`: the sender's, for this conversation, unused, under 2 hours
old, and its picture and thumbnail in `storage.objects` at the type reserved, at most
400 KB and 48 KB, and together the size reserved; 22023 otherwise) before the row is
written, and returns `attached` false for a draft sent already. `public.chat_page` gives
`file_path` and `thumb_path` too (dropped and made again). Keeping:
`public.expired_files(at_time, max_rows)` lists, oldest first and each thumbnail before its
picture, the files past their business's `fileDays` (30, 90 or 180), each business's oldest
past its `fileSpaceMb` (50, 100 or 200 MB; Orel, 11 November 2026: the oldest go first, even
before their days; since 20261127000300 first what one person holds beyond half of it,
their oldest first, `CHAT_SENDER_SPACE_DIVISOR`), removed messages' held files once their undo is over, reservations never
sent after a day, and anything in the bucket older than a day that nothing points at; and
`public.forget_files(paths, at_time)` marks them (`file_removed_at`, the message stays,
and its conversation's `changed_at` moves, so every reader's sync hears of it and an open
screen shows "הקובץ כבר לא נשמר"), lets go of held files and drops unused reservations. C1's job `chat` (`private.chat_tick`)
now also drops the reservations sent more than a day before and, while a file is due, asks
the app's `/cron/chat-files` through pg_net with the minute job's Vault secrets.
`public.admin_storage()` is the console's storage card, for platform staff only (42501
otherwise): the database's size, Storage per bucket, each business's chat space beside its
caps and the caps' sum, sizes only, and no chat table read for it; since
20261127000100_bigger_teams.sql also each business's `document_bytes`, as the documents'
refusal counts them (`private.documents_held_bytes`), so the card names a business near its
own space. `public.file_space(actor, business)` (the same migration, the secret key's) is
the same for a business's own people: an active member who sees the management page
(`manage.view`) or sends documents (`private.sends_documents`), 42501 for anyone else, no
branch for a view session. It gives `files_open`, `document_bytes` beside
`document_space_bytes`, and `chat_bytes` (the Storage objects under the business's folder,
as the console counts them) beside `chat_space_bytes`: sizes only, nothing written or
logged. `@db/chat-files` `getFileSpace(actor, business)` reads it (null before the
migration, on 42501 and on a shape it doesn't know), for `/manage/chat` and the documents'
screens. "קראתי" no longer moves
`chat_conversations.changed_at` (a worker's sync could tell someone confirmed):
`public.confirm_announcement` is replaced without it, `public.chat_acks.recorded_at` (the
clock's time of the row) moves `public.chat_stamp(business, conversation)` (the sync's
per-reader stamp, new) and `public.chat_version` (replaced) for the announcement's author
while they still read it (as `announcement_readers` shows its readers), the moderators and
the person themselves only. `@db/chat-files` has `chatFilesAllowed`,
`sendChatImage` (checked by `@domain/chat-files`, reserved, both files uploaded with
`upsert: false`, sent; both removed at once on any refusal, and kept when the sending's end
is unknown, for the message that may hold them or the clean-up a day on), `chatFileBytes` (for
`/chat-files`: the message read under the reader's session, then the file with the secret
key, its type from its bytes), `getConversationPictures` (a conversation's latest pictures still
kept, for its details, under the reader's session), `cleanChatFiles` (for
`/cron/chat-files`) and `getStorageUse` (null, and the card hidden, when it can't be
read);
`@db/chat` reads `getConversationStamp` from `public.chat_stamp` and gives each message its
`fileSrc` and `thumbSrc`. Covered by `chat_files.test.sql`, with `chat.test.sql` (the
confirmation's timing), `isolation` and `demo_reset`.

Chat's PDFs (`20261111000600_chat_pdfs.sql`, chat C5), up to 10 MiB. Vercel refuses
request bodies over 4.5 MB, so a PDF never passes through the server: `startChatPdf` in
`@db/chat-files` checks its name (cleaned, ending in `.pdf`) and size, reserves its place
(`public.reserve_chat_upload` with kind `pdf`, replaced with the same grants: a PDF's
name ends in `.pdf`, 22023; a person holds at most 10 PDF places unsent from the last day
that hold a file or may still be given one, 54000 with hint `pdfs`, since what the browser
put and never sent waits for the clean-up a day on; a business's PDFs reserved in the last
10 minutes, sent or not, bring at most its `fileSpaceMb`, 54000 with hint `busy`, so
nobody fills Storage faster than the job lets files go, and since 20261127000300 a
person's own at most half of it, 54000 with hint `own` (`busyOwn` on screen), so nobody
alone keeps everyone's PDFs waiting; the 900 MB guard counts the places
on their way, a PDF's for 10 MiB whatever its size, `private.uploads_on_their_way`; a
person's reservations, and a business's PDFs, are counted one at a time under advisory
locks) and makes Storage's signed upload for that one path with the secret key (`upsert`
off). That upload is good for 2 hours and writes wherever nothing is, so a place let go
while it may still be good holds the server's 1-byte tombstone (`chatPlaceTombstone` in
`@domain/chat-files`) rather than nothing: on a stop, a refusal on finishing, and in
`cleanChatFiles`, for the PDFs `public.chat_paths_signed` names (a place under 2 hours and
5 minutes old). The browser PUTs the file to that URL itself, with no Supabase client and
no session. `finishChatPdf` asks
`public.chat_upload_place(actor, business, upload, at_time)` (the server's alone: the
person's own reservation's path, conversation, kind, size and name, whether it was sent and
whether its 2 hours are on; null for anyone else's), so the file it reads is the
reservation's and never a path the browser names; reads its first KB with a ranged request
(a short-lived signed link; when the range isn't honoured, the rest of the transfer is
cancelled after the first KB), checks `%PDF-` (`isPdf` in `@domain/chat-files`) and sends it
with C4's `public.send_chat_message`, which checks its size and type in `storage.objects`.
On any refusal the file gives way to the tombstone, unless a message holds it by then (a
retry of the same sending is given back its message and never loses its file), and a later
try of that place is told to start again (`expired`); `cancelChatPdf` lets go the place of
a sending stopped and says whether it was sent after all. `chatPdfDownload` serves `/chat-files`: the message
read under the reader's session, then the file with the secret key, streamed on after its
first KB proved it a PDF, as a download (`chatPdfDisposition`: `attachment`, the name in
UTF-8 per RFC 5987 with the ASCII fallback `document.pdf`). `getConversationPdfs` gives a
conversation's latest PDFs for its details. `public.chat_inbox` gives `last_file_name` too
(dropped and made again, the same grants), for "קובץ PDF" with its name in the list, and
lists a private chat only once it has a message (a file's reservation opens it first). A demo
business takes no PDF, as no picture (C4's refusals). Covered by `chat_pdfs.test.sql`.

Official documents (`20261111000700_documents.sql`, chat C6), in the database only: the
screens, the demo's sample files (`public/demo-documents/`) and the `/document-files` route
that serves them come with C7. `public.documents` (a worker's to the business,
`from_person`: a sick note, a form or another document; the business's to people,
`to_people`: a payslip, a contract, a procedure, a form or another document, asking for
"קראתי" or not) and `public.document_recipients` (who it went to, each one's opening and
confirmation), and the private bucket `documents` (10 MiB, JPEG, WebP and PDF, at
`<business>/<32 hex>.<pdf|webp|jpg>`, a path that names neither the person nor the
category; no browser writes). Both tables are read by `authenticated` alone, under
`private.sees_document`: a document to the business by its person and the office (the
business's active members who hold `clock.payroll`, `private.in_office`: owners and
accountants always, managers when the owner gives it), one to people by its recipients, its
sender and the office; a removed one by the office and its sender only; someone who left
keeps reading their own and those sent to them. Never a manager without pay access, the
ConceptApp team or a view session, and the secret key reads neither table, so no console
page or script can. The bucket's read policy (`private.can_read_document`) followed the
document, and never gave a removed one's file, even within its 10 minutes of undo (C7's
`20261111000800_documents_screens.sql` replaced it so: putting a file back needs no look at
it, and a sick note its sender took back is seen by nobody); since
`20261111000900_documents_server_only.sql` the bucket has no policy at all (below). Kept forever: on delete
restrict to the business and the people, a trigger that refuses deletes but under the demo
reset's purge (`private.purge_business_records`, replaced once here with the documents and
their recipients before the log), and truncate for nobody; never deleted for space either
(past a business's `documentSpaceMb`, 50 MB unless the team chose 100 or 200, a new one is
54000 with hint `space`, and across the project past 980 MB, hint `storage`). All of it
through server functions with the secret key, for `actor`: `public.reserve_document_upload`
(a photo of a page, at most 700 KB, which the server uploads itself, or a PDF, at most
10 MiB, through a signed upload, as chat's), `public.document_upload_place` (finishing a
PDF), `public.send_document` (every rule checked before the row: the categories each way
takes, 1 to 1000 others on the staff, 200 until 20261127000100_bigger_teams.sql, a title
of 1 to 80, a note of at most 300; in a demo
business samples only, no note, its category's words as the title; at most 30 a minute),
`public.open_document` (a recipient's opening marked, the office's first opening of a
document to the business marked received, and each opening by the office of someone else's
logged, once a day per reader), `public.confirm_document` (55000 for a removed one only to
a recipient in the office, who still reads it; to a plain recipient a removed one is unknown,
P0002), `public.remove_document` (the
file, never the row: its sender in their first 10 minutes as `taken_back`, the office with
`wrong_person`, `wrong_file`, `duplicate` or `other`; never free text) and
`public.restore_document` (whoever removed it, within its 10 minutes), and
`public.documents_closed`. The lines are `documents.received` (to the office),
`documents.sent` and `documents.to_confirm` (to each recipient), with `{document, from}`
only, and the trigger `audit_log_settles_documents` settles `documents.received` for anyone
whose pay access goes (a permission taken back, and since the team changes someone removed
or given another role). The log's `document.send`, `document.open`, `document.remove` and
`document.restore` hold ids and codes only and are read by the office alone (the policy
"managers read the log, pay holders the pay rows", altered here; C1's view policy already
keeps them from every view). C4's `public.expired_files` and `public.forget_files` are
replaced with the same grants for a removed document's file once its undo is over (its path,
kind, name and size cleared, the row kept), the bucket's unused places and its orphans, and
C5's `public.chat_paths_signed` for a document's PDF too; `cleanChatFiles` in
`@db/chat-files` removes each listed file from its own bucket (`isDocumentFilePath`), with
the tombstone in `documents` for a PDF whose signed upload may still be good. The demo reset
writes three samples through these functions (`private.seed_demo_documents`, from
`private.seed_demo_chat`). `@db/documents` has what C7 calls: `getDocuments`,
`getDocument` (under the reader's session, with the marks RLS gives them),
`reserveDocumentUpload`, `documentUploadPlace`, `sendDocument` (a reserved place or a demo's
sample), `openDocument`, `confirmDocument`, `removeDocument`, `restoreDocument`,
`documentsAllowed` and `documentFileBytes` (for `/document-files`: the row under the
reader's session, the type from the bytes; the file itself with the secret key since
`20261111000900_documents_server_only.sql`). `@db/notifications` reads a document line's category from
the document itself under the reader's session, for the inbox alone; a phone's lines never
look one up. Covered by `documents.test.sql`, with `rls_enabled`, `isolation`, `demo_reset`
and `chat_on`, and `modules/chat/documents.db.test.ts` (`pnpm test:db`).

Documents on screen (`20261111000800_documents_screens.sql`, chat C7) add one table:
`public.document_notices`, when each person in a business's office read, on its documents
screen, that the business should keep its own copy of its official documents (the free plan
keeps no backups), read by that person alone and written once by
`public.see_documents_notice(actor, business)`, the server's, for someone in the office
(`private.in_office`), 55000 while documents are off; no log row. Chat's notice table takes
the staff alone, so an accountant couldn't be in it. One rule of C6 is tighter:
`private.can_read_document` is replaced without its 10 minutes' read of a removed
document's file, which nobody reads any more (its undo needs no look at it). `@db/documents`
now also has what C7's screens and routes call: `getDocuments` with a `DocumentsQuery`
(`person`, `sentBy`, `direction`, `sentFrom`/`sentBefore`; a person's read from every mark
of theirs, a hundred ids to a read), each `DocumentView` carrying `src`
(`/document-files/<business>/<id>` while it has a file or a sample to open and isn't removed)
and `shownKind`, its marks read page by page; `getDocumentsIndex` (every document in brief,
page by page: the office's people and months) and `getDocumentsToKeep` (a download's every
document, oldest first, page by page); `getDocumentsForToday` (what the reader is asked to
confirm, one read of the documents joined to their own mark, and for the office what came
that nobody there opened, each with its count); `documentToServe` (the row the
`/document-files` routes read, never a removed one: from
`20261111000900_documents_server_only.sql` they open the document first and read its row
and file after, the route of one document after a look at its row in the business its
address names); `documentIdForFile`; `documentsNoticeSeen` and `seeDocumentsNotice`; and the sending with a file of its own, as chat's: `sendDocumentPhoto`
(checked again, reserved, uploaded with the secret key, sent; the photo removed on any
refusal unless the document was written after all), `startDocumentPdf` (the place and
Storage's signed upload for its one path in `documents`), `finishDocumentPdf` (the place's
first KB a PDF's, then sent; let go with the tombstone on any refusal), `cancelDocumentPdf`,
and `sendDocumentSample` for a demo. `@db/chat-files` exports `occupyPlace` and
`isSignedUploadFor`, each taking the bucket, and `storedHead`, chat's alone since
`20261111000900_documents_server_only.sql`. Covered by `documents_screens.test.sql` and
`rls_enabled`, and the unit tests `document-sending.test.ts`.

Official documents' files through the server only (`20261111000900_documents_server_only.sql`,
Orel's decision of 12 November 2026, on #1). C6's policy let whoever reads a document's row
read its file straight from Storage under their own session: an access token copied from the
browser's developer tools downloaded it with no `public.open_document`, so with no
`document.open` row in the access log of reg 10, and could ask Storage for a signed URL that
anyone opens without signing in, after the person has lost their access too. The policy is
dropped, and `private.can_read_document` with it: the `documents` bucket has no policy, so
`anon` and `authenticated` read nothing of it (no download, no list, no signed URL), whoever
they are. Only the server reads a file, with the secret key, in the `/document-files` routes:
for one document, a look at it in the business its address names first (`documentToServe`
by its id, `documentIdForFile` by its stored name: the row only, under the reader's session),
so an address with another business in it opens nothing there; then
`openDocument` (`public.open_document` decides who reads it, marks and logs the
opening, and says what may be served), then `documentToServe` under the reader's session,
which must agree, then `documentFileBytes` (the row again under that session, then the bytes
with the secret key's own download). The download of all does the same for each file. An
opening whose file then can't be read stays logged: the log may hold more than was served,
never less. `public.open_document` is replaced with the same arguments, return and grants: it
serves nothing of a removed document, even within its 10 minutes of undo (`path` and
`sample` null), and logs no opening of one. Nothing makes a signed URL to read a document's
file, the server included: `finishDocumentPdf` reads a PDF's first KB with the secret key's
own download (`storedHead`'s signed, ranged read stays chat's). A PDF's signed upload, for
its one reserved place, is unchanged: it writes and reads nothing. Covered by
`documents.test.sql` (163: every person, a view, the team and `anon` read no file, the
server role does, no policy of Storage names the bucket, the removed procedure opens to
nothing and logs nothing) and `isolation` (the worker's two files no longer counted), the
unit tests of both routes and of `documentFileBytes` and `finishDocumentPdf`, and
`tooling/documents.test.ts` (no policy of the bucket left in the migrations, the function
dropped after it and named by nothing later, and `open_document`'s rule).

Taking orders, the menu and the places (waiter mode P1, issue #191;
`20261117000400_order_taking_module.sql` adds the key,
`20261117000500_order_taking_menu.sql` the rest), with no screen yet and the
module off in every template and business. `menu_categories` each send their
items to a department of the business (a composite key, checked at commit as
the lists' are); `menu_items` keep their price in whole agorot, VAT included
(0 to 1,000,000), an optional department of their own, "sold out" with who
and when (`available_by`, `available_changed_at`; `available_station` waits
for P8's stations), a `version` a save names, and up to five groups of
choices, checked by `private.valid_option_groups` (`optionGroups` in
`@domain/order-taking` is its twin): every group's `max` most expensive
options add at most 100,000, so a line's unit price (`private.unit_agorot`,
`unitAgorot`) never passes 1,100,000. `order_places` are the business's
tables or rooms. Categories, items and places are archived, never deleted.
All three are read under RLS by the staff and a view as a role on it while
the module is on (`private.order_taking_on`), never by an accountant; and
`public.order_menu(business, known_version)`, with the person's own session,
answers the same menu as one JSON, or null when `known_version` is the
business's version now (`private.menu_versions`, moved by every write, and
by `set_departments` when the departments change, since a department removed
or brought back changes where items go: the moment in microseconds, or one
more, so it never comes back to a number a phone holds after a demo reset).
Writes are the server's, for `actor`, each
refused while the module is off (42501, hint `off`): `set_menu_categories`
and `set_order_places` save the list whole as `set_departments` does,
`save_menu_item` (40001 behind `known_version`), `archive_menu_item`,
`restore_menu_item`, `import_menu` (one transaction) and
`set_menu_item_available`, which someone on the staff in the item's
department may call too (`private.line_route`, `private.in_department`, never
an accountant). Those who run the menu hold `order_taking.edit`
(`private.runs_orders`), managers' by default and settable; its log rows
(`menu.*`, and the orders' `order.*` to come) are read with it
(`private.log_perm`). `@db/order-taking` wraps each, its refusals read by
`@db/menu-failures`. The demo restaurant's sample is
`private.seed_demo_order_taking`, last in `public.reset_demo_business`.
Covered by `order_taking_menu.test.sql`, `isolation`, `demo_reset`,
`rls_enabled`, `roles_catalogue`, `activity_log`, and
`modules/order_taking/unit-price.db.test.ts`.

On screen (waiter mode P2, `20261120000100_order_taking_screens.sql`): the
ConceptApp team sets the menu up too (`private.sets_up_menu`, asked by
`set_menu_categories`, `save_menu_item`, `archive_menu_item`,
`restore_menu_item`, `import_menu` and `set_order_places`, as
`private.can_edit_settings` lets it save settings), so the console imports
and saves places for a business it is no member of. `private.runs_orders`
stays P1's, the members' alone: "sold out" asks for an active membership
first and then for it, so it stays the business's own, and someone on the
team who is also on a business's staff marks only what their own department
prepares; the orders to come ask it too. `set_menu_categories`
saves a category sent with its id and the department it has already, even one
removed since, so a rename or a move still saves while its items go nowhere;
a new category, or one moved, goes to a live department (22023 'route').
`save_menu_item` keeps an item's own department the same way, so its price or
name still saves after that department went. The demo restaurant opens with
the module on where its definition says
`"orderTaking": true` (`private.seed_demo_order_taking`, last in every
reset): the local seed's does, the hosted demo's doesn't. The restaurant's
and café's templates have their own words for it (`template_wording`,
"מצב מלצרות", "מנה", "שולחן"; `tooling/template-wording.test.ts` keeps each
row's `base_sentence` he.json's). `getMenuForTeam` reads a business's menu
with the secret key, as `order_menu` gives it without its version, for the
console only (the team is no member, so `order_menu` answers it P0002).
Covered by `order_taking_screens.test.sql` and `wording.test.sql`.

Taking orders, the orders (waiter mode P3, issue #191; Orel's decisions of 20
November 2026), in the database alone, the module still off.
`20261120000200_order_taking_takers.sql`: the module's settings
(`private.order_taking_settings`, with the manifest's defaults, and a reader
per field that takes a value the manifest wouldn't as its default, as
`readModuleSettings` does: `private.order_taker_keys`, `order_clock_rule`,
`order_take_back`, `order_day_ends`, and `private.order_business_day`, the
business day by the wall clock, `orderDay` in `@domain/orders` its twin);
`public.set_module_settings` keeps who takes orders, the clock rule and the
take-back time to owners and the team, and checks each field's shape through
the same `private.valid_taker_keys`. Who takes orders
(`private.order_taker_refusal`, `takes_orders`, `require_taker`): an owner,
or someone active on the staff in one of `takerDepartments` (the templates
name the restaurant's floor and bar, the café's coffee bar and bar) or holding
`order_taking.edit`; with the time clock on and `onlyOnTheClock`, only during
a shift (`private.on_the_clock`: an open one under 16 hours, or until 30
minutes after clocking out, never a cancelled one), refused 42501 with hint
`clock` or `stale_shift`. Who prepares (`private.prepares_in`): the ticket's
department's staff, or `order_taking.edit`; never an accountant.
`20261120000300_order_taking_orders.sql`: `orders` (at a place, or a takeaway
with its number of the business day from `private.order_day_counters`),
`order_rounds` (keyed by the phone, with the body's hash), `order_tickets`
(per department and held block: held, new, ready, served; `prepared_at` kept
once a preparer marked it ready, `served_new` for one served before it was
ready) and `order_lines` (name, unit price in agorot and choices frozen when
sent, a note erased later, taken back, cancelled or on the house), with
`private.order_versions`. RLS is on with no policy and no grant, not even to
the server role: nobody reads the tables, and only the functions write them.
The send, `public.send_order_round(actor, business, round_key, target,
lines)`, refuses someone who takes no orders (42501) before any lock (only
their own round that went through, the same lines again, is answered then,
looked up with no lock: a sender moved out of the departments that take
orders since), takes the business's lock, gives a stored round's answer
back as it is (23505 hint
`key` or `body` for another sender, business or body), then asks the clock,
refuses every item it can't take at once with their ids
(22023 hint `unavailable` or `route`), joins a first send within 60 seconds
and refuses a later one (23505 hint `taken`, the order's id as the detail),
and writes no log row. The writes, the server's for `actor`, each after
`private.order_writer` (P0002 for anyone not in the business, 42501 hint
`off`) and in the lock order business, order, ticket, line (P0002 too when a
row is gone by the time it is locked):
`take_back_order_line`, `cancel_order_line` (and its undo),
`comp_order_line` (and its undo), `cancel_order` (for good),
`set_order_ticket_ready`, `serve_order_ticket`, `fire_order_tickets`,
`move_order`, `close_order`, `reopen_order` and `set_order_label`; their
refusals are in the migration's header and `@db/order-failures`. The log
rows `order.line.take_back` (once the kitchen saw it), `cancel`, `restore`,
`comp`, `uncomp` and `order.cancel` keep a line's quantity and unit price,
never a sum (`private.order_line_facts`), read with `order_taking.edit`. The
reads, with the person's own session (`private.order_access`): `order_floor`,
`order_detail`, `order_till` (by item and by round, no total), `order_mine`,
`order_prep` (no price at all; it marks what the reader's department saw)
and `order_favourites`, person ids only on today's business day, and an
order of another business refused word for word as one that doesn't exist.
`20261120000400_order_taking_orders_demo.sql`: the hourly job `order-taking`
(`private.order_taking_tick`, pure SQL, off in `seed.sql`) erases notes and
labels two days after an order closes (or after its last round, open), and
makes its rounds' body hashes from their ids alone then; it marks each
order then (`notes_erased_at`, read through `orders_unerased_idx`), so no
later hour reads it again until a round or a label added while it is open
takes the mark away (`send_order_round`, `set_order_label`). A round sent
within those two days (to an open order while the job waited on its lock,
or to one closed at a moment before the round's) is left alone, its order
unmarked, until its own two days pass. It forgets, 30 days
after, who sent a round and who did anything else to an order, its tickets
and its lines; and deletes a demo business's orders after two days.
`private.seed_demo_orders`, last in `public.reset_demo_business`, writes
the demo restaurant's three sample orders. `@db/orders` wraps each, every
input and answer parsed with `@domain/orders`. Covered by
`order_taking.test.sql`, `order_taking_access.test.sql`,
`order_taking_retention.test.sql`, `isolation`, `demo_reset`, `templates`,
`activity_log`, `rls_enabled`, and `modules/order_taking/settings.db.test.ts`.

P4 (`20261121000100_order_taking_mode.sql`): `public.order_mode`, where the
signed-in person stands in the mode (takes, runs, the clock's refusal, the
departments they prepare for, their own ready and being made, what waits,
sold out), never refused and never written, for the frame, Home and the
clock (`getOrderMode`, "notYet" before the migration); `order_mine`'s
tickets carry their lines (`items`, no price) and `order_floor` what is
ready to serve (`ready`, with its lines, no price), each read with a
default of none before the migration. `getOrderPeople` names the people
the screens show, short. The send goes through `POST /orders-send`
(app/orders-send/route.ts, the body's business, never the cookie's) and the
reads through `GET /orders-sync` (app/orders-sync/route.ts, the kitchen's
read first), both outside the proxy's matcher.

P5 (`20261122000100_order_taking_fixes.sql`) adds one write: the close's
"ביטול", `public.undo_close_order` (`undoCloseOrder`), granted to
`service_role` alone. By whoever closed the order, within 2 minutes of the
close (55000 hint 'window' after that, or for another's close), it opens the
order again as `reopen_order` does and, in the same transaction, puts every
ticket the close served (served at the order's `closed_at` by its
`closed_by`) back to new or ready, as `serve_order_ticket`'s undo does; one
served before the close stays served. Its other refusals are reopen's:
'day', 'taken', 'not_closed'. The screens' cancels, "on the house", a whole
order's cancel, the move, the close and the reopen are P3's writes through
`@db/orders`, and "נסגרו היום" and the owner's counts are `order_floor`'s
`closed` and `fixes`. The migration also writes the restaurant's and the
café's words (`order_taking_fixes.test.sql` holds both). The phones' till
is drawn from `order_detail` (`orderTill` in `@domain/orders`), so it stays
current with the mode's sync; the till's station reads `station_order_till`
(P8a, below), which groups them as `order_till` does, and
`modules/order_taking/till.db.test.ts` and `stations.db.test.ts` hold them
alike.

P7 (no migration) keeps rounds on the phone until they go. `getOwnPlace`
returns `memberOf`, every business the person is an active member of, from
the memberships it already reads. The send's body names its person
(`sendBody.user`), and `/orders-send` refuses another than the session's
(409 `person`: a round kept on a shared phone is never written as whoever
is signed in now) and a business they aren't a member of (403
`notMember`, told apart from 404 `gone`) before the database, which
still checks both. `order_mine`'s round ids are the phones' keys, so the
outbox sees from one's own rounds that a round went (a last send as the app
closed) before it asks about it. `send_order_round`, its idempotency and
every read are as they were.

Order stations (`order-stations.ts`, waiter mode P8a,
`20261124000100_order_taking_stations.sql`): the kitchen's screens and the
till are stations of the clock's one registry. `clock_stations.shows` says
what each shows (`clock_code`, every station before; `prep`, with
`department_id` or none for every department; `till`), and `last_action`
with `last_action_at` what it last did, for the list of screens; ten
running in a business of every kind together (`approve_station_pairing`'s
count already reads them all, `lock_order_station` counts the same under the
business's lock). `lockOrderStation(actor, business, {name, shows,
department})` is the clock's lock (`pairThenApprove`, now shared with
`lockStation`, on the business's own three pairings) approved by
`public.lock_order_station`, by whoever runs orders, logged as
`order.station.add`. By the station's secret, with the secret key: the reads
`stationOrderPrep` (its department's tickets or every one's, as
`order_prep` gives them, with no price and the senders only on today's
orders, marking the new ones seen and stamping the station seen),
`stationOrderMenu` (the items that reach it, for "מה נגמר", no price) and
`stationOrderTill` (the open orders and today's closed and cancelled ones,
by item and by round, no label, no person, no total), each "same" for the
version the station has; the writes `stationSetTicketReady`,
`stationSetItemAvailable`, `stationCloseOrder`, `stationReopenOrder` and
`stationUndoCloseOrder` (the close's "ביטול", the same station within 2
minutes), decided as a person's are and kept on the row as the station's
(`ready_station`, `served_station`, `closed_station`, `reopened_station`,
P1's `available_station` with its key now), at most one of a person and a
station beside each other; `set_order_ticket_ready`, `serve_order_ticket`,
`reopen_order` and `undo_close_order` clear the station's column with the
person's. Every answer is parsed with `@domain/order-stations`' strict
schemas; refusals by `order-station-failures.ts` (`notStation`, `stopped`,
`notOrders` for another kind, `off`, then the orders' own). With the
secret key too, since a station has nobody signed in: `getStationPeople`
(the senders' short names, over the whole team, only those asked),
`getStationWording` (the template's and the business's sentences, as the
session reads them) and `getStationDepartment`. `getRunningOrderStations`
lists the kitchen's screens and tills under the person's session (RLS: the
new policy "order_taking's runners read its stations", for
`order_taking.edit` with taking orders on; the clock's own policy now reads
the clock's rows only, and `getRunningStations` asks for them); the secret is
still never granted. `station_by_token` says what a station shows and its
department; `issue_station_code` makes no clock code for a kitchen's or a
till's secret; `set_clock_station_stopped` stops a kitchen's screen or a till
for whoever runs orders or edits the clock, taking orders off too (the
clock's lock offers it on that device), and starts it again only for whoever
runs orders, with taking orders on (`order.station.stop`, `restart`). A
kitchen's "מה נגמר" refused says the item's own words (`itemGone`,
`notHere`, `orderStationItemFailureOf`). Since P8b `public.order_mode` says
which live departments a running prep screen shows (`screens`, none before
that migration reaches the project), for the order's and "ההזמנות שלי"'s
"המסך לא מחובר". The demo's reset deletes the business, and its stations of every kind go with it. Covered by
`order-stations.test.ts`, `order-station-failures.test.ts`,
pgTAP `order_stations.test.sql`, `modules/order_taking/stations.db.test.ts`
and `e2e/order-stations.spec.ts`.

The tests that must always pass: a member of business A cannot read
business B; anonymous visitors read nothing; every table in `public` has RLS.

## Templates

A business starts from a template (`restaurant`, `cafe-bar`): rows in
`templates`, written by migrations (a change is a new migration that updates
the row and bumps `version`). The definition's shape is `templateDefinition`
in `@domain/templates`: modules with `enabled` and their settings (positions
and the weekly shift pattern are scheduling settings), plus the opening hours,
its `departments` and its `listTemplates` (pointing at its departments and
shifts by key). A module the template doesn't name starts off, with its
defaults, so a module built for one business touches no template.

`public.apply_template(business, template)` copies one into a business
that has none yet, in one transaction: a `business_modules` row per module,
`opening_hours`, its departments and lists (`private.copy_template_lists`),
`template_key` and `template_version`. It refuses a business that is already
set up, an unknown key, a template that names a module nobody has, or a list
that names a department or shift the template doesn't have, and changes
nothing then. It is security definer, since the server role has no use of the
private schema. Only `service_role` may run it;
from TypeScript, `applyTemplate(adminClient, id, key)` in `@db/templates`.

Tested twice: pgTAP (`templates.test.sql`: grants, refusals, nothing
half-applied) and `pnpm test:db` (`modules/templates.db.test.ts`: each
template in the database is valid against the real manifests, and applying
it to a fresh business gives back the same valid definition). The seed makes
the demo restaurant and the demo shop with `reset_demo_business`, which applies
their templates; `demo_reset.test.sql` tests the reset and the shop's renewed
week.

## Wording

A template or a business can replace a whole sentence of the app's copy
(`template_wording`, `business_wording`), keyed by its message key under
`app.*` or `modules.*`. A business's sentence wins over its template's, which
wins over messages/he.json; deleting a row brings back the layer below.
Template sentences are read live through `businesses.template_key`, so a
change reaches every business opened from the template at once (Orel,
7 November 2026). Members read their own business's sentences and its
template's under RLS, and the team while viewing; only the team writes, with
`set_business_wording` (platform staff) and `set_template_wording` (platform
admins), each logging `wording.change`. Seeds hold no wording, so screens
read as messages/he.json. Console reads and writes are in `@db/wording`;
`wording.test.sql` covers who reads and writes what.

## Clients and session

- `@db/supabase/server`: `createClient()` for Server Components and Server
  Actions, acting as the signed-in person under RLS (publishable key).
- `@db/supabase/proxy`: `refreshSession()` for the root `proxy.ts`, which
  refreshes the session cookies on every app request.
- `@db/supabase/cookies`: how both set the session cookies (#80): httpOnly,
  since there is no Supabase client in the browser; Secure over https (not
  on the browser tests' http://127.0.0.1); sameSite lax. Signing out ends
  this device's session only (`scope: "local"`).
- `@db/session`: `getCurrentMember(catalogue)`, the signed-in person and their
  business: the one the `ca_business` cookie names when it is one of their
  active memberships, else their place on a staff, else the first they
  joined (`chosenMembership` in `@domain/businesses`), with every business
  they are in as `businesses` (payroll P3b), and what they hold there from
  `public.my_permissions` (today's rules from `catalogue`, every permission
  declared, while it is missing). `app/(app)/member.ts` wraps it in React
  `cache()` with `permissions` from `@modules/registry`; the cookie is set
  only by `app/(app)/business-cookie.ts` (the switch, the door, joining, a
  line from another business).
- `@db/supabase/admin`: `createAdminClient()` with `SUPABASE_SECRET_KEY`,
  for server-only writes. Bypasses RLS, so every caller checks who is
  asking first.
- `@db/auth-limits`: the counts on sign-in codes, with the secret key.
  `noteAuthAttempt` gives 0, the seconds to wait (any window of
  `private.auth_limits`: a quarter of an hour, a day per number),
  `NO_CODE_WAITING` (-1) for a check with no code sent to its number in the
  last ten minutes, or `CODE_JUST_SENT` (-2) for a send within the app's
  own wait of the number's last counted one, on either side of it
  (`private.auth_send_wait`, 65 seconds, the same for every number; of two
  sent at once, the one stamped later may be counted first); either is
  counted for its caller only. `forgetAuthAttempt` gives back a send the auth server sent nothing
  for, past that wait: one of its limits on everyone (the project's SMS in
  an hour, its requests from one address) or a failing SMS provider, for
  the number and the caller, on sign-in as for joining and the file's
  codes. A send to a number with no account stays counted on sign-in, as a
  code sent does. `forgetRefusedSend` gives back a send the auth server
  refused for its "אני לא רובוט" check (`captcha_failed`, once Supabase's
  CAPTCHA is on), for its number only: the caller's try stays counted, so
  sends with no token can't wear down the auth server's limit per address,
  which is the whole site's. `forgetNumberAttempts` clears a
  number's counts while it has no account (none reached anyone): for
  joining from an open invite only, before its code is counted; the
  database keeps the counts of a number with an account.
- `@db/admin`: the console's reads and writes. `createBusiness(actor,
  business)` calls `public.create_business` (service role only): it opens
  the business, applies its template and writes `business.create` to the
  audit log in one transaction, and refuses an actor who is not platform
  staff. A taken slug comes back as `slugTaken`.
- `@db/env`: the public settings and the secret key, checked with Zod, and
  this site's demo door (`DEMO_DOOR`: `demoDoorOpen`, read here alone, for
  server code and the proxy only). `turnstileSiteKey` (`parseTurnstileSiteKey`)
  reads `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, the "אני לא רובוט" widget's public
  key: unset, Cloudflare's always-passing test key; another shape (a secret
  pasted by mistake too) throws naming the setting. The pages that send a
  code read it on the server and hand it to their screens.
- `@db/pages`: reading past PostgREST's `max_rows` (1000 in supabase/config.toml, as on
  hosted Supabase, which cuts a longer read short with no error; kept, since raising it
  locally would only hide the cut). `PAGE_ROWS`; `allPages(page)` asks `page(first, last)`
  until one comes back short and throws a page's error; `readAllPages` answers as one read
  does (`{ data, error }`), for the reads that fall back on a missing table or column;
  `allPagesIn(ids, page)` and `readAllPagesIn` read ids in parts of `IDS_PER_READ` (100, so
  an address stays near 3.7 KB), each part page by page, in the parts' order; `inParts`.
  The rule (bigger teams, the first fixes): a read in packages/db of a table that grows
  with time or with everyone who ever joined, and a call of a function that answers rows
  (as `team_phones` and `announcement_readers` do, one a person on the staff), pages,
  ordered by its key last so no row falls between two pages, or says beside its `.from(`
  or `.rpc(` why it can't pass the cap (`// bounded: …`). `tooling/bounded-reads.test.ts`
  holds every read to it (the functions from database.types.ts, those whose `Returns` is
  rows), and names the files kept out for now (taking orders', the hiring file's). The paging is proved by
  `packages/db/paged-reads.test.ts`, a stand-in for PostgREST that serves at most 1000 rows
  a request: CI's database job has no PostgREST.

Sign-in is phone + SMS code. Accounts are never created at sign-in
(`[auth] enable_signup = false`); people arrive through the seed now and
through invites from chunk 1d. Locally and in CI the `send_sms` auth hook
writes codes to `dev.sms_codes` (defined in `supabase/seed.sql`, so it never
reaches a real project); the Playwright test reads them from there.
The sign-in screen gives every valid number the same answer, registered or
not (`sendSignInCode` in `app/(auth)/otp.ts`).
