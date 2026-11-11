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
  // A scheduled list opening and its reminder: the lists themselves show them.
  "lists.open",
  "lists.due",
  // Someone opened the pay screens: kept for the record, not news.
  "payroll.view",
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
  /** The business's departments, removed ones too, by id: their names. */
  departments: ReadonlyMap<string, string>;
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

/** One break a correction changed: its times before, and after (null when removed). */
export type BreakFit = { from: ClockTimes; to: ClockTimes | null };

/**
 * What a correction did to the breaks, for the log's headline: removed them,
 * ended open ones, or cut them; "other" when the breaks went different ways.
 */
export type BreakFitKind = "removed" | "ended" | "cut" | "other";

export function breakFitKind(breaks: readonly BreakFit[]): BreakFitKind {
  const kinds = new Set(
    breaks.map((pause): BreakFitKind => {
      if (pause.to === null) return "removed";
      if (pause.from.clockOut === null && pause.to.clockOut !== null) {
        return "ended";
      }
      return "cut";
    }),
  );
  const [only] = kinds;
  return kinds.size === 1 && only ? only : "other";
}

/** Who a permission was given to: everyone in a role, or one person. */
export type ActivityGrantee =
  | { kind: "role"; role: Role | null }
  | { kind: "person"; person: ActivityPerson };

/** Who a list went to, as the log says it. */
export type ActivityRecipient =
  | { kind: "person"; person: ActivityPerson }
  /** The name is null when the department is not known (any more). */
  | { kind: "department"; name: string | null }
  | { kind: "shift" }
  | { kind: "role"; role: Role | null };

