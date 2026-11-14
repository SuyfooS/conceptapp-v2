// Mock data for the console demo. Fictional businesses and people, standing in
// for database rows, so its Hebrew stays here rather than in messages/; the
// Hebrew-literal check in tooling/ allows this file.

import type { AdminBusiness, BusinessSetup } from "@db/admin";
import type { StorageUse } from "@db/chat-files";
import type { PayRole } from "@domain/payroll-access";
import type { AccessData } from "../../(app)/manage/access/access-types";

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
    expiredInvites: 0,
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
    expiredInvites: 0,
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
    expiredInvites: 1,
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
    expiredInvites: 0,
  },
];

const MB = 1024 * 1024;

/** How full the demo's free plan is (`?storage=` on /design/console). */
export type DemoStorageLevel = "low" | "high" | "full";

/**
 * How full the free plan is, as the console's storage card reads it (sizes
 * only): `high` is a project past 700 MB whose businesses' space adds up past
 * the 900 MB where new chat files stop; `full` is one past those 900 MB,
 * where new chat files are refused now.
 */
export function demoStorage(level: DemoStorageLevel): StorageUse {
  const high = level !== "low";
  const chat = (
    id: string,
    name: string,
    slug: string,
    used: number,
    cap: number,
  ) => ({
    id,
    slug,
    name,
    chatBytes: used * MB,
    filesOpen: cap > 0,
    chatCapBytes: cap * MB,
    documentCapBytes: cap > 0 ? 50 * MB : 0,
  });
  const businessesUse =
    level === "full"
      ? [
          chat("4", "השולחן של סבתא", "shulchan", 200, 200),
          chat("3", "בר הים", "bar-hayam", 199, 200),
          chat("1", "קפה נועה", "cafe-noa", 197, 200),
          chat("5", "פיצה בכיכר", "pizza", 196, 200),
          chat("2", "מסעדת הדגמה", "demo-restaurant", 0, 0),
        ]
      : high
        ? [
            chat("4", "השולחן של סבתא", "shulchan", 196, 200),
            chat("3", "בר הים", "bar-hayam", 188, 200),
            chat("1", "קפה נועה", "cafe-noa", 171, 200),
            chat("5", "פיצה בכיכר", "pizza", 120, 200),
            chat("2", "מסעדת הדגמה", "demo-restaurant", 0, 0),
          ]
        : [
            chat("3", "בר הים", "bar-hayam", 97, 100),
            chat("4", "השולחן של סבתא", "shulchan", 64, 100),
            chat("1", "קפה נועה", "cafe-noa", 12.5, 100),
            chat("2", "מסעדת הדגמה", "demo-restaurant", 0, 0),
          ];
  const chatBytes = businessesUse.reduce((sum, b) => sum + b.chatBytes, 0);
  const lists = (high ? 104 : 38) * MB;
  const avatars = 6.4 * MB;
  return {
    databaseBytes: (high ? 362 : 41) * MB,
    storageBytes: Math.round(chatBytes + lists + avatars),
    guardBytes: 900 * MB,
    buckets: [
      { bucket: "avatars", bytes: Math.round(avatars), files: 41 },
      {
        bucket: "chat-files",
        bytes: Math.round(chatBytes),
        files: high ? 4120 : 1066,
      },
      { bucket: "list-photos", bytes: lists, files: high ? 371 : 140 },
    ],
    businesses: businessesUse.map((b) => ({
      ...b,
      chatBytes: Math.round(b.chatBytes),
    })),
    chatCapsBytes: businessesUse.reduce((sum, b) => sum + b.chatCapBytes, 0),
    documentCapsBytes: businessesUse.reduce(
      (sum, b) => sum + b.documentCapBytes,
      0,
    ),
  };
}

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
          expiresAt: null,
        },
        {
          name: "שירן אלון",
          phone: "+972501234567",
          role: "manager",
          status: "member",
          inviteId: null,
          expiresAt: null,
        },
        {
          name: "נועה כהן",
          phone: "+972541234560",
          role: "worker",
          status: "member",
          inviteId: null,
          expiresAt: null,
        },
        {
          name: "דנה אברהם",
          phone: "+972531234567",
          role: "worker",
          status: "invited",
          inviteId: "invite-1",
          expiresAt: "2026-11-14T09:00:00+02:00",
        },
        {
          name: "",
          phone: "+972581234567",
          role: "worker",
          status: "invited",
          inviteId: "invite-2",
          expiresAt: "2026-11-14T09:00:00+02:00",
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
          expiresAt: "2026-11-12T09:00:00+02:00",
        },
        {
          name: "רונית שמש",
          phone: "+972521234568",
          role: "owner",
          status: "expired",
          inviteId: "invite-4",
          expiresAt: "2026-09-27T09:00:00+03:00",
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
          expiresAt: null,
        },
      ],
    },
  },
};

/** Sentences the demo restaurant's template and the business replace. */
export const demoWording = {
  template: { "modules.scheduling.name": "משמרות" },
  business: {
    "app.nav.home": "הבית",
    "app.team.title": "הצוות של המסעדה",
  },
};

/**
 * Who sees pay in the demo's businesses, as the console's "מי רואה שכר" shows
 * it: the roles given it, and who was given it personally, by name. In the
 * restaurant, managers don't see pay and Noa does on her own, so Shiran is
 * there to add.
 */
const payAccess: Record<string, { roles: PayRole[]; personal: string[] }> = {
  "demo-restaurant": { roles: [], personal: ["נועה כהן"] },
  shulchan: { roles: ["manager"], personal: [] },
};

/**
 * A business's people as the console's "מי רואה שכר" lists them: its members
 * from `setups` (an invite isn't in the business yet), with their access.
 * `readOnly`, as a team role that only reads businesses would see it.
 */
export function consoleAccess(slug: string, readOnly: boolean): AccessData {
  const access = payAccess[slug] ?? { roles: [], personal: [] };
  const members = (setups[slug]?.business.people ?? []).filter(
    (person) => person.status === "member",
  );
  return {
    roles: access.roles,
    people: members.map((person, index) => ({
      userId: `${slug}-${index}`,
      name: person.name || null,
      photo: null,
      role: person.role,
      personal: access.personal.includes(person.name),
    })),
    // Someone on the ConceptApp team, never in the business.
    me: "console",
    viewOnly: readOnly,
    documents: true,
  };
}
