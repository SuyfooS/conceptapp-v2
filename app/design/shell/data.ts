// Mock data for the layout demo. Fictional restaurant and people.
// It stands in for database rows (names, roles, shift names a business
// sets itself), so its Hebrew stays here rather than in messages/; the
// Hebrew-literal check in tooling/ allows this one file.

import type { ActivityLookups, ActivityRow } from "@domain/activity";
import type { AvailabilityAnswer } from "@domain/availability";
import type { BusinessDetails } from "@domain/business-details";
import type { ModuleRow } from "@domain/modules";
import type { AddressForm, CoverPreset } from "@domain/profile";
import type { Position, ShiftPattern } from "@domain/staffing";
import type { TeamInvite, TeamMember } from "@domain/team";
import { portraits } from "../portraits";

export const business = { name: "מסעדת הדגמה" };
export const user = {
  name: "שירן",
  role: "מנהלת משמרת",
  photo: portraits.shiran,
};

/** Some of the demo's people have a photo; the rest show their initials. */
const photos: Record<string, string> = {
  shiran: portraits.shiran,
  yoav: portraits.yoav,
  maya: portraits.maya,
};

/** How each demo person chose to be addressed; the rest haven't yet. */
const forms: Record<string, AddressForm> = {
  shiran: "f",
  noa: "f",
  yoav: "m",
  maya: "f",
  itay: "m",
  omer: "x",
};

export type Staff = { id: string; name: string; role: string };

export const staff: Staff[] = [
  { id: "noa", name: "נועה כהן", role: "מלצרית" },
  { id: "yoav", name: "יואב לוי", role: "ברמן" },
  { id: "maya", name: "מאיה פרץ", role: "מלצרית" },
  { id: "itay", name: "איתי מזרחי", role: "טבח" },
  { id: "shira", name: "שירה ביטון", role: "מארחת" },
  { id: "omer", name: "עומר אזולאי", role: "טבח" },
  { id: "dana", name: "דנה אברהם", role: "מלצרית" },
  { id: "ron", name: "רון שפירא", role: "ברמן" },
];

export const byId = Object.fromEntries(staff.map((s) => [s.id, s])) as Record<
  string,
  Staff
>;

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("");

export const firstName = (name: string) => name.split(" ")[0] ?? name;

export type ShiftType = {
  key: "m" | "e";
  name: string;
  time: string;
  hours: number;
  needed: number;
};

const weekday: ShiftType[] = [
  { key: "m", name: "בוקר", time: "09:00–16:00", hours: 7, needed: 3 },
  { key: "e", name: "ערב", time: "16:00–23:30", hours: 7.5, needed: 4 },
];

export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Day names come from messages (`days.<key>.short` / `.long`). */
export type Day = {
  key: DayKey;
  date: string;
  shifts: ShiftType[];
};

// Week of 18–24 October 2026. Friday closes early, Saturday opens after Shabbat.
export const days: Day[] = [
  { key: "sun", date: "18", shifts: weekday },
  { key: "mon", date: "19", shifts: weekday },
  { key: "tue", date: "20", shifts: weekday },
  { key: "wed", date: "21", shifts: weekday },
  { key: "thu", date: "22", shifts: weekday },
  {
    key: "fri",
    date: "23",
    shifts: [
      { key: "m", name: "בוקר", time: "08:00–14:30", hours: 6.5, needed: 5 },
    ],
  },
  {
    key: "sat",
    date: "24",
    shifts: [
      { key: "e", name: "מוצ״ש", time: "19:30–00:00", hours: 4.5, needed: 4 },
    ],
  },
];

export const assignments: Record<
  string,
  Partial<Record<"m" | "e", string[]>>
> = {
  sun: { m: ["noa", "itay", "shira"], e: ["maya", "yoav", "omer", "dana"] },
  mon: { m: ["dana", "itay"], e: ["noa", "ron", "omer", "shira"] },
  tue: { m: ["maya", "itay", "shira"], e: ["noa", "yoav", "omer", "dana"] },
  wed: { m: ["noa", "omer"], e: ["maya", "ron", "itay", "shira"] },
  thu: {
    m: ["dana", "itay", "shira"],
    e: ["noa", "maya", "yoav", "omer", "ron"],
  },
  fri: { m: ["noa", "maya", "itay", "yoav", "shira"] },
  sat: { e: ["dana", "ron", "omer", "shira"] },
};

