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
a new entry, with its twin in `public.minimum_wages`.

Import as `@domain/<file>`.
