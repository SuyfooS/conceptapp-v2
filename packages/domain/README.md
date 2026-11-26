# packages/domain

Pure business logic with unit tests and no framework imports: Shabbat
boundaries (candle lighting / havdalah by coordinates), reservation slot
availability, hours and overtime maths. Nothing here may import from
`app/`, `modules/` or `packages/db`.

The profile's checks (Israeli ID, passports and other documents, banks and
Masav's account rules, the pasted-number splitter, address) take their rules
from dated lists: a new source is a new date and a new entry, by PR. The
hiring file (`employee-file.ts`, profile H4) builds on them: what a write
sends, group by group (`employeeDetailsInput`), what of it is sealed and what
stays plain (`identityParts`, `addressText`, `bankParts`), the emergency
contact, the database's replies as schemas that fail closed, and its refusals
(`fileFailureOf`). The worker's own flow (H5a) is `employee-file-steps.ts`:
where each step stands, worked out from the file, where the person picks up,
the minor's card and the pension's due date; since H5b it takes the steps the
business's settings put on screen (`fileParts`, `fileStepsOn`), with step 2
optional while only the ways to reach the person are asked (counted done
only once something of it is in), and `onlyPensionLeft` for a file that
lacks only a fund chosen "later", whose ways in open the pension's step. What each
business asks is `employee-file-settings.ts`: the asks and the groups they
count (`fileGroupsAsked`, as `private.file_groups`), Form 101's way
(`form101SetupOf`, the link's check `FORM101_LINK` as the database's), the
notice's names, the bank change Today tells for 14 days and the cookie that
keeps it seen on a device, by its person and its exact moment. `phone.ts` has, beside the mobile's,
`normalizeIsraeliPhone` and `displayIsraeliPhone` for any Israeli number, a
business's landline too. Two more dated lists feed it:
`pension-funds.ts` (the comprehensive funds as the Capital Market
Authority's pension data names them, by report period) and `cities-data.ts`
(Israel's settlements by CBS code, made by `tooling/cities.mjs` from
data.gov.il and never edited by hand), searched by `cities.ts` in either
language with spellings that meet (קריית and קרית, Kiryat and Qiryat).

Words read as plain text, not drawn (a button's name and tooltip, an
UndoRow's message, a push line), hold their times and numbers left to right
with `isolate` from `bidi.ts` (LRI … PDI), next-intl's `<ltr>` callback for
`t.markup`. It is the one copy: the chat's actions, the availability sheets,
the fill's sheet and the push lines all read it. (`share.ts` keeps its own
LRI for the week range, around each pair of days in it.)

Payroll keeps money in whole agorot (`money.ts`), and the minimum wage is a
dated list too (`minimum-wage.ts`, every figure as published): each April's is
a new entry, with its twin in `public.minimum_wages`. A minor's age is kept as
the day they turn 18 (`youth.ts`: `youthUntilOf`, `ageBandOn`, adding years as
Postgres does, and `private.minimum_wage_for` reads the bands the same way),
never a birth date; the details for payroll and the periods
of work, with their forms and overlap rules, are `payroll-details.ts`, and a
day typed as three numbers is `typed-date.ts`.

The legal hours engine is `payroll.ts` (`payrollMonth`, `personPayroll`): from
a month's entries, each person's details and wages, the clock's settings and a
calendar, every person's minutes at each rate day by day and week by week
(the norm, overtime, the rest windows, the weekly 42), the pay for days not
worked (`holiday-pay.ts`: holiday pay and election day, with what to check),
the estimate in whole agorot, and the flags and notes (`payroll-flags.ts`, with
the statute's limits for adults and minors). It is pure: no I/O, no clock of
its own, no hebcal. The calendar comes from `payroll-calendar.ts` (rest windows
by rest day, the nine paid holidays, one-off rest days), which imports hebcal,
so only server code imports it, as with `shabbat-times.ts`. Durations come from
instants and workdays, the night and the week from local time; a day's rates
always add up to the minutes the clock shows. Every reading of the law an
accountant or a lawyer must confirm (payroll plan §14) is one named field of
`PAYROLL_READINGS` in `payroll-readings.ts`, which the engine reads where it
decides, so a correction is one change; the plan's §13 vectors are
`payroll.test.ts`, with tests of the other value of the readings they name.
What the pay screens draw from it is `pay-rates.ts`: a person's month by rate,
wage and day (`personRates`), what a pay holder checks (`remarksOf`, minors
first, without what the screens already say in their own words), the values of
each flag's words (`flagValues`, held to the words by
`tooling/payroll-words.test.ts`), the month's card and estimate, and what a
worker sees of their own month (`ownMonthOf`: their adult limits, and for a
minor only that a rule was crossed). The file for payroll is
`payroll-export.ts` (`exportSheets`): the month's four sheets, in words that
come in, as cells (text escaped against formulas, totals to two decimals from
summed minutes, each shift's and day's hours exact so a column adds up to its
total, days, times), a summary row for each stretch at one wage with something
in it (`monthWageSpans` in `payroll.ts`, the engine's own), and a day's rates
and marks once, on its first counted shift. It never reads an estimate or an
amount, so the file is the same with amounts on or off; the app writes the
cells as XLSX.

Permissions are declared by area (`PermissionDeclaration` in `modules.ts`: a
module's own in the manifest, the team screen's and the management page's in
`permissions.ts` as `CORE_PERMISSIONS`), and `declaredPermissions` is what
`public.permission_keys` holds. Who holds what is the database's answer
(`public.my_permissions`); `holdsPermission` only reads it, and
`permissionsByDefault` gives today's rules from the declarations alone, for a
project the database can't answer yet.

`role-access.ts` is what "תפקידים והרשאות" draws and writes: edit, view or
none per area and the switches under edit, each area's permissions
(`areaPermissions`: its view, its edit, its switches), a role's levels from
what the database says it holds (`accessFromHeld`), the writes that bring one
area to a level (`areaWrites`: denials first, each before what it requires,
then grants, each after it, and a grant whose requirement goes taken back
unless the default makes it, so an undo leaves no row), whether an area is
open for changes (`areaOpen`: every one of its keys settable), the
matrix from the declarations alone (`matrixByDefault`), who changes it in the
app (`changesPermissions`: owners, as on "מי רואה שכר"), and one area's
change as the server takes it (`parseRoleAreaChange`: managers or workers,
a known area never under its floor, only its own switches), the areas a
business has (`areaShown`: a module's while it is on, team and manage
always), and where workers hold more than managers (`heldBeyond`, when a
manager gives no one the worker role). Roles a business names (R11a): a
role's key is `manager`, `worker` or a named role's id (`RoleKey`,
`isBaseRole`), the matrix carries the live ones (`RoleMatrix.named`,
`addsRoles`) and finds a role's rules by key (`rulesOf`), a new role and a
new name are parsed as the server takes them (`parseNewRole`,
`parseRoleRename`, over `checkRoleName`), at most `ROLE_LIMIT` live, and
`namedRoleName` gives the English name in English when there is one.

`team.ts` gives them (R11b): a role to give is a `RoleChoice` (a built-in
role, or a named role's id on its base; `roleChoiceKey`/`roleChoiceOf` as a
form carries it), and `invitableRoles`, `roleChoices` and `parseTeamInvite`
take the business's live named roles (`GivableNamedRole`: with the settable
keys each holds by role) and offer each after its base to whoever gives it
(`givesNamedRole`: an owner any; anyone else who edits the team one on a role
they give by rank, holding nothing they don't, as
`private.role_holds_beyond` says). Removing, cancelling an invite and the
rank of a change go by the base. `namedRolesBeyond` is those on a base the
viewer gives that hold what they don't, which the role sheet shows as an
owner's to give, and `namedRoleShown` strips a named role to its names and
base before it reaches a browser: what it holds is the owner's to read.

`people-import.ts` reads a pasted list of people to invite at once ("הזמנה
מרשימה", part 1 of the plan of 25 November 2026): from WhatsApp, Excel,
Google Sheets or a note, on the device, so only each person's name, number
and role ever leave it. `parsePeopleList` chooses the cells once from most
lines (a tab, then `;` or `,` read quote-aware, then the staff list's `|` or
a spaced dash), splits each raw line before cleaning its cells (cleaning
collapses tabs), with every dash in a number read as "-" and WhatsApp's time,
date and sender before a message left out, finds a header row after any title
(`שם`, `נייד`, `ת"ז`, `תפקיד` and the like, an unknown header named in
`ignored`; a sheet's one-cell title may hold a mobile), and without one the
phone, role and name columns by most of their cells (a sheet's single row by
its cells; a line with no delimiter, or typed by hand with its mobile in
another place, as free text); two columns of mobiles are never guessed
between (`phoneColumns`, with the headers that named them, and a typed list's
second column of mobiles beside the first on a line, when a line has it with
no mobile of its own; else it is left out), and a word in a role column that
names no role is left out, the line given the list's role. A name's header
word exactly comes before one in other words, and "שם הסניף", "שם מנהל",
"שם האב" or "Username" is never the person's, nor "שם תפקיד" (the role's),
while "שם / תפקיד" is; first and last names come before a name's header in
other words only together. "שם" beside "שם משפחה" is the first name, and the
two are joined; a second column of single words joins the name only when it
varies, holds no digits and isn't past the phone. In free text a mobile must
start with 0, 972, +972 or 00972 (Excel's dropped zero only from a sheet's
cell's first group, so a 9-digit ID starting with 5 is never a phone, and no
number of another country is read as one, while "+054…" and "001 050-…" are
no country's), every other number, Excel's "5.01E+08" and a number's label
(`ת.ז`, `מס' עובד`, `שכר:`, `דרכון`) leave the name (`dropped`), but one or
two digits right after its words ("דנה כהן 2"); a role is read at the line's
end or start, a named role of one word only as a field of its own or after a
name of two words, so a role named like a first name or a surname ("בר") is
never read off "בר כהן", and a name line followed by its number line is one
person. Names go through `parseTeamName`, phones
through `normalizeIsraeliMobile`; owners and accountants are one by one,
roles above the viewer's rank, with pay or held are refused with the invite
form's reasons, and past `PEOPLE_IMPORT_MAX` (300) no line is drawn. The
same number twice is one person (`sameLine`) by the same name and the same
role, written on the line or the list's (the first line sent, as naming it
when either does), else a conflict (`duplicate`).
`importRolesOf` builds the roles from `inviteChoices` and the business's
words (owners and accountants one at a time, `given` when the viewer
invites them on the invite form, an owner alone), `againstTeam` checks the
paste against the team the page loaded (a member, or an invite with a link,
an owner's or an accountant's, or one the viewer may not change, is left
out whatever its line says; an invite with no
link yet is updated, its role kept when the line names none; from the
console, a line it would write whose number the database found on another
business's staff, its third argument, is to fix, `elsewhere`, until it is
removed), `writtenRoleOf` is the role an invite ends with by the database's
answer for its row (null for one made meanwhile, whose role the screen never
read), and `peopleImportRows` is what the server takes again. On the Team
screen (`/team/import`, part 5) `teamKnownOf` is the `KnownTeam` from the
team that screen reads (`buildTeam`): an invite is `touchable` only when the
viewer would make its link now (`canResendInvite`, and a role that sees pay
only for an owner), and `importsPeople` says whether a viewer imports at
all (a staff role among the invite form's choices that isn't an owner's
alone), so the import and the rows leading to it open only then. `pasted-text.ts` holds
what it shares with the menu's reader (`clean`, the marks, `readsBackwards`)
and `westernDigits` for Arabic-Indic digits; `staff-list.ts` exports
`wordKey` and `builtInRoleWord` ("מנהל/ת", "עובד/ת", "employee", and two
words read whole: "מנהלת חשבונות", "בעלת העסק", "אחראי משמרת", a shift
lead a manager as אחמ"ש is, though a business's own role of that name comes
first), and the wizard's `STAFF_LIST_MAX` (60) and `StaffEntry`. Since part 6 the console's
new-business wizard reads its staff list with the same reader
(`parseStaffList` in `business.ts`, which `parseNewBusiness` runs): a header
row, an ID column, direction marks, Excel's dropped zero, names through
`parseTeamName` and each problem as the import has it, against
`staffRolesOf` (every role, none blocked: a line naming an owner or an
accountant, which the import holds for one by one, carries the role it
named, `role` on the problem, and the wizard invites them), the app's words
for the roles (`labels`, from `app.roles` in the viewer's language, so
"ניהול" and "צוות" read too) and the numbers the database found on another
staff (`elsewhere`, whose staff lines are to fix until they go). The same
number twice is one person by the same name and role, an owner's line
included, else a `duplicate` naming the first line with it; the same name
with another number is a `sameNameList` note on both, an owner's and an
accountant's lines among them. A line above the header row with a mobile
in it (the import marks such a title `mobile`, and leaves it out) is to fix
in the wizard, `beforeHeader`, so a person typed above a pasted sheet is
never left out unsaid.

`setup.ts` is the console's checklist of a business just opened (opened,
owner, staff, address), each item from the business as stored, and the rule
for "staff" it shares with the owner's first steps: managers and workers
(`SETUP_STAFF_ROLES`, `isSetupStaff`, `hasStaff`), owners counted apart and
an accountant outside. `first-steps.ts` is the owner's own list on Today, by
module (`FIRST_STEP_MODULE`: the team and the business's details always, job
roles and shifts and the first publish with scheduling, people in departments
with lists once there are departments, the clock's code with the time clock):
`firstSteps` works each out from facts, `firstStepHref` is the screen that
does it, and the clock's code is optional (`OPTIONAL_STEPS`), shown and never
counted (`stepsLeft`), so it never keeps the card open. Hiding it is kept on
the device, in `FIRST_STEPS_HIDDEN_COOKIE` (`firstStepsHidden`,
`withFirstStepsHidden`: the businesses' ids, the latest last), by its owner
alone, as themselves (`firstStepsHideRefusal`).

`manage-access.ts` is who manages the business on /manage (the roles plan's
R7): `manageReach` (edit at `manage.edit`, view at `manage.view`, else
none), `settingsPermission` (the module's own edit a module's settings need
besides it, as the database's `private.settings_perm`), and
`manageReadOnly`, why a screen there shows without saving: a view session,
the role at view, or the module's edit missing; and `readsEveryLogArea`,
whether someone reads every area's rows of the activity log
(`LOG_AREA_PERMISSIONS`, the areas of the database's `private.log_perm`,
kept equal by `tooling/log-families.test.ts`).

`availability-form.ts` is the worker's availability form free of React:
where Shabbat cuts the week (`shabbatLimits`, `shabbatConflict`), the checks
behind each error (`parseAvailabilityForm`, `dayProblems`), and the hours a
day opens with. An empty day opens with the business's own shifts that day
(`suggestedDay`, from the hours of its shift pattern, `ShiftHours` by
`shiftHoursOf`, read by weekday with `shiftsOn` as the builder draws a week):
from the earliest start to the latest end, each shift first cut where the
form's Shabbat rules cut the day (Friday ends by candle lighting, Saturday
starts from havdalah) and one wholly inside Shabbat left out. Hours kept as
suggested so cover every shift that day that Shabbat leaves whole, and the
fill from availability can put the person on any of them; a shift Shabbat
cuts stays open there with its time named. Shifts around the clock give two
ranges that meet at the last shift's start, since a range is shorter than a
day. A day with no shift, or none that Shabbat leaves, opens with the usual
day as before: 09:00–17:00, Friday 08:00 until 15:00 or candle lighting,
Saturday from havdalah until 23:30. The day's sheet lists each shift's own
hours, never cut by Shabbat, since they are named as the shift's, and leaves
out one wholly inside Shabbat (`shiftHoursOn`), so someone who can't work all
of them knows where to cut; the sheet's Shabbat line says what can be marked.
"הוספת שעות" (`suggestedRange`) reads the day's hours and
adds hours that overlap none of them whenever any can: what the day's shifts
still need (after the day's hours if any is free, so 09:00–17:00 at the
restaurant gets 17:00–23:30), then the usual evening, then the day's latest
free hours inside Shabbat's limits; only a day with no free minute (a summer
Saturday from havdalah to midnight) gets the usual hours all the same, and
the day's check names the overlap. The form has no rule for holidays, so the
suggestion has none.

`absences.ts` is days away (known issue 19): the form's checks, the days by
kind for payroll, and who is away when, never why. Someone is away during a
shift (`awayDuring`) when they are away on its day, or, for a shift that ends
after midnight, on the day after; one that ends at 00:00 exactly is its own
day's only. The schedule reads every warning about one shift through it:
the shift sheet's lists, the copy, the fill's rule, and a shift's card in the
builder and on the schedule tab (`assigneesAway`, who on the shift is away
during it, since 25 November 2026, known issue 107). The sheet, the copy and
the cards say it in the sheet's words, "לא בעבודה בשעות המשמרת"; the fill
says its rule in its own ("לא בעבודה" beside a name). A day's own line in the
builder ("לא בעבודה: {names}", `awayByDay`) and Today still read the day
alone, so a night into a day away is said on its card and not on its day.
For the nights, days away are read to the day after the last week shown
(`awayWindow`): the builder's week and the day after it, the tab's two
weeks and the day after them.

`copy-week.ts` is "העתקה מהשבוע שעבר" on the schedule builder: last week as it
stands once built (`copySourceOf`), what copying it onto the week on the
screen does day by day and who it leaves out and why (`copyLastWeek`, its
rules numbered; someone away during a shift, a night past midnight into a
day away included, by `awayDuring`), and whether the week was saved since
the screen copied into it (`copiedOver`). It changes the screen only; the
week's own write checks everything again when it is saved.

`fill-week.ts` is "מילוי מהזמינות", the builder's fill of the week's open
places from the staff's availability (`fillFromAvailability`, its rules
numbered). It only appends people to shifts still to start that need more:
never moving, removing or re-positioning anyone, never changing a shift. It
places only staff who sent an answer whose ranges cover the whole shift
(someone who sent none never, though the manager can still put them on a
shift by hand: Orel, 25 November 2026), and only while every `FillRule`
holds, checked in this order: not away during it (`awayDuring` in
`absences.ts`: its day, and the next day for a night past midnight, as the
shift sheet's lists (`shiftCandidates`) and the copy read it too; the builder
reads days away over `awayWindow`, the week and the day after it), never two
shifts at once, one shift a day, 8 hours between shifts
(`LIMITS.restBetween`, `FILL_REST_HOURS` in the sheet's words, in real time
as payroll measures it, so a night the clocks change in counts the hour they
skip or repeat), at most
`FILL_MAX_DAYS` (6) days, and at most the week's hours (`weekHours`, the
number the sheet names: the business's scheduling setting `fillWeekHours`,
which owners and managers set on /manage/scheduling, 42 by default,
`FILL_WEEK_HOURS`, from 4 up to `FILL_WEEK_HOURS_MAX`, 58; what is already on
the screen counts, and placing by hand has no cap). The week's hours are
counted on the wall clock, as the builder's totals count them. A minor is
placed like everyone else (Orel, 25 November 2026): the fill has no rule
of its own for minors, the manager is responsible as when placing by hand
(the fill's sheet says, in every business, that it checks nobody's age),
and payroll's flags for minors still read the hours worked. Last week, when
it is the week just before, and next week's first days (`nextWeekEdge` in
`running-week.ts`: its first two days with people on them, only while the
builder shows the week running now) count as spans only, placed in time by
`shiftSpan` in `schedule.ts` (minutes from the week's first midnight on
`daysApart`, so last Saturday is day -1 and next Sunday day 7; the copy reads
it too) and, for the rest between shifts, by `instantIn`, as the database's
`private.shift_span` places a shift. The scarcest place goes first; the
person with the fewest hours this week takes it, then the fewest of that kind
of shift, the fewest shifts, the fewest hours last week, then a rotation that
changes every week, never the team's order or the alphabet, so the same
screen always gives the same fill. Each goes on in the position they held
most last week on that kind of shift. Every place left open says why
(`FillWhy`: Shabbat with its time when no answer covers it, of anyone on it,
whether the fill or the manager put them there, or of anyone else; nobody
else covers it; or each one who does with the first rule that stopped them;
a shift into Shabbat names it beside the other two as well). `nobody` means
nobody else: when anyone is on the shift after the fill, whoever put them
there, the sheet says nobody else covers it, and a Shabbat time beside
`nobody` or `blocked` comes without saying no answer covers the shift. The
database checks only that nobody works two shifts at once, never these
rules: they are the fill's own (ROADMAP known issue 108). The builder's
"מילוי מהזמינות" shows what a fill would do in a sheet before anything
changes on the screen, and puts it there only
(`app/(app)/schedule/build/fill-sheet.tsx`), ending with each one who
answered (`byPerson`: an answer with no hours in it included), fewest shifts
first, with their shifts, hours and how many of them the fill gave.

Import as `@domain/<file>`.
