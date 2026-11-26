import { createHash } from "node:crypto";
import {
  addDays,
  dateIn,
  instantIn,
  weekdayOf,
  weekStartOf,
} from "@domain/availability";
import { manifest as scheduling } from "@modules/scheduling/manifest";
import { manifest as timeClock } from "@modules/time_clock/manifest";
import {
  businessNameOf,
  choice,
  emailOf,
  fictionalNumber,
  hexOf,
  Ids,
  nameOf,
  personId,
  SEED_VERSION,
  ZONE,
} from "./ids";

/**
 * The test business of a few hundred people, planned row by row before
 * anything is written (docs/measure.md, the plan's section 1): who works
 * there, its departments and shift patterns, its weeks, shifts, hours,
 * chat, documents and lines. Pure: the same size, depth and anchor give the
 * same shape, and `seedScaleBusiness` (./seed.ts) only writes what this says.
 * A small neighbour business comes with it, on the same tables.
 */

export const SIZES = [30, 100, 300, 600] as const;
export type Size = (typeof SIZES)[number];

/** `people`: the team, its departments, invites and next week's draft. `history`: months of the rest too. */
export type Depth = "people" | "history";

/** `ci`: fewer messages, for the database job. */
export type ChatDepth = "full" | "ci";

export type ShapeOptions = {
  people: Size;
  depth: Depth;
  /** Months of hours and schedule behind the anchor (13 by default). */
  months?: number;
  chat?: ChatDepth;
  /** The run's moment; every date is relative to it, in Asia/Jerusalem. */
  anchor: Date;
  /**
   * Refuse an anchor this close to a week's or a month's start, when "this
   * week" or "this month" would change during a run. The database test
   * passes 0: its transaction's clock stands still.
   */
  marginMinutes?: number;
};

/** The app's caps, which the shape never passes: what the database refuses. */
export const CAPS = {
  shiftsAWeek: 200,
  patterns: 30,
  needed: 50,
  departments: 30,
  importAtOnce: 300,
  invitesWaiting: 500,
} as const;

export const SCALE = {
  id: "5ca1e300-0000-4000-b000-000000000300",
  slug: "scale-test",
  name: "עסק בדיקה",
} as const;

export const NEIGHBOUR = {
  id: "5ca1e300-0000-4000-b000-000000000007",
  slug: "scale-neighbour",
  name: "עסק שכן",
} as const;

export const SHIFT_LEAD_ROLE = "אחראי/ת משמרת";

export const POSITIONS = [
  { key: "lead", name: "אחראי/ת" },
  { key: "crew", name: "צוות" },
  { key: "trainee", name: "בהכשרה" },
] as const;

export type PositionKey = (typeof POSITIONS)[number]["key"];

/** The people of each size (the plan's 1.3). */
export const TEAMS: Record<
  Size,
  {
    managers: number;
    leads: number;
    workers: number;
    left: number;
    departments: number;
    roundTheClock: boolean;
  }
> = {
  30: {
    managers: 1,
    leads: 2,
    workers: 26,
    left: 6,
    departments: 1,
    roundTheClock: false,
  },
  100: {
    managers: 2,
    leads: 4,
    workers: 93,
    left: 20,
    departments: 4,
    roundTheClock: false,
  },
  300: {
    managers: 4,
    leads: 10,
    workers: 285,
    left: 60,
    departments: 10,
    roundTheClock: true,
  },
  600: {
    managers: 8,
    leads: 20,
    workers: 571,
    left: 120,
    departments: 10,
    roundTheClock: true,
  },
};

export type Role = "owner" | "manager" | "worker" | "accountant";

export type Person = {
  n: number;
  id: string;
  email: string;
  name: string;
  addressForm: "f" | "m";
  /** A fictional display number (`profiles.phone`); never in `auth.users`. */
  phone: string | null;
  /** In the business; null for the console's platform admin. */
  role: Role | null;
  kind: "staff" | "left" | "accountant" | "admin";
  /** Holds the named role "אחראי/ת משמרת" (clock.edit). */
  lead: boolean;
  joinedOn: string;
  joinedAt: string;
  leftOn: string | null;
  leftAt: string | null;
  /** Home department (index) and pattern (key); null for who isn't placed. */
  department: number | null;
  second: number | null;
  pattern: string | null;
  /** Its business's own name for them, when it differs. */
  businessName: string | null;
};

export type Department = {
  id: string;
  key: string;
  name: string;
  position: number;
};

export type Pattern = {
  key: string;
  name: string;
  days: number[];
  start: string;
  end: string;
  needed: number;
  department: number;
};

export type Assignee = { user: string; position: PositionKey };

export type Shift = {
  /** The seed's id for a week written directly; null when a function makes it. */
  id: string | null;
  day: string;
  pattern: string;
  name: string;
  start: string;
  end: string;
  needed: number;
  startsAt: string;
  endsAt: string;
  assignees: Assignee[];
};

export type WeekKind = "history" | "last" | "this" | "next";

export type Week = {
  id: string;
  startsOn: string;
  kind: WeekKind;
  /** Written directly (history, and the neighbour's), or through the app's functions. */
  via: "direct" | "publish" | "draft";
  dueAt: string;
  publishedAt: string | null;
  shifts: Shift[];
};

export type EntryKind =
  | "scan"
  | "none"
  | "self"
  | "missed"
  | "corrected"
  | "cancelled"
  | "open"
  | "waiting-none"
  | "waiting-self";

export type Entry = {
  id: string;
  user: string;
  day: string;
  kind: EntryKind;
  clockIn: string;
  clockOut: string | null;
  inProof: string;
  outProof: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  editedBy: string | null;
  editedAt: string | null;
  note: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  /** The punched times a correction replaced (missed and corrected). */
  fromIn: string | null;
  fromOut: string | null;
};

export type Break = {
  id: string;
  entry: string;
  user: string;
  startedAt: string;
  endedAt: string;
};

export type Submission = {
  id: string;
  user: string;
  week: string;
  submittedAt: string;
  ranges: { id: string; day: string; start: string; end: string }[];
};

export type Swap = {
  id: string;
  /** The shift's id for a week written directly; else found by week, day and pattern. */
  shift: string | null;
  weekStart: string;
  day: string;
  pattern: string;
  requestedBy: string;
  status: "open" | "declined" | "cancelled";
  takenBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  cancelledBecause: "withdrawn" | null;
  createdAt: string;
};

export type Absence = {
  user: string;
  kind: "vacation" | "sick" | "reserve";
  from: string;
  to: string;
};

export type Wage = {
  id: string;
  user: string;
  hourlyAgorot: number;
  effectiveFrom: string;
  setAt: string;
};

export type Period = {
  id: string;
  user: string;
  startedOn: string;
  endedOn: string;
};

export type ConversationKey = string;

export type Message = {
  id: string;
  /** "team", "department:<id>" or "direct:<id>". */
  conversation: ConversationKey;
  author: string;
  draft: string;
  kind: "text" | "announcement";
  body: string;
  pinned: boolean;
  createdAt: string;
};

export type Ack = { message: string; user: string; ackedAt: string };

export type Read = {
  conversation: ConversationKey;
  user: string;
  readAt: string;
};

export type DirectChat = {
  id: string;
  a: string;
  b: string;
  createdAt: string;
};

export type Document = {
  id: string;
  upload: string;
  category: "procedure" | "payslip";
  title: string;
  author: string;
  asks: boolean;
  path: string;
  fileName: string;
  fileSize: number;
  sentAt: string;
  recipients: {
    user: string;
    openedAt: string | null;
    confirmedAt: string | null;
  }[];
};

export type JoinedLine = { person: string; at: string; recipients: string[] };

export type PublishedLine = {
  user: string;
  week: string;
  startsOn: string;
  mine: number;
  at: string;
};

export type Invite = {
  id: string;
  phone: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  tokenHash: string;
};

