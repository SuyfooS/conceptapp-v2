import type { Role } from "@domain/modules";
import type { NamedRole } from "@domain/role-access";
import type { Translator } from "../wording";

/**
 * Someone's role as the team's server-drawn screens name it (the roles
 * plan's R11b): a role the business named by its name, with the role it is
 * built on ("אחראי משמרת (עובד/ת)"); else the role in the business's words.
 * These screens speak the app's Hebrew (`translator`), so a named role goes
 * by its Hebrew name.
 */
export function roleLabel(
  t: Translator<"app">,
  role: Role,
  named?: Pick<NamedRole, "name"> | null,
): string {
  const base = t(`team.roles.${role}`);
  return named ? t("team.namedRole", { name: named.name, role: base }) : base;
}
