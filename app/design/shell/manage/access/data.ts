// Mock rows for the demo of who sees pay: the demo restaurant's people as its
// owner sees them. Names stand in for database data, so their Hebrew stays
// here; tooling/hebrew-literals.ts allows this file.

import type { AccessData } from "../../../../(app)/manage/access/access-types";
import { portraits } from "../../../portraits";

export const demoAccess: AccessData = {
  roles: ["manager"],
  me: "uri",
  viewOnly: false,
  people: [
    {
      userId: "uri",
      name: "אורי הדגמה",
      photo: null,
      role: "owner",
      personal: false,
    },
    {
      userId: "galit",
      name: "גלית הדגמה",
      photo: null,
      role: "accountant",
      personal: false,
    },
    {
      userId: "shiran",
      name: "שירן הדגמה",
      photo: portraits.shiran,
      role: "manager",
      // Given access herself before managers were: her role sees pay too.
      personal: true,
    },
    {
      userId: "yoav",
      name: "יואב לוי",
      photo: portraits.yoav,
      role: "worker",
      personal: true,
    },
    {
      userId: "noa",
      name: "נועה כהן",
      photo: null,
      role: "worker",
      personal: false,
    },
    {
      userId: "maya",
      name: "מאיה פרץ",
      photo: portraits.maya,
      role: "worker",
      personal: false,
    },
  ],
};