export type BusinessShape = {
  id: string;
  slug: string;
  name: string;
  kind: "scale" | "neighbour";
  createdAt: string;
  owner: string;
  /** Who builds and publishes the schedule through the app's functions. */
  scheduler: string;
  people: Person[];
  departments: Department[];
  patterns: Pattern[];
  settings: {
    scheduling: Record<string, unknown>;
    time_clock: Record<string, unknown>;
  };
  weeks: Week[];
  availability: Submission[];
  swaps: Swap[];
  entries: Entry[];
  breaks: Break[];
  absences: Absence[];
  wages: Wage[];
  payrollNumbers: { user: string; number: string }[];
  periods: Period[];
  chat: {
    directs: DirectChat[];
    messages: Message[];
    acks: Ack[];
    reads: Read[];
  };
  documents: Document[];
  joined: JoinedLine[];
  published: PublishedLine[];
  invites: Invite[];
  /** Who opens the pay screens, and the days they did (Sunday to Thursday). */
  payrollViews: { holders: string[]; from: string; to: string };
  /** The people the measuring run punches in with: no shift today, none running. */
  punchers: string[];
};

export type Shape = {
  version: string;
  size: Size;
  depth: Depth;
  months: number;
  chat: ChatDepth;
  anchor: string;
  today: string;
  weekStart: string;
  monthStart: string;
  scale: BusinessShape;
  neighbour: BusinessShape;
  /** The console's platform admin, outside both businesses. */
  admin: Person;
  /** Who signs in to measure (the plan's 1.6). */
  viewers: {
    owner: string;
    scheduler: string;
    lead: string | null;
    worker: string;
    accountant: string;
    admin: string;
  };
};

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 86_400_000;

const iso = (time: number) => new Date(time).toISOString();
const ms = (instant: string) => Date.parse(instant);

