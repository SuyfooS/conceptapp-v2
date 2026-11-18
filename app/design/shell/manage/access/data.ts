// Mock rows for the demo of who sees pay: the demo restaurant's people as its
// owner sees them. Names stand in for database data, so their Hebrew stays
// here; tooling/hebrew-literals.ts allows this file.

import type { AccessData } from "../../../../(app)/manage/access/access-types";
import { portraits } from "../../../portraits";
import { demoNamedRole } from "../../data";

/** The role the demo restaurant named, as the screen reads it (R11b). */
const shiftLead = {
  id: demoNamedRole.id,
  name: demoNamedRole.name,
  nameEn: demoNamedRole.nameEn,
};

export const demoAccess: AccessData = {
  roles: ["manager"],
  me: "uri",
  viewOnly: false,
  documents: true,
  people: [
    {
      userId: "uri",
      name: "אורי הדגמה",
      photo: null,
      role: "owner",
      namedRole: null,
      personal: false,
    },
    {
      userId: "galit",
      name: "גלית הדגמה",
      photo: null,
      role: "accountant",
      namedRole: null,
      personal: false,
    },
    {
      userId: "shiran",
      name: "שירן הדגמה",
      photo: portraits.shiran,
      role: "manager",
      namedRole: null,
      // Given access herself before managers were: her role sees pay too.
      personal: true,
    },
    {
      userId: "yoav",
      name: "יואב לוי",
      photo: portraits.yoav,
      role: "worker",
      // A shift lead, as on the team's screens: named by the role.
      namedRole: shiftLead,
      personal: true,
    },
    {
      userId: "noa",
      name: "נועה כהן",
      photo: null,
      role: "worker",
      namedRole: null,
      personal: false,
    },
    {
      userId: "maya",
      name: "מאיה פרץ",
      photo: portraits.maya,
      role: "worker",
      namedRole: null,
      personal: false,
    },
  ],
};

/**
 * `?state=named` (the roles plan's R11e): workers see pay too, and Yoav, a
 * shift lead built on workers, wasn't given it himself. His role the
 * business named never sees pay by role, so he isn't counted, he is offered
 * for personal access, and the lines under the switches say why and where.
 */
export const demoAccessNamed: AccessData = {
  ...demoAccess,
  roles: ["manager", "worker"],
  people: demoAccess.people.map((person) =>
    person.userId === "yoav" ? { ...person, personal: false } : person,
  ),
};
