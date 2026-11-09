-- Lists, part 1 of 2: the module's key. A value added to an enum can't be used
-- in the transaction that adds it, and each migration file runs as one, so
-- everything that uses it is in the next file (20261109000600_lists.sql).
alter type public.module_key add value if not exists 'lists';