/** Instants of wall-clock times, each worked out once. */
const instants = new Map<string, number>();
function at(day: string, time: string): number {
  const key = `${day} ${time}`;
  let found = instants.get(key);
  if (found === undefined) {
    found = instantIn(day, time, ZONE).getTime();
    instants.set(key, found);
  }
  return found;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const hhmm = (hour: number) => `${pad2(hour % 24)}:00`;

/** The first of the month of `date`, and of the month after. */
function monthOf(date: string): { start: string; next: string } {
  const [year = 0, month = 1] = date.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${year}-${pad2(month)}-01`,
    next: `${nextYear}-${pad2(nextMonth)}-01`,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / DAY,
  );
}

/** A whole number from `low` to `high`, by one choice. */
function pick(low: number, high: number, u: number): number {
  return low + Math.min(high - low, Math.floor(u * (high - low + 1)));
}

/** `items` ordered by a choice about each, so taking the first k is a fair, fixed pick. */
function byChoice<T>(
  items: readonly T[],
  kind: string,
  key: (item: T) => string,
  day = "",
): T[] {
  return items
    .map((item) => ({ item, u: choice(kind, key(item), day) }))
    .sort((a, b) => a.u - b.u)
    .map(({ item }) => item);
}

/**
 * Refuses an anchor within `margin` minutes of this week's or this month's
 * start, or of the next one's.
 */
export function anchorRefusal(
  anchor: Date,
  marginMinutes: number,
): string | null {
  if (marginMinutes <= 0) return null;
  const today = dateIn(anchor, ZONE);
  const week = weekStartOf(today, 0);
  const month = monthOf(today);
  const edges: [string, string][] = [
    ["this week's start", week],
    ["next week's start", addDays(week, 7)],
    ["this month's start", month.start],
    ["next month's start", month.next],
  ];
  for (const [label, day] of edges) {
    const gap = Math.abs(anchor.getTime() - at(day, "00:00"));
    if (gap < marginMinutes * MINUTE) {
      return `The anchor is ${Math.round(gap / MINUTE)} minutes from ${label} (${day}); start the run again more than ${marginMinutes} minutes from it`;
    }
  }
  return null;
}

type Spec = {
  business: { id: string; slug: string; name: string };
  kind: "scale" | "neighbour";
  /** Person numbers: owner first, then managers, leads, workers. */
  base: number;
  managers: number;
  leads: number;
  workers: number;
  left: number;
  departments: number;
  roundTheClock: boolean;
  accountant: boolean;
  /** Seeded invites waiting and expired. */
  invites: [number, number];
  onClock: number;
  punchers: number;
  waitingNone: number;
  waitingSelf: number;
  absences: number;
  swaps: { live: number; ended: number; stale: number };
  chat: boolean;
  documents: boolean;
  availability: boolean;
  wages: boolean;
  /** Index of the first display number this business's people take. */
  numbers: number;
};

/** The plan for one size, depth and anchor. */
export function shape(options: ShapeOptions): Shape {
  const months = options.months ?? 13;
  const chatDepth = options.chat ?? "full";
  const refusal = anchorRefusal(options.anchor, options.marginMinutes ?? 120);
  if (refusal) throw new Error(refusal);
  if (!SIZES.includes(options.people)) {
    throw new Error(
      `No shape for ${options.people} people; sizes are ${SIZES.join(", ")}`,
    );
  }
  if (!Number.isInteger(months) || months < 1 || months > 36) {
    throw new Error("Months of history are 1 to 36");
  }

  const size = options.people;
  const team = TEAMS[size];
  const anchor = options.anchor.getTime();
  const today = dateIn(options.anchor, ZONE);
  const weekStart = weekStartOf(today, 0);
  const monthStart = monthOf(today).start;
  const ids = new Ids();
  const history = options.depth === "history";

  const scaleSpec: Spec = {
    business: SCALE,
    kind: "scale",
    base: 0,
    managers: team.managers,
    leads: team.leads,
    workers: team.workers,
    left: team.left,
    departments: team.departments,
    roundTheClock: team.roundTheClock,
    accountant: true,
    invites: [
      Math.min(Math.round(size / 3), 200 - Math.round(size / 10)),
      Math.round(size / 10),
    ],
    onClock: Math.round(size / 20),
    punchers: Math.round(size / 3),
    waitingNone: 2 * size,
    waitingSelf: Math.round(size / 15),
    absences: Math.round(size / 10),
    swaps: {
      live: Math.round(size / 15),
      ended: Math.round(size / 2),
      stale: Math.round((2 * size) / 3),
    },
    chat: true,
    documents: true,
    availability: true,
    wages: true,
    numbers: 0,
  };
  const neighbourSpec: Spec = {
    business: NEIGHBOUR,
    kind: "neighbour",
    base: 800_000,
    managers: 1,
    leads: 0,
    workers: 5,
    left: 0,
    departments: 1,
    roundTheClock: false,
    accountant: false,
    invites: [0, 0],
    onClock: 0,
    punchers: 0,
    waitingNone: 14,
    waitingSelf: 0,
    absences: 0,
    swaps: { live: 0, ended: 0, stale: 0 },
    chat: false,
    documents: false,
    availability: false,
    wages: false,
    // After the scale business's people, its leavers and the accountant.
    numbers: size + team.left + 1,
  };

  const context = {
    anchor,
    today,
    weekStart,
    monthStart,
    months,
    chatDepth,
    history,
    ids,
  };
  const scale = build(scaleSpec, context);
  const neighbour = build(neighbourSpec, context);

  const adminN = 900_002;
  const adminName = nameOf(adminN);
  const admin: Person = {
    n: adminN,
    id: personId(adminN),
    email: emailOf(adminN),
    name: adminName.name,
    addressForm: adminName.addressForm,
    phone: null,
    role: null,
    kind: "admin",
    lead: false,
    joinedOn: addDays(today, -1095),
    joinedAt: iso(at(addDays(today, -1095), "09:00")),
    leftOn: null,
    leftAt: null,
    department: null,
    second: null,
    pattern: null,
    businessName: null,
  };

  const staff = scale.people.filter((p) => p.kind === "staff");
  const lead = staff.find((p) => p.lead);
  const worker =
    staff.find((p) => p.n === 100) ??
    staff.find((p) => p.role === "worker" && !p.lead);
  const accountant = scale.people.find((p) => p.kind === "accountant");
  if (!worker || !accountant)
    throw new Error("The shape has no worker or accountant");

  return {
    version: SEED_VERSION,
    size,
    depth: options.depth,
    months,
    chat: chatDepth,
    anchor: iso(anchor),
    today,
    weekStart,
    monthStart,
    scale,
    neighbour,
    admin,
    viewers: {
      owner: scale.owner,
      scheduler: scale.scheduler,
      lead: lead?.id ?? null,
      worker: worker.id,
      accountant: accountant.id,
      admin: admin.id,
    },
  };
}

type Context = {
  anchor: number;
  today: string;
  weekStart: string;
  monthStart: string;
  months: number;
  chatDepth: ChatDepth;
  history: boolean;
  ids: Ids;
};

function build(spec: Spec, context: Context): BusinessShape {
  const { anchor, today, weekStart, ids } = context;
  const people = peopleOf(spec, context);
  const owner = people[0];
  if (!owner) throw new Error("A business needs its owner");
  const staff = people.filter((p) => p.kind === "staff");
  const managers = staff.filter((p) => p.role === "manager");
  const scheduler = managers[0]?.id ?? owner.id;

  const departments: Department[] = Array.from(
    { length: spec.departments },
    (_, d) => ({
      id: ids.take("department"),
      key: `d-${pad2(d + 1)}`,
      name: `מחלקה ${pad2(d + 1)}`,
      position: d,
    }),
  );

  const patterns = patternsOf(spec);
  placeInPatterns(spec, people, patterns);
  const patternByKey = new Map(patterns.map((p) => [p.key, p]));

  const settings = {
    scheduling: scheduling.settings.parse({
      weekStartsOn: 0,
      closedOnShabbat: !spec.roundTheClock,
      positions: POSITIONS.map((p) => ({ ...p })),
      shifts: patterns.map((p) => ({
        key: p.key,
        name: p.name,
        days: p.days,
        start: p.start,
        end: p.end,
        needed: p.needed,
      })),
    }) as Record<string, unknown>,
    // Without a code required every punch reads 'off' (private.check_punch),
    // and nothing would wait for confirmation: on, so punches are scanned at
    // the station or made without a code, as the plan's mix needs.
    time_clock: timeClock.settings.parse({ requirePunchCode: true }) as Record<
      string,
      unknown
    >,
  };

  const holders = staff.filter(
    (p) => p.role === "owner" || p.role === "manager" || p.lead,
  );
  const weeks = weeksOf(spec, context, people, patterns);
  // Before the hours: a puncher has today off, so no entry of today holds them.
  const punchers = context.history
    ? punchersOf(spec, context, staff, weeks)
    : [];
  const entries: Entry[] = [];
  const breaks: Break[] = [];
  if (context.history) {
    hoursOf(spec, context, weeks, people, holders, entries, breaks);
  }

  const thisWeek = weeks.find((w) => w.kind === "this");
  const nextWeek = weeks.find((w) => w.kind === "next");

  const availability: Submission[] = [];
  if (context.history && spec.availability) {
    for (const week of [thisWeek, nextWeek]) {
      if (!week) continue;
      for (const person of staff) {
        if (person.role === "owner" || person.joinedOn >= today) continue;
        if (choice("availability", person.id, week.startsOn) >= 0.9) continue;
        const pattern = person.pattern
          ? patternByKey.get(person.pattern)
          : undefined;
        const count = pick(
          5,
          7,
          choice("availability-days", person.id, week.startsOn),
        );
        const first = pick(
          0,
          6,
          choice("availability-first", person.id, week.startsOn),
        );
        const submitted = Math.min(
          at(addDays(week.startsOn, -5), "20:00"),
          anchor - HOUR,
        );
        availability.push({
          id: ids.take("submission"),
          user: person.id,
          week: week.id,
          submittedAt: iso(submitted),
          ranges: Array.from({ length: count }, (_, i) => ({
            id: ids.take("range"),
            day: addDays(week.startsOn, (first + i) % 7),
            start: pattern?.start ?? "08:00",
            end: pattern?.end ?? "16:00",
          })).sort((a, b) => a.day.localeCompare(b.day)),
        });
      }
    }
  }

  const swaps = context.history
    ? swapsOf(spec, context, weeks, people, scheduler)
    : [];

  const absences: Absence[] = [];
  if (context.history && spec.absences > 0) {
    const month = monthOf(today);
    const length = daysBetween(month.start, month.next);
    const workers = byChoice(
      staff.filter((p) => p.role === "worker" && p.joinedOn < month.start),
      "absence",
      (p) => p.id,
      month.start,
    ).slice(0, spec.absences);
    const kinds = ["vacation", "sick", "reserve"] as const;
    workers.forEach((person, i) => {
      const from = pick(
        0,
        length - 2,
        choice("absence-day", person.id, month.start),
      );
      const days = pick(0, 1, choice("absence-length", person.id, month.start));
      absences.push({
        user: person.id,
        kind: kinds[i % kinds.length] ?? "vacation",
        from: addDays(month.start, from),
        to: addDays(month.start, Math.min(from + days, length - 1)),
      });
    });
  }

  // Wages: four rates over each person's time, for everyone on the staff
  // but the owner, and for those who left.
  const wages: Wage[] = [];
  const payrollNumbers: { user: string; number: string }[] = [];
  const periods: Period[] = [];
  for (const person of people) {
    if (person.kind !== "staff" && person.kind !== "left") continue;
    if (person.leftOn && person.kind === "left") {
      periods.push({
        id: ids.take("period"),
        user: person.id,
        startedOn: person.joinedOn,
        endedOn: person.leftOn,
      });
    }
    if (person.role === "owner") continue;
    if (spec.wages) {
      payrollNumbers.push({ user: person.id, number: String(person.n) });
      const until = person.leftOn ?? today;
      const span = daysBetween(person.joinedOn, until);
      for (let i = 0; i < 4; i++) {
        const effective = addDays(person.joinedOn, Math.floor((i * span) / 4));
        wages.push({
          id: ids.take("wage"),
          user: person.id,
          hourlyAgorot: 3600 + 150 * i + (person.n % 7) * 50,
          effectiveFrom: effective,
          setAt: iso(at(effective, "09:00")),
        });
      }
    }
  }

  const chat =
    context.history && spec.chat
      ? chatOf(spec, context, people, departments)
      : {
          directs: [],
          messages: [],
          acks: [],
          reads: [],
        };

  const documents =
    context.history && spec.documents
      ? documentsOf(spec, context, people, owner)
      : [];

  // Lines: who joined, to those who see the team; and the published weeks,
  // the last 25 of history, to everyone on the staff at the time.
  const joined: JoinedLine[] = [];
  const published: PublishedLine[] = [];
  if (context.history) {
    const teamViewers = staff.filter(
      (p) => p.role === "owner" || p.role === "manager",
    );
    for (const person of people) {
      if (person.kind !== "staff" && person.kind !== "accountant") continue;
      if (person.role === "owner") continue;
      const recipients = teamViewers
        .filter((v) => v.id !== person.id)
        .map((v) => v.id);
      if (recipients.length > 0) {
        joined.push({ person: person.id, at: person.joinedAt, recipients });
      }
    }
    const historyWeeks = weeks.filter((w) => w.kind === "history").slice(-25);
    for (const week of historyWeeks) {
      if (!week.publishedAt) continue;
      const mine = new Map<string, number>();
      for (const s of week.shifts) {
        for (const a of s.assignees)
          mine.set(a.user, (mine.get(a.user) ?? 0) + 1);
      }
      for (const person of staff) {
        if (person.id === scheduler || person.joinedAt > week.publishedAt)
          continue;
        published.push({
          user: person.id,
          week: week.id,
          startsOn: week.startsOn,
          mine: mine.get(person.id) ?? 0,
          at: week.publishedAt,
        });
      }
    }
  }

  const [waiting, expired] = spec.invites;
  const invites: Invite[] = [];
  for (let j = 0; j < waiting + expired; j++) {
    const late = j >= waiting;
    const created = late
      ? anchor - 30 * DAY
      : anchor - pick(1, 10, choice("invite", String(j))) * DAY;
    invites.push({
      id: ids.take("invite"),
      phone: fictionalNumber(j, "invites"),
      name: `מוזמן/ת בדיקה ${String(j + 1).padStart(3, "0")}`,
      createdAt: iso(created),
      expiresAt: iso(late ? anchor - 16 * DAY : anchor + 7 * DAY),
      tokenHash:
        hexOf(`invite:${spec.business.id}:${j}`) +
        hexOf(`invite-2:${spec.business.id}:${j}`),
    });
  }

  const payHolders = people
    .filter((p) => p.role === "owner" || p.role === "accountant")
    .map((p) => p.id);
  const firstHistory =
    weeks.find((w) => w.kind === "history")?.startsOn ?? weekStart;

  return {
    id: spec.business.id,
    slug: spec.business.slug,
    name: spec.business.name,
    kind: spec.kind,
    createdAt: iso(ms(owner.joinedAt) - HOUR),
    owner: owner.id,
    scheduler,
    people,
    departments,
    patterns,
    settings,
    weeks,
    availability,
    swaps,
    entries,
    breaks,
    absences,
    wages,
    payrollNumbers,
    periods,
    chat,
    documents,
    joined,
    published,
    invites,
    payrollViews: {
      holders: context.history ? payHolders : [],
      from: firstHistory,
      to: addDays(today, -1),
    },
    punchers,
  };
}

/** The owner, managers, shift leads, workers, those who left and the accountant. */
function peopleOf(spec: Spec, context: Context): Person[] {
  const { today, anchor } = context;
  const people: Person[] = [];
  let number = spec.numbers;
  const make = (
    n: number,
    role: Role,
    kind: Person["kind"],
    daysAgo: number,
    leftDaysAgo: number | null,
    lead = false,
  ): Person => {
    const { name, addressForm } = nameOf(n);
    const joinedOn = addDays(today, -daysAgo);
    const leftOn = leftDaysAgo === null ? null : addDays(today, -leftDaysAgo);
    const person: Person = {
      n,
      id: personId(n),
      email: emailOf(n),
      name,
      addressForm,
      phone: fictionalNumber(number, "people"),
      role,
      kind,
      lead,
      joinedOn,
      joinedAt: iso(Math.min(at(joinedOn, "10:00"), anchor - HOUR)),
      leftOn,
      leftAt: leftOn ? iso(at(leftOn, "18:00")) : null,
      department: null,
      second: null,
      pattern: null,
      businessName: null,
    };
    number += 1;
    return person;
  };

  const b = spec.base;
  people.push(make(b + 1, "owner", "staff", 1095, null));
  let n = b + 2;
  for (let i = 0; i < spec.managers; i++, n++) {
    people.push(
      make(
        n,
        "manager",
        "staff",
        pick(400, 1090, choice("joined", personId(n))),
        null,
      ),
    );
  }
  for (let i = 0; i < spec.leads; i++, n++) {
    people.push(
      make(
        n,
        "worker",
        "staff",
        pick(400, 1090, choice("joined", personId(n))),
        null,
        true,
      ),
    );
  }
  // Workers: a tenth joined in the last 90 days (the newest of them 20 days
  // ago, so someone always joined after the chat's oldest message), the rest
  // over three years.
  const workerNumbers = Array.from({ length: spec.workers }, (_, i) => n + i);
  const recent = new Set(
    byChoice(workerNumbers, "recent", (k) => personId(k)).slice(
      0,
      Math.round(spec.workers / 10),
    ),
  );
  const newest = workerNumbers[workerNumbers.length - 1];
  for (const k of workerNumbers) {
    const u = choice("joined", personId(k));
    const daysAgo =
      k === newest ? 20 : recent.has(k) ? pick(8, 90, u) : pick(91, 1090, u);
    people.push(make(k, "worker", "staff", daysAgo, null));
  }
  for (let i = 0; i < spec.left; i++) {
    const k = b + 10_001 + i;
    const leftDaysAgo = pick(7, 730, choice("left", personId(k)));
    const stayed = pick(60, 360, choice("stayed", personId(k)));
    people.push(
      make(
        k,
        "worker",
        "left",
        Math.min(1094, leftDaysAgo + stayed),
        leftDaysAgo,
      ),
    );
  }
  if (spec.accountant) {
    people.push(make(b + 900_001, "accountant", "accountant", 730, null));
  }

  // A third of the staff are known to the business by another name: never
  // its owner, who keeps none (memberships_owner_keeps_no_name).
  for (const person of people) {
    if (
      person.kind === "staff" &&
      person.role !== "owner" &&
      person.n % 3 === 0
    ) {
      person.businessName = businessNameOf(person.n);
    }
  }
  return people;
}

/** Each department's three shifts, and who in it works which. */
function patternsOf(spec: Spec): Pattern[] {
  const patterns: Pattern[] = [];
  for (let d = 0; d < spec.departments; d++) {
    const number = pad2(d + 1);
    if (spec.roundTheClock) {
      // Staggered by an hour across departments, so some shift always has
      // two hours or more to run; nights skip one day each, departments
      // apart: 20 patterns of 7 days and 10 of 6 make the 200.
      const o = d % 3;
      const longDay = d === spec.departments - 1;
      patterns.push(
        {
          key: `d-${number}-m`,
          name: longDay ? `יום ארוך ${number}` : `בוקר ${number}`,
          days: [0, 1, 2, 3, 4, 5, 6],
          start: longDay ? "07:00" : hhmm(6 + o),
          end: longDay ? "19:00" : hhmm(14 + o),
          needed: 1,
          department: d,
        },
        {
          key: `d-${number}-e`,
          name: `ערב ${number}`,
          days: [0, 1, 2, 3, 4, 5, 6],
          start: hhmm(14 + o),
          end: hhmm(22 + o),
          needed: 1,
          department: d,
        },
        {
          key: `d-${number}-n`,
          name: `לילה ${number}`,
          days: [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== d % 7),
          start: hhmm(22 + o),
          end: hhmm(6 + o),
          needed: 1,
          department: d,
        },
      );
    } else {
      // Closed on Shabbat: mornings Sunday to Friday, evenings Sunday to
      // Thursday, nights from Saturday's end to Thursday's, all at the same
      // hours (a night from midnight would fall on Shabbat).
      const o = 0;
      patterns.push(
        {
          key: `d-${number}-m`,
          name: `בוקר ${number}`,
          days: [0, 1, 2, 3, 4, 5],
          start: hhmm(7 + o),
          end: hhmm(15 + o),
          needed: 1,
          department: d,
        },
        {
          key: `d-${number}-e`,
          name: `ערב ${number}`,
          days: [0, 1, 2, 3, 4],
          start: hhmm(15 + o),
          end: hhmm(23 + o),
          needed: 1,
          department: d,
        },
        {
          key: `d-${number}-n`,
          name: `לילה ${number}`,
          days: [0, 1, 2, 3, 4, 6],
          start: hhmm(23 + o),
          end: hhmm(7 + o),
          needed: 1,
          department: d,
        },
      );
    }
  }
  return patterns;
}

/** Who is placed on shifts: the staff but the owner, and those who left, while they worked. */
const isWorker = (p: Person) =>
  (p.kind === "staff" && p.role !== "owner") || p.kind === "left";

/**
 * Departments and patterns for everyone placed: the first department holds
 * a third of the team (all of it when there is one), the rest share the
 * others; a tenth are in a second department too. Within a department, its
 * mornings take most people (seven in ten in the big one, so its morning
 * needs 50), then evenings, then nights. Each pattern needs what its people
 * fill at nine in ten.
 */
function placeInPatterns(
  spec: Spec,
  people: Person[],
  patterns: Pattern[],
): void {
  const placed = people.filter(isWorker);
  const count = placed.length;
  const sizes = Array.from({ length: spec.departments }, () => 0);
  if (spec.departments === 1) sizes[0] = count;
  else {
    const first = Math.round(count / 3);
    sizes[0] = first;
    const rest = count - first;
    for (let d = 1; d < spec.departments; d++) {
      sizes[d] =
        Math.floor(rest / (spec.departments - 1)) +
        (d - 1 < rest % (spec.departments - 1) ? 1 : 0);
    }
  }
  const slots = sizes.flatMap((n, d) =>
    Array.from({ length: n }, (_, i) => ({ d, i })),
  );
  const ordered = byChoice(slots, "department-slot", (s) => `${s.d}:${s.i}`);
  placed.forEach((person, k) => {
    person.department = ordered[k]?.d ?? 0;
  });
  if (spec.departments > 1) {
    const staff = placed.filter((p) => p.kind === "staff");
    const twice = byChoice(staff, "second", (p) => p.id).slice(
      0,
      Math.round(staff.length / 10),
    );
    for (const person of twice) {
      const home = person.department ?? 0;
      const step =
        1 +
        Math.floor(choice("second-which", person.id) * (spec.departments - 1));
      person.second = (home + step) % spec.departments;
    }
  }

  for (let d = 0; d < spec.departments; d++) {
    const members = byChoice(
      placed.filter((p) => p.department === d),
      "pattern",
      (p) => p.id,
    );
    const shares =
      spec.roundTheClock && d === 0 ? [0.7, 0.2, 0.1] : [0.5, 0.3, 0.2];
    const keys = [
      `d-${pad2(d + 1)}-m`,
      `d-${pad2(d + 1)}-e`,
      `d-${pad2(d + 1)}-n`,
    ];
    const cut1 = Math.round(members.length * (shares[0] ?? 0.5));
    const cut2 = cut1 + Math.round(members.length * (shares[1] ?? 0.3));
    members.forEach((person, i) => {
      person.pattern = keys[i < cut1 ? 0 : i < cut2 ? 1 : 2] ?? null;
    });
  }

  for (const pattern of patterns) {
    const group = placed.filter(
      (p) => p.pattern === pattern.key && p.kind === "staff",
    );
    const days = pattern.days.length;
    const shifts = group.reduce(
      (sum, _, rank) => sum + Math.min(days, worksAWeek(rank)),
      0,
    );
    pattern.needed = Math.max(
      1,
      Math.min(CAPS.needed, Math.ceil(shifts / days / 0.9)),
    );
  }
  // The biggest shift at its cap, the review's "50 a shift": the big
  // department's morning, round the clock.
  const big = patterns.find((p) => p.key === "d-01-m");
  if (big && spec.roundTheClock) big.needed = CAPS.needed;
}

/** Week number from a fixed Sunday, for the rotation of days off. */
function weekIndex(startsOn: string): number {
  return Math.round(daysBetween("2026-01-04", startsOn) / 7);
}

/** Shifts a week: five for every third person, four for the rest. */
const worksAWeek = (rank: number) => (rank % 3 === 0 ? 5 : 4);

/**
 * The days of `pattern` a person works in a week. The group's days off are
 * laid end to end around the pattern's days (`tile` is where this person's
 * start), so each day has about as many off as any other, and they move by
 * a day each week. One pattern a person, at most one shift a day, so two of
 * anyone's shifts are always a day apart: at least 12 hours between them,
 * the jitter included.
 */
export function workDays(
  pattern: Pattern,
  rank: number,
  tile: number,
  startsOn: string,
): number[] {
  const k = pattern.days.length;
  const off = k - Math.min(k, worksAWeek(rank));
  // Weeks before the fixed Sunday count below zero: taken back into 0..k-1.
  const first = (((tile + weekIndex(startsOn)) % k) + k) % k;
  const offAt = new Set(Array.from({ length: off }, (_, t) => (first + t) % k));
  return pattern.days.filter((_, i) => !offAt.has(i));
}

/** Where each person's days off start: the days off of those ranked before them. */
function tilesOf(
  pattern: Pattern,
  group: Person[],
  ranks: Map<string, number>,
) {
  const k = pattern.days.length;
  const tiles = new Map<string, number>();
  let at = 0;
  for (const person of [...group].sort(
    (a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0),
  )) {
    tiles.set(person.id, at);
    at += k - Math.min(k, worksAWeek(ranks.get(person.id) ?? 0));
  }
  return tiles;
}

function shiftsOf(
  pattern: Pattern,
  startsOn: string,
  group: Person[],
  ranks: Map<string, number>,
  tiles: Map<string, number>,
): Shift[] {
  const shifts: Shift[] = [];
  const working = new Map<number, Person[]>();
  for (const person of group) {
    const rank = ranks.get(person.id) ?? 0;
    for (const day of workDays(
      pattern,
      rank,
      tiles.get(person.id) ?? 0,
      startsOn,
    )) {
      const list = working.get(day) ?? [];
      list.push(person);
      working.set(day, list);
    }
  }
  for (const weekday of pattern.days) {
    const day = addDays(startsOn, weekday);
    const overnight = pattern.end <= pattern.start;
    const startsAt = at(day, pattern.start);
    const endsAt = at(overnight ? addDays(day, 1) : day, pattern.end);
    const active = (working.get(weekday) ?? []).filter(
      (p) => p.joinedOn < day && (p.leftOn === null || day < p.leftOn),
    );
    const chosen = byChoice(active, "cap", (p) => p.id, day).slice(
      0,
      pattern.needed,
    );
    shifts.push({
      id: null,
      day,
      pattern: pattern.key,
      name: pattern.name,
      start: pattern.start,
      end: pattern.end,
      needed: pattern.needed,
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      assignees: chosen
        .sort((a, b) => a.n - b.n)
        .map((p) => ({ user: p.id, position: positionOf(p, day) })),
    });
  }
  return shifts;
}

function positionOf(person: Person, day: string): PositionKey {
  if (person.role === "manager" || person.lead) return "lead";
  return daysBetween(person.joinedOn, day) <= 90 ? "trainee" : "crew";
}

function weeksOf(
  spec: Spec,
  context: Context,
  people: Person[],
  patterns: Pattern[],
): Week[] {
  const { weekStart, today, ids, months } = context;
  const placed = people.filter(isWorker);
  const groups = new Map<string, Person[]>();
  for (const person of placed) {
    if (!person.pattern) continue;
    const list = groups.get(person.pattern) ?? [];
    list.push(person);
    groups.set(person.pattern, list);
  }
  const ranks = new Map<string, number>();
  for (const list of groups.values()) {
    list.sort((a, b) => a.n - b.n);
    for (const [i, p] of list.entries()) ranks.set(p.id, i);
  }
  const tiles = new Map(
    patterns.map(
      (p) => [p.key, tilesOf(p, groups.get(p.key) ?? [], ranks)] as const,
    ),
  );

  const starts: [string, WeekKind][] = [];
  if (context.history) {
    const first = weekStartOf(addDays(today, -Math.round(months * 30.44)), 0);
    for (let s = first; s < addDays(weekStart, -7); s = addDays(s, 7))
      starts.push([s, "history"]);
    starts.push([addDays(weekStart, -7), "last"], [weekStart, "this"]);
  }
  if (spec.kind === "scale") starts.push([addDays(weekStart, 7), "next"]);

  return starts.map(([startsOn, kind]) => {
    const via: Week["via"] =
      kind === "next"
        ? "draft"
        : spec.kind === "neighbour" || kind === "history"
          ? "direct"
          : "publish";
    // The app's functions put only active members on a shift: those who
    // left are in the weeks written directly alone.
    const groupOf = (key: string) =>
      (groups.get(key) ?? []).filter(
        (p) => via === "direct" || p.kind === "staff",
      );
    const shifts = patterns.flatMap((p) =>
      shiftsOf(
        p,
        startsOn,
        groupOf(p.key),
        ranks,
        tiles.get(p.key) ?? new Map(),
      ),
    );
    if (via === "direct") for (const s of shifts) s.id = ids.take("shift");
    if (kind === "next") draftOf(shifts, groups, ranks, patterns);
    return {
      id: ids.take("week"),
      startsOn,
      kind,
      via,
      dueAt: iso(at(addDays(startsOn, -4), "18:00")),
      publishedAt:
        via === "direct" ? iso(at(addDays(startsOn, -3), "12:00")) : null,
      shifts,
    };
  });
}

/**
 * Next week, saved but not published: six in ten placed, and the biggest
 * shift (the big department's first morning) full, to its cap of 50 at 300.
 */
function draftOf(
  shifts: Shift[],
  groups: Map<string, Person[]>,
  ranks: Map<string, number>,
  patterns: Pattern[],
): void {
  const biggest = [...patterns].sort((a, b) => b.needed - a.needed)[0];
  const first = biggest
    ? shifts.find((s) => s.pattern === biggest.key)
    : undefined;
  const counts = new Map<string, number>();
  for (const s of shifts) {
    if (s === first) continue;
    s.assignees = s.assignees.filter(
      (a) => choice("draft", a.user, s.day) < 0.6,
    );
  }
  for (const s of shifts)
    for (const a of s.assignees)
      counts.set(a.user, (counts.get(a.user) ?? 0) + 1);
  if (!first || !biggest) return;
  const on = new Set(first.assignees.map((a) => a.user));
  const extra = (groups.get(biggest.key) ?? [])
    .filter(
      (p) =>
        p.kind === "staff" &&
        !on.has(p.id) &&
        p.joinedOn < first.day &&
        (counts.get(p.id) ?? 0) < 5,
    )
    .sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0));
  for (const person of extra) {
    if (first.assignees.length >= first.needed) break;
    first.assignees.push({
      user: person.id,
      position: positionOf(person, first.day),
    });
  }
  first.assignees.sort((a, b) => a.user.localeCompare(b.user));
}

/**
 * The people the measuring run punches in with (the plan's 1.3): a third of
 * the staff but the owner, none with a shift today, one running now or one
 * about to start (an arrival is up to 10 minutes early). Those already off
 * come first, by the seed's choice; when too few are off (at 300 some days
 * have about 95, and past midnight last night's shifts still run), the rest
 * are taken off those shifts before any hours are planned. So the count
 * holds at every anchor.
 */
function punchersOf(
  spec: Spec,
  context: Context,
  staff: Person[],
  weeks: Week[],
): string[] {
  const { anchor, today } = context;
  if (spec.punchers === 0) return [];
  const now = weeks
    .flatMap((w) => w.shifts)
    .filter(
      (s) =>
        s.day === today ||
        (ms(s.startsAt) <= anchor + 10 * MINUTE && ms(s.endsAt) > anchor),
    );
  const busy = new Set(now.flatMap((s) => s.assignees.map((a) => a.user)));
  const ordered = byChoice(
    staff.filter((p) => p.role !== "owner" && p.joinedOn < today),
    "puncher",
    (p) => p.id,
  );
  const chosen = [
    ...ordered.filter((p) => !busy.has(p.id)),
    ...ordered.filter((p) => busy.has(p.id)),
  ]
    .slice(0, spec.punchers)
    .map((p) => p.id);
  const off = new Set(chosen);
  for (const s of now)
    s.assignees = s.assignees.filter((a) => !off.has(a.user));
  return chosen;
}

/**
 * One entry per placed shift that has ended, nineteen in twenty kept, by
 * the rules of the plan's 1.5: arrivals 10 minutes early to 5 late,
 * departures 5 early to 15 late; a stated mix of proofs; then what waits
 * for confirmation in the last two weeks, and who is on the clock now.
 */
function hoursOf(
  spec: Spec,
  context: Context,
  weeks: Week[],
  people: Person[],
  holders: Person[],
  entries: Entry[],
  breaks: Break[],
): void {
  const { anchor, ids } = context;
  const byId = new Map(people.map((p) => [p.id, p]));
  const owner = people[0];
  if (!owner) return;
  const other = (
    person: string,
    kind: string,
    day: string,
    among: Person[],
  ) => {
    const list = among.filter((p) => p.id !== person);
    const one = list[Math.floor(choice(kind, person, day) * list.length)];
    return (one ?? owner).id;
  };
  const managers = holders.filter((p) => p.role === "manager");
  const correctors = managers.length > 0 ? managers : [owner];
  const running: { shift: Shift; user: string; arrival: number }[] = [];

  for (const week of weeks) {
    if (week.kind === "next") continue;
    for (const shift of week.shifts) {
      const start = ms(shift.startsAt);
      const end = ms(shift.endsAt);
      for (const { user } of shift.assignees) {
        const person = byId.get(user);
        if (!person) continue;
        if (end + 20 * MINUTE > anchor) {
          // Arrived already (10 minutes early to 5 late), and the shift still runs.
          const arrival =
            start + pick(-10, 5, choice("in", user, shift.day)) * MINUTE;
          if (arrival <= anchor - MINUTE && end > anchor)
            running.push({ shift, user, arrival });
          continue;
        }
        if (choice("absent", user, shift.day) < 0.05) continue;
        const punchedIn =
          start + pick(-10, 5, choice("in", user, shift.day)) * MINUTE;
        const punchedOut =
          end + pick(-5, 15, choice("out", user, shift.day)) * MINUTE;
        const u = choice("kind", user, shift.day);
        const entry: Entry = {
          id: ids.take("entry"),
          user,
          day: shift.day,
          kind: "scan",
          clockIn: iso(punchedIn),
          clockOut: iso(punchedOut),
          inProof: "scan",
          outProof: "scan",
          confirmedAt: null,
          confirmedBy: null,
          editedBy: null,
          editedAt: null,
          note: null,
          cancelledAt: null,
          cancelledBy: null,
          cancelReason: null,
          fromIn: null,
          fromOut: null,
        };
        // Nothing after the anchor: a time still to come is just before it.
        const past = (time: number) => iso(Math.min(time, anchor - MINUTE));
        const confirmAfter =
          pick(1, 48, choice("confirm", user, shift.day)) * HOUR;
        if (u < 0.005) {
          entry.kind = "cancelled";
          entry.cancelledAt = past(punchedOut + HOUR);
          entry.cancelledBy = other(user, "canceller", shift.day, correctors);
          entry.cancelReason = "המשמרת בוטלה";
        } else if (u < 0.035) {
          // A missed punch: open until a manager closed it with the shift's end.
          entry.kind = "missed";
          entry.outProof = "manager";
          entry.clockOut = iso(end);
          entry.editedBy = other(user, "corrector", shift.day, correctors);
          entry.editedAt = past(end + 10 * HOUR);
          entry.note = "שכח/ה להחתים יציאה";
          entry.fromIn = entry.clockIn;
          entry.fromOut = null;
        } else if (u < 0.045) {
          entry.kind = "corrected";
          entry.inProof = "manager";
          entry.outProof = "manager";
          entry.fromIn = entry.clockIn;
          entry.fromOut = entry.clockOut;
          entry.clockIn = iso(start);
          entry.clockOut = iso(end);
          entry.editedBy = other(user, "corrector", shift.day, correctors);
          entry.editedAt = past(end + 20 * HOUR);
          entry.note = "תיקון שעות לפי הסידור";
        } else if (u < 0.225) {
          entry.kind = "none";
          entry.inProof = "none";
          entry.outProof = "none";
          entry.confirmedAt = past(punchedOut + confirmAfter);
          entry.confirmedBy = other(user, "confirmer", shift.day, holders);
        } else if (u < 0.235 && person.role === "manager") {
          entry.kind = "self";
          entry.inProof = "self";
          entry.outProof = "self";
          entry.confirmedAt = past(punchedOut + confirmAfter);
          entry.confirmedBy = owner.id;
        }
        entries.push(entry);
      }
    }
  }

  // Waiting now: arrivals without a code in the last two weeks, and the
  // managers' own hours, which only an owner confirms.
  const since = anchor - 14 * DAY;
  const recent = entries.filter(
    (e) =>
      ms(e.clockIn) >= since &&
      (e.kind === "scan" || e.kind === "none") &&
      ms(e.clockOut ?? e.clockIn) < anchor,
  );
  const managerIds = new Set(
    people.filter((p) => p.role === "manager").map((p) => p.id),
  );
  for (const entry of byChoice(
    recent.filter((e) => !managerIds.has(e.user)),
    "wait",
    (e) => e.id,
  ).slice(0, spec.waitingNone)) {
    entry.kind = "waiting-none";
    entry.inProof = "none";
    entry.outProof = "none";
    entry.confirmedAt = null;
    entry.confirmedBy = null;
  }
  for (const entry of byChoice(
    recent.filter((e) => managerIds.has(e.user) && e.kind !== "waiting-none"),
    "wait-self",
    (e) => e.id,
  ).slice(0, spec.waitingSelf)) {
    entry.kind = "waiting-self";
    entry.inProof = "self";
    entry.outProof = "self";
    entry.confirmedAt = null;
    entry.confirmedBy = null;
  }

  // On the clock now: arrived, in a shift that runs two hours more or
  // longer. When too few have that (at 300 around 06:00 and 22:00, as most
  // shifts end within the hour), the rest from the running shifts with the
  // most time left, so the count holds whenever enough people are on a
  // shift (at 300 always; at 30 and 100 none while the business is closed).
  const left = (r: { shift: Shift }) => ms(r.shift.endsAt) - anchor;
  const clockKey = (r: { shift: Shift; user: string }) =>
    `${r.user}:${r.shift.day}`;
  const onClock = [
    ...byChoice(
      running.filter((r) => left(r) >= 2 * HOUR),
      "clock",
      clockKey,
    ),
    ...byChoice(
      running.filter((r) => left(r) < 2 * HOUR),
      "clock",
      clockKey,
    ).sort((a, b) => left(b) - left(a)),
  ].slice(0, spec.onClock);
  for (const { shift, user, arrival } of onClock) {
    entries.push({
      id: ids.take("entry"),
      user,
      day: shift.day,
      kind: "open",
      clockIn: iso(arrival),
      clockOut: null,
      inProof: "scan",
      outProof: null,
      confirmedAt: null,
      confirmedBy: null,
      editedBy: null,
      editedAt: null,
      note: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      fromIn: null,
      fromOut: null,
    });
  }

  // A break in four of five ended entries: half an hour, in the middle.
  for (const entry of entries) {
    if (!entry.clockOut || entry.cancelledAt) continue;
    if (choice("break", entry.user, entry.day) >= 0.8) continue;
    const middle = (ms(entry.clockIn) + ms(entry.clockOut)) / 2;
    const startedAt = Math.floor((middle - 15 * MINUTE) / MINUTE) * MINUTE;
    breaks.push({
      id: ids.take("break"),
      entry: entry.id,
      user: entry.user,
      startedAt: iso(startedAt),
      endedAt: iso(startedAt + 30 * MINUTE),
    });
  }
  void spec;
}

/**
 * Requests to swap: some open on this week's shifts that start more than an
 * hour from now (a fifteenth of the staff, or as many places as those
 * shifts have, which is fewer only in the week's last hours: next week is a
 * draft, and the app makes no request on a draft), the rest on past ones.
 */
function swapsOf(
  spec: Spec,
  context: Context,
  weeks: Week[],
  people: Person[],
  scheduler: string,
): Swap[] {
  const { anchor, ids } = context;
  const swaps: Swap[] = [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const thisWeek = weeks.find((w) => w.kind === "this");
  const ahead = (thisWeek?.shifts ?? []).filter(
    (s) => ms(s.startsAt) > anchor + HOUR,
  );
  const asks = (shifts: Shift[], kind: string) =>
    byChoice(
      shifts.flatMap((s) => s.assignees.map((a) => ({ s, user: a.user }))),
      kind,
      (x) => `${x.user}:${x.s.day}:${x.s.pattern}`,
    );
  for (const { s, user } of asks(ahead, "swap-live").slice(
    0,
    spec.swaps.live,
  )) {
    swaps.push({
      id: ids.take("swap"),
      shift: s.id,
      weekStart: thisWeek?.startsOn ?? "",
      day: s.day,
      pattern: s.pattern,
      requestedBy: user,
      status: "open",
      takenBy: null,
      decidedBy: null,
      decidedAt: null,
      cancelledBecause: null,
      createdAt: iso(anchor),
    });
  }
  const past = weeks
    .filter((w) => w.kind === "history")
    .flatMap((w) => w.shifts.map((s) => ({ s, week: w.startsOn })))
    .filter(({ s }) => ms(s.endsAt) < anchor);
  const weekOf = new Map(past.map(({ s, week }) => [s, week]));
  const pastAsks = asks(
    past.map(({ s }) => s),
    "swap-past",
  );
  const ended = pastAsks.slice(0, spec.swaps.ended);
  const stale = pastAsks.slice(
    spec.swaps.ended,
    spec.swaps.ended + spec.swaps.stale,
  );
  ended.forEach(({ s, user }, i) => {
    const declined = i % 3 !== 2;
    const created = ms(s.startsAt) - 3 * DAY;
    const group = people.filter(
      (p) =>
        p.pattern === byId.get(user)?.pattern &&
        p.id !== user &&
        p.joinedOn < s.day,
    );
    const taker =
      group[Math.floor(choice("taker", user, s.day) * group.length)];
    swaps.push({
      id: ids.take("swap"),
      shift: s.id,
      weekStart: weekOf.get(s) ?? "",
      day: s.day,
      pattern: s.pattern,
      requestedBy: user,
      status: declined && taker ? "declined" : "cancelled",
      takenBy: declined && taker ? taker.id : null,
      decidedBy: declined && taker ? scheduler : null,
      decidedAt: declined && taker ? iso(created + DAY) : null,
      cancelledBecause: declined && taker ? null : "withdrawn",
      createdAt: iso(created),
    });
  });
  // Asked and never answered, on shifts long past: nothing closes them.
  for (const { s, user } of stale) {
    swaps.push({
      id: ids.take("swap"),
      shift: s.id,
      weekStart: weekOf.get(s) ?? "",
      day: s.day,
      pattern: s.pattern,
      requestedBy: user,
      status: "open",
      takenBy: null,
      decidedBy: null,
      decidedAt: null,
      cancelledBecause: null,
      createdAt: iso(ms(s.startsAt) - 2 * DAY),
    });
  }
  return swaps;
}

const WORDS = [
  "בוקר טוב לכולם",
  "מי יכול להחליף אותי מחר?",
  "תודה על העזרה היום",
  "החניה ליד הכניסה סגורה השבוע",
  "הזמנה חדשה הגיעה למחסן",
  "מזכירים לשלוח זמינות עד רביעי",
  "יש מישהו שראה את המפתחות?",
  "המשמרת של אתמול עברה טוב",
  "פגישת צוות ביום ראשון בעשר",
  "לילה טוב",
] as const;

function wordsOf(i: number): string {
  return `${WORDS[i % WORDS.length] ?? "שלום"} (${i + 1})`;
}

/** The team group, the departments' groups and private chats, with acks and read marks. */
function chatOf(
  spec: Spec,
  context: Context,
  people: Person[],
  departments: Department[],
): BusinessShape["chat"] {
  const { anchor, ids, chatDepth } = context;
  const full = chatDepth === "full";
  const staff = people.filter((p) => p.kind === "staff");
  const managersAndOwner = staff.filter(
    (p) => p.role === "owner" || p.role === "manager",
  );
  const messages: Message[] = [];
  const acks: Ack[] = [];
  const reads: Read[] = [];
  const directs: DirectChat[] = [];
  const startOf = anchor - 90 * DAY;

  const authors = byChoice(staff, "author", (p) => p.id).slice(0, 60);
  const teamCount = full ? 2000 : 300;
  const announcements = full ? 20 : 5;
  const every = Math.floor(teamCount / announcements);
  for (let i = 0; i < teamCount; i++) {
    const time = startOf + Math.floor(((i + 0.5) * 90 * DAY) / teamCount);
    const announce = i % every === every - 1;
    const pool = (announce ? managersAndOwner : authors).filter(
      (p) => ms(p.joinedAt) < time,
    );
    const author =
      pool[Math.floor(choice("chat-author", String(i)) * pool.length)] ??
      people[0];
    if (!author) continue;
    const message: Message = {
      id: ids.take("message"),
      conversation: "team",
      author: author.id,
      draft: ids.take("draft"),
      kind: announce ? "announcement" : "text",
      body: announce ? `הודעה לכל הצוות: ${wordsOf(i)}` : wordsOf(i),
      pinned: false,
      createdAt: iso(time),
    };
    messages.push(message);
    if (announce) {
      const share = 0.6 + 0.35 * choice("acks", message.id);
      for (const person of staff) {
        if (ms(person.joinedAt) >= time || person.id === author.id) continue;
        if (choice("ack", person.id, message.id) >= share) continue;
        acks.push({
          message: message.id,
          user: person.id,
          ackedAt: iso(
            Math.min(
              time +
                pick(5, 2880, choice("ack-at", person.id, message.id)) * MINUTE,
              anchor - MINUTE,
            ),
          ),
        });
      }
    }
  }
  const lastAnnouncement = [...messages]
    .reverse()
    .find((m) => m.kind === "announcement");
  if (lastAnnouncement) lastAnnouncement.pinned = true;

  const perDepartment = full ? 300 : 50;
  departments.forEach((department, d) => {
    const members = staff.filter((p) => p.department === d || p.second === d);
    for (let i = 0; i < perDepartment; i++) {
      const time = startOf + Math.floor(((i + 0.5) * 90 * DAY) / perDepartment);
      const pool = members.filter((p) => ms(p.joinedAt) < time);
      const author =
        pool[Math.floor(choice("dept-author", `${d}:${i}`) * pool.length)];
      if (!author) continue;
      messages.push({
        id: ids.take("message"),
        conversation: `department:${department.id}`,
        author: author.id,
        draft: ids.take("draft"),
        kind: "text",
        body: wordsOf(i + d),
        pinned: false,
        createdAt: iso(time),
      });
    }
  });

  // Private chats between people already on the staff a month ago.
  const settled = staff.filter((p) => ms(p.joinedAt) < anchor - 31 * DAY);
  const pairs = full
    ? Math.round(staff.length / 2)
    : Math.round(staff.length / 10);
  const seen = new Set<string>();
  for (let i = 0; seen.size < pairs && i < pairs * 20; i++) {
    const x =
      settled[Math.floor(choice("direct-a", String(i)) * settled.length)];
    const y =
      settled[Math.floor(choice("direct-b", String(i)) * settled.length)];
    if (!x || !y || x.id === y.id) continue;
    const [a, b] = x.id < y.id ? [x, y] : [y, x];
    const key = `${a.id}:${b.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const first =
      anchor - 30 * DAY + pick(0, 600, choice("direct-at", key)) * MINUTE;
    const chat: DirectChat = {
      id: ids.take("conversation"),
      a: a.id,
      b: b.id,
      createdAt: iso(first),
    };
    directs.push(chat);
    for (let j = 0; j < 10; j++) {
      messages.push({
        id: ids.take("message"),
        conversation: `direct:${chat.id}`,
        author: j % 2 === 0 ? a.id : b.id,
        draft: ids.take("draft"),
        kind: "text",
        body: wordsOf(j + i),
        pinned: false,
        createdAt: iso(first + j * 2 * DAY),
      });
    }
  }

  // Read marks: everyone in each conversation, three in ten behind.
  const byConversation = new Map<string, Message[]>();
  for (const m of messages) {
    const list = byConversation.get(m.conversation) ?? [];
    list.push(m);
    byConversation.set(m.conversation, list);
  }
  const members = new Map<string, Person[]>();
  members.set("team", staff);
  for (const [d, department] of departments.entries()) {
    members.set(
      `department:${department.id}`,
      staff.filter((p) => p.department === d || p.second === d),
    );
  }
  for (const chat of directs) {
    members.set(
      `direct:${chat.id}`,
      staff.filter((p) => p.id === chat.a || p.id === chat.b),
    );
  }
  for (const [conversation, list] of members) {
    const sent = byConversation.get(conversation) ?? [];
    const last = sent[sent.length - 1];
    for (const person of list) {
      if (!last) continue;
      const behind = choice("read", person.id, conversation) < 0.3;
      const upTo = behind
        ? sent[
            Math.max(
              0,
              sent.length -
                1 -
                pick(1, 30, choice("behind", person.id, conversation)),
            )
          ]
        : last;
      reads.push({
        conversation,
        user: person.id,
        readAt: iso(
          Math.max(ms(upTo?.createdAt ?? last.createdAt), ms(person.joinedAt)) +
            MINUTE,
        ),
      });
    }
  }
  void spec;
  return { directs, messages, acks, reads };
}

/** A procedure sent to everyone, and each month's payslips, one person each. */
function documentsOf(
  spec: Spec,
  context: Context,
  people: Person[],
  owner: Person,
): Document[] {
  const { anchor, ids, today, chatDepth } = context;
  const staff = people.filter((p) => p.kind === "staff" && p.role !== "owner");
  const documents: Document[] = [];
  const file = (id: string) => `${spec.business.id}/${hexOf(`file:${id}`)}.pdf`;

  const sentAt = anchor - 6 * DAY;
  const procedureId = ids.take("document");
  documents.push({
    id: procedureId,
    upload: ids.take("upload"),
    category: "procedure",
    title: "נוהל עבודה בטוחה",
    author: owner.id,
    asks: true,
    path: file(procedureId),
    fileName: "procedure.pdf",
    fileSize: 4043,
    sentAt: iso(sentAt),
    recipients: staff
      .filter((p) => ms(p.joinedAt) < sentAt)
      .map((p) => {
        const u = choice("procedure", p.id);
        const opened =
          u < 0.85 ? sentAt + pick(1, 48, choice("opened", p.id)) * HOUR : null;
        return {
          user: p.id,
          openedAt:
            opened === null ? null : iso(Math.min(opened, anchor - MINUTE)),
          confirmedAt:
            opened !== null && u < 0.7
              ? iso(Math.min(opened + MINUTE, anchor - MINUTE))
              : null,
        };
      }),
  });

  const payslipMonths = chatDepth === "full" ? 4 : 1;
  let month = monthOf(today).start;
  for (let k = 0; k < payslipMonths; k++) {
    const previous = monthOf(addDays(month, -1)).start;
    const sent = Math.min(at(addDays(month, 9), "10:00"), anchor - HOUR);
    const [year, mm] = previous.split("-");
    for (const person of staff) {
      if (person.joinedOn >= month) continue;
      const id = ids.take("document");
      const opened = choice("payslip", person.id, previous) < 0.8;
      documents.push({
        id,
        upload: ids.take("upload"),
        category: "payslip",
        title: `תלוש שכר ${mm}/${year}`,
        author: owner.id,
        asks: false,
        path: file(id),
        fileName: `payslip-${year}-${mm}.pdf`,
        fileSize: 4459,
        sentAt: iso(sent),
        recipients: [
          {
            user: person.id,
            openedAt: opened
              ? iso(Math.min(sent + 3 * HOUR, anchor - MINUTE))
              : null,
            confirmedAt: null,
          },
        ],
      });
    }
    month = previous;
  }
  return documents;
}

/** Whether an entry still waits for someone to confirm it. */
export function waits(entry: Entry): boolean {
  return (
    (entry.inProof === "none" || entry.inProof === "self") &&
    entry.confirmedAt === null
  );
}

/** The kinds of line the seed writes through `private.notify` and the triggers. */
export type LineKind = "team.joined" | "schedule.published" | "clock.confirm";

/** Who holds clock.edit: the owner, the managers and the shift leads. */
export function clockEditors(business: BusinessShape): Person[] {
  return business.people.filter(
    (p) =>
      p.kind === "staff" &&
      (p.role === "owner" || p.role === "manager" || p.lead),
  );
}

/** The lines the waiting entries' log rows write: each to every holder but its person; one of a manager's own hours to the owners. */
export function confirmLines(business: BusinessShape): number {
  const editors = clockEditors(business);
  const owners = business.people.filter(
    (p) => p.role === "owner" && p.kind === "staff",
  );
  return business.entries.filter(waits).reduce((sum, e) => {
    const to = e.inProof === "self" ? owners : editors;
    return sum + to.filter((p) => p.id !== e.user).length;
  }, 0);
}

/** This week's first publish, under way: a line for each person with a shift still to start. */
export function thisWeekLines(business: BusinessShape, anchor: string): number {
  const week = business.weeks.find(
    (w) => w.kind === "this" && w.via === "publish",
  );
  if (!week) return 0;
  const people = new Set<string>();
  for (const s of week.shifts) {
    if (ms(s.startsAt) <= ms(anchor)) continue;
    for (const a of s.assignees)
      if (a.user !== business.scheduler) people.add(a.user);
  }
  return people.size;
}

/** The Israel date of an instant, as the SQL reads it for the read marks. */
export function israelDate(instant: string): string {
  return dateIn(new Date(instant), ZONE);
}

/** Whether the seed marks a line it wrote itself read (80-lines): seven in ten, made before this week. */
export function seedReads(
  user: string,
  when: string,
  weekStart: string,
): boolean {
  return (
    ms(when) < at(weekStart, "00:00") &&
    choice("read", user, israelDate(when)) < 0.7
  );
}

/** Lines the seed wrote itself and marks read. */
export function readLines(business: BusinessShape, weekStart: string): number {
  let read = 0;
  for (const line of business.joined)
    for (const user of line.recipients)
      if (seedReads(user, line.at, weekStart)) read += 1;
  for (const line of business.published)
    if (seedReads(line.user, line.at, weekStart)) read += 1;
  return read;
}

/** Sunday to Thursday, from `from` to `to`: the days a pay holder opened the pay screens. */
export function payrollViewDays(from: string, to: string): number {
  let days = 0;
  for (let d = from; d <= to; d = addDays(d, 1))
    if (weekdayOf(d) <= 4) days += 1;
  return days;
}

/** A hash of the whole shape: equal for the same version and anchor, and only then. */
export function shapeHash(value: Shape): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
