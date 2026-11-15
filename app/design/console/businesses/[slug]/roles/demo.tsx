"use client";

import type {
  RolesActions,
  RolesData,
  RolesPaths,
} from "../../../../../(app)/manage/roles/roles-types";
import { RolesView } from "../../../../../(app)/manage/roles/roles-view";

// A stand-in for the console's action: every change of an open area goes
// through at once, nothing is stored, and a reload shows the demo again.
const demoActions: RolesActions = {
  setArea: async () => ({ ok: true }),
};

/** The console's roles screen over the demo's rows, with an action that stores nothing. */
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
