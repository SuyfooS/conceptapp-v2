import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { baseWording, translator } from "../../wording";
import {
  addRoleAction,
  archiveRoleAction,
  renameRoleAction,
  restoreRoleAction,
  setRoleAreaAction,
  setRoleAreasAction,
} from "./actions";
import { currentRoles } from "./roles";
import { RolesView } from "./roles-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.manage.roles");
  return { title: t("title") };
}

/**
 * Roles and permissions, the owner's own screen (the roles plan's R9; Orel's
 * answers of 15 November 2026, issue #1): R0's view over the business's
 * rules as its database answers them, the areas whose module is on, each
 * changed at once with its undo once its phase opened it, the business's own
 * people in each role, and pay where it always was, on "מי רואה שכר", which
 * it leads to (critique 20). For owners only, and the team viewing as one,
 * read only; the not-found screen for everyone else, managers included.
 * "הוספת תפקיד" adds a role the business names (R11a), which is then renamed
 * and archived here, once the database takes them.
 * `?role=worker` opens that role first (on a phone, on its own screen).
 */
export default async function RolesPage({
  searchParams,
}: PageProps<"/manage/roles">) {
  const wording = await currentWording();
  const tTeam = translator(wording, "app.team");
  const [roles, member, query] = await Promise.all([
    currentRoles(tTeam("noName")),
    currentMember(),
    searchParams,
  ]);
  if (!roles || !member?.membership) notFound();
  const role = typeof query.role === "string" ? query.role : undefined;
  const business = member.membership.business.id;
  return (
    <RolesView
      data={roles.data}
      // Each write names the business the screen is drawn for: one sent after
      // a switch to another business is refused there (payroll P3b).
      actions={{
        setArea: setRoleAreaAction.bind(null, business),
        setAreas: setRoleAreasAction.bind(null, business),
        ...(roles.addsRoles
          ? {
              addRole: addRoleAction.bind(null, business),
              renameRole: renameRoleAction.bind(null, business),
              archiveRole: archiveRoleAction.bind(null, business),
              restoreRole: restoreRoleAction.bind(null, business),
            }
          : {}),
      }}
      paths={{
        place: "app",
        manage: "/manage",
        // Where pay opens something (the time clock's hours, chat's
        // documents), as /manage offers it.
        access: roles.payAccess ? "/manage/access" : null,
        team: "/team",
      }}
      initialRole={role}
    />
  );
}
