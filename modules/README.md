# modules/

One folder per product module, named by its key in the database enum
`module_key`: `scheduling/`, `time_clock/`, `reservations/`, `storefront/`,
`notifications/`.

Each module exports a single typed manifest (`manifest.ts`, built with
`defineManifest` from `@domain/modules`), and everything the app needs to
show, gate or configure the module comes from it:

- `key` and `requires` (other module keys; a module whose requirement is off
  counts as off)
- `nav`: href, icon name, lowest role that sees it, order. The label is
  `modules.<key>.name` in `messages/`; manifests hold no copy.
- `homeWidget`: the module's part of the Today screen, for roles from `minRole`
  up. Until it has a part of its own, as scheduling does, that is one quiet row
  (`modules.<key>.description` under the name)
- `permissions` (e.g. `schedule.publish`) with the lowest role that holds
  each by default
- `settings`: a Zod schema where every field has a default. Read with
  `readModuleSettings` (invalid fields fall back to defaults), written
  through `validateModuleSettings` (invalid input throws).

`registry.ts` lists the manifests in nav order. `registry.test.ts` checks
them against the database enum, the phone tab bar limit (home + 4) and the
message files; `tooling/proxy.test.ts` checks every module screen is
behind the sign-in guard in `proxy.ts`.

Rules:

1. Enabling a module for a business is a row in `business_modules`. Nothing else.
2. Nav, home widgets, module screens (`ModuleScreen` in `app/(app)`) and
   settings forms come from enabled manifests. No page checks
   `if (business.hasReservations)` by hand.
3. Modules never import each other's internals. Shared reads go through
   `packages/db`; shared logic lives in `packages/domain`.
4. Every business-specific request becomes a setting or a module that all
   businesses get. Never per-business code.
5. A module's own tables add `private.module_enabled(business_id, '<key>')`
   to their RLS policies, so switching a module off also closes its data.
