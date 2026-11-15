"use client";

import type {
  RolesActions,
  RolesData,
} from "../../../../(app)/manage/roles/roles-types";
import { RolesView } from "../../../../(app)/manage/roles/roles-view";

/** How many roles the demo added, for each one's key. */
let added = 0;

// Stand-ins for the demo: every change goes through at once, nothing is
// stored, and a reload shows the demo's own roles again.
const demoActions: RolesActions = {
  setArea: async () => ({ ok: true }),
  addRole: async () => {
    added += 1;
    return { ok: true, key: `demo-role-${added}` };
  },
  removeRole: async () => ({ ok: true }),
};

/** The roles screen over the demo's mock rows, with actions that store nothing. */
export function RolesDemo({
  data,
  initialRole,
}: {
  data: RolesData;
  initialRole?: string;
}) {
  return (
    <RolesView
      data={data}
      actions={demoActions}
      paths={{
        place: "app",
        manage: "/design/shell/manage",
        access: "/design/shell/manage/access",
        team: "/design/shell/team",
      }}
      initialRole={initialRole}
    />
  );
}
