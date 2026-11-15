// Mock rows for the demo of roles and permissions (roles plan R0): the demo
// restaurant's people by role, as its owner sees them, with one role the
// business named itself. The role's name and the people's stand in for
// database data, so their Hebrew stays here; tooling/hebrew-literals.ts
// allows this file.

import {
  ACCESS_AREAS,
  AREA_MODULE,
  defaultAccess,
  withExtra,
  withLevel,
} from "@domain/role-access";
import { manifestFor } from "@modules/registry";
import type {
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

export const demoRoles: RolesData = {
  // Every area: the demo restaurant has each of these modules on, chat
  // included (/design/chat).
  areas: ACCESS_AREAS.map((key) => {
    const module = AREA_MODULE[key];
    return {
      key,
      icon: module ? (manifestFor(module).nav?.icon ?? null) : null,
    };
  }),
  roles: [
    {
      key: "manager",
      base: "manager",
      name: null,
      people: [person("shiran")],
      access: defaultAccess("manager"),
      // As /design/shell/manage/access shows it: managers on.
      seesPay: true,
    },
    {
      key: "worker",
      base: "worker",
      name: null,
      people: ["noa", "maya", "shira", "omer"].map(person),
      access: defaultAccess("worker"),
      seesPay: false,
    },
    {
      key: "shift-lead",
      base: "worker",
      name: "אחראי משמרת",
      people: ["yoav", "itay"].map(person),
      access: shiftLead,
      seesPay: false,
    },
  ],
  owners: [person("uri")],
  accountants: [{ name: demoAccountantName, photo: null }],
  viewOnly: false,
  // Chat is on, so documents are (as /design/shell/manage/access says).
  documents: true,
};
