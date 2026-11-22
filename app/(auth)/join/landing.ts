import {
  canOpenModule,
  enabledModules,
  type ModuleRow,
  type Role,
} from "@domain/modules";
import { manifestFor, manifests } from "@modules/registry";

/**
 * Where someone lands once they joined a business (profile H5b, default 11):
 * a worker or a manager on their hiring file's welcome, while the business
 * uses the file and they open it (`canOpenModule`), so the first thing they
 * see is what the business needs to pay them; an owner, an accountant, or
 * anyone in a business without it, on Today. `rows` are the business's
 * modules as the server read them just after the claim.
 */
export function landingAfterJoin(
  rows: readonly ModuleRow[],
  role: Role,
): "/me/file" | "/home" {
  const opens =
    role !== "owner" &&
    canOpenModule(
      manifestFor("employee_files"),
      enabledModules(manifests, rows),
      { role, perms: [] },
    );
  return opens ? "/me/file" : "/home";
}
