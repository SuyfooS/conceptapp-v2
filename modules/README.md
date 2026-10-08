# modules/

One folder per product module (`scheduling/`, `timeclock/`, `reservations/`,
`storefront/`, `notifications/`). Nothing here yet — the first module arrives
in phase 2.

Each module exports a single typed manifest (`manifest.ts`) and everything the
app needs to show, gate or configure the module comes from it:

- `key`, `name` (he / en), `requires` (other module keys)
- `nav` entries with the roles that see them
- `permissions` (e.g. `schedule.edit`) with default roles
- `settings`: a Zod schema with defaults — validated on every write
- `homeWidgets` and `onboarding` steps for the admin wizard

Rules:

1. Enabling a module for a business is a row in `business_modules`. Nothing else.
2. Nav, home widgets and settings forms are generated from enabled manifests.
   No page checks `if (business.hasReservations)` by hand.
3. Modules never import each other's internals. Shared reads go through
   `packages/db`; shared logic lives in `packages/domain`.
4. Every business-specific request becomes a setting or a module that all
   businesses get. Never per-business code.
