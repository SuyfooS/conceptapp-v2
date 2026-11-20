// Mock rows for the demo of roles and permissions (roles plan R0): the demo
// restaurant's people by role, as its owner sees them, with one role the
// business named itself. The role's name and the people's stand in for
// database data, so their Hebrew stays here; tooling/hebrew-literals.ts
// allows this file.

import { moduleIcon } from "@domain/modules";
import {
  ACCESS_AREAS,
  AREA_MODULE,
  defaultAccess,
  extrasOf,
  withExtra,
  withLevel,
} from "@domain/role-access";
import { manifestFor } from "@modules/registry";
import type {
  EditableRole,
  RolePerson,
  RolesData,
} from "../../../../(app)/manage/roles/roles-types";
import { demoAccountantName } from "../../clock/pay/data";
import { teamMembers } from "../../data";

function person(id: string): RolePerson {
  const member = teamMembers.find((m) => m.userId === id);
  if (!member?.name) throw new Error(`No demo person ${id}`);
  return { name: member.name, photo: member.photo };
}

/**
 * The shift lead: built on workers, they build the schedule but leave
 * publishing it to the owner and the manager (Q3), run the lists, sending
 * included, and see the team screen.
 */
const shiftLead = withExtra(
  withLevel(
    withLevel(
      withLevel(defaultAccess("worker"), "scheduling", "edit"),
      "lists",
      "edit",
    ),
    "team",
    "view",
  ),
  "schedule.publish",
  false,
);

/**
 * The role the business named, "אחראי משמרת", built on workers, held by two
 * of its workers here, with Dana's invite to it waiting, as on the team
 * twin, and the shift's opening sent to it, as on the lists' twin (R11d).
 * The console's twin shows it held by nobody and waited for by none, and
 * with `?state=lists` held back by that list alone.
 * It starts as workers are (R10), so its scheduling, lists and team are
 * marked "שונה".
 */
export const demoShiftLead: EditableRole = {
  key: "shift-lead",
  base: "worker",
  name: "אחראי משמרת",
  nameEn: null,
  people: ["yoav", "itay"].map(person),
  invited: 1,
  lists: 1,
  access: shiftLead,
  start: defaultAccess("worker"),
  seesPay: false,
};

/**
 * Orel's case (L6b-2; 16 November 2026): "עובד בכיר", built on workers,
 * for the kitchen's Noa and Omer. Lists stay at view, so they fill what is
 * sent to them and no more, with "תיקון רשימות שנסגרו" on: one of them
 * closes the kitchen's list for both, and either fixes it for a while after
 * (the lists' twins `?state=fix-worker` and `/lists/worker?state=fixable`).
 * It starts as workers are (R10), so its lists are marked "שונה". On the
 * roles twin with `?state=senior` only, so the twin's other roles read as
 * before.
 */
export const demoSenior: EditableRole = {
  key: "senior",
  base: "worker",
  name: "עובד בכיר",
  nameEn: null,
  people: ["noa", "omer"].map(person),
  invited: 0,
  lists: 0,
  access: withExtra(defaultAccess("worker"), "lists.fix", true),
  start: defaultAccess("worker"),
  seesPay: false,
};

export const demoRoles: RolesData = {
  // Every area: the demo restaurant has each of these modules on, chat
  // included (/design/chat), and taking orders since its screens (waiter
  // mode P2), as the local seed's restaurant does.
  // Each open for changes, as the screen will be once every area's phase
  // has moved it (the roles plan's R3 to R8).
  areas: ACCESS_AREAS.map((key) => {
    const module = AREA_MODULE[key];
    return {
      key,
      icon: module ? moduleIcon(manifestFor(module)) : null,
      open: true,
      // Every switch, as the database knows each once its migration is in.
      extras: [...extrasOf(key)],
    };
  }),
  roles: [
    {
      key: "manager",
      base: "manager",
      name: null,
      nameEn: null,
      people: [person("shiran")],
      invited: 0,
      lists: 0,
      access: defaultAccess("manager"),
      start: defaultAccess("manager"),
      // As /design/shell/manage/access shows it: managers on.
      seesPay: true,
    },
    {
      key: "worker",
      base: "worker",
      name: null,
      nameEn: null,
      people: ["noa", "maya", "shira", "omer"].map(person),
      invited: 0,
      lists: 0,
      access: defaultAccess("worker"),
      start: defaultAccess("worker"),
      seesPay: false,
    },
    demoShiftLead,
  ],
  owners: [person("uri")],
  accountants: [{ name: demoAccountantName, photo: null }],
  viewOnly: false,
  // Chat is on, so documents are (as /design/shell/manage/access says).
  documents: true,
};

/**
 * The same, with "עובד בכיר" after the shift lead (`?state=senior`), its
 * two people no longer among the workers.
 */
export const demoRolesWithSenior: RolesData = {
  ...demoRoles,
  roles: [
    ...demoRoles.roles.map((role) =>
      role.key === "worker"
        ? { ...role, people: ["maya", "shira"].map(person) }
        : role,
    ),
    demoSenior,
  ],
};
