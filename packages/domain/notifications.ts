import { z } from "zod";
import { isUuid } from "./activity";
import { atLeast, type ModuleKey, type Role } from "./modules";

/**
 * Notifications in the app: what happened that a person should know, one line
 * per person per thing. The database writes them, from the audit log
 * (`private.notify_for` in supabase/migrations/20261109000450_notifications.sql,
 * and a module's own, like `private.notify_for_lists`);
 * this file says what each kind is about, who it is for, where it leads, and
 * how its stored facts read back. A row's params are free JSON, so each kind is
 * read leniently: anything unexpected becomes a plain line, never an error.
 */

/** What a person switches on or off for the phone, later: each kind is in one. */
export const NOTIFICATION_GROUPS = [
  "schedule",
  "swaps",
  "approvals",
  "team",
  "lists",
] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

type KindInfo = {
  /** Null for a line nobody switches off: the test from the phone switch. */
  group: NotificationGroup | null;
  /** The module the line is about; switching it off hides the line. */
  module: ModuleKey | null;
  /** The lowest role the line is ever for. */
  minRole: Role;
  /**
   * The reader has something to do about it (take a shift, approve). The Home
   * tab counts only these, in red and read out as "needs action"; the bell
   * counts everything unread.
   */
  needsAction: boolean;
  /** Where opening it leads, inside the app. */
  href: `/${string}`;
  /**
   * Leads to the thing itself when the line names it: "list" opens
   * `/lists/<params.list>`, "payMonth" the hours for payroll of
   * `params.month`, and `href` is where it leads otherwise.
   */
  to?: "list" | "payMonth";
  /**
   * Where a settled line leads instead, when settling it closes `href` to its
   * reader (access taken back): the inbox, which leads nowhere new.
   */
  settledHref?: `/${string}`;
};