export const missingAvailability = ["ron", "dana"];

export function assigned(day: Day, shift: ShiftType): string[] {
  return assignments[day.key]?.[shift.key] ?? [];
}

export function openSlots(day: Day): number {
  return day.shifts.reduce(
    (n, s) => n + Math.max(0, s.needed - assigned(day, s).length),
    0,
  );
}

/** The shift a person works on a day, if any. */
export function shiftFor(personId: string, day: Day): ShiftType | undefined {
  return day.shifts.find((s) => assigned(day, s).includes(personId));
}

export function weeklyHours(personId: string): number {
  return days.reduce((h, d) => h + (shiftFor(personId, d)?.hours ?? 0), 0);
}

export const totalOpenSlots = days.reduce((n, d) => n + openSlots(d), 0);

// The Team screen: members and invites as the database returns them.
export const teamToday = new Date("2026-10-23T09:00:00+03:00");

export const teamMembers: TeamMember[] = [
  {
    userId: "shiran",
    name: "שירן אלון",
    phone: "+972501234567",
    role: "manager",
    photo: photos.shiran ?? null,
    addressForm: forms.shiran ?? null,
  },
  {
    userId: "uri",
    name: "אורי בן דוד",
    phone: "+972521234567",
    role: "owner",
    photo: null,
    addressForm: null,
  },
  ...staff.slice(0, 6).map((s, i) => ({
    userId: s.id,
    name: s.name,
    phone: `+97254123456${i}`,
    role: "worker" as const,
    photo: photos[s.id] ?? null,
    addressForm: forms[s.id] ?? null,
  })),
];

/**
 * What a few of the demo's people wrote about themselves and the covers they
 * picked, for their profiles (/design/shell/me, /design/shell/team/[person]).
 */
export const teamProfiles: Record<
  string,
  { bio: string | null; cover: CoverPreset; since: string }
> = {
  shiran: {
    bio: "אחראית משמרת בערב. אם משהו לא ברור בסידור, אפשר לשאול אותי.",
    cover: "dots",
    since: "2026-03-02T08:00:00.000Z",
  },
  noa: {
    bio: "בבוקר בקופה, בערב בבר. אפשר לשאול אותי על כל עוגה בוויטרינה.",
    cover: "waves",
    since: "2026-04-12T08:00:00.000Z",
  },
  yoav: {
    bio: "ערבי חמישי ושישי בבר. את קוקטייל הבית המצאתי בעצמי.",
    cover: "arcs",
    since: "2026-10-04T08:00:00.000Z",
  },
};

export const teamInvites: TeamInvite[] = [
  {
    id: "dana",
    name: "דנה אברהם",
    phone: "+972531234567",
    role: "worker",
    expiresAt: "2026-11-02T09:00:00+02:00",
  },
  {
    id: "ron",
    name: "רון שפירא",
    phone: "+972581234567",
    role: "worker",
    expiresAt: "2026-10-18T09:00:00+03:00",
  },
];

