import { z } from "zod";
import { addDays, dateIn } from "./availability";
import {
  DOCUMENT_DIRECTIONS,
  DOCUMENT_REMOVE_REASONS,
  type DocumentDirection,
  type DocumentRemoveReason,
} from "./documents";
import {
  DENIAL_REASONS,
  type DenialReason,
  FILE_DETAIL_FIELDS,
  FILE_GROUPS,
  FILE_VIEW_FIELDS,
  type FileDetailField,
  type FileGroup,
  type FileViewField,
  TAX_YEAR_STATUSES,
  type TaxYearStatus,
} from "./employee-file";
import { ROLES, type Role } from "./modules";
import {
  COMP_REASONS,
  type CompReason,
  LINE_CANCEL_REASONS,
  type LineCancelReason,
  ORDER_CANCEL_REASONS,
  type OrderCancelReason,
  TICKET_STATUSES,
  type TicketStatus,
} from "./orders";
import {
  ACCESS_AREAS,
  ACCESS_EXTRA_KEYS,
  type AccessArea,
  type AccessExtra,
  AREA_EDIT,
  AREA_VIEW,
  PLACE_AREAS,
} from "./role-access";
import { shabbatCityOf } from "./shabbat";
import { swapShift } from "./swaps";

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
  // A late list's owners told it is still open: the log already says it was
  // late, and the owners have their line.
  "lists.late_owner",
  // Someone opened the pay screens: kept for the record, not news.
  "payroll.view",
  // A holder read a file or revealed a number (H4): kept for the record and
  // the owner's monthly summary (H6), not news. A refused view is.
  "employee.view",
] as const;

/**
 * What the app writes to the log on its own, with no actor: a scheduled list
 * opening, its reminder, late, still late to its owners, and closed with
 * nobody doing it (`private.lists_tick_business`). A row of one of these
 * without an actor is the app's; a row of any other action without one was
 * someone's whose account has since gone (`audit_log.actor_id` is `on delete
 * set null`). tooling/log-families.test.ts holds this to every insert in the
 * migrations that writes no actor.
 */