export type ActivityLine =
  | { action: "business.create"; invites: number }
  | { action: "business.details"; changes: FieldChange<DetailKey>[] }
  | { action: "module.settings"; module: string; changes: FieldChange[] }
  | { action: "module.enabled"; module: string; enabled: boolean }
  | {
      action: "clock.add";
      person: ActivityPerson;
      times: ClockTimes;
      /** Why, as the manager wrote it; null on rows from before reasons. */
      note: string | null;
    }
  | {
      action: "clock.correct";
      person: ActivityPerson;
      from: ClockTimes;
      to: ClockTimes;
      note: string | null;
    }
  | {
      /**
       * A correction cut the shift's breaks to fit its new times, or removed
       * those left outside it (`to` null). Each break's times as a span.
       */
      action: "clock.break_fit";
      person: ActivityPerson;
      /**
       * When the corrected shift starts, which names its day as the
       * correction's own line does; null on rows from before it was logged.
       */
      clockIn: string | null;
      breaks: [BreakFit, ...BreakFit[]];
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
  | {
      /** The business's departments: what was added, removed or renamed. */
      action: "departments.change";
      added: string[];
      removed: string[];
      renamed: { from: string; to: string }[];
      /** Only their order changed. */
      reordered: boolean;
    }
  | {
      action: "departments.members";
      /** Null when the department is not known (any more). */
      department: string | null;
      added: ActivityPerson[];
      removed: ActivityPerson[];
    }
  | {
      action: "lists.template.save";
      name: string;
      /** It was new: the first save of a run of saves. */
      created: boolean;
    }
  | {
      action: "lists.template.archive" | "lists.template.restore";
      name: string;
    }
  | { action: "lists.send"; name: string; to: ActivityRecipient }
  | {
      action: "lists.finish";
      name: string;
      late: boolean;
      /** Optional items left empty. */
      leftOptional: number;
    }
  | { action: "lists.cancel"; name: string }
  | {
      /** A list passed from one department to another (lists L5). */
      action: "lists.pass";
      name: string;
      /** Where it was: null for a person, a shift or a role, or a department not known. */
      from: string | null;
      /** Null when the department is not known (any more). */
      to: string | null;
      /** A note came with it; the log never keeps the note. */
      note: boolean;
    }
  /** A list's times (lists L4): one late, or closed with nobody doing it. */
  | { action: "lists.late" | "lists.missed"; name: string }
  | {
      /** A reading outside its item's range; the actor read it. */
      action: "lists.out_of_range";
      name: string;
      label: string;
      reading: number;
      min: number | null;
      max: number | null;
      /** The item's unit; null when it has none, or the row is older than it. */
      unit: string | null;
    }
  | {
      /** An owner or the team gave a permission, or took it back. */
      action: "permission.grant" | "permission.revoke";
      /** The permission's key, such as `clock.payroll`. */
      perm: string;
      to: ActivityGrantee;
    }
  | {
      action: "lists.reopen";
      name: string;
      was: "finished" | "cancelled" | null;
    }
  | {
      /** A pay holder set someone's hourly wage from a day (payroll P4). */
      action: "wage.set";
      person: ActivityPerson;
      /** The wage, in agorot. */
      agorot: number;
      /** What it was on that day before, in agorot; null when it had none. */
      previous: number | null;
      /** The day it takes effect, YYYY-MM-DD. */
      from: string;
      /**
       * The adult minimum of that day when it was set, in agorot; null when
       * the table had none, or on a row from before the log kept it.
       */
      minimum: number | null;
      note: string | null;
    }
  | {
      /**
       * A pay holder changed someone's details for payroll (payroll P5): which
       * fields, never their values. A birth date shows as the youth.
       */
      action: "payroll.details";
      person: ActivityPerson;
      fields: PayrollDetailField[];
    }
  | {
      /** A pay holder added or changed a period of someone's work (payroll P5). */
      action: "payroll.period";
      person: ActivityPerson;
      added: boolean;
      /** It had been copied from joining the app, and is a holder's now. */
      confirmed: boolean;
      fields: PeriodField[];
    }
  | {
      /**
       * A pay holder took a month's file for payroll (payroll P8): which
       * month, and how many people and shifts it listed when the log says.
       */
      action: "payroll.export";
      /** `YYYY-MM`. */
      month: string;
      people: number | null;
      shifts: number | null;
    }
  | {
      /** The owner or an accountant closed a month for payroll (payroll P9). */
      action: "payroll.close";
      /** `YYYY-MM`. */
      month: string;
    }
  | {
      /** The owner or an accountant reopened a closed month, saying why (payroll P9). */
      action: "payroll.reopen";
      /** `YYYY-MM`. */
      month: string;
      reason: string | null;
    }
  | {
      /**
       * Management removed someone's message in a group, or put it back
       * (chat C1). Never what it said: the row holds ids only, and a view
       * session reads none of these.
       */
      action: "chat.remove" | "chat.restore";
      group: ActivityChatGroup;
      /** Who wrote it. */
      author: ActivityPerson;
    }
  | { action: "other" };

/** A chat's group, as the log names it. */
export type ActivityChatGroup =
  | { kind: "team" }
  /** The name is null when the department is not known (any more). */
  | { kind: "department"; name: string | null };

/** The fields of someone's details for payroll, as the log names them, in order. */
export const PAYROLL_DETAIL_FIELDS = [
  "payroll_number",
  "rest_day",
  "hours_law",
  "compulsory_education",
  "youth_until",
] as const;
export type PayrollDetailField = (typeof PAYROLL_DETAIL_FIELDS)[number];

/** The fields of a period of work, as the log names them, in order. */
export const PERIOD_FIELDS = [
  "started_on",
  "ended_on",
  "last_paid_on",
] as const;
export type PeriodField = (typeof PERIOD_FIELDS)[number];

/** The known names of a list, in their order; anything else is left out. */
function knownFields<F extends string>(
  names: readonly unknown[],
  known: readonly F[],
): F[] {
  return known.filter((field) => names.includes(field));
}

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
const span = z.object({ start: instant, end: instant.nullable() });

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
    note: z.unknown().optional(),
  }),
  "clock.correct": z.object({
    person: id,
    from: times,
    to: times,
    note: z.unknown().optional(),
  }),
  "clock.break_fit": z.object({
    person: id,
    clock_in: instant.optional(),
    breaks: z.array(z.object({ from: span, to: span.nullable() })),
  }),
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
  "departments.change": z.object({
    from: z.array(z.object({ key: z.string(), name: z.string() })),
    to: z.array(z.object({ key: z.string(), name: z.string() })),
  }),
  "departments.members": z.object({
    department: id,
    added: z.array(id).default([]),
    removed: z.array(id).default([]),
  }),
  "lists.template.save": z.object({
    name: z.string(),
    created: z.boolean().default(false),
  }),
  "lists.named": z.object({ name: z.string() }),
  "lists.send": z.object({
    name: z.string(),
    recipient: z.object({
      kind: z.string(),
      id: id.optional(),
      role: z.unknown().optional(),
    }),
  }),
  "lists.finish": z.object({
    name: z.string(),
    late: z.boolean().default(false),
    left_optional: z.int().min(0).default(0),
  }),
  "lists.reopen": z.object({
    name: z.string(),
    was: z.string().optional(),
  }),
  "lists.pass": z.object({
    name: z.string(),
    from_department: id.nullable().optional(),
    to_department: id,
    has_note: z.boolean().default(false),
  }),
  "lists.out_of_range": z.object({
    name: z.string(),
    label: z.string(),
    reading: z.number(),
    min: z.number().nullable().default(null),
    max: z.number().nullable().default(null),
    unit: z.string().nullable().default(null),
  }),
  permission: z.object({
    perm: z.string(),
    role: z.unknown().optional(),
    person: id.optional(),
  }),
  "wage.set": z.object({
    person: id,
    to_agorot: z.int().min(1),
    from_agorot: z.int().min(1).nullable().optional(),
    effective_from: z.iso.date(),
    minimum_agorot: z.int().min(1).nullable().optional(),
    note: z.unknown().optional(),
  }),
  "payroll.details": z.object({
    person: id,
    fields: z.array(z.unknown()),
  }),
  "payroll.period": z.object({
    person: id,
    added: z.boolean().default(false),
    confirmed: z.boolean().default(false),
    fields: z.array(z.unknown()).default([]),
  }),
  "payroll.export": z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    people: z.int().min(0).optional(),
    shifts: z.int().min(0).optional(),
  }),
  "payroll.month": z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    reason: z.unknown().optional(),
  }),
  "chat.moderation": z.object({
    conversation: id,
    message: id,
    author: id.nullable().optional(),
    department: id.nullable().optional(),
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

function spanTimes(value: z.infer<typeof span>): ClockTimes {
  return { clockIn: value.start, clockOut: value.end };
}

/** A correction's reason, when the row has one worth showing. */
function noteOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
        note: noteOf(details.note),
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
        note: noteOf(details.note),
      };
    }
    case "clock.break_fit": {
      const details = read(schemas["clock.break_fit"]);
      const [first, ...rest] = details?.breaks ?? [];
      if (!details || !first) return other;
      const breakOf = (pause: typeof first): BreakFit => ({
        from: spanTimes(pause.from),
        to: pause.to ? spanTimes(pause.to) : null,
      });
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        clockIn: details.clock_in ?? null,
        breaks: [breakOf(first), ...rest.map(breakOf)],
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
    case "departments.change": {
      const details = read(schemas["departments.change"]);
      if (!details) return other;
      const before = new Map(details.from.map((d) => [d.key, d.name]));
      const after = new Map(details.to.map((d) => [d.key, d.name]));
      const renamed = details.to.flatMap((d) => {
        const was = before.get(d.key);
        return was !== undefined && was !== d.name
          ? [{ from: was, to: d.name }]
          : [];
      });
      const added = details.to
        .filter((d) => !before.has(d.key))
        .map((d) => d.name);
      const removed = details.from
        .filter((d) => !after.has(d.key))
        .map((d) => d.name);
      const kept = (list: { key: string }[], other: Map<string, string>) =>
        list.filter((d) => other.has(d.key)).map((d) => d.key);
      return {
        action: row.action,
        added,
        removed,
        renamed,
        reordered:
          added.length + removed.length + renamed.length === 0 &&
          !same(kept(details.from, after), kept(details.to, before)),
      };
    }
    case "departments.members": {
      const details = read(schemas["departments.members"]);
      if (!details) return other;
      return {
        action: row.action,
        department:
          lookups.departments.get(details.department.toLowerCase()) ?? null,
        added: details.added.map((person) => personOf(person, lookups)),
        removed: details.removed.map((person) => personOf(person, lookups)),
      };
    }
    case "lists.template.save": {
      const details = read(schemas["lists.template.save"]);
      return details
        ? { action: row.action, name: details.name, created: details.created }
        : other;
    }
    case "lists.template.archive":
    case "lists.template.restore":
    case "lists.cancel":
    case "lists.late":
    case "lists.missed": {
      const details = read(schemas["lists.named"]);
      return details ? { action: row.action, name: details.name } : other;
    }
    case "lists.send": {
      const details = read(schemas["lists.send"]);
      if (!details) return other;
      const { kind, id: to, role } = details.recipient;
      const recipient: ActivityRecipient | null =
        kind === "person"
          ? { kind, person: personOf(to, lookups) }
          : kind === "department"
            ? {
                kind,
                name: (to && lookups.departments.get(to.toLowerCase())) ?? null,
              }
            : kind === "shift"
              ? { kind }
              : kind === "role"
                ? { kind, role: roleOf(role) }
                : null;
      return recipient
        ? { action: row.action, name: details.name, to: recipient }
        : other;
    }
    case "lists.finish": {
      const details = read(schemas["lists.finish"]);
      return details
        ? {
            action: row.action,
            name: details.name,
            late: details.late,
            leftOptional: details.left_optional,
          }
        : other;
    }
    case "lists.out_of_range": {
      const details = read(schemas["lists.out_of_range"]);
      return details ? { action: row.action, ...details } : other;
    }
    case "lists.pass": {
      const details = read(schemas["lists.pass"]);
      if (!details) return other;
      const named = (department: string | null | undefined) =>
        department
          ? (lookups.departments.get(department.toLowerCase()) ?? null)
          : null;
      return {
        action: row.action,
        name: details.name,
        from: named(details.from_department),
        to: named(details.to_department),
        note: details.has_note,
      };
    }
    case "lists.reopen": {
      const details = read(schemas["lists.reopen"]);
      if (!details) return other;
      const was =
        details.was === "finished" || details.was === "cancelled"
          ? details.was
          : null;
      return { action: row.action, name: details.name, was };
    }
    case "permission.grant":
    case "permission.revoke": {
      const details = read(schemas.permission);
      if (!details) return other;
      if (details.person !== undefined) {
        return {
          action: row.action,
          perm: details.perm,
          to: { kind: "person", person: personOf(details.person, lookups) },
        };
      }
      return details.role === undefined
        ? other
        : {
            action: row.action,
            perm: details.perm,
            to: { kind: "role", role: roleOf(details.role) },
          };
    }
    case "wage.set": {
      const details = read(schemas["wage.set"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        agorot: details.to_agorot,
        previous: details.from_agorot ?? null,
        from: details.effective_from,
        minimum: details.minimum_agorot ?? null,
        note: noteOf(details.note),
      };
    }
    case "payroll.details": {
      const details = read(schemas["payroll.details"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        fields: knownFields(details.fields, PAYROLL_DETAIL_FIELDS),
      };
    }
    case "payroll.period": {
      const details = read(schemas["payroll.period"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        added: details.added,
        confirmed: details.confirmed,
        fields: knownFields(details.fields, PERIOD_FIELDS),
      };
    }
    case "payroll.export": {
      const details = read(schemas["payroll.export"]);
      return details
        ? {
            action: row.action,
            month: details.month,
            people: details.people ?? null,
            shifts: details.shifts ?? null,
          }
        : other;
    }
    case "payroll.close": {
      const details = read(schemas["payroll.month"]);
      return details ? { action: row.action, month: details.month } : other;
    }
    case "payroll.reopen": {
      const details = read(schemas["payroll.month"]);
      return details
        ? {
            action: row.action,
            month: details.month,
            reason: noteOf(details.reason),
          }
        : other;
    }
    case "chat.remove":
    case "chat.restore": {
      const details = read(schemas["chat.moderation"]);
      if (!details) return other;
      const department = details.department ?? null;
      return {
        action: row.action,
        group: department
          ? {
              kind: "department",
              name: lookups.departments.get(department.toLowerCase()) ?? null,
            }
          : { kind: "team" },
        author: personOf(details.author, lookups),
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
  const departments = new Set<string>();
  const add = (set: Set<string>, value: unknown) => {
    if (isUuid(value)) set.add(value.toLowerCase());
  };
  const addAll = (set: Set<string>, value: unknown) => {
    if (Array.isArray(value)) for (const one of value) add(set, one);
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
    if (row.action === "departments.members") {
      add(departments, details.data.department);
      addAll(people, details.data.added);
      addAll(people, details.data.removed);
    }
    if (row.action === "lists.pass") {
      add(departments, details.data.from_department);
      add(departments, details.data.to_department);
    }
    if (row.action === "chat.remove" || row.action === "chat.restore") {
      add(people, details.data.author);
      add(departments, details.data.department);
    }
    if (row.action === "lists.send") {
      const recipient = fields.safeParse(details.data.recipient);
      if (recipient.success) {
        const { kind, id: target } = recipient.data;
        if (kind === "person") add(people, target);
        if (kind === "department") add(departments, target);
      }
    }
  }
  return {
    people: [...people],
    invites: [...invites],
    shifts: [...shifts],
    swaps: [...swaps],
    departments: [...departments],
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
  if (a.action === "lists.template.save") {
    return b.action === "lists.template.save" && a.name === b.name;
  }
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
  if (
    a.action === "lists.template.save" &&
    b.action === "lists.template.save"
  ) {
    return { ...newer, line: { ...a, created: a.created || b.created } };
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
