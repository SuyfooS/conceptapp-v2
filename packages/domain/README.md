# packages/domain

Pure business logic with unit tests and no framework imports: Shabbat
boundaries (candle lighting / havdalah by coordinates), reservation slot
availability, hours and overtime maths. Nothing here may import from
`app/`, `modules/` or `packages/db`.

The profile's checks (Israeli ID, passports and other documents, banks and
Masav's account rules, the pasted-number splitter, address) take their rules
from dated lists: a new source is a new date and a new entry, by PR.

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

Import as `@domain/<file>`.