export const NOTIFICATION_KINDS = {
  "schedule.published": {
    group: "schedule",
    module: "scheduling",
    minRole: "worker",
    needsAction: false,
    href: "/schedule/shifts",
  },
  "schedule.changed": {
    group: "schedule",
    module: "scheduling",
    minRole: "worker",
    needsAction: false,
    href: "/schedule/shifts",
  },
  "swap.offered": {
    group: "swaps",
    module: "scheduling",
    minRole: "worker",
    needsAction: true,
    href: "/schedule/shifts",
  },
  "swap.taken": {
    group: "swaps",
    module: "scheduling",
    minRole: "worker",
    needsAction: false,
    href: "/schedule/shifts",
  },
  "swap.waiting": {
    group: "approvals",
    module: "scheduling",
    minRole: "manager",
    needsAction: true,
    href: "/schedule/swaps",
  },
  "swap.cancelled": {
    group: "swaps",
    module: "scheduling",
    minRole: "worker",
    needsAction: false,
    href: "/schedule/shifts",
  },
  "swap.approved": {
    group: "swaps",
    module: "scheduling",
    minRole: "worker",
    needsAction: false,
    href: "/schedule/shifts",
  },
  "swap.declined": {
    group: "swaps",
    module: "scheduling",
    minRole: "worker",
    needsAction: false,
    href: "/schedule/shifts",
  },
  "swap.removed": {
    group: "swaps",
    module: "scheduling",
    minRole: "worker",
    needsAction: false,
    href: "/schedule/shifts",
  },
  "clock.confirm": {
    group: "approvals",
    module: "time_clock",
    minRole: "manager",
    needsAction: true,
    // Hours are approved on the team's hours.
    href: "/clock/team",
  },
  "team.joined": {
    group: "team",
    module: null,
    minRole: "manager",
    needsAction: false,
    href: "/team",
  },
  // The Lists tab counts the open lists a person holds, so a list's lines
  // don't ask for action on Home as well.
  "lists.sent": {
    group: "lists",
    module: "lists",
    minRole: "worker",
    needsAction: false,
    href: "/lists",
    to: "list",
  },
  "lists.finished": {
    group: "lists",
    module: "lists",
    minRole: "worker",
    needsAction: false,
    href: "/lists",
    to: "list",
  },
  // A list passed to the reader's department (lists L5), which their Lists
  // tab then counts.
  "lists.passed": {
    group: "lists",
    module: "lists",
    minRole: "worker",
    needsAction: false,
    href: "/lists",
    to: "list",
  },
  // A list's times (lists L4): due soon and late, to the people it is for,
  // whose Lists tab already counts it.
  "lists.due": {
    group: "lists",
    module: "lists",
    minRole: "worker",
    needsAction: false,
    href: "/lists",
    to: "list",
  },
  "lists.late": {
    group: "lists",
    module: "lists",
    minRole: "worker",
    needsAction: false,
    href: "/lists",
    to: "list",
  },
  // To list managers, whose Lists tab counts only what they hold: these ask
  // them to look.
  "lists.late_team": {
    group: "lists",
    module: "lists",
    minRole: "worker",
    needsAction: true,
    href: "/lists/today",
    to: "list",
  },
  "lists.out_of_range": {
    group: "lists",
    module: "lists",
    minRole: "worker",
    needsAction: true,
    href: "/lists/today",
    to: "list",
  },
  // Someone was given pay access to them alone (payroll P3): about their own
  // access, so not a line anyone switches off. Taking it back settles it, and
  // the pay screens are then not found for them: a settled line stays in the
  // inbox.
  "access.pay_granted": {
    group: null,
    module: "time_clock",
    minRole: "worker",
    needsAction: false,
    href: "/clock/pay",
    settledHref: "/notifications",
  },
  // The reader's own hourly wage was set, from a day (payroll P4): about
  // their own pay, so not a line anyone switches off. It names the day and
  // never the amount, which the clock shows them.
  "pay.wage_set": {
    group: null,
    module: "time_clock",
    minRole: "worker",
    needsAction: false,
    href: "/clock",
  },
  // A shift of a month closed for payroll was corrected or added (payroll
  // P9): to the month's closer and the accountants, one line per month. Its
  // difference goes into the next month's file; nothing to do here.
  "pay.after_close": {
    group: null,
    module: "time_clock",
    minRole: "worker",
    needsAction: false,
    href: "/clock/pay",
    to: "payMonth",
  },
  // On the 2nd, last month's hours wait to be closed (payroll P9): to its pay
  // holders, with how many shifts wait or are open. Closing it settles it.
  "pay.month_due": {
    group: null,
    module: "time_clock",
    minRole: "worker",
    needsAction: true,
    href: "/clock/pay",
    to: "payMonth",
  },
  // "Send a test notification", from the phone switch: to the person alone.
  "push.test": {
    group: null,
    module: null,
    minRole: "worker",
    needsAction: false,
    href: "/notifications",
  },
} as const satisfies Record<string, KindInfo>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export const NOTIFICATION_KIND_KEYS = Object.keys(
  NOTIFICATION_KINDS,
) as NotificationKind[];

/** The kind a stored row names, when it is one this app knows. */
export function notificationKindOf(value: unknown): NotificationKind | null {
  return NOTIFICATION_KIND_KEYS.find((kind) => kind === value) ?? null;
}

/** Where the inbox itself is, and where an unknown line leads. */
export const INBOX_PATH = "/notifications";

/**
 * Where opening a line leads: always a path inside the app, chosen from the
 * line's kind, so a stored row can never send anyone elsewhere. A kind about
 * one thing leads to it when its params name it by a real id. A settled line
 * of a kind whose screen closes once it is (`settledHref`) leads there.
 */
export function linkFor(
  kind: string,
  params?: unknown,
  settled = false,
): `/${string}` {
  const known = notificationKindOf(kind);
  if (!known) return INBOX_PATH;
  const info: KindInfo = NOTIFICATION_KINDS[known];
  if (settled && info.settledHref) return info.settledHref;
  if (info.to === "list") {
    const list = z.object({ list: z.string() }).safeParse(params);
    if (list.success && isUuid(list.data.list)) {
      return `/lists/${list.data.list.toLowerCase()}`;
    }
  }
  if (info.to === "payMonth") {
    const month = schemas.month.safeParse(params);
    if (month.success) return `${info.href}?month=${month.data.month}`;
  }
  return info.href;
}

