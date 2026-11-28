// Mock data for the console demo. Fictional businesses and people, standing in
// for database rows, so its Hebrew stays here rather than in messages/; the
// Hebrew-literal check in tooling/ allows this file.

import type { AdminBusiness, BusinessSetup } from "@db/admin";
import type { StorageUse } from "@db/chat-files";
import type { PayRole } from "@domain/payroll-access";
import type { SetupModuleFacts } from "@domain/setup";
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
export type DemoStorageLevel = "low" | "high" | "full" | "quota";

/**
 * How full the free plan is, as the console's storage card reads it (sizes
 * only): `high` is a project past 700 MB whose businesses' space adds up past
 * the 900 MB where new chat files stop; `full` is one past those 900 MB,
 * where new chat files are refused now; `quota` (bigger teams) is a quiet
 * project where businesses near their own spaces: one's documents at 47 of
 * 50 MB, another's at 49.6 (full: less than a page's photo left), and a
 * third's chat files at 171 of 200 MB.
 */
export function demoStorage(level: DemoStorageLevel): StorageUse {
  const high = level === "high" || level === "full";
  const chat = (
    id: string,
    name: string,
    slug: string,
    used: number,
    cap: number,
    documents = 0,
  ) => ({
    id,
    slug,
    name,
    chatBytes: used * MB,
    filesOpen: cap > 0,
    chatCapBytes: cap * MB,
    documentCapBytes: cap > 0 ? 50 * MB : 0,
    documentBytes: Math.round(documents * MB),
  });
  const businessesUse =
    level === "full"
      ? [
          chat("4", "השולחן של סבתא", "shulchan", 200, 200, 31),
          chat("3", "בר הים", "bar-hayam", 199, 200, 22),
          chat("1", "קפה נועה", "cafe-noa", 197, 200, 18),
          chat("5", "פיצה בכיכר", "pizza", 196, 200, 9.4),
          chat("2", "מסעדת הדגמה", "demo-restaurant", 0, 0),
        ]
      : high
        ? [
            chat("4", "השולחן של סבתא", "shulchan", 196, 200, 28),
            chat("3", "בר הים", "bar-hayam", 188, 200, 20),
            chat("1", "קפה נועה", "cafe-noa", 171, 200, 16),
            chat("5", "פיצה בכיכר", "pizza", 120, 200, 8.2),
            chat("2", "מסעדת הדגמה", "demo-restaurant", 0, 0),
          ]
        : level === "quota"
          ? [
              chat("3", "בר הים", "bar-hayam", 171, 200, 12),
              chat("4", "השולחן של סבתא", "shulchan", 64, 100, 49.6),
              chat("1", "קפה נועה", "cafe-noa", 12.5, 100, 47),
              chat("5", "פיצה בכיכר", "pizza", 8, 100, 3.1),
              chat("2", "מסעדת הדגמה", "demo-restaurant", 0, 0),
            ]
          : [
              chat("3", "בר הים", "bar-hayam", 74, 100, 12),
              chat("4", "השולחן של סבתא", "shulchan", 64, 100, 4.2),
              chat("1", "קפה נועה", "cafe-noa", 12.5, 100, 0.8),
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

/**
 * The demo's businesses by address; `created` shows the just-opened state,
 * and `facts` what the checklist reads from each one's modules (closing the
 * pilot, PR 16). The café was just opened as open on Shabbat, with its
 * template's job roles and shifts; the restaurant has everything done; the
 * bar was opened before the wizard asked about Shabbat, and its clock's code
 * is shown only at a station while none runs; the last has no template, its
 * time clock off, and pay given to its managers.
 */
export const setups: Record<
  string,
  { business: BusinessSetup; created: boolean; facts: SetupModuleFacts }
> = {
  "cafe-noa": {
    created: true,
    facts: {
      scheduling: {
        positions: 4,
        patterns: 3,
        published: false,
        closedOnShabbat: false,
      },
      timeClock: { requirePunchCode: false, codeDisplay: "both", stations: 0 },
      pay: { roles: [], personal: 0 },
    },
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
    facts: {
      scheduling: {
        positions: 5,
        patterns: 4,
        published: true,
        closedOnShabbat: true,
      },
      timeClock: { requirePunchCode: true, codeDisplay: "both", stations: 1 },
      // Noa sees pay on her own (`payAccess` below).
      pay: { roles: [], personal: 1 },
    },
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
    facts: {
      scheduling: {
        positions: 3,
        patterns: 2,
        published: false,
        closedOnShabbat: null,
      },
      timeClock: {
        requirePunchCode: true,
        codeDisplay: "station",
        stations: 0,
      },
      pay: { roles: [], personal: 0 },
    },
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
    facts: {
      scheduling: {
        positions: 0,
        patterns: 0,
        published: false,
        closedOnShabbat: null,
      },
      timeClock: null,
      pay: { roles: ["manager"], personal: 0 },
    },
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
      // Nobody in the console's demo holds a role the business named.
      namedRole: null,
      personal: access.personal.includes(person.name),
    })),
    // Someone on the ConceptApp team, never in the business.
    me: "console",
    viewOnly: readOnly,
    documents: true,
  };
}
