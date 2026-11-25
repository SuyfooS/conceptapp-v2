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

`copy-week.ts` is "העתקה מהשבוע שעבר" on the schedule builder: last week as it
stands once built (`copySourceOf`), what copying it onto the week on the
screen does day by day and who it leaves out and why (`copyLastWeek`, its
rules numbered), and whether the week was saved since the screen copied
into it (`copiedOver`). It changes the screen only; the week's own write
checks everything again when it is saved.

`fill-week.ts` is "מילוי מהזמינות", the builder's fill of the week's open
places from the staff's availability (`fillFromAvailability`, its rules
numbered). It only appends people to shifts still to start that need more:
never moving, removing or re-positioning anyone, never changing a shift. It
places only staff who sent an answer whose ranges cover the whole shift, and
only while every `FillRule` holds, checked in this order: not away during it
(`awayDuring` in `absences.ts`: its day, and the next day for a night past
midnight), a minor only within 08:00–20:00 (`FILL_MINOR_HOURS`, payroll's
stricter reading) and for at most 8 hours (7 on a Friday), never two shifts
at once, one shift a day, 8 hours between shifts (`LIMITS.restBetween`), at
most `FILL_MAX_DAYS` (6) days, and at most the week's hours (`weekHours`, 42
by default, `FILL_WEEK_HOURS`, up to `FILL_WEEK_HOURS_MAX`, 58; a minor 40).
Last week, when it is the week just before, and next week's first days count
as spans only, placed in time by `shiftSpan` in `schedule.ts` (minutes from
the week's first midnight on `daysApart`, so last Saturday is day -1 and next
Sunday day 7; the copy reads it too). The scarcest place goes first; the
person with the fewest hours this week takes it, then the fewest of that kind
of shift, the fewest shifts, the fewest hours last week, then a rotation that
changes every week, never the team's order or the alphabet, so the same
screen always gives the same fill. Each goes on in the position they held
most last week on that kind of shift. Every place left open says why
(`FillWhy`: Shabbat with its time, nobody covers it, or each one who does with
the first rule that stopped them). `weekMinors` is who counts as a minor all
week, ids only. The database checks only that nobody works two shifts at
once, never these rules: they are the fill's own.

Import as `@domain/<file>`.