/**
 * A path inside the app: one slash, then no scheme, host, backslash or
 * control character that a browser could read as one.
 */
export function isAppPath(url: unknown): url is `/${string}` {
  return (
    typeof url === "string" &&
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    [...url].every((char) => char.charCodeAt(0) > 0x1f)
  );
}

/** Whether a line asks its reader to do something. */
export function needsAction(kind: string): boolean {
  const known = notificationKindOf(kind);
  return known ? NOTIFICATION_KINDS[known].needsAction : false;
}

/** How many lines a person has not read in a business. */
export type UnreadCounts = {
  /** Everything unread: the bell. */
  all: number;
  /** What needs them to act: the Home tab. */
  action: number;
};

export const NO_UNREAD: UnreadCounts = { all: 0, action: 0 };

/**
 * The counts for one business, from the person's unread rows in every business
 * they read (RLS gives only lines still for them).
 */
export function unreadCounts(
  rows: readonly { business_id: string; kind: string }[],
  businessId: string,
): UnreadCounts {
  let all = 0;
  let action = 0;
  for (const row of rows) {
    if (row.business_id !== businessId) continue;
    all += 1;
    if (needsAction(row.kind)) action += 1;
  }
  return { all, action };
}

/**
 * The groups of lines a person in this role can get in a business with these
 * modules on, in order: what the inbox says reaches it.
 */
export function groupsFor(
  role: Role,
  enabled: readonly ModuleKey[],
): NotificationGroup[] {
  return NOTIFICATION_GROUPS.filter((group) =>
    NOTIFICATION_KIND_KEYS.some((kind) => {
      const info: KindInfo = NOTIFICATION_KINDS[kind];
      return (
        info.group === group &&
        atLeast(role, info.minRole) &&
        (info.module === null || enabled.includes(info.module))
      );
    }),
  );
}

/**
 * Lines a page of the inbox shows. The unread ones come first, every one of
 * them a page at a time, then the ones already read: what the bell counts can
 * always be found.
 */
export const INBOX_PAGE_SIZE = 40;

/** A line a page ends on, by time and then id. */
export type InboxPlace = { at: string; id: string };

/**
 * Where an older page starts: after the last line shown of the unread ones, or
 * of the read ones (`after` null: at the first read one).
 */
export type InboxCursor =
  | { part: "unread"; after: InboxPlace }
  | { part: "read"; after: InboxPlace | null };

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

const PARTS = { u: "unread", r: "read" } as const;

/** The `?before=` of an older page, or null for the newest. */
export function parseInboxCursor(value: unknown): InboxCursor | null {
  if (typeof value !== "string" || value.length > 90) return null;
  // A "+" in a link reads back as a space when it isn't escaped.
  const [tag = "", ...place] = value.replace(/ /g, "+").split("~");
  const part = tag === "u" || tag === "r" ? PARTS[tag] : null;
  if (!part) return null;
  if (place.length === 0) {
    return part === "read" ? { part, after: null } : null;
  }
  const [at = "", id = "", ...rest] = place;
  if (rest.length > 0 || !INSTANT.test(at) || Number.isNaN(Date.parse(at))) {
    return null;
  }
  return isUuid(id) ? { part, after: { at, id: id.toLowerCase() } } : null;
}

/** A cursor as `parseInboxCursor` reads it back. */
export function inboxCursor(cursor: InboxCursor): string {
  const tag = cursor.part === "unread" ? "u" : "r";
  return cursor.after ? `${tag}~${cursor.after.at}~${cursor.after.id}` : tag;
}

/** A row as the database gives it. */
export type NotificationRow = {
  id: string;
  kind: string;
  params: unknown;
  actorId: string | null;
  createdAt: string;
  readAt: string | null;
  /** When what it asked for was handled, for everyone; null while it waits. */
  resolvedAt: string | null;
};

/**
 * One page of the inbox from what was read for it, newest first: up to
 * `INBOX_PAGE_SIZE + 1` unread lines after the cursor (none when it is among
 * the read ones), and as many read lines from where the read part starts. The
 * unread lines fill the page first, and read lines what is left of it.
 */
