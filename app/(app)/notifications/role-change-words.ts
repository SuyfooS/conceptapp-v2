import "server-only";
import type { NotificationLine } from "@domain/notifications";
import { type AccessExtra, editOrView } from "@domain/role-access";
import { type AppWording, translator } from "../wording";

type RoleLine = Extract<NotificationLine, { kind: "role.changed" }>;

/**
 * A line about a role's permissions in words, the inbox's and the phone's
 * alike (the roles plan's R10; it never reaches a phone, but its words are
 * the same everywhere): the title names the reader's role, in the business's
 * words or by the name the business gave it, and `change` says what the area
 * gives and takes now, with the area's and its switches' names as the roles
 * screen says them ("מעכשיו עורכים בסידור", "מעכשיו בלי פרסום הסידור").
 * `list` joins the switches' names in the reader's language.
 */
export function roleChangeWords(
  line: RoleLine,
  wording: AppWording,
  list: (items: string[]) => string,
): { title: string; change: string } {
  const t = translator(wording, "app.notifications.kinds.role.changed");
  const tRoles = translator(wording, "app.manage.roles");
  const tModules = translator(wording, "modules");
  const tTeam = translator(wording, "app.team.roles");
  const area = editOrView(line.area)
    ? tModules(`${line.area}.name`)
    : tRoles(`areas.${line.area}`);
  const extras = (items: readonly AccessExtra[]) =>
    list(items.map((extra) => tRoles(`extras.${extra}.phrase`)));
  const { level, on, off } = line.change;

  let change: string;
  switch (level) {
    case "edit":
      change =
        on.length > 0
          ? t("editWith", { area, extras: extras(on) })
          : t("edit", { area });
      break;
    case "view":
      change =
        off.length > 0
          ? t("viewWithout", { area, extras: extras(off) })
          : t("view", { area });
      break;
    case "none":
      change = t("none", { area });
      break;
    default:
      // The level stayed: only switches came or went.
      change =
        on.length > 0 && off.length > 0
          ? t("extraBoth", { on: extras(on), off: extras(off) })
          : on.length > 0
            ? t("extraOn", { extras: extras(on) })
            : t("extraOff", { extras: extras(off) });
  }

  const role =
    line.role.kind === "base" ? tTeam(line.role.base) : line.role.name;
  return { title: role ? t("title", { role }) : t("titleOwn"), change };
}
