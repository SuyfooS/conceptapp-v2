import { manageReach } from "@domain/manage-access";
import { holdsPermission, isStaff } from "@domain/modules";
import { canWrite } from "@domain/view-as";
import { cache } from "react";
import { currentMember } from "../../member";
import { currentModules } from "../../modules";
import type { MenuReach } from "./menu-types";

/**
 * Who the menu's screens and actions are for, once per request (waiter mode
 * P2): someone on the staff of a business with taking orders on, as the
 * database lets them read it (`public.order_menu`), with whether they run
 * the menu (order_taking.edit: owners always, managers by default). Null for
 * anyone else, an accountant included, who gets the not-found screen. While
 * the team views the business as a role, the role's: its screens drawn as
 * that role has them, and nothing saves. The database decides every write
 * again.
 */
export const menuAccess = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (!member || !membership || !enabled.includes("order_taking")) return null;
  if (!isStaff(membership.role)) return null;
  const viewing = !canWrite(member.viewing);
  const runsMenu = holdsPermission(membership, "order_taking.edit");
  return {
    userId: member.userId,
    businessId: membership.business.id,
    role: membership.role,
    viewing,
    /** Holds order_taking.edit, or the viewed role does. */
    runsMenu,
    /** Saves anything on the menu: runs it, and isn't viewing. */
    edits: runsMenu && !viewing,
    /** Why only "נגמר" saves, if anything: a view session, or not running the menu. */
    readOnly: viewing ? "viewing" : runsMenu ? null : "menu",
    /**
     * Opens the management page, where the way in is: back goes there, and
     * for anyone else (a worker, by a link until the mode) to Today.
     */
    seesManage: manageReach(membership) !== null,
  } as const;
});

export type MenuAccess = NonNullable<Awaited<ReturnType<typeof menuAccess>>>;

/** What the views need of it: what the person may do, and why not. */
export function menuReach(access: MenuAccess): MenuReach {
  return {
    edits: access.edits,
    runsMenu: access.runsMenu,
    readOnly: access.readOnly,
    marks: !access.viewing,
  };
}