export function inboxPage<T extends { createdAt: string; id: string }>(
  before: InboxCursor | null,
  unread: readonly T[],
  read: readonly T[],
): { unread: T[]; earlier: T[]; older: InboxCursor | null } {
  const place = (line: T): InboxPlace => ({ at: line.createdAt, id: line.id });
  const shown = before?.part === "read" ? [] : unread.slice(0, INBOX_PAGE_SIZE);
  const last = shown.at(-1);
  if (unread.length > INBOX_PAGE_SIZE && last && before?.part !== "read") {
    return {
      unread: shown,
      earlier: [],
      older: { part: "unread", after: place(last) },
    };
  }
  const room = INBOX_PAGE_SIZE - shown.length;
  const earlier = read.slice(0, room);
  const lastRead = earlier.at(-1);
  return {
    unread: shown,
    earlier,
    older:
      read.length > room
        ? { part: "read", after: lastRead ? place(lastRead) : null }
        : null,
  };
}

/** What lines point at, read under the reader's own access. */
export type NotificationLookups = {
  /** The business's memberships, active or not, by person. */
  members: ReadonlyMap<string, { active: boolean; name: string | null }>;
};

/** Someone a line names, as its reader may know them. */
export type NotificationPerson =
  /** In the team now. The name is null when nobody wrote one down. */
  | { kind: "member"; name: string | null }
  /** Was in the team and has left. */
  | { kind: "former" }
  /** Nothing says who. */
  | { kind: "unknown" };

/** A shift as a line shows it: what everyone reads in the published week. */
export type NotificationShift = {
  /** YYYY-MM-DD */
  day: string;
  name: string;
  /** HH:MM, the business's own clock. */
  start: string;
  end: string;
};

/** The reader's own part in a decided swap. */
export type SwapSide = "from" | "to" | null;

export type NotificationLine =
  | {
      kind: "schedule.published" | "schedule.changed";
      /** The week's first day, YYYY-MM-DD. */
      startsOn: string;
      /** How many of the week's shifts are the reader's. */
      mine: number;
    }
  | {
      kind: "swap.offered" | "swap.cancelled";
      shift: NotificationShift | null;
      from: NotificationPerson;
    }
  | {
      kind: "swap.taken";
      shift: NotificationShift | null;
      by: NotificationPerson;
    }
  | {
      kind: "swap.waiting";
      shift: NotificationShift | null;
      from: NotificationPerson;
      to: NotificationPerson;
    }
  | {
      kind: "swap.approved" | "swap.declined";
      shift: NotificationShift | null;
      from: NotificationPerson;
      to: NotificationPerson;
      /** Whether the reader asked, or took it. */
      side: SwapSide;
    }
  | { kind: "swap.removed"; shift: NotificationShift | null }
  | {
      kind: "clock.confirm";
      person: NotificationPerson;
      /** 'none': without a code; 'self': hours someone set for themselves. */
      proof: "none" | "self";
      direction: "in" | "out";
      /** The time that waits, as an ISO instant. */
      at: string;
    }
  | { kind: "team.joined"; person: NotificationPerson }
  | {
      kind: "lists.sent" | "lists.finished";
      /** The list's name, as it was sent. */
      name: string;
    }
  | {
      /** A list passed to the reader's department; the actor passed it. */
      kind: "lists.passed";
      name: string;
      /** The department's name when it was passed; null when the line lost it. */
      department: string | null;
      /** A note came with it, which the list itself shows. */
      hasNote: boolean;
    }
  | {
      kind: "lists.due" | "lists.late" | "lists.late_team";
      name: string;
      /** When it is due, as an ISO instant; null when the line lost it. */
      due: string | null;
    }
  | {
      /** A reading outside its item's range; the actor read it. */
      kind: "lists.out_of_range";
      name: string;
      /** The item's label; null when the line lost it. */
      label: string | null;
      /**
       * The reading with its range and unit; null for a line from before it
       * kept them.
       */
      reading: {
        value: number;
        min: number | null;
        max: number | null;
        unit: string | null;
      } | null;
    }
  /** Pay access, given to the reader alone; the actor gave it. */
  | { kind: "access.pay_granted" }
  | {
      /** The reader's hourly wage changed; the actor set it. */
      kind: "pay.wage_set";
      /** The day it takes effect, YYYY-MM-DD; null when the line lost it. */
      since: string | null;
    }
  | {
      /** A shift of a closed month was corrected or added; the actor did it. */
      kind: "pay.after_close";
      /** The closed month, YYYY-MM; null when the line lost it. */
      month: string | null;
    }
  | {
      /** Last month's hours wait to be closed. */
      kind: "pay.month_due";
      /** That month, YYYY-MM; null when the line lost it. */
      month: string | null;
      /** Its shifts waiting for a confirmation, and still open. */
      waiting: number;
      open: number;
    }
  | { kind: "push.test" }
  | { kind: "other" };

