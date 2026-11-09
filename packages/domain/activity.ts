import { z } from "zod";
import { addDays, dateIn } from "./availability";
import { ROLES, type Role } from "./modules";
import { shabbatCityOf } from "./shabbat";

/**
 * The business's activity log: what changed, who changed it and when, read from
 * the audit log rows its owners and managers may read. A row's details are free
 * JSON whose shape depends on its action and has changed over time, so each is
 * read leniently: anything unexpected becomes a plain line, never an error.
 */

/** Punches repeat what the team's hours already show, so the log leaves them out. */
export const ROUTINE_ACTIONS = [
  "clock.in",
  "clock.out",
  "clock.break_start",
  "clock.break_end",
  "clock.undo_out",
] as const;

/** Rows a page of the log reads. */
export const ACTIVITY_PAGE_SIZE = 40;

/** Edits to the same settings this close together read as one change. */
export const FOLD_MINUTES = 10;

/** Someone a row names, as the reader may know them. */
export type ActivityPerson =
  /** In the team now. The name is null when nobody wrote one down. */
  | { kind: "member"; name: string | null }
  /** Was in the team and has left. */
  | { kind: "former" }
  /** The ConceptApp team. */
  | { kind: "team" }
  /** No longer in the app, or nothing says who. */
  | { kind: "unknown" };

/** An audit log row, as the database gives it. */
export type ActivityRow = {
  id: number;
  action: string;
  details: unknown;
  createdAt: string;
  actorId: string | null;
};

export type ActivityShift = {
  /** YYYY-MM-DD */
  day: string;
  name: string;
  /** HH:MM, the business's own clock. */
  start: string;
  end: string;
};

/** What rows point at, read with them under the reader's own access. */
export type ActivityLookups = {
  /** The business's memberships, active or not, by person. */
  members: ReadonlyMap<string, { active: boolean; name: string | null }>;
  invites: ReadonlyMap<string, { name: string | null; role: Role | null }>;
  shifts: ReadonlyMap<string, ActivityShift>;
  swaps: ReadonlyMap<
    string,
    { shiftId: string; requestedBy: string; takenBy: string | null }
  >;
};

export const DETAIL_KEYS = [
  "name",
  "accent",
  "address",
  "shabbatCity",
] as const;
export type DetailKey = (typeof DETAIL_KEYS)[number];

/**
 * One setting or detail, before and after. `from` is undefined when nothing says
 * what it was. For a module's setting, null means it was never set, so it had the
 * module's default; for a detail, null means it was empty.
 */
export type FieldChange<Key extends string = string> = {
  key: Key;
  from: unknown;
  to: unknown;
};

export type ClockTimes = { clockIn: string; clockOut: string | null };

export type ActivityLine =
  | { action: "business.create"; invites: number }
  | { action: "business.details"; changes: FieldChange<DetailKey>[] }
  | { action: "module.settings"; module: string; changes: FieldChange[] }
  | { action: "module.enabled"; module: string; enabled: boolean }
  | { action: "clock.add"; person: ActivityPerson; times: ClockTimes }
  | {
      action: "clock.correct";
      person: ActivityPerson;
      from: ClockTimes;
      to: ClockTimes;
    }
  /** A manager approved hours made without a code, or set by someone for themselves. */
  | { action: "clock.confirm"; person: ActivityPerson }
  /** Typing the clock's code was blocked after too many wrong tries; the actor is who typed. */
  | { action: "clock.code.locked" }
  | {
      action: "invite.create" | "invite.send";
      name: string | null;
      role: Role | null;
    }
  | { action: "invite.claim"; role: Role | null }
  | { action: "view_as.start" | "view_as.end"; role: Role | null }
  | { action: "swap.request" | "swap.cancel"; shift: ActivityShift | null }
  | {
      action: "swap.take";
      shift: ActivityShift | null;
      /** Whose shift it was, when the request is still there to say. */
      from: ActivityPerson | null;
    }
  | {
      action: "swap.approve" | "swap.decline";
      shift: ActivityShift | null;
      from: ActivityPerson;
      to: ActivityPerson | null;
    }
  | {
      action: "schedule.publish";
      /** The week's first day, YYYY-MM-DD. */
      startsOn: string;
      shifts: number;
      first: boolean;
      swapsRemoved: number;
    }
  | {
      /** One of the app's sentences, replaced for the business or cleared. */
      action: "wording.change";
      to: string | null;
      from: string | null;
    }
  /** An owner or manager cleared someone's line about themselves; never its text. */
  | { action: "profile.bio_cleared"; person: ActivityPerson }
  | { action: "other" };