export const APP_ACTIONS = [
  "lists.open",
  "lists.due",
  "lists.late",
  "lists.late_owner",
  "lists.missed",
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

/**
 * Who did what a line says: someone, or the app itself, for what it writes
 * on its own (`APP_ACTIONS`), as the inbox names it (`NotificationActor`).
 */
export type ActivityActor = ActivityPerson | { kind: "app" };

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

/**
 * A shift as the database keeps it on a swap request (`shift_swaps.shift`,
 * private.shift_brief: its day, name and hours when the request was made),
 * or null when it is anything else.
 */
export function activityShiftOf(value: unknown): ActivityShift | null {
  const parsed = swapShift.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What rows point at, read with them under the reader's own access. */
export type ActivityLookups = {
  /** The business's memberships, active or not, by person. */
  members: ReadonlyMap<string, { active: boolean; name: string | null }>;
  invites: ReadonlyMap<string, { name: string | null; role: Role | null }>;
  shifts: ReadonlyMap<string, ActivityShift>;
  /**
   * Swap requests by id: their shift while it is there (null once it is
   * deleted), the shift as it was asked for (null on a project without
   * 20261115000200_swap_history.sql), and their people.
   */
  swaps: ReadonlyMap<
    string,
    {
      shiftId: string | null;
      shift: ActivityShift | null;
      requestedBy: string;
      takenBy: string | null;
    }
  >;
  /** The business's departments, removed ones too, by id: their names. */
  departments: ReadonlyMap<string, string>;
  /**
   * The business's stations, stopped ones too, by id: their names, as the
   * reader may read them (the clock's for whoever edits the clock, with the
   * clock on; the kitchen's screens and the till for whoever runs orders,
   * with taking orders on).
   */
  stations: ReadonlyMap<string, string>;
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

/** What a break edit did: as `public.add_time_break` and the others log it. */
export const BREAK_EDIT_KINDS = ["add", "change", "remove", "restore"] as const;
export type BreakEditKind = (typeof BREAK_EDIT_KINDS)[number];

/** Who a permission was given to: everyone in a role, or one person. */
export type ActivityGrantee =
  | { kind: "role"; role: Role | null }
  | { kind: "person"; person: ActivityPerson };

/**
 * A permission a role's rule switched, as the screen "תפקידים והרשאות" names
 * it: an area's edit, its view (team and manage), one of the switches under
 * edit, or a key the screen doesn't draw.
 */
export type ActivityRolePermission =
  | { kind: "edit" | "view"; area: AccessArea }
  | { kind: "extra"; extra: AccessExtra }
  | { kind: "other" };

/** Which of an area's permissions a key is, from the key alone. */
export function rolePermissionOf(perm: string): ActivityRolePermission {
  for (const area of ACCESS_AREAS) {
    if (AREA_EDIT[area] === perm) return { kind: "edit", area };
  }
  for (const area of PLACE_AREAS) {
    if (AREA_VIEW[area] === perm) return { kind: "view", area };
  }
  const extra = ACCESS_EXTRA_KEYS.find((key) => key === perm);
  return extra ? { kind: "extra", extra } : { kind: "other" };
}

/** Who a list went to, as the log says it. */
export type ActivityRecipient =
  | { kind: "person"; person: ActivityPerson }
  /** The name is null when the department is not known (any more). */
  | { kind: "department"; name: string | null }
  | { kind: "shift" }
  /**
   * A role, or a role the business named on it by its name as the list was
   * sent (`name`, the roles plan's R11d).
   */
  | { kind: "role"; role: Role | null; name?: string };

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
  | {
      /**
       * Someone who edits the clock cancelled a shift, with why
       * (20261117000200_cancelled_shifts.sql): it is kept, and counts
       * nowhere. `times.clockOut` is null for one still open, which the
       * cancel ended.
       */
      action: "clock.cancel";
      person: ActivityPerson;
      /** Whose shift, for the way to their hours; null when the row can't say. */
      personId: string | null;
      times: ClockTimes;
      note: string | null;
    }
  | {
      /** A cancelled shift brought back; `reopened`: open again, as it was. */
      action: "clock.restore";
      person: ActivityPerson;
      personId: string | null;
      times: ClockTimes;
      reopened: boolean;
    }
  | {
      /**
       * Someone who edits the clock changed, added or removed one break of a
       * shift, with why, or brought back one they had just removed, which
       * asks for none (20261117000300_break_edits.sql). Each side the break's
       * times; `from` null for one added or brought back, `to` null for one
       * removed.
       */
      action: "clock.break_edit";
      person: ActivityPerson;
      personId: string | null;
      /** When the shift starts, which names its day. */
      clockIn: string;
      change: BreakEditKind;
      from: ClockTimes | null;
      to: ClockTimes | null;
      /** An unpaid break: its change changed the paid hours. Null when unknown. */
      unpaid: boolean | null;
      note: string | null;
    }
  /** A manager approved hours made without a code, or set by someone for themselves. */
  | { action: "clock.confirm"; person: ActivityPerson }
  /** Typing the clock's code was blocked after too many wrong tries; the actor is who typed. */
  | { action: "clock.code.locked" }
  /**
   * Someone who edits the clock left the device they were on as a clock
   * station (#78 phase 5), by the name they gave it.
   */
  | { action: "clock.station.add"; name: string }
  /**
   * A station stopped, or started again in the two minutes after; its name
   * where the reader may read the station, else null.
   */
  | {
      action: "clock.station.stop" | "clock.station.restart";
      name: string | null;
    }
  | {
      action: "invite.create" | "invite.send" | "invite.cancel";
      name: string | null;
      role: Role | null;
      /**
       * The role the business named that it gave, by its name then, built
       * on `role` (the roles plan's R11b); missing for none.
       */
      roleName?: string;
    }
  | {
      action: "invite.claim";
      role: Role | null;
      /** The role the business named that they joined in, as for an invite. */
      roleName?: string;
    }
  | {
      /**
       * An owner or manager took someone off the team (Orel, 14 November
       * 2026). They are almost always former by the time it is read.
       */
      action: "member.remove";
      person: ActivityPerson;
      /** The role they had. */
      role: Role | null;
      /**
       * The role the business named that they held, by its name then, built
       * on `role` (the roles plan's R11b); missing for none.
       */
      roleName?: string;
      /** Their shifts still to start in published weeks, which came off them. */
      shifts: number;
      /** Swap requests they made on those shifts, cancelled. */
      swaps: number;
      /**
       * Colleagues' shifts they had taken, waiting for approval, whose
       * requests are open again (Orel, 15 November 2026).
       */
      reopened: number;
    }
  | {
      /** An owner or manager changed someone's role. */
      action: "member.role";
      person: ActivityPerson;
      role: Role | null;
      /** The role before. */
      was: Role | null;
      /**
       * The role the business named that they were given, and the one they
       * left, by their names then, each built on `role` and `was` (the roles
       * plan's R11b); missing for none.
       */
      roleName?: string;
      wasName?: string;
      /** Published shifts that came off them, when they left the staff. */
      shifts: number;
      /** Swaps cancelled and swaps open again, as for a removal. */
      swaps: number;
      reopened: number;
    }
  /**
   * Someone who edits the team fixed the name the business shows for
   * someone (`public.set_member_name`); never the name, old or new.
   */
  | { action: "member.name"; person: ActivityPerson }
  | {
      action: "view_as.start" | "view_as.end";
      role: Role | null;
      /**
       * The role the business named that the view was as, by its name then,
       * built on `role` (the roles plan's R11c); missing for none.
       */
      roleName?: string;
    }
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
      /**
       * The week had begun when it was published
       * (20261115000300_running_week.sql); false for a row from before.
       */
      running: boolean;
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
      /**
       * An owner or the team switched a permission for everyone in a role
       * (roles R2, `public.set_role_permission`): on, or off.
       */
      action: "role.permission";
      role: Role | null;
      permission: ActivityRolePermission;
      on: boolean;
      /**
       * The role the business named, by its name then, when the switch was
       * its own (roles R11a); `role` is what it is built on.
       */
      named?: string;
    }
  | {
      /**
       * An owner or the team added a role the business names (roles R11a),
       * built on a manager or a worker.
       */
      action: "role.create";
      name: string;
      base: Role | null;
    }
  | {
      /** A role the business named got a new name. */
      action: "role.rename";
      from: string;
      to: string;
    }
  | {
      /** A role the business named went to the archive, or came back. */
      action: "role.archive" | "role.restore";
      name: string;
    }
  | {
      action: "lists.reopen";
      name: string;
      was: "finished" | "cancelled" | null;
    }
  | {
      /**
       * Items of a finished list fixed in place after it closed (lists
       * L6b-1): one, or one person's run of them on the list, each item once
       * from where it began to where it ended. No text: the list is the
       * record.
       */
      action: "lists.fix";
      name: string;
      items: ActivityListFix[];
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
  | {
      /**
       * A document was sent (chat C6): to the business by the actor, or by
       * the actor to people, how many. Never its category, title or file:
       * the row holds ids and codes only, and only the office reads it.
       */
      action: "document.send";
      direction: DocumentDirection;
      /** People it went to; 0 for a document to the business. */
      recipients: number;
    }
  | {
      /**
       * The office opened someone's document (once a day per reader): the
       * access log. `person` is whose it is, null for one sent to people.
       */
      action: "document.open";
      person: ActivityPerson | null;
    }
  | {
      /** A document's file was removed, with the reason's code. */
      action: "document.remove";
      reason: DocumentRemoveReason | null;
    }
  /** A removed document's file was put back by whoever removed it. */
  | { action: "document.restore" }
  | {
      /**
       * Someone who runs the menu added an item or saved one (waiter mode
       * P1, 20261117000500_order_taking_menu.sql): what changed, and the
       * agorot before and after for its price and each option whose price
       * moved. The row stands on its own: it names the item as it was then.
       */
      action: "menu.item.save";
      name: string;
      created: boolean;
      /** What changed, in `MENU_ITEM_FIELDS`' order; none for a new one. */
      fields: MenuItemField[];
      /** Its price before (null for a new one) and after, when it moved. */
      price: { before: number | null; after: number } | null;
      options: MenuOptionMove[];
    }
  | { action: "menu.item.archive" | "menu.item.restore"; name: string }
  | {
      /** A pasted menu written in one go: how many items and new categories. */
      action: "menu.import";
      categories: number;
      items: number;
    }
  | {
      /** The menu's categories, or the business's places, saved whole. */
      action: "menu.categories" | "menu.places";
      added: number;
      archived: number;
      restored: number;
      /** Renamed, moved, or sent to another department. */
      changed: number;
    }
  | {
      /**
       * A line of an order fixed (waiter mode P3,
       * 20261120000300_order_taking_orders.sql): taken back by its sender
       * once the kitchen had it, cancelled with a reason and brought back,
       * or given on the house and taken off it. The line as it was sent: its
       * quantity and unit price, never a total (decision 7). The row stands
       * on its own: it names the item and the place as they were then.
       */
      action: OrderLineAction;
      name: string;
      choices: string[];
      quantity: number;
      unitAgorot: number;
      where: ActivityOrderWhere | null;
      /** The department it went to, by its name; null when the reader can't tell. */
      department: string | null;
      /** Where its ticket was: held, at its department, ready, served. */
      ticket: TicketStatus | null;
      /** Why it was cancelled or given on the house. */
      reason: LineCancelReason | CompReason | null;
      /** Who sent it, on a cancel and on the house. */
      sender: ActivityPerson | null;
    }
  | {
      /**
       * A whole order cancelled, for good, with each line it cancelled: its
       * quantity and unit price, never a sum.
       */
      action: "order.cancel";
      where: ActivityOrderWhere | null;
      reason: OrderCancelReason | null;
      lines: ActivityOrderLine[];
    }
  | {
      /**
       * Whoever runs orders left the device they were on as the kitchen's
       * screen or the till (waiter mode P8a), by the name they gave it; a
       * kitchen's screen of one department (`department` its name, null
       * when the reader can't tell) or of every one (`every`).
       */
      action: "order.station.add";
      name: string;
      shows: OrderStationShows;
      department: string | null;
      every: boolean;
    }
  | {
      /**
       * A kitchen's screen or a till stopped, or started again in the two
       * minutes after; its name where the reader may read it, else null.
       */
      action: "order.station.stop" | "order.station.restart";
      name: string | null;
      shows: OrderStationShows;
    }
  | {
      /**
       * Someone changed a hiring file (profile H4): the person, or a holder
       * of people.files for the person's name, birth date or ID. Which
       * parts, never a value or a hint; only holders read these rows.
       */
      action: "employee.details";
      person: ActivityPerson;
      fields: FileDetailField[];
    }
  | {
      /** A holder read someone's file, or revealed a number (routine, kept). */
      action: "employee.view";
      person: ActivityPerson;
      fields: FileViewField[];
    }
  | {
      /**
       * A read of a file refused, and why: the person it was for when they
       * are in the business, else null (an export's, or one asked by
       * someone outside it, which never says more).
       */
      action: "employee.view_denied";
      person: ActivityPerson | null;
      reason: DenialReason | null;
    }
  | {
      /**
       * The person sent their file, a holder confirmed a new bank account,
       * or the person said "לא שיניתי" about one.
       */
      action:
        | "employee.submit"
        | "employee.bank_ack"
        | "employee.bank_disputed";
      person: ActivityPerson;
    }
  | {
      /** A year's Form 101 marked, or the mark taken off ("cleared"). */
      action: "employee.tax_year";
      person: ActivityPerson;
      year: number;
      status: TaxYearStatus | "cleared";
    }
  /** A holder confirmed the duties screen before their first file. */
  | { action: "employee.ack" }
  | {
      /** A holder marked parts of a file "נמסר ישירות לשכר"; none for the mark taken off. */
      action: "employee.direct";
      person: ActivityPerson;
      groups: FileGroup[];
    }
  | {
      /**
       * A holder took the details for payroll out of the files: how many
       * people, for whom, and how many accounts waited for a holder and
       * stayed out. Never a value.
       */
      action: "employee.export";
      people: number;
      recipient: "provider" | "own";
      held: number;
    }
  /** Someone set or removed their emergency contact (H4): never who it is. */
  | { action: "member.emergency"; person: ActivityPerson }
  | { action: "other" };

/** What a station of the orders shows: the kitchen's tickets, or the till. */
export type OrderStationShows = "prep" | "till";

/** The fixes of a line the log keeps (waiter mode P3). */
export const ORDER_LINE_ACTIONS = [
  "order.line.take_back",
  "order.line.cancel",
  "order.line.restore",
  "order.line.comp",
  "order.line.uncomp",
] as const;
export type OrderLineAction = (typeof ORDER_LINE_ACTIONS)[number];

/** Where an order was: a place by its name then, or a takeaway by its number. */
export type ActivityOrderWhere =
  | { kind: "place"; name: string }
  | { kind: "takeaway"; number: number };

/** A line a cancelled order took with it. */
export type ActivityOrderLine = {
  name: string;
  choices: string[];
  quantity: number;
  unitAgorot: number;
  department: string | null;
};

/** What an item's save changed, as the log names it, in order. */
export const MENU_ITEM_FIELDS = [
  "name",
  "description",
  "price",
  "category",
  "department",
  "options",
  "position",
] as const;
export type MenuItemField = (typeof MENU_ITEM_FIELDS)[number];

/**
 * An option whose price moved, by its group's name and its own: none before
 * for one added, none after for one removed.
 */
export type MenuOptionMove = {
  group: string;
  option: string;
  before: number | null;
  after: number | null;
};

/** The fields of a list item a fix names (lists L6b-1), in order. */
export const LIST_FIX_FIELDS = [
  "checked",
  "given",
  "reading",
  "answer",
  "comment",
  "photo",
] as const;
export type ListFixField = (typeof LIST_FIX_FIELDS)[number];

/** An item's value a fix's row keeps, before and after: never its text. */
export type ListFixValues = {
  checked: boolean;
  given: number | null;
  reading: number | null;
};

/** One item a fix changed (lists L6b-1). */
export type ActivityListFix = {
  label: string;
  /** The item's kind, or null when the row doesn't say. */
  kind: "check" | "number" | "note" | "photo" | null;
  unit: string | null;
  /** What changed, in `LIST_FIX_FIELDS`' order. */
  fields: ListFixField[];
  from: ListFixValues;
  to: ListFixValues;
};

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
  actor: ActivityActor;
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
const fixValues = z.object({
  checked: z.boolean().nullable().catch(null),
  given: z.number().nullable().catch(null),
  reading: z.number().nullable().catch(null),
});
const noValues: ListFixValues = { checked: false, given: null, reading: null };
const fixValuesOf = (
  values: z.infer<typeof fixValues> | undefined,
): ListFixValues =>
  values
    ? {
        checked: values.checked === true,
        given: values.given,
        reading: values.reading,
      }
    : noValues;
/** Where an order was, as the log froze it: a place's name or a takeaway's number. */
const orderWhere = z
  .union([
    z
      .object({ place: z.string() })
      .transform((where) => ({ kind: "place", name: where.place }) as const),
    z
      .object({ takeaway: z.int().min(1) })
      .transform(
        (where) => ({ kind: "takeaway", number: where.takeaway }) as const,
      ),
  ])
  .nullable()
  .catch(null);
/** A line as the log froze it: its quantity and unit price, never a total. */
const orderLineFields = {
  name: z.string(),
  choices: z.array(z.string()).catch([]),
  quantity: z.int().min(1),
  unitAgorot: z.int().min(0),
  department: id.nullable().optional(),
};

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
  // 20261117000200_cancelled_shifts.sql: an open shift's clock_out is null.
  "clock.cancel": z.object({
    person: id,
    clock_in: instant,
    clock_out: instant.nullable().optional(),
    note: z.unknown().optional(),
  }),
  "clock.restore": z.object({
    person: id,
    clock_in: instant,
    clock_out: instant.nullable().optional(),
    reopened: z.unknown().optional(),
  }),
  // 20261117000300_break_edits.sql: a break added or brought back has no
  // `from`, one removed no `to`; a restore no note.
  "clock.break_edit": z.object({
    person: id,
    clock_in: instant,
    change: z.enum(BREAK_EDIT_KINDS),
    from: span.nullable().optional(),
    to: span.nullable().optional(),
    unpaid: z.boolean().nullable().optional().catch(null),
    note: z.unknown().optional(),
  }),
  "clock.confirm": z.object({ person: id }),
  "clock.code.locked": z.object({ person: id.optional() }),
  // 20261108000200_qr_clock.sql: the add keeps the name, a stop or restart
  // the station alone.
  "clock.station.add": z.object({ station: id, name: z.string() }),
  "clock.station.stop": z.object({ station: id }),
  // A role the business named, by its name then (20261115001600_named_roles_give.sql).
  invite: z.object({
    invite: id,
    role: z.unknown().optional(),
    role_name: z.string().optional().catch(undefined),
  }),
  // A team change (20261114000100_team_changes.sql): the published shifts
  // that came off the person, the swaps cancelled and those open again are
  // arrays, counted here.
  "member.remove": z.object({
    person: id,
    role: z.unknown().optional(),
    role_name: z.string().optional().catch(undefined),
    shifts: z.array(z.unknown()).optional().catch(undefined),
    swaps: z.array(z.unknown()).optional().catch(undefined),
    reopened: z.array(z.unknown()).optional().catch(undefined),
  }),
  "member.role": z.object({
    person: id,
    role: z.unknown().optional(),
    was: z.unknown().optional(),
    role_name: z.string().optional().catch(undefined),
    was_role_name: z.string().optional().catch(undefined),
    shifts: z.array(z.unknown()).optional().catch(undefined),
    swaps: z.array(z.unknown()).optional().catch(undefined),
    reopened: z.array(z.unknown()).optional().catch(undefined),
  }),
  // 20261117000700_member_names.sql: the person alone, never a name.
  "member.name": z.object({ person: id }),
  role: z.object({
    role: z.unknown().optional(),
    role_name: z.string().optional().catch(undefined),
  }),
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
    running: z.boolean().default(false),
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
      // A role the business named (R11d): its name as the list was sent.
      role_name: z.string().optional().catch(undefined),
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
  // A fix of a finished list (20261116000300_lists_fix.sql): `checked` is
  // true or null, as list_items keeps it.
  "lists.fix": z.object({
    list: id,
    name: z.string(),
    item: id.optional(),
    label: z.string(),
    kind: z.enum(["check", "number", "note", "photo"]).nullable().catch(null),
    unit: z.string().nullable().catch(null),
    changed: z.array(z.unknown()).catch([]),
    from: fixValues.optional().catch(undefined),
    to: fixValues.optional().catch(undefined),
  }),
  "role.permission": z.object({
    role: z.unknown(),
    perm: z.string(),
    to: z.boolean(),
    name: z.string().optional().catch(undefined),
  }),
  "role.create": z.object({ name: z.string(), base: z.unknown().optional() }),
  "role.rename": z.object({ from: z.string(), to: z.string() }),
  "role.named": z.object({ name: z.string() }),
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
  "document.send": z.object({
    document: id,
    direction: z.enum(DOCUMENT_DIRECTIONS),
    recipients: z.int().min(0).catch(0),
  }),
  "document.open": z.object({ document: id, person: id.nullable().optional() }),
  "document.remove": z.object({
    document: id,
    reason: z.enum(DOCUMENT_REMOVE_REASONS).nullable().catch(null),
  }),
  "document.restore": z.object({ document: id }),
  // The hiring file (20261126000200_employee_files.sql): names of parts and
  // reasons only, never a value.
  "employee.fields": z.object({
    person: id,
    fields: z.array(z.unknown()).catch([]),
  }),
  "employee.view_denied": z.object({
    person: id.nullable().optional(),
    reason: z.enum(DENIAL_REASONS).nullable().catch(null),
  }),
  "employee.person": z.object({ person: id }),
  "employee.tax_year": z.object({
    person: id,
    year: z.int().min(2000).max(2100),
    status: z.enum([...TAX_YEAR_STATUSES, "cleared"]),
  }),
  "employee.ack": z.object({ version: z.string().optional() }),
  "employee.direct": z.object({
    person: id,
    groups: z.array(z.unknown()).catch([]),
  }),
  "employee.export": z.object({
    people: z.int().min(0),
    recipient: z.enum(["provider", "own"]),
    held: z.int().min(0).catch(0).default(0),
  }),
  // The menu (20261117000500_order_taking_menu.sql): prices in agorot.
  "menu.item.save": z.object({
    item: id,
    name: z.string(),
    created: z.boolean().default(false),
    changed: z.array(z.unknown()).catch([]),
    price: z
      .object({ before: z.int().min(0).nullable(), after: z.int().min(0) })
      .optional()
      .catch(undefined),
    options: z
      .array(
        z.object({
          group: z.string(),
          option: z.string(),
          before: z.int().min(0).nullable(),
          after: z.int().min(0).nullable(),
        }),
      )
      .optional()
      .catch(undefined),
  }),
  "menu.item": z.object({ item: id, name: z.string() }),
  "menu.import": z.object({
    categories: z.int().min(0),
    items: z.int().min(0),
  }),
  "menu.list": z.object({
    added: z.int().min(0).catch(0),
    archived: z.int().min(0).catch(0),
    restored: z.int().min(0).catch(0),
    changed: z.int().min(0).catch(0),
  }),
  // The orders (20261120000300_order_taking_orders.sql): a line's quantity
  // and unit price in agorot, never a total.
  "order.line": z.object({
    ...orderLineFields,
    where: orderWhere,
    ticket: z.enum(TICKET_STATUSES).nullable().catch(null),
    reason: z.unknown().optional(),
    sender: id.nullable().optional(),
  }),
  "order.cancel": z.object({
    where: orderWhere,
    reason: z.enum(ORDER_CANCEL_REASONS).nullable().catch(null),
    lines: z.array(z.object(orderLineFields)).catch([]),
  }),
  // 20261124000100_order_taking_stations.sql: the add keeps the name, what
  // it shows and the kitchen's department; a stop or restart the station
  // and what it shows.
  "order.station.add": z.object({
    station: id,
    name: z.string(),
    shows: z.enum(["prep", "till"]),
    department: id.nullable().catch(null),
  }),
  "order.station.stop": z.object({
    station: id,
    shows: z.enum(["prep", "till"]),
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

const APP_WRITES: ReadonlySet<string> = new Set(APP_ACTIONS);

/**
 * Who did it: a member now or before, or else the ConceptApp team, the only
 * other writer of a business's log. Nobody, on what the app writes on its own,
 * is the app; on anything else, someone whose account has gone.
 */
function actorOf(row: ActivityRow, lookups: ActivityLookups): ActivityActor {
  const { actorId } = row;
  if (actorId === null) {
    return APP_WRITES.has(row.action) ? { kind: "app" } : { kind: "unknown" };
  }
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

const PATH_ID = /^[0-9a-z-]{1,64}$/i;

/**
 * Whose a row is, as a link may carry it: a database's id, or the demo's own
 * ("yoav"); null for anything else, which never reaches an address.
 */
function pathIdOf(value: string): string | null {
  return PATH_ID.test(value) ? value : null;
}

/**
 * Whether a break edit's sides fit what it did: one added or brought back has
 * only its new times, one removed only its old, one changed both.
 */
function breakEditFits(
  change: BreakEditKind,
  from: unknown,
  to: unknown,
): boolean {
  const has = (side: unknown) => side !== null && side !== undefined;
  switch (change) {
    case "add":
    case "restore":
      return has(to);
    case "remove":
      return has(from);
    case "change":
      return has(from) && has(to);
  }
}

/** A role the business named, by its name then, for a line that names one (R11b). */
function namedOf(name: string | undefined): { roleName?: string } {
  return name?.trim() ? { roleName: name.trim() } : {};
}

function lineOf(row: ActivityRow, lookups: ActivityLookups): ActivityLine {
  const other = { action: "other" } as const;
  const read = <S extends z.ZodType>(schema: S) => {
    const parsed = schema.safeParse(row.details);
    return parsed.success ? (parsed.data as z.infer<S>) : null;
  };
  const shiftOf = (shiftId: string | null | undefined) =>
    (shiftId && lookups.shifts.get(shiftId)) || null;
  // A swap's line names the shift the request was made for, as it was then,
  // so it reads the same after the shift moves or goes; without the request
  // to read, the shift the row names, while it is there.
  const swapShift = (swapId: string, shiftId: string | null | undefined) =>
    lookups.swaps.get(swapId)?.shift ?? shiftOf(shiftId);
  /** A department a row names, by its name as the reader may read it. */
  const departmentOf = (departmentId: string | null | undefined) =>
    (departmentId && lookups.departments.get(departmentId.toLowerCase())) ??
    null;

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
    case "clock.cancel": {
      const details = read(schemas["clock.cancel"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        personId: pathIdOf(details.person),
        times: {
          clockIn: details.clock_in,
          clockOut: details.clock_out ?? null,
        },
        note: noteOf(details.note),
      };
    }
    case "clock.restore": {
      const details = read(schemas["clock.restore"]);
      if (!details) return other;
      const reopened = details.reopened === true;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        personId: pathIdOf(details.person),
        times: {
          clockIn: details.clock_in,
          // Open again, it has no end.
          clockOut: reopened ? null : (details.clock_out ?? null),
        },
        reopened,
      };
    }
    case "clock.break_edit": {
      const details = read(schemas["clock.break_edit"]);
      if (!details || !breakEditFits(details.change, details.from, details.to))
        return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        personId: pathIdOf(details.person),
        clockIn: details.clock_in,
        change: details.change,
        from:
          details.change === "add" || details.change === "restore"
            ? null
            : details.from
              ? spanTimes(details.from)
              : null,
        to:
          details.change === "remove"
            ? null
            : details.to
              ? spanTimes(details.to)
              : null,
        unpaid: details.unpaid ?? null,
        // A restore asks for no reason.
        note: details.change === "restore" ? null : noteOf(details.note),
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
    case "clock.station.add": {
      const details = read(schemas["clock.station.add"]);
      return details?.name.trim()
        ? { action: row.action, name: details.name.trim() }
        : other;
    }
    case "clock.station.stop":
    case "clock.station.restart": {
      const details = read(schemas["clock.station.stop"]);
      return details
        ? {
            action: row.action,
            name: lookups.stations.get(details.station.toLowerCase()) ?? null,
          }
        : other;
    }
    case "invite.create":
    case "invite.send":
    case "invite.cancel": {
      const details = read(schemas.invite);
      if (!details) return other;
      const invite = lookups.invites.get(details.invite);
      return {
        action: row.action,
        name: invite?.name ?? null,
        role: roleOf(details.role) ?? invite?.role ?? null,
        ...namedOf(details.role_name),
      };
    }
    case "member.remove": {
      const details = read(schemas["member.remove"]);
      return details
        ? {
            action: row.action,
            person: personOf(details.person, lookups),
            role: roleOf(details.role),
            ...namedOf(details.role_name),
            shifts: details.shifts?.length ?? 0,
            swaps: details.swaps?.length ?? 0,
            reopened: details.reopened?.length ?? 0,
          }
        : other;
    }
    case "member.role": {
      const details = read(schemas["member.role"]);
      return details
        ? {
            action: row.action,
            person: personOf(details.person, lookups),
            role: roleOf(details.role),
            was: roleOf(details.was),
            ...namedOf(details.role_name),
            ...(details.was_role_name
              ? { wasName: details.was_role_name }
              : {}),
            shifts: details.shifts?.length ?? 0,
            swaps: details.swaps?.length ?? 0,
            reopened: details.reopened?.length ?? 0,
          }
        : other;
    }
    case "member.name": {
      const details = read(schemas["member.name"]);
      return details
        ? { action: row.action, person: personOf(details.person, lookups) }
        : other;
    }
    case "invite.claim": {
      const details = read(schemas.role);
      return details
        ? {
            action: row.action,
            role: roleOf(details.role),
            ...namedOf(details.role_name),
          }
        : other;
    }
    case "view_as.start":
    case "view_as.end": {
      const details = read(schemas.role);
      return details
        ? {
            action: row.action,
            role: roleOf(details.role),
            ...namedOf(details.role_name),
          }
        : other;
    }
    case "swap.request": {
      const details = read(schemas["swap.request"]);
      return details
        ? { action: row.action, shift: swapShift(details.swap, details.shift) }
        : other;
    }
    case "swap.take":
    case "swap.cancel": {
      const details = read(schemas.swap);
      if (!details) return other;
      const swap = lookups.swaps.get(details.swap);
      const shift = swapShift(details.swap, swap?.shiftId);
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
        shift: swapShift(
          details.swap,
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
      const { kind, id: to, role, role_name: roleName } = details.recipient;
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
                ? roleName
                  ? { kind, role: roleOf(role), name: roleName }
                  : { kind, role: roleOf(role) }
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
    case "lists.fix": {
      const details = read(schemas["lists.fix"]);
      if (!details) return other;
      return {
        action: row.action,
        name: details.name,
        items: [
          {
            label: details.label,
            kind: details.kind,
            unit: details.unit,
            fields: knownFields(details.changed, LIST_FIX_FIELDS),
            from: fixValuesOf(details.from),
            to: fixValuesOf(details.to),
          },
        ],
      };
    }
    case "role.permission": {
      const details = read(schemas["role.permission"]);
      if (!details) return other;
      return {
        action: row.action,
        role: roleOf(details.role),
        permission: rolePermissionOf(details.perm),
        on: details.to,
        ...(details.name ? { named: details.name } : {}),
      };
    }
    case "role.create": {
      const details = read(schemas["role.create"]);
      return details
        ? { action: row.action, name: details.name, base: roleOf(details.base) }
        : other;
    }
    case "role.rename": {
      const details = read(schemas["role.rename"]);
      return details
        ? { action: row.action, from: details.from, to: details.to }
        : other;
    }
    case "role.archive":
    case "role.restore": {
      const details = read(schemas["role.named"]);
      return details ? { action: row.action, name: details.name } : other;
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
    case "document.send": {
      const details = read(schemas["document.send"]);
      return details
        ? {
            action: row.action,
            direction: details.direction,
            recipients:
              details.direction === "to_people" ? details.recipients : 0,
          }
        : other;
    }
    case "document.open": {
      const details = read(schemas["document.open"]);
      if (!details) return other;
      const person = details.person ?? null;
      return {
        action: row.action,
        person: person === null ? null : personOf(person, lookups),
      };
    }
    case "document.remove": {
      const details = read(schemas["document.remove"]);
      return details ? { action: row.action, reason: details.reason } : other;
    }
    case "document.restore":
      return read(schemas["document.restore"]) ? { action: row.action } : other;
    case "employee.details": {
      const details = read(schemas["employee.fields"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        fields: knownFields(details.fields, FILE_DETAIL_FIELDS),
      };
    }
    case "employee.view": {
      const details = read(schemas["employee.fields"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        fields: knownFields(details.fields, FILE_VIEW_FIELDS),
      };
    }
    case "employee.view_denied": {
      const details = read(schemas["employee.view_denied"]);
      if (!details) return other;
      const person = details.person ?? null;
      return {
        action: row.action,
        person: person === null ? null : personOf(person, lookups),
        reason: details.reason,
      };
    }
    case "employee.submit":
    case "employee.bank_ack":
    case "employee.bank_disputed": {
      const details = read(schemas["employee.person"]);
      return details
        ? { action: row.action, person: personOf(details.person, lookups) }
        : other;
    }
    case "employee.tax_year": {
      const details = read(schemas["employee.tax_year"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        year: details.year,
        status: details.status,
      };
    }
    case "employee.ack":
      return read(schemas["employee.ack"]) ? { action: row.action } : other;
    case "employee.direct": {
      const details = read(schemas["employee.direct"]);
      if (!details) return other;
      return {
        action: row.action,
        person: personOf(details.person, lookups),
        groups: knownFields(details.groups, FILE_GROUPS),
      };
    }
    case "employee.export": {
      const details = read(schemas["employee.export"]);
      return details
        ? {
            action: row.action,
            people: details.people,
            recipient: details.recipient,
            held: details.held,
          }
        : other;
    }
    case "member.emergency": {
      const details = read(schemas["employee.person"]);
      return details
        ? { action: row.action, person: personOf(details.person, lookups) }
        : other;
    }
    case "menu.item.save": {
      const details = read(schemas["menu.item.save"]);
      if (!details) return other;
      return {
        action: row.action,
        name: details.name,
        created: details.created,
        fields: details.created
          ? []
          : knownFields(details.changed, MENU_ITEM_FIELDS),
        price:
          details.price && details.price.before !== details.price.after
            ? details.price
            : null,
        options: (details.options ?? []).filter(
          (move) => move.before !== move.after,
        ),
      };
    }
    case "menu.item.archive":
    case "menu.item.restore": {
      const details = read(schemas["menu.item"]);
      return details ? { action: row.action, name: details.name } : other;
    }
    case "menu.import": {
      const details = read(schemas["menu.import"]);
      return details ? { action: row.action, ...details } : other;
    }
    case "menu.categories":
    case "menu.places": {
      const details = read(schemas["menu.list"]);
      return details ? { action: row.action, ...details } : other;
    }
    case "order.line.take_back":
    case "order.line.cancel":
    case "order.line.restore":
    case "order.line.comp":
    case "order.line.uncomp": {
      const details = read(schemas["order.line"]);
      if (!details) return other;
      const reasons: readonly string[] =
        row.action === "order.line.cancel"
          ? LINE_CANCEL_REASONS
          : row.action === "order.line.comp"
            ? COMP_REASONS
            : [];
      const reason =
        typeof details.reason === "string" && reasons.includes(details.reason)
          ? (details.reason as LineCancelReason | CompReason)
          : null;
      return {
        action: row.action,
        name: details.name,
        choices: details.choices,
        quantity: details.quantity,
        unitAgorot: details.unitAgorot,
        where: details.where,
        department: departmentOf(details.department),
        ticket: details.ticket,
        reason,
        sender: details.sender ? personOf(details.sender, lookups) : null,
      };
    }
    case "order.cancel": {
      const details = read(schemas["order.cancel"]);
      if (!details) return other;
      return {
        action: row.action,
        where: details.where,
        reason: details.reason,
        lines: details.lines.map((line) => ({
          name: line.name,
          choices: line.choices,
          quantity: line.quantity,
          unitAgorot: line.unitAgorot,
          department: departmentOf(line.department),
        })),
      };
    }
    case "order.station.add": {
      const details = read(schemas["order.station.add"]);
      if (!details?.name.trim()) return other;
      return {
        action: row.action,
        name: details.name.trim(),
        shows: details.shows,
        department: departmentOf(details.department),
        every: details.shows === "prep" && details.department === null,
      };
    }
    case "order.station.stop":
    case "order.station.restart": {
      const details = read(schemas["order.station.stop"]);
      return details
        ? {
            action: row.action,
            name: lookups.stations.get(details.station.toLowerCase()) ?? null,
            shows: details.shows,
          }
        : other;
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
            running: details.running,
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
  const stations = new Set<string>();
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
    // An order's line names the department it went to and who sent it; a
    // cancelled order, each line's department.
    if (row.action.startsWith("order.")) {
      add(people, details.data.sender);
      add(departments, details.data.department);
      const lines = details.data.lines;
      if (Array.isArray(lines)) {
        for (const line of lines) {
          const one = fields.safeParse(line);
          if (one.success) add(departments, one.data.department);
        }
      }
    }
    if (
      row.action === "clock.station.stop" ||
      row.action === "clock.station.restart" ||
      row.action === "order.station.stop" ||
      row.action === "order.station.restart"
    ) {
      add(stations, details.data.station);
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
    stations: [...stations],
  };
}

type Parsed = ActivityEntry & {
  actorId: string | null;
  /** When the run of edits this line stands for began. */
  since: string;
  /**
   * A fix's list, and each of its items' ids beside the line's items (lists
   * L6b-1): what a run folds by, never shown.
   */
  fix?: { list: string; items: (string | null)[] };
};

/** The ids a fix's row names (lists L6b-1), for folding a run of them. */
function fixRefsOf(row: ActivityRow): Parsed["fix"] {
  if (row.action !== "lists.fix") return undefined;
  const details = fields.safeParse(row.details);
  if (!details.success) return undefined;
  const { list, item } = details.data;
  if (!isUuid(list)) return undefined;
  return {
    list: list.toLowerCase(),
    items: [isUuid(item) ? item.toLowerCase() : null],
  };
}

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
  // One person's fixes of one list (lists L6b-1).
  if (a.action === "lists.fix") {
    return (
      b.action === "lists.fix" &&
      newer.fix !== undefined &&
      newer.fix.list === older.fix?.list
    );
  }
  return (
    a.action === "module.settings" &&
    b.action === "module.settings" &&
    a.module === b.module
  );
}

/**
 * A run of fixes as one line (lists L6b-1): the older one's items first, as
 * they were fixed, and an item fixed again once, from where it began to
 * where it ended, with every field either named.
 */
function foldFixes(
  newer: Parsed,
  older: Parsed,
  a: Extract<ActivityLine, { action: "lists.fix" }>,
  b: Extract<ActivityLine, { action: "lists.fix" }>,
): Parsed {
  const items = [...b.items];
  const ids = [...(older.fix?.items ?? b.items.map(() => null))];
  a.items.forEach((item, index) => {
    const id = newer.fix?.items[index] ?? null;
    const at = id === null ? -1 : ids.indexOf(id);
    const was = at >= 0 ? items[at] : undefined;
    if (!was) {
      items.push(item);
      ids.push(id);
      return;
    }
    items[at] = {
      ...item,
      fields: LIST_FIX_FIELDS.filter(
        (field) => was.fields.includes(field) || item.fields.includes(field),
      ),
      from: was.from,
    };
  });
  return {
    ...newer,
    line: { ...a, items },
    fix: newer.fix ? { list: newer.fix.list, items: ids } : undefined,
  };
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
  if (a.action === "lists.fix" && b.action === "lists.fix") {
    return foldFixes(newer, older, a, b);
  }
  return newer;
}

/** The fields a fix's row keeps the values of, before and after. */
const FIX_VALUE_FIELDS: readonly ListFixField[] = [
  "checked",
  "given",
  "reading",
];

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
  // A fix that put a value back where it began (lists L6b-1). A fix of an
  // answer, a comment or a photo has no value kept, so it always says so.
  if (line.action === "lists.fix") {
    const items = line.items.filter(
      (item) =>
        item.fields.length === 0 ||
        !item.fields.every((field) => FIX_VALUE_FIELDS.includes(field)) ||
        !same(item.from, item.to),
    );
    return items.length ? { ...entry, line: { ...line, items } } : null;
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
      actor: actorOf(row, lookups),
      line: lineOf(row, lookups),
      actorId: row.actorId,
      since: row.createdAt,
      fix: fixRefsOf(row),
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