/** One line of the inbox. Holds no ids but its own, so it can go anywhere. */
export type NotificationEntry = {
  id: string;
  /** When, as an ISO instant. */
  at: string;
  read: boolean;
  /**
   * What it asked for was handled, for everyone (a shift taken, a request
   * decided, hours confirmed): it no longer says something waits.
   */
  settled: boolean;
  /** Who did it, for the line's picture. */
  actor: NotificationPerson;
  group: NotificationGroup | null;
  href: `/${string}`;
  line: NotificationLine;
};

const uuid = z.string().refine(isUuid);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const shift = z.object({
  day: z.iso.date(),
  name: z.string().min(1),
  start: hhmm,
  end: hhmm,
});
const instant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a time");

const schemas = {
  week: z.object({ startsOn: z.iso.date(), mine: z.int().min(0) }),
  from: z.object({ from: uuid }),
  by: z.object({ by: uuid }),
  decided: z.object({ from: uuid, to: uuid.nullable().optional() }),
  confirm: z.object({
    person: uuid,
    proof: z.enum(["none", "self"]),
    direction: z.enum(["in", "out"]),
    at: instant,
  }),
  person: z.object({ person: uuid }),
  list: z.object({ list: uuid, name: z.string().min(1) }),
  due: z.object({ due: instant }),
  passed: z.object({
    departmentName: z.string().min(1).nullable().catch(null),
    hasNote: z.boolean().catch(false),
  }),
  label: z.object({ label: z.string().min(1) }),
  reading: z.object({
    reading: z.number(),
    min: z.number().nullable().default(null),
    max: z.number().nullable().default(null),
    unit: z.string().nullable().default(null),
  }),
  since: z.object({ since: z.iso.date() }),
  month: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
  counts: z.object({
    waiting: z.int().min(0).catch(0),
    open: z.int().min(0).catch(0),
  }),
};

function personOf(
  id: string | null | undefined,
  lookups: NotificationLookups,
): NotificationPerson {
  const member = id ? lookups.members.get(id.toLowerCase()) : undefined;
  if (!member) return { kind: "unknown" };
  return member.active
    ? { kind: "member", name: member.name }
    : { kind: "former" };
}