/** One line of the log. Holds no ids, so it can go anywhere. */
export type ActivityEntry = {
  id: number;
  /** When, as an ISO instant. */
  at: string;
  actor: ActivityPerson;
  line: ActivityLine;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id that's safe to look up: details can hold anything. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

const id = z.string();
const instant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a time");
const fields = z.record(z.string(), z.unknown());
const times = z.object({ clock_in: instant, clock_out: instant.nullable() });

const schemas = {
  "business.create": z.object({ invites: z.int().min(0).optional() }),
  "business.details": z.object({ from: fields.nullable(), to: fields }),
  "module.settings": z.object({
    module: z.string(),
    from: fields.nullable().optional(),
    to: fields,
  }),
  "module.enabled": z.object({ module: z.string(), enabled: z.boolean() }),
  // Before module.settings, the clock wrote this one setting by itself.
  "clock.settings": z.object({ unpaid_breaks: z.boolean() }),
  "clock.add": z.object({
    person: id,
    clock_in: instant,
    clock_out: instant.nullable().optional(),
  }),
  "clock.correct": z.object({ person: id, from: times, to: times }),
  "clock.confirm": z.object({ person: id }),
  "clock.code.locked": z.object({ person: id.optional() }),
  invite: z.object({ invite: id, role: z.unknown().optional() }),
  role: z.object({ role: z.unknown().optional() }),
  "swap.request": z.object({ swap: id, shift: id }),
  swap: z.object({ swap: id }),
  "swap.decide": z.object({
    swap: id,
    shift: id.optional(),
    from: id,
    to: id.nullable().optional(),
  }),
  "schedule.publish": z.object({
    starts_on: z.iso.date(),
    shifts: z.int().min(0),
    first: z.boolean(),
    swaps_removed: z.int().min(0),
  }),
  "profile.bio_cleared": z.object({ person: id }),
  "wording.change": z.object({
    key: z.string(),
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  }),
};

const DETAIL_COLUMNS: Record<string, DetailKey> = {
  name: "name",
  accent: "accent",
  address: "address",
  shabbat_city: "shabbatCity",
};

function roleOf(value: unknown): Role | null {
  const role = z.enum(ROLES).safeParse(value);
  return role.success ? role.data : null;
}

/** Who did it: a member now or before, or else the ConceptApp team, the only
 * other writer of a business's log. */
function actorOf(actorId: string | null, lookups: ActivityLookups) {
  if (actorId === null) return { kind: "unknown" } as const;
  const member = lookups.members.get(actorId);
  if (!member) return { kind: "team" } as const;
  return member.active
    ? ({ kind: "member", name: member.name } as const)
    : ({ kind: "former" } as const);
}

/** Someone a row names: in the team now, or before, or nobody known. */
function personOf(
  personId: string | null | undefined,
  lookups: ActivityLookups,
): ActivityPerson {
  const member = personId ? lookups.members.get(personId) : undefined;
  if (!member) return { kind: "unknown" };
  return member.active
    ? { kind: "member", name: member.name }
    : { kind: "former" };
}

function detailValue(key: DetailKey, value: unknown): string | null {
  if (key === "shabbatCity") return shabbatCityOf(value);
  return typeof value === "string" && value.trim() ? value : null;
}

function clockTimes(value: z.infer<typeof times>): ClockTimes {
  return { clockIn: value.clock_in, clockOut: value.clock_out };
}

function lineOf(row: ActivityRow, lookups: ActivityLookups): ActivityLine {
  const other = { action: "other" } as const;
  const read = <S extends z.ZodType>(schema: S) => {
    const parsed = schema.safeParse(row.details);
    return parsed.success ? (parsed.data as z.infer<S>) : null;
  };
  const shiftOf = (shiftId: string | undefined) =>
    (shiftId && lookups.shifts.get(shiftId)) || null;

  switch (row.action) {
    case "business.create": {
      const details = read(schemas["business.create"]);
      return details
        ? { action: row.action, invites: details.invites ?? 0 }
        : other;
    }
    case "business.details": {
      const details = read(schemas["business.details"]);
      if (!details) return other;
      const changes = Object.entries(DETAIL_COLUMNS)
        .filter(([column]) => Object.hasOwn(details.to, column))
        .map(([column, key]) => ({
          key,
          from: detailValue(key, details.from?.[column]),
          to: detailValue(key, details.to[column]),
        }));
      return { action: row.action, changes };
    }
    case "module.settings": {
      const details = read(schemas["module.settings"]);
      if (!details) return other;
      return {
        action: row.action,
        module: details.module,
        // Null: the business never set it, so it had the module's default.
        changes: Object.entries(details.to).map(([key, to]) => ({
          key,
          from: details.from?.[key] ?? null,
          to,
        })),
      };
    }
    case "clock.settings": {
      const details = read(schemas["clock.settings"]);
      if (!details) return other;
      return {
        action: "module.settings",
        module: "time_clock",
        changes: [
          { key: "unpaidBreaks", from: undefined, to: details.unpaid_breaks },
        ],
      };
    }
    case "wording.change": {
      const details = read(schemas["wording.change"]);
      return details
        ? {
            action: row.action,
            to: details.to ?? null,
            from: details.from ?? null,
          }
        : other;
    }
    case "module.enabled": {
      const details = read(schemas["module.enabled"]);
      return details
        ? {
            action: row.action,
            module: details.module,
            enabled: details.enabled,
          }
        : other;
    }
    case "clock.add": {
      const details = read(schemas["clock.add"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        times: {
          clockIn: details.clock_in,
          clockOut: details.clock_out ?? null,
        },
      };
    }
    case "clock.correct": {
      const details = read(schemas["clock.correct"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        from: clockTimes(details.from),
        to: clockTimes(details.to),
      };
    }
    case "clock.confirm": {
      const details = read(schemas["clock.confirm"]);
      return details
        ? { action: row.action, person: personOf(details.person, lookups) }
        : other;
    }
    case "profile.bio_cleared": {
      const details = read(schemas["profile.bio_cleared"]);
      return details
        ? { action: row.action, person: personOf(details.person, lookups) }
        : other;
    }
    case "clock.code.locked":
      return read(schemas["clock.code.locked"])
        ? { action: row.action }
        : other;
    case "invite.create":
    case "invite.send": {
      const details = read(schemas.invite);
      if (!details) return other;
      const invite = lookups.invites.get(details.invite);
      return {
        action: row.action,
        name: invite?.name ?? null,
        role: roleOf(details.role) ?? invite?.role ?? null,
      };
    }
    case "invite.claim":
    case "view_as.start":
    case "view_as.end": {
      const details = read(schemas.role);
      return details
        ? { action: row.action, role: roleOf(details.role) }
        : other;
    }
    case "swap.request": {
      const details = read(schemas["swap.request"]);
      return details
        ? { action: row.action, shift: shiftOf(details.shift) }
        : other;
    }
    case "swap.take":
    case "swap.cancel": {
      const details = read(schemas.swap);
      if (!details) return other;
      const swap = lookups.swaps.get(details.swap);
      const shift = shiftOf(swap?.shiftId);
      return row.action === "swap.take"
        ? {
            action: row.action,
            shift,
            from: swap ? personOf(swap.requestedBy, lookups) : null,
          }
        : { action: row.action, shift };
    }
    case "swap.approve":
    case "swap.decline": {
      const details = read(schemas["swap.decide"]);
      if (!details) return other;
      return {
        action: row.action,
        shift: shiftOf(
          details.shift ?? lookups.swaps.get(details.swap)?.shiftId,
        ),
        from: personOf(details.from, lookups),
        to: details.to ? personOf(details.to, lookups) : null,
      };
    }
    case "schedule.publish": {
      const details = read(schemas["schedule.publish"]);
      return details
        ? {
            action: row.action,
            startsOn: details.starts_on,
            shifts: details.shifts,
            first: details.first,
            swapsRemoved: details.swaps_removed,
          }
        : other;
    }
    default:
      return other;
  }
}

/** The ids a page of rows points at, each one safe to look up. */
export function activityRefs(rows: readonly ActivityRow[]) {
  const people = new Set<string>();
  const invites = new Set<string>();
  const shifts = new Set<string>();
  const swaps = new Set<string>();
  const add = (set: Set<string>, value: unknown) => {
    if (isUuid(value)) set.add(value.toLowerCase());
  };
  for (const row of rows) {
    add(people, row.actorId);
    const details = fields.safeParse(row.details);
    if (!details.success) continue;
    const { person, from, to, invite, shift, swap } = details.data;
    add(people, person);
    add(people, from);
    add(people, to);
    add(invites, invite);
    add(shifts, shift);
    add(swaps, swap);
  }
  return {
    people: [...people],
    invites: [...invites],
    shifts: [...shifts],
    swaps: [...swaps],
  };
}

type Parsed = ActivityEntry & {
  actorId: string | null;
  /** When the run of edits this line stands for began. */
  since: string;
};

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Whether `older` is more of the same edit as `newer`, just before it. */
function foldsInto(newer: Parsed, older: Parsed): boolean {
  if (newer.actorId === null || newer.actorId !== older.actorId) return false;
  const gap = Date.parse(newer.since) - Date.parse(older.at);
  if (gap < 0 || gap > FOLD_MINUTES * 60_000) return false;
  const a = newer.line;
  const b = older.line;
  if (a.action === "business.details") return b.action === "business.details";
  return (
    a.action === "module.settings" &&
    b.action === "module.settings" &&
    a.module === b.module
  );
}

/** The changes of two edits as one: the older one's before, the newer one's after. */
function merged<Key extends string>(
  newer: FieldChange<Key>[],
  older: FieldChange<Key>[],
): FieldChange<Key>[] {
  const keys = [
    ...newer.map((change) => change.key),
    ...older.map((change) => change.key),
  ].filter((key, index, all) => all.indexOf(key) === index);
  return keys.map((key) => {
    const before = older.find((change) => change.key === key);
    const after = newer.find((change) => change.key === key);
    return {
      key,
      from: before ? before.from : after?.from,
      to: after ? after.to : before?.to,
    };
  });
}

function fold(newer: Parsed, older: Parsed): Parsed {
  const a = newer.line;
  const b = older.line;
  if (a.action === "business.details" && b.action === "business.details") {
    const changes = merged(a.changes, b.changes).sort(
      (x, y) => DETAIL_KEYS.indexOf(x.key) - DETAIL_KEYS.indexOf(y.key),
    );
    return { ...newer, line: { ...a, changes } };
  }
  if (a.action === "module.settings" && b.action === "module.settings") {
    return { ...newer, line: { ...a, changes: merged(a.changes, b.changes) } };
  }
  return newer;
}

/** Each module's settings as they are when a business never set them, by module. */
export type SettingDefaults = ReadonlyMap<
  string,
  Readonly<Record<string, unknown>>
>;

/**
 * A settings or details line whose every change ended where it began says
 * nothing. A setting never set before had the module's default, so going back
 * to the default is no change either.
 */
function withoutNoChange(
  entry: Parsed,
  defaults: SettingDefaults,
): Parsed | null {
  const { line } = entry;
  if (line.action === "business.details") {
    const changes = line.changes.filter((c) => !same(c.from, c.to));
    return changes.length ? { ...entry, line: { ...line, changes } } : null;
  }
  if (line.action === "module.settings") {
    const before = (c: FieldChange) =>
      c.from === null ? (defaults.get(line.module)?.[c.key] ?? null) : c.from;
    const changes = line.changes.filter((c) => !same(before(c), c.to));
    return changes.length ? { ...entry, line: { ...line, changes } } : null;
  }
  return entry;
}

/**
 * The log's lines from its rows, newest first as given. Typing into a setting
 * saves a moment after each pause, so a run of edits by one person to the same
 * settings reads as one change from where it began to where it ended, and a
 * run that ended where it began is left out. `defaults` says where a setting
 * never set began.
 */
export function buildActivity(
  rows: readonly ActivityRow[],
  lookups: ActivityLookups,
  defaults: SettingDefaults = new Map(),
): ActivityEntry[] {
  const lines: Parsed[] = [];
  for (const row of rows) {
    const entry: Parsed = {
      id: row.id,
      at: row.createdAt,
      actor: actorOf(row.actorId, lookups),
      line: lineOf(row, lookups),
      actorId: row.actorId,
      since: row.createdAt,
    };
    const last = lines.at(-1);
    if (last && foldsInto(last, entry)) {
      // The line keeps the newest edit's place and time; the next gap is
      // measured from this older one.
      lines[lines.length - 1] = { ...fold(last, entry), since: entry.at };
      continue;
    }
    lines.push(entry);
  }
  return lines.flatMap((parsed) => {
    const kept = withoutNoChange(parsed, defaults);
    return kept
      ? [{ id: kept.id, at: kept.at, actor: kept.actor, line: kept.line }]
      : [];
  });
}

export type ActivityDay = {
  /** YYYY-MM-DD in the business's time zone. */
  date: string;
  relative: "today" | "yesterday" | null;
  entries: ActivityEntry[];
};

/** Lines by the business's own days, newest first. */
export function activityByDay(
  entries: readonly ActivityEntry[],
  timeZone: string,
  now: Date,
): ActivityDay[] {
  const today = dateIn(now, timeZone);
  const yesterday = addDays(today, -1);
  const days: ActivityDay[] = [];
  for (const entry of entries) {
    const date = dateIn(new Date(entry.at), timeZone);
    const day = days.at(-1);
    if (day?.date === date) {
      day.entries.push(entry);
      continue;
    }
    days.push({
      date,
      relative:
        date === today ? "today" : date === yesterday ? "yesterday" : null,
      entries: [entry],
    });
  }
  return days;
}

/** The `?before=` of an older page: a row id, or null for the newest page. */
export function parseActivityCursor(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,15}$/.test(value)) return null;
  const cursor = Number(value);
  return Number.isSafeInteger(cursor) ? cursor : null;
}
