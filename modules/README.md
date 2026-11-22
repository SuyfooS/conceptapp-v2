# modules/

One folder per product module, named by its key in the database enum
`module_key`: `scheduling/`, `time_clock/`, `reservations/`, `storefront/`,
`notifications/`, `lists/`, `chat/`, `order_taking/`, `employee_files/`.

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
- `page`: for a module with no tab and no mode, where its own screen is and
  the lowest role that opens it (the hiring file's `/me/file`, profile H5a).
  `canOpenModule` reads it as it reads `nav`, still never for someone off the
  staff, and Today's part, when it has one, leads there. It sits under a
  screen `proxy.ts` guards already (`tooling/proxy.test.ts`).
- `permissions` (e.g. `schedule.publish`), each in the module's own `area`,
  with the lowest role that holds it by default and what it `requires`
  (`schedule.edit`). With the team's and the management page's
  (`CORE_PERMISSIONS` in `@domain/permissions`) they are `permissions` here,
  the rows of `public.permission_keys` (`permissions.db.test.ts`). Who holds
  what is the database's answer (`public.my_permissions`); the screens ask
  `holdsPermission` over it and keep no defaults of their own.
- `settings`: a Zod schema where every field has a default. Read with
  `readModuleSettings` (invalid fields fall back to defaults), written
  through `validateModuleSettings` (invalid input throws). A field's
  `.meta()` says who edits it (`level`), and for a text typed left to right,
  how (`entry`: a link, a phone or digits, drawn with their keyboard; the
  field tidies what is typed, and what it outputs is saved).

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

## Modes

A module may have a `mode` (waiter mode, P4): its own items in the same shell
while the path is the mode's `href` or under it, at most five
(`MAX_MODE_NAV`), the same on every device, each labelled
`modules.<key>.mode.<item>` in both languages (`modules/registry.test.ts`).
`entries` says where its ways in show: Home's card (`"home"`, with a
`homeWidget`), the clock's live shift (`"clockIn"`) and the profile (`"me"`).
Which items a person gets, where the ways in lead and what they say is the
module's own read (`app/(app)/modes.ts`, a table by module key); no page
checks a mode by hand. Every top screen of a mode leads back to the app
(`app.mode.leave`), and `proxy.ts` guards its `href` as it does a tab's.