function lineOf(
  row: NotificationRow,
  lookups: NotificationLookups,
  readerId: string,
): NotificationLine {
  const other = { kind: "other" } as const;
  const read = <S extends z.ZodType>(schema: S) => {
    const parsed = schema.safeParse(row.params);
    return parsed.success ? (parsed.data as z.infer<S>) : null;
  };
  // A line still reads without its shift, if that much is missing.
  const shiftOf = (): NotificationShift | null => {
    const parsed = z.object({ shift }).safeParse(row.params);
    return parsed.success ? parsed.data.shift : null;
  };
  const kind = notificationKindOf(row.kind);
  switch (kind) {
    case "schedule.published":
    case "schedule.changed": {
      const params = read(schemas.week);
      return params
        ? { kind, startsOn: params.startsOn, mine: params.mine }
        : other;
    }
    case "swap.offered":
    case "swap.cancelled": {
      const params = read(schemas.from);
      return params
        ? { kind, shift: shiftOf(), from: personOf(params.from, lookups) }
        : other;
    }
    case "swap.taken": {
      const params = read(schemas.by);
      return params
        ? { kind, shift: shiftOf(), by: personOf(params.by, lookups) }
        : other;
    }
    case "swap.waiting":
    case "swap.approved":
    case "swap.declined": {
      const params = read(schemas.decided);
      if (!params) return other;
      const to = params.to ?? null;
      const people = {
        shift: shiftOf(),
        from: personOf(params.from, lookups),
        to: personOf(to, lookups),
      };
      if (kind === "swap.waiting") return { kind, ...people };
      const reader = readerId.toLowerCase();
      const side: SwapSide =
        params.from.toLowerCase() === reader
          ? "from"
          : to?.toLowerCase() === reader
            ? "to"
            : null;
      return { kind, ...people, side };
    }
    case "swap.removed":
      return { kind, shift: shiftOf() };
    case "clock.confirm": {
      const params = read(schemas.confirm);
      return params
        ? {
            kind,
            person: personOf(params.person, lookups),
            proof: params.proof,
            direction: params.direction,
            at: params.at,
          }
        : other;
    }
    case "team.joined": {
      const params = read(schemas.person);
      return params
        ? { kind, person: personOf(params.person, lookups) }
        : other;
    }
    case "lists.sent":
    case "lists.finished": {
      const params = read(schemas.list);
      return params ? { kind, name: params.name } : other;
    }
    case "lists.passed": {
      const params = read(schemas.list);
      // Still a line without the department's name.
      const passed = read(schemas.passed);
      return params
        ? {
            kind,
            name: params.name,
            department: passed?.departmentName ?? null,
            hasNote: passed?.hasNote ?? false,
          }
        : other;
    }
    case "lists.due":
    case "lists.late":
    case "lists.late_team": {
      const params = read(schemas.list);
      // Still a line without its due time.
      return params
        ? { kind, name: params.name, due: read(schemas.due)?.due ?? null }
        : other;
    }
    case "lists.out_of_range": {
      const params = read(schemas.list);
      const reading = read(schemas.reading);
      return params
        ? {
            kind,
            name: params.name,
            label: read(schemas.label)?.label ?? null,
            reading: reading
              ? {
                  value: reading.reading,
                  min: reading.min,
                  max: reading.max,
                  unit: reading.unit,
                }
              : null,
          }
        : other;
    }
    case "pay.wage_set":
      // The line still says the wage changed without its day.
      return { kind, since: read(schemas.since)?.since ?? null };
    case "pay.after_close":
      // And a closed month changed without its name.
      return { kind, month: read(schemas.month)?.month ?? null };
    case "pay.month_due": {
      const counts = read(schemas.counts);
      return {
        kind,
        month: read(schemas.month)?.month ?? null,
        waiting: counts?.waiting ?? 0,
        open: counts?.open ?? 0,
      };
    }
    case "access.pay_granted":
    case "push.test":
      return { kind };
    case null:
      return other;
    default: {
      // A new kind needs its reading here: typecheck says so.
      const unhandled: never = kind;
      return unhandled;
    }
  }
}

/** The people a page of rows names, each one safe to look up. */
export function notificationRefs(rows: readonly NotificationRow[]): string[] {
  const people = new Set<string>();
  const add = (value: unknown) => {
    if (isUuid(value)) people.add(value.toLowerCase());
  };
  for (const row of rows) {
    add(row.actorId);
    const params = z.record(z.string(), z.unknown()).safeParse(row.params);
    if (!params.success) continue;
    const { from, to, by, person } = params.data;
    add(from);
    add(to);
    add(by);
    add(person);
  }
  return [...people];
}

/** The inbox's lines from their rows, in the order given. */
export function buildInbox(
  rows: readonly NotificationRow[],
  lookups: NotificationLookups,
  readerId: string,
): NotificationEntry[] {
  return rows.map((row) => {
    const kind = notificationKindOf(row.kind);
    return {
      id: row.id,
      at: row.createdAt,
      read: row.readAt !== null,
      settled: row.resolvedAt !== null,
      actor: personOf(row.actorId, lookups),
      group: kind ? NOTIFICATION_KINDS[kind].group : null,
      href: linkFor(row.kind, row.params, row.resolvedAt !== null),
      line: lineOf(row, lookups, readerId),
    };
  });
}
