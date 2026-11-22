-- The hiring file, part 1 of 2 (profile H4, issue #82): the module's key. A
-- value added to an enum can't be used in the transaction that adds it
-- (55P04), and each migration file runs as one, so everything that uses it is
-- in the next file (20261126000200_employee_files.sql). Appended, so the enum
-- reads as MODULE_KEYS in @domain/modules does (modules/registry.test.ts
-- compares them).
alter type public.module_key add value if not exists 'employee_files';