// Answers for the demo week of 1–7 November 2026 (due 28 October, 18:00).
// Shira and Omer have not sent theirs; Yoav sent after the due moment.
export const teamAnswers: AvailabilityAnswer[] = [
  {
    userId: "shiran",
    note: null,
    updatedAt: "2026-10-26T07:40:00.000Z",
    ranges: [
      { day: "2026-11-01", start: "08:00", end: "16:00" },
      { day: "2026-11-02", start: "08:00", end: "16:00" },
      { day: "2026-11-04", start: "08:00", end: "16:00" },
      { day: "2026-11-05", start: "16:00", end: "23:30" },
    ],
  },
  {
    userId: "noa",
    note: "מבחן ביום שלישי בבוקר",
    updatedAt: "2026-10-27T09:12:00.000Z",
    ranges: [
      { day: "2026-11-01", start: "09:00", end: "17:00" },
      { day: "2026-11-03", start: "17:00", end: "23:30" },
      { day: "2026-11-06", start: "08:00", end: "14:00" },
      { day: "2026-11-07", start: "19:30", end: "00:30" },
    ],
  },
  {
    userId: "yoav",
    note: null,
    updatedAt: "2026-10-28T19:05:00.000Z",
    ranges: [
      { day: "2026-11-02", start: "12:00", end: "16:00" },
      { day: "2026-11-02", start: "18:00", end: "23:00" },
      { day: "2026-11-05", start: "18:00", end: "02:00" },
    ],
  },
  {
    userId: "maya",
    note: "בחופשה כל השבוע",
    updatedAt: "2026-10-25T18:30:00.000Z",
    ranges: [],
  },
  {
    userId: "itay",
    note: null,
    updatedAt: "2026-10-28T10:00:00.000Z",
    ranges: [
      { day: "2026-11-01", start: "10:00", end: "18:00" },
      { day: "2026-11-02", start: "10:00", end: "18:00" },
      { day: "2026-11-03", start: "10:00", end: "18:00" },
      { day: "2026-11-04", start: "10:00", end: "18:00" },
      { day: "2026-11-05", start: "10:00", end: "18:00" },
    ],
  },
];

// The restaurant template's positions (supabase/migrations, templates).
export const demoPositions: Position[] = [
  { key: "waiter", name: "מלצר/ית" },
  { key: "bartender", name: "ברמן/ית" },
  { key: "cook", name: "טבח/ית" },
  { key: "host", name: "מארח/ת" },
];

// The restaurant template's shift pattern (supabase/migrations, templates),
// for the demo of building the week of 1–7 November 2026.
export const demoShiftPatterns: ShiftPattern[] = [
  {
    key: "morning",
    name: "בוקר",
    days: [0, 1, 2, 3, 4],
    start: "09:00",
    end: "16:00",
    needed: 3,
  },
  {
    key: "evening",
    name: "ערב",
    days: [0, 1, 2, 3, 4],
    start: "16:00",
    end: "23:30",
    needed: 4,
  },
  {
    key: "friday",
    name: "בוקר",
    days: [5],
    start: "08:00",
    end: "14:30",
    needed: 5,
  },
  {
    key: "saturday-night",
    name: "מוצ״ש",
    days: [6],
    start: "19:30",
    end: "00:00",
    needed: 4,
  },
];

// The demo business's own details. No city yet, so the demo shows what asks
// for one.
export const demoBusinessDetails: BusinessDetails = {
  name: business.name,
  accent: "#2563eb",
  address: "רחוב הדגמה 1, תל אביב",
  shabbatCity: null,
};

// A moment in the demo's week, for the Shabbat times it shows.
export const demoNow = new Date("2026-11-04T12:00:00+02:00");

// The demo business's modules, for the management demos. What's left out takes
// the module's defaults.
export const demoModuleRows: ModuleRow[] = [
  {
    key: "scheduling",
    enabled: true,
    settings: { positions: demoPositions, shifts: demoShiftPatterns },
  },
  { key: "time_clock", enabled: true, settings: { unpaidBreaks: true } },
  { key: "reservations", enabled: false, settings: {} },
  { key: "storefront", enabled: false, settings: {} },
  { key: "notifications", enabled: true, settings: {} },
];

// A shift a manager added by hand on the demo week's Sunday, overlapping both
// of the day's regular shifts, so its people show as busy on them.
export const demoExtraShift = {
  name: "אמצע",
  start: "12:00",
  end: "20:00",
  needed: 2,
  pattern: null,
  assignees: [],
};

// The demo business's activity log, as rows from its audit log and what they
// point at: three days around the demo's Wednesday, newest first. Two edits to
// the availability time a moment apart read as one change.
const demoPerson = (id: string) => ({
  active: true,
  name: byId[id]?.name ?? null,
});

export const demoActivityLookups: ActivityLookups = {
  members: new Map([
    ["shiran", { active: true, name: user.name }],
    ["noa", demoPerson("noa")],
    ["yoav", demoPerson("yoav")],
    ["dana", demoPerson("dana")],
  ]),
  invites: new Map([["invite-dana", { name: "דנה אברהם", role: "worker" }]]),
  shifts: new Map([
    [
      "shift-thu-evening",
      { day: "2026-11-05", name: "ערב", start: "16:00", end: "23:00" },
    ],
  ]),
  swaps: new Map([
    [
      "swap-thu",
      { shiftId: "shift-thu-evening", requestedBy: "noa", takenBy: "yoav" },
    ],
  ]),
};

