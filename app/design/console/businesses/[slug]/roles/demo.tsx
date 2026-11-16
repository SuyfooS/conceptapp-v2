"use client";

import type {
  RolesActions,
  RolesData,
  RolesPaths,
} from "../../../../../(app)/manage/roles/roles-types";
import { RolesView } from "../../../../../(app)/manage/roles/roles-view";

/** How many roles the demo added, for each one's key. */
let added = 0;

// Stand-ins for the console's actions: every change of an open area goes
// through at once, as adding, renaming, removing and bringing back a role
// the business named do (R11a), nothing is stored, and a reload shows the
// demo again.
const demoActions: RolesActions = {
  setArea: async () => ({ ok: true }),
  setAreas: async () => ({ ok: true }),
  addRole: async () => {
    added += 1;
    return { ok: true, key: `demo-role-${added}` };
  },
  renameRole: async () => ({ ok: true }),
  archiveRole: async () => ({ ok: true }),
  restoreRole: async () => ({ ok: true }),
};

/** The console's roles screen over the demo's rows, with actions that store nothing. */
export function ConsoleRolesDemo({
  data,
  paths,
  initialRole,
}: {
  data: RolesData;
  paths: RolesPaths;
  initialRole?: string;
}) {
  return (
    <RolesView
      data={data}
      actions={demoActions}
      paths={paths}
      initialRole={initialRole}
    />
  );
}
