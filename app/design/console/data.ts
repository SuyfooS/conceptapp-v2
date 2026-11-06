// Mock data for the console demo. Fictional businesses and people, standing in
// for database rows, so its Hebrew stays here rather than in messages/; the
// Hebrew-literal check in tooling/ allows this file.

import type { AdminBusiness, BusinessSetup } from "@db/admin";

export const consoleUser = { name: "אורל הדגמה" };

const opened = "2026-10-04T09:00:00+03:00";

export const businesses: AdminBusiness[] = [
  {
    id: "1",
    slug: "cafe-noa",
    name: "קפה נועה",
    accent: "#0f766e",
    templateKey: "cafe-bar",
    createdAt: "2026-11-02T09:00:00+02:00",
    members: 0,
    openInvites: 0,
  },
  {
    id: "2",
    slug: "demo-restaurant",
    name: "מסעדת הדגמה",
    accent: "#8b2635",
    templateKey: "restaurant",
    createdAt: opened,
    members: 8,
    openInvites: 2,
  },
  {
    id: "3",
    slug: "bar-hayam",
    name: "בר הים",
    accent: "#c2410c",
    templateKey: "cafe-bar",
    createdAt: "2026-09-13T09:00:00+03:00",
    members: 14,
    openInvites: 1,
  },
  {
    id: "4",
    slug: "shulchan",
    name: "השולחן של סבתא",
    accent: "#2563eb",
    templateKey: null,
    createdAt: "2026-08-23T09:00:00+03:00",
    members: 6,
    openInvites: 0,
  },
];

/** The demo's businesses by address; `created` shows the just-opened state. */
export const setups: Record<
  string,
  { business: BusinessSetup; created: boolean }
> = {
  "cafe-noa": {
    created: true,
    business: {
      id: "1",
      slug: "cafe-noa",
      name: "קפה נועה",
      accent: "#0f766e",
      templateKey: "cafe-bar",
      createdAt: "2026-11-02T09:00:00+02:00",
      address: null,
      people: [],
    },
  },
  "demo-restaurant": {
    created: false,
    business: {
      id: "2",
      slug: "demo-restaurant",
      name: "מסעדת הדגמה",
      accent: "#8b2635",
      templateKey: "restaurant",
      createdAt: opened,
      address: "רחוב הדגמה 12, תל אביב",
      people: [
        {
          name: "אורי בן דוד",
          phone: "+972521234567",
          role: "owner",
          status: "member",
          inviteId: null,
        },
        {
          name: "שירן אלון",
          phone: "+972501234567",
          role: "manager",
          status: "member",
          inviteId: null,
        },
        {
          name: "נועה כהן",
          phone: "+972541234560",
          role: "worker",
          status: "member",
          inviteId: null,
        },
        {
          name: "דנה אברהם",
          phone: "+972531234567",
          role: "worker",
          status: "invited",
          inviteId: "invite-1",
        },
        {
          name: "",
          phone: "+972581234567",
          role: "worker",
          status: "invited",
          inviteId: "invite-2",
        },
      ],
    },
  },
  "bar-hayam": {
    created: false,
    business: {
      id: "3",
      slug: "bar-hayam",
      name: "בר הים",
      accent: "#c2410c",
      templateKey: "cafe-bar",
      createdAt: "2026-09-13T09:00:00+03:00",
      address: null,
      people: [
        {
          name: "יואב לוי",
          phone: "+972541234561",
          role: "worker",
          status: "invited",
          inviteId: "invite-3",
        },
      ],
    },
  },
  shulchan: {
    created: false,
    business: {
      id: "4",
      slug: "shulchan",
      name: "השולחן של סבתא",
      accent: "#2563eb",
      templateKey: null,
      createdAt: "2026-08-23T09:00:00+03:00",
      address: "רחוב הדגמה 3, חיפה",
      people: [
        {
          name: "מאיה פרץ",
          phone: "+972541234562",
          role: "owner",
          status: "member",
          inviteId: null,
        },
      ],
    },
  },
};
