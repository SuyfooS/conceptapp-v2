import { z } from "zod";
import { isUuid } from "./activity";
import { addDays, dateIn, instantIn } from "./availability";
import { type DocumentCategory, isDocumentCategory } from "./documents";
import { timeOfDay } from "./hours";
import { atLeast, isStaff, type ModuleKey, type Role } from "./modules";
import { timeIn } from "./shabbat";

/**
 * Notifications in the app: what happened that a person should know, one line
 * per person per thing. The database writes them, from the audit log
 * (`private.notify_for` in supabase/migrations/20261109000450_notifications.sql,
 * and a module's own, like `private.notify_for_lists`);
 * this file says what each kind is about, who it is for, where it leads, and
 * how its stored facts read back. A row's params are free JSON, so each kind is
 * read leniently: anything unexpected becomes a plain line, never an error.
 */

/**
 * What a person switches on or off for the phone (notifications part 3):
 * each kind is in one, or in none when nobody switches it off.
 */
export const NOTIFICATION_GROUPS = [
  "schedule",
  "swaps",
  "approvals",
  "team",
  "lists",
  "chat",
  "documents",
] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

type KindInfo = {
  /**
   * Null for a line nobody switches off: the lines about pay (the person's
   * own access and wage, and the office's month to close and corrections
   * after closing it) and the test from the phone switch.
   */
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
   * `params.month`, "conversation" the chat `/chat/<params.conversation>`,
   * "document" the document `/chat/documents/<params.document>` (C7's
   * screen), and `href` is where it leads otherwise.
   */
  to?: "list" | "payMonth" | "conversation" | "document";
  /**
   * Shown in the bell and the inbox, and counted there: all but a chat's own
   * lines, which the Chat tab counts instead (as chats with unread messages).
   * They still reach the phone (/push/inbox reads them).
   */
  inbox?: false;
  /**
   * Never for someone off the staff (an accountant), who is in no chat: the
   * inbox doesn't say such lines reach them.
   */
  staffOnly?: true;
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
  // difference goes into the next month's file; nothing to do here. Not about
  // the reader's own pay, yet payroll kept it out of every group, as it did
  // the month to close below: both always reach the phone, and the settings
  // say pay always comes (`alwaysOnPhone`).
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
  // A chat's line (chat C1): one per person per conversation, with how many
  // messages wait and who wrote last, never a word of them. The Chat tab
  // counts chats with unread messages, so these stay out of the bell and the
  // inbox and reach the phone only.
  "chat.direct": {
    group: "chat",
    module: "chat",
    minRole: "worker",
    needsAction: false,
    href: "/chat",
    to: "conversation",
    inbox: false,
    staffOnly: true,
  },
  "chat.group": {
    group: "chat",
    module: "chat",
    minRole: "worker",
    needsAction: false,
    href: "/chat",
    to: "conversation",
    inbox: false,
    staffOnly: true,
  },
  // An announcement in a group (chat C1), which asks the reader for
  // "קראתי": confirming it settles their line, removing or unpinning it
  // everyone's.
  "chat.announcement": {
    group: "chat",
    module: "chat",
    minRole: "worker",
    needsAction: true,
    href: "/chat",
    to: "conversation",
    staffOnly: true,
  },
  // Official documents (chat C6): to the office (pay holders, never a
  // manager without pay access), a document someone on the staff sent the
  // business; to each recipient, one sent to them, asking for "קראתי" or
  // not. Their params hold the document's id and who sent it, never its
  // category, title or file: a line outlives its reader's pay access, and a
  // lock screen is seen by whoever is near the phone. The inbox names the
  // category from the document itself, read under the reader's own session
  // (`documents` in the lookups), and says "מסמך" to whoever no longer reads
  // it. The office's first opening settles documents.received for all of
  // it, and losing pay access one's own; a recipient's opening settles their
  // documents.sent, and their "קראתי" their documents.to_confirm; removing
  // the document's file settles every line about it.
  "documents.received": {
    group: "documents",
    module: "chat",
    minRole: "worker",
    needsAction: true,
    href: "/chat/documents",
    to: "document",
    // Settled when the reader lost pay access, too: the document's screen
    // is then not found for them.
    settledHref: "/notifications",
  },
  "documents.sent": {
    group: "documents",
    module: "chat",
    minRole: "worker",
    needsAction: false,
    href: "/chat/documents",
    to: "document",
    // Only people on the staff are sent documents.
    staffOnly: true,
  },
  "documents.to_confirm": {
    group: "documents",
    module: "chat",
    minRole: "worker",
    needsAction: true,
    href: "/chat/documents",
    to: "document",
    staffOnly: true,
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
  if (info.to === "conversation") {
    const chat = z.object({ conversation: z.string() }).safeParse(params);
    if (chat.success && isUuid(chat.data.conversation)) {
      return `/chat/${chat.data.conversation.toLowerCase()}`;
    }
  }
  if (info.to === "document") {
    const document = z.object({ document: z.string() }).safeParse(params);
    if (document.success && isUuid(document.data.document)) {
      return `/chat/documents/${document.data.document.toLowerCase()}`;
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

/**
 * Whether a line shows in the bell and the inbox: every kind but a chat's own
 * lines (`inbox: false`). A kind this app doesn't know shows, as a plain line.
 */
export function inInbox(kind: string): boolean {
  const known = notificationKindOf(kind);
  if (!known) return true;
  const info: KindInfo = NOTIFICATION_KINDS[known];
  return info.inbox !== false;
}

/** The kinds the inbox and the bell leave out: they reach the phone only. */
export const PHONE_ONLY_KINDS: readonly NotificationKind[] =
  NOTIFICATION_KIND_KEYS.filter((kind) => !inInbox(kind));

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
    if (row.business_id !== businessId || !inInbox(row.kind)) continue;
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
        !(info.staffOnly && !isStaff(role)) &&
        (info.module === null || enabled.includes(info.module))
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Each person's choices (notifications part 3,
// supabase/migrations/20261112000100_notification_preferences.sql): which
// groups reach their phone, quiet hours, and what a lock screen shows. They
// are the person's own, across every business they are in, and read by
// nobody else. The app's inbox always shows everything.

/** Whether a value names a group. */
export function isNotificationGroup(
  value: unknown,
): value is NotificationGroup {
  return NOTIFICATION_GROUPS.some((group) => group === value);
}

/**
 * The group a kind is in, as the database reads it
 * (`private.notification_group`, kept equal by
 * packages/db/notification-preferences.db.test.ts): null for a line nobody
 * switches off (the lines about pay, the person's own and the office's, and
 * the test) and for a kind this app doesn't know.
 */
export function notificationGroupOf(kind: string): NotificationGroup | null {
  const known = notificationKindOf(kind);
  if (!known) return null;
  const info: KindInfo = NOTIFICATION_KINDS[known];
  return info.group;
}

/**
 * The kinds that reach this role's phone here whatever they switch off: in
 * no group, for this role, with their module on. Only the lines about pay
 * (payroll kept each of them out of every group), so a settings screen that
 * finds any says pay always comes. The test from the phone switch, asked for
 * there and then, isn't one.
 */
export function alwaysOnPhone(
  role: Role,
  enabled: readonly ModuleKey[],
): NotificationKind[] {
  return NOTIFICATION_KIND_KEYS.filter((kind) => {
    const info: KindInfo = NOTIFICATION_KINDS[kind];
    return (
      kind !== "push.test" &&
      info.group === null &&
      atLeast(role, info.minRole) &&
      !(info.staffOnly && !isStaff(role)) &&
      (info.module === null || enabled.includes(info.module))
    );
  });
}

/**
 * The groups a person may keep off their phone: every one, those whose lines
 * ask them to act included, since those still wait in the app and count on
 * Home and the bell. Nothing is ever switched off in the app. Which of them a
 * settings screen offers is `groupsFor` the person's role.
 */
export const SWITCHABLE_GROUPS: readonly NotificationGroup[] =
  NOTIFICATION_GROUPS;

/** Quiet hours, "HH:MM" on the person's clock; `to` before `from` crosses midnight. */
export type QuietHours = { from: string; to: string };

/** Quiet hours when first switched on (plan §9): 22:00 to 07:00. */
export const DEFAULT_QUIET_HOURS: QuietHours = { from: "22:00", to: "07:00" };

/** The clock quiet hours are read on, until a screen says the business's. */
export const NOTIFICATION_TIME_ZONE = "Asia/Jerusalem";

export type NotificationPreferences = {
  /** Groups that don't reach the phone; their lines still reach the app. */
  pushOff: NotificationGroup[];
  /** Null while quiet hours are off, as they are until switched on. */
  quiet: QuietHours | null;
  /** The clock `quiet` is read on (an IANA zone). */
  timeZone: string;
  /** What the lock screen shows: the line, or only its group's words. */
  previews: boolean;
  /**
   * When the person was first offered notifications on the phone after
   * giving away a shift or sending availability, as an ISO instant: asked
   * once, never again. Null: not yet.
   */
  askedAt: string | null;
};

/** Everyone's choices until they make their own. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushOff: [],
  quiet: null,
  timeZone: NOTIFICATION_TIME_ZONE,
  previews: true,
  askedAt: null,
};

/** "HH:MM" of a stored time ("22:00:00"), or null for anything else. */
function clockOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clock = value.slice(0, 5);
  return timeOfDay.safeParse(clock).success ? clock : null;
}

/**
 * Choices as the database keeps them, read leniently: anything unexpected
 * reads as its default, and quiet hours are on only with both ends.
 */
export function readNotificationPreferences(stored: {
  pushOff: unknown;
  quietFrom: unknown;
  quietTo: unknown;
  timeZone: unknown;
  previews: unknown;
  askedAt: unknown;
}): NotificationPreferences {
  const from = clockOf(stored.quietFrom);
  const to = clockOf(stored.quietTo);
  return {
    pushOff: SWITCHABLE_GROUPS.filter(
      (group) =>
        Array.isArray(stored.pushOff) && stored.pushOff.includes(group),
    ),
    quiet: from && to && from !== to ? { from, to } : null,
    timeZone:
      typeof stored.timeZone === "string" && stored.timeZone
        ? stored.timeZone
        : NOTIFICATION_TIME_ZONE,
    previews: stored.previews !== false,
    askedAt:
      typeof stored.askedAt === "string" &&
      !Number.isNaN(Date.parse(stored.askedAt))
        ? stored.askedAt
        : null,
  };
}

/** Whether a kind's lines reach the person's phone by their choices. */
export function reachesPhone(
  kind: string,
  preferences: Pick<NotificationPreferences, "pushOff">,
): boolean {
  const group = notificationGroupOf(kind);
  return group === null || !preferences.pushOff.includes(group);
}

/**
 * When the quiet hours `at` falls in end, or null when it falls outside them
 * (or there are none): from `from` (included) until `to` (not), on the clock
 * of `timeZone`, the next day's `to` when they cross midnight. The same as
 * `private.quiet_end`, which packages/db/notification-preferences.db.test.ts
 * compares with this across the clock changes.
 */
export function quietEnd(
  quiet: QuietHours | null,
  timeZone: string,
  at: Date,
): Date | null {
  if (!quiet || quiet.from === quiet.to) return null;
  const day = dateIn(at, timeZone);
  const now = timeIn(at, timeZone);
  const { from, to } = quiet;
  if (from < to) {
    return now >= from && now < to ? instantIn(day, to, timeZone) : null;
  }
  if (now >= from) return instantIn(addDays(day, 1), to, timeZone);
  if (now < to) return instantIn(day, to, timeZone);
  return null;
}

/**
 * When a line of `kind` written at `at` goes to the person's phone, by their
 * choices, or null for not at all (`private.push_plan`, for someone whose
 * phone gets the business's lines): at once, or at the end of their quiet
 * hours. The test from the phone switch is asked for there and then, so it
 * never waits.
 */
export function phoneTime(
  kind: string,
  preferences: Pick<NotificationPreferences, "pushOff" | "quiet" | "timeZone">,
  at: Date,
): Date | null {
  if (!reachesPhone(kind, preferences)) return null;
  if (kind === "push.test") return at;
  return quietEnd(preferences.quiet, preferences.timeZone, at) ?? at;
}

const quietHours = z
  .object({ from: timeOfDay, to: timeOfDay })
  .refine((hours) => hours.from !== hours.to, "Quiet hours need a length");

/**
 * One change from the settings screen, saved at once: a group on or off for
 * the phone, quiet hours on with their times or off (`hours: null`), or
 * whether the lock screen shows the line.
 */
export const notificationPreferenceChange = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("group"),
    group: z.enum(NOTIFICATION_GROUPS),
    on: z.boolean(),
  }),
  z.object({ kind: z.literal("quiet"), hours: quietHours.nullable() }),
  z.object({ kind: z.literal("previews"), on: z.boolean() }),
]);

