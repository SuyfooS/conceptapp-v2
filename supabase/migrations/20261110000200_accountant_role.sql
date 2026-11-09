-- The accountant (payroll P2; Orel, 8 November 2026, issue #1): someone who does
-- the books, in one business or several, from outside the staff. What they may
-- read and do is in 20261110000300_payroll_access.sql.
--
-- Alone in its file: a value added to an enum can't be used in the transaction
-- that adds it (55P04), and the next migration uses it. Appended, so the enum
-- reads owner, manager, worker, accountant (`ROLES` in @domain/modules, which
-- modules/registry.test.ts compares with the generated types).
alter type public.member_role add value if not exists 'accountant';
