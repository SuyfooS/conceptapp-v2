# packages/db

Database schema (Drizzle), migrations, typed server queries and the RLS
tests (pgTAP). Arrives in phase 0, chunk 3.

Every tenant table carries `business_id`; row-level security filters on it
through three SQL helpers: `is_member`, `has_role`, `has_perm`. The test
"a worker of business A cannot read business B" must always pass.

Import as `@db/<file>`.
