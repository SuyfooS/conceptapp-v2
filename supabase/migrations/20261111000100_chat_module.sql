-- Chat, part 1 of 2 (C1 of the chat plan): the module's key. A value added to
-- an enum can't be used in the transaction that adds it (55P04), and each
-- migration file runs as one, so everything that uses it is in the next file
-- (20261111000200_chat.sql). Appended, so the enum reads as MODULE_KEYS in
-- @domain/modules does (modules/registry.test.ts compares them).
alter type public.module_key add value if not exists 'chat';