const demoRow = (
  id: number,
  createdAt: string,
  actorId: string | null,
  action: string,
  details: unknown,
): ActivityRow => ({ id, action, details, createdAt, actorId });

export const demoActivityRows: ActivityRow[] = [
  demoRow(120, "2026-11-04T11:40:00+02:00", "shiran", "business.details", {
    from: { address: "רחוב הדגמה 1, תל אביב" },
    to: { address: "רחוב הרצל 12, תל אביב" },
  }),
  demoRow(119, "2026-11-04T11:05:00+02:00", "team", "module.settings", {
    module: "time_clock",
    from: { roundToMinutes: null },
    to: { roundToMinutes: 15 },
  }),
  demoRow(118, "2026-11-04T10:30:00+02:00", "shiran", "swap.approve", {
    swap: "swap-thu",
    shift: "shift-thu-evening",
    from: "noa",
    to: "yoav",
  }),
  demoRow(117, "2026-11-04T10:12:00+02:00", "yoav", "swap.take", {
    swap: "swap-thu",
  }),
  demoRow(116, "2026-11-04T09:50:00+02:00", "noa", "swap.request", {
    swap: "swap-thu",
    shift: "shift-thu-evening",
  }),
  demoRow(115, "2026-11-04T09:20:00+02:00", "shiran", "clock.correct", {
    entry: "entry-noa",
    person: "noa",
    from: { clock_in: "2026-11-03T16:00:00+02:00", clock_out: null },
    to: {
      clock_in: "2026-11-03T16:00:00+02:00",
      clock_out: "2026-11-03T23:30:00+02:00",
    },
  }),
  demoRow(114, "2026-11-04T09:03:00+02:00", "shiran", "module.settings", {
    module: "scheduling",
    from: { availabilityDueTime: "17:00" },
    to: { availabilityDueTime: "18:00" },
  }),
  demoRow(113, "2026-11-04T09:01:00+02:00", "shiran", "module.settings", {
    module: "scheduling",
    from: { availabilityDueTime: "16:00" },
    to: { availabilityDueTime: "17:00" },
  }),
  demoRow(112, "2026-11-03T18:10:00+02:00", "shiran", "schedule.publish", {
    week: "week-8",
    starts_on: "2026-11-08",
    shifts: 14,
    first: false,
    swaps_removed: 1,
  }),
  demoRow(111, "2026-11-03T12:00:00+02:00", "shiran", "schedule.publish", {
    week: "week-8",
    starts_on: "2026-11-08",
    shifts: 13,
    first: true,
    swaps_removed: 0,
  }),
  demoRow(110, "2026-11-03T11:20:00+02:00", "dana", "invite.claim", {
    invite: "invite-dana",
    role: "worker",
  }),
  demoRow(109, "2026-11-03T10:45:00+02:00", "shiran", "invite.create", {
    invite: "invite-dana",
    role: "worker",
  }),
  demoRow(108, "2026-11-03T10:40:00+02:00", "team", "view_as.end", {
    session: "view-1",
    role: "manager",
  }),
  demoRow(107, "2026-11-03T10:02:00+02:00", "team", "view_as.start", {
    session: "view-1",
    role: "manager",
  }),
  demoRow(106, "2026-11-03T09:15:00+02:00", "shiran", "module.settings", {
    module: "time_clock",
    from: { unpaidBreaks: false },
    to: { unpaidBreaks: true },
  }),
  demoRow(105, "2026-11-01T10:00:00+02:00", "shiran", "business.details", {
    from: { accent: "#7c3aed" },
    to: { accent: "#2563eb" },
  }),
  demoRow(104, "2026-11-01T09:30:00+02:00", "team", "module.enabled", {
    module: "time_clock",
    enabled: true,
  }),
  demoRow(103, "2026-11-01T09:00:00+02:00", "team", "business.create", {
    template: "restaurant",
    slug: "demo-restaurant",
    invites: 6,
  }),
];
