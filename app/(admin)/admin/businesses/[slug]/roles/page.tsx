import { getBusinessSetup } from "@db/admin";
import { getBusinessModulesForTeam } from "@db/module-settings";
import { getRoleMatrixForTeam, getRolePeopleForTeam } from "@db/roles";
import { enabledModules, permissionInUse } from "@domain/modules";
import { accessOrder, PAY_PERMISSION } from "@domain/payroll-access";
import { consoleRolesAccess } from "@domain/platform";
import { manifests, permissions } from "@modules/registry";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { RolesView } from "@/app/(app)/manage/roles/roles-view";
import { currentPlatformStaff } from "../../../../staff";
import {
  addTeamRoleAction,
  archiveTeamRoleAction,
  renameTeamRoleAction,
  restoreTeamRoleAction,
  setTeamRoleAreaAction,
} from "./actions";
import { consoleRolesData } from "./roles-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.manage.roles");
  return { title: t("title") };
}

/**
 * Roles and permissions in a business, from the console (the roles plan's
 * R2; Orel, 15 November 2026, Q5: the owner, and the ConceptApp team from
 * the console): the owner's screen over the business's own managers and
 * workers, as its database answers (`public.role_permission_matrix`, read
 * with the secret key once the person is known to be on the team; before
 * that migration, the declarations' defaults), and its way back to the
 * business. Gated as "מי רואה שכר" is: every team role that reads businesses
 * sees it, and one that may invite people changes it (`consoleRolesAccess`),
 * in a demo business too, whose reset puts it back. An area changes only
 * once its phase opens it, and says so until then. Pay stays on "מי רואה
 * שכר", which it links to where pay opens something. "הוספת תפקיד" adds a role
 * the business names (R11a), renamed and archived here too, once the
 * database takes them. Not found off the team or for an unknown business.
 * `?role=worker` opens that role first (on a phone, on its own screen).
 */
export default async function TeamRolesPage({
  params,
  searchParams,
}: PageProps<"/admin/businesses/[slug]/roles">) {
  const staff = await currentPlatformStaff();
  const may = consoleRolesAccess(staff?.role ?? null);
  if (!staff || may === null) notFound();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const business = await getBusinessSetup(slug);
  if (!business) notFound();
  const t = await getTranslations("admin.setup.people");
  // Read with the secret key, only now that they are on the team.
  const [modules, matrix, people] = await Promise.all([
    getBusinessModulesForTeam(business.id),
    getRoleMatrixForTeam(business.id, permissions),
    getRolePeopleForTeam(business.id),
  ]);
  const enabled = enabledModules(manifests, modules);
  const href = `/admin/businesses/${business.slug}`;
  const role = typeof query.role === "string" ? query.role : undefined;
  return (
    <RolesView
      data={consoleRolesData({
        matrix,
        enabled,
        // Members only: an invite isn't in a role until it is claimed. By
        // name, as the owner's screen lists them.
        people: people.sort(accessOrder).map((person) => ({
          name: person.name || t("noName"),
          role: person.role,
          namedRole: person.namedRole,
        })),
        viewOnly: may !== "change",
        documents: enabled.includes("chat"),
      })}
      // Each write names the business the screen is drawn for.
      actions={{
        setArea: setTeamRoleAreaAction.bind(null, business.id),
        ...(matrix.addsRoles
          ? {
              addRole: addTeamRoleAction.bind(null, business.id),
              renameRole: renameTeamRoleAction.bind(null, business.id),
              archiveRole: archiveTeamRoleAction.bind(null, business.id),
              restoreRole: restoreTeamRoleAction.bind(null, business.id),
            }
          : {}),
      }}
      paths={{
        place: "console",
        business: href,
        name: business.name,
        // Where pay opens something (the time clock's hours, chat's
        // documents), as the business's page offers it.
        access: permissionInUse(manifests, enabled, PAY_PERMISSION)
          ? `${href}/access`
          : null,
        team: `${href}#people`,
      }}
      initialRole={role}
    />
  );
}