export type NotificationPreferenceChange = z.infer<
  typeof notificationPreferenceChange
>;

/**
 * Why a change was not saved: the team viewing as someone changes nothing
 * (`viewOnly`), a change the screen can't have sent (`invalid`), or anything
 * else (`failed`).
 */
export type PreferencesFailure = "viewOnly" | "invalid" | "failed";

/** What saving a change answers: the choices as they now stand. */
export type PreferencesSaveResult =
  | { ok: true; preferences: NotificationPreferences }
  | { ok: false; failure: PreferencesFailure };

/**
 * How long ago a line came, in the inbox's own words: "now" under a minute,
 * then whole minutes, hours and days (rounded down) for a week, and `null`
 * after that, when the line says its date. Our own words, not
 * `Intl.RelativeTimeFormat`, which writes "לפני שעה (1)" in Hebrew.
 */
export type InboxAgo =
  | { unit: "now" }
  | { unit: "minutes" | "hours" | "days"; count: number }
  | null;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function inboxAgo(at: Date, now: Date): InboxAgo {
  const ago = now.getTime() - at.getTime();
  if (Number.isNaN(ago)) return null;
  // A clock a little ahead of the server's still reads "now".
  if (ago < MINUTE_MS) return { unit: "now" };
  if (ago < HOUR_MS)
    return { unit: "minutes", count: Math.floor(ago / MINUTE_MS) };
  if (ago < DAY_MS) return { unit: "hours", count: Math.floor(ago / HOUR_MS) };
  if (ago < 7 * DAY_MS)
    return { unit: "days", count: Math.floor(ago / DAY_MS) };
  return null;
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

/** A chat's group as a line names it. */
export type NotificationChat =
  | { kind: "team" }
  /** The name is null when the department is not known (any more). */
  | { kind: "department"; name: string | null };

/** What lines point at, read under the reader's own access. */
export type NotificationLookups = {
  /** The business's memberships, active or not, by person. */
  members: ReadonlyMap<string, { active: boolean; name: string | null }>;
  /**
   * The groups chat lines name, by conversation: those the reader reads.
   * Left out where no line needs them.
   */
  chats?: ReadonlyMap<string, NotificationChat>;
  /**
   * The categories of the documents lines name, by document: those the
   * reader still reads, for the inbox alone. Never read for a phone: a lock
   * screen never names a category ("אישור מחלה").
   */
  documents?: ReadonlyMap<string, DocumentCategory>;
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
  | {
      /** A private chat's line: who wrote last, and how many messages wait. */
      kind: "chat.direct";
      from: NotificationPerson;
      count: number;
    }
  | {
      /** A group's line: who wrote last, and how many messages wait. */
      kind: "chat.group";
      from: NotificationPerson;
      count: number;
      /** The group, as its reader may know it; null when the line lost it. */
      chat: NotificationChat | null;
    }
  | {
      /** An announcement in a group, asking the reader for "קראתי". */
      kind: "chat.announcement";
      from: NotificationPerson;
      chat: NotificationChat | null;
    }
  | {
      /**
       * A document: to the business (to the office, from `from`), or to the
       * reader, asking for "קראתי" (`to_confirm`) or not (`sent`).
       */
      kind: "documents.received" | "documents.sent" | "documents.to_confirm";
      from: NotificationPerson;
      /**
       * Its category, as the reader may still read the document; null when
       * they no longer do, or nobody looked it up (a phone never does).
       */
      category: DocumentCategory | null;
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
  chat: z.object({
    conversation: uuid,
    from: uuid.nullable().catch(null),
    count: z.int().min(1).max(99).catch(1),
  }),
  document: z.object({
    document: uuid,
    from: uuid.nullable().catch(null),
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

/** The category of a document a line names, as the reader may still read it. */
function categoryOf(
  document: string,
  lookups: NotificationLookups,
): DocumentCategory | null {
  const category = lookups.documents?.get(document.toLowerCase());
  return isDocumentCategory(category) ? category : null;
}

/** The group a chat line names, as the reader may know it. */
function chatOf(
  conversation: string,
  lookups: NotificationLookups,
): NotificationChat | null {
  return lookups.chats?.get(conversation.toLowerCase()) ?? null;
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
    case "chat.direct": {
      const params = read(schemas.chat);
      return params
        ? { kind, from: personOf(params.from, lookups), count: params.count }
        : other;
    }
    case "chat.group": {
      const params = read(schemas.chat);
      return params
        ? {
            kind,
            from: personOf(params.from, lookups),
            count: params.count,
            chat: chatOf(params.conversation, lookups),
          }
        : other;
    }
    case "chat.announcement": {
      const params = read(schemas.chat);
      return params
        ? {
            kind,
            from: personOf(params.from, lookups),
            chat: chatOf(params.conversation, lookups),
          }
        : other;
    }
    case "documents.received":
    case "documents.sent":
    case "documents.to_confirm": {
      const params = read(schemas.document);
      return params
        ? {
            kind,
            from: personOf(params.from, lookups),
            category: categoryOf(params.document, lookups),
          }
        : other;
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

/**
 * The chats a page of rows names for their group (a group's line and an
 * announcement), each one safe to look up. A private chat's line names its
 * person, which `notificationRefs` gives.
 */
export function notificationChats(rows: readonly NotificationRow[]): string[] {
  const chats = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "chat.group" && row.kind !== "chat.announcement") continue;
    const params = z
      .object({ conversation: z.unknown() })
      .safeParse(row.params);
    const conversation = params.success ? params.data.conversation : null;
    if (isUuid(conversation)) chats.add(conversation.toLowerCase());
  }
  return [...chats];
}

/**
 * The documents a page of rows names (a document's line), each one safe to
 * look up: for the inbox to name their categories, under the reader's own
 * session. A phone's lines are never looked up this way.
 */
export function notificationDocuments(
  rows: readonly NotificationRow[],
): string[] {
  const documents = new Set<string>();
  for (const row of rows) {
    if (!row.kind.startsWith("documents.")) continue;
    const params = z.object({ document: z.unknown() }).safeParse(row.params);
    const document = params.success ? params.data.document : null;
    if (isUuid(document)) documents.add(document.toLowerCase());
  }
  return [...documents];
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
