import { z } from "zod";
import { isUuid } from "./activity";
import { addDays, dateIn, instantIn } from "./availability";
import { departmentKey } from "./departments";
import { dayOfWeek, minutesOf, rangeMinutes, timeOfDay } from "./hours";
import type { ScheduleOpenings } from "./list-openings";
import { type Role, STAFF_ROLES, type StaffRole } from "./modules";
import { timeIn } from "./shabbat";

/**
 * Lists (Orel, 8 and 9 November 2026, issue #1): checklists sent to a person,
 * a department, the people of a shift or a role, now or by a template's
 * times, checked off and finished; and orders that go from one department to
 * another. The database holds them (supabase/migrations/
 * 20261109000600_lists.sql) and checks every write; this file is the shapes
 * the app sends and reads, checked here first with the same rules, and the
 * small sums the screens show (progress, out of range, due and late).
 */

export const LIST_ITEM_KINDS = ["check", "number", "note", "photo"] as const;
export type ListItemKind = (typeof LIST_ITEM_KINDS)[number];

/** Who a list goes to. A template's default is never a person. */
export const RECIPIENT_KINDS = [
  "person",
  "department",
  "shift",
  "role",
] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

export const LIST_STATUSES = [
  "open",
  "finished",
  "missed",
  "cancelled",
] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export const LIST_ORIGINS = ["sent", "scheduled"] as const;
export type ListOrigin = (typeof LIST_ORIGINS)[number];

/** A schedule's times follow the day, or a shift's start or end. */
export const SCHEDULE_ANCHORS = ["day", "shift_start", "shift_end"] as const;
export type ScheduleAnchor = (typeof SCHEDULE_ANCHORS)[number];

/** The database's limits, in one place for the screens. */
export const MAX_LIST_ITEMS = 60;
export const MAX_LIST_SCHEDULES = 7;
export const MAX_LIVE_TEMPLATES = 100;
export const MAX_OPEN_LISTS = 500;
/** Whoever finished or cancelled a list opens it again within this (the undo). */
export const REOPEN_MINUTES = 5;
/** A due time is at most this many days after sending. */
export const MAX_DUE_DAYS = 14;
/** A note passed on with a list, at most (`public.pass_list`). */
export const MAX_PASS_NOTE = 200;
/** The most of one item an order asks for, or says was given. */
export const MAX_QUANTITY = 9999;
/** A list sent to a shift names one from today to this many days ahead. */
export const SHIFT_DAYS_AHEAD = 7;
/** A shift-anchored time is at most this many minutes around the shift. */
export const MAX_SHIFT_OFFSET = 720;
const DAY_MINUTES = 24 * 60;

const uuid = z.string().refine(isUuid, "Expected an id");
const key = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Expected a lowercase key")
  .max(40);

/** A shift pattern's key in the scheduling settings. */
export const shiftKey = key;

export const listName = z.string().trim().min(1).max(60);
export const listNote = z.string().trim().min(1).max(300);
const itemLabel = z.string().trim().min(1).max(120);
const itemHint = z.string().trim().min(1).max(200);
const itemUnit = z.string().trim().min(1).max(12);
const bound = z.number().min(-100000).max(100000);
const count = z.int().min(0).max(MAX_QUANTITY);
const itemComment = z.string().trim().min(1).max(200);
const itemAnswer = z.string().trim().min(1).max(500);

const itemFields = {
  kind: z.enum(LIST_ITEM_KINDS),
  label: itemLabel,
  hint: itemHint.optional(),
  required: z.boolean().default(true),
  /** Numbers only: the unit and the range a reading is flagged outside. */
  unit: itemUnit.optional(),
  min: bound.optional(),
  max: bound.optional(),
  /** Orders: the usual count of a check item, filled in when sending. */
  defaultQuantity: z.int().min(1).max(MAX_QUANTITY).optional(),
};

type ItemShape = {
  kind: ListItemKind;
  unit?: string;
  min?: number;
  max?: number;
  defaultQuantity?: number;
};

/**
 * The rules an item keeps whatever holds it. A photo (from L6) is like a
 * note: no unit, range or usual count.
 */
function checkItem(item: ItemShape, ctx: z.RefinementCtx) {
  if (
    item.kind !== "number" &&
    (item.unit !== undefined ||
      item.min !== undefined ||
      item.max !== undefined)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Only numbers have a unit and a range",
    });
  }
  if (item.min !== undefined && item.max !== undefined && item.min > item.max) {
    ctx.addIssue({
      code: "custom",
      message: "The lowest value is above the highest",
    });
  }
  if (item.kind !== "check" && item.defaultQuantity !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Only checks have a usual quantity",
    });
  }
}

/** An item as a global template writes it. */
export const listItemSeed = z.strictObject(itemFields).superRefine(checkItem);
export type ListItemSeed = z.output<typeof listItemSeed>;

/** An item as the editor saves it: with its id when it was saved before. */
export const listItemInput = z
  .strictObject({ id: uuid.optional(), ...itemFields })
  .superRefine(checkItem);
export type ListItemInput = z.input<typeof listItemInput>;

const roleRecipient = z.strictObject({
  kind: z.literal("role"),
  // A list goes to someone on the staff, never to accountants.
  role: z.enum(STAFF_ROLES),
});

/** A template's default recipient in a global template: by keys. */
export const recipientSeed = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("department"), department: departmentKey }),
  z.strictObject({ kind: z.literal("shift"), shift: shiftKey }),
  roleRecipient,
]);
export type RecipientSeed = z.output<typeof recipientSeed>;

/** A template's default recipient in a business: a department by its id. */
export const templateRecipient = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("department"), department: uuid }),
  z.strictObject({ kind: z.literal("shift"), shift: shiftKey }),
  roleRecipient,
]);
export type TemplateRecipient = z.output<typeof templateRecipient>;

/** Who a schedule's lists go to: a person too, by their place in the business. */
export const scheduleRecipient = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("person"), user: uuid }),
  z.strictObject({ kind: z.literal("department"), department: uuid }),
  z.strictObject({ kind: z.literal("shift"), shift: shiftKey }),
  roleRecipient,
]);
export type ScheduleRecipient = z.output<typeof scheduleRecipient>;

/**
 * Who a list sent now goes to. A shift is a real shift of a published
 * schedule, from today to `SHIFT_DAYS_AHEAD` days ahead, by its id: its
 * people as they are when it is sent.
 */
export const sendRecipient = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("person"), user: uuid }),
  z.strictObject({ kind: z.literal("department"), department: uuid }),
  z.strictObject({ kind: z.literal("shift"), shift: uuid }),
  roleRecipient,
]);
export type SendRecipient = z.output<typeof sendRecipient>;

const scheduleDays = z
  .array(dayOfWeek)
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, "Each day once");

/** "HH:MM" for the day; minutes from the shift's start or end otherwise. */
const opensTime = z.union([
  timeOfDay,
  z.int().min(-MAX_SHIFT_OFFSET).max(MAX_SHIFT_OFFSET),
]);

type TimesShape = {
  anchor: ScheduleAnchor;
  shift?: string | undefined;
  opens: string | number;
};

function checkTimes(schedule: TimesShape, ctx: z.RefinementCtx) {
  const byDay = schedule.anchor === "day";
  if (byDay !== (schedule.shift === undefined)) {
    ctx.addIssue({
      code: "custom",
      message: "A schedule that follows a shift names it, and only then",
    });
  }
  if (byDay !== (typeof schedule.opens === "string")) {
    ctx.addIssue({
      code: "custom",
      message: "A time of day for the day, minutes for a shift",
    });
  }
}

/** A template's times as a global template writes them. */
export const scheduleSeed = z
  .strictObject({
    days: scheduleDays,
    anchor: z.enum(SCHEDULE_ANCHORS).default("day"),
    shift: shiftKey.optional(),
    opens: opensTime,
    /** How long it has, from when it opens. */
    dueAfterMinutes: z.int().min(1).max(DAY_MINUTES),
    /** Left out: the template's own recipient. */
    recipient: recipientSeed.optional(),
  })
  .superRefine(checkTimes);

/** A template's times as the editor shows and saves them. */
export const scheduleInput = z
  .strictObject({
    id: uuid.optional(),
    days: scheduleDays,
    anchor: z.enum(SCHEDULE_ANCHORS).default("day"),
    shift: shiftKey.optional(),
    opens: opensTime,
    dueAfterMinutes: z.int().min(1).max(DAY_MINUTES),
    recipient: scheduleRecipient,
    /** A pause, without losing the times. */
    active: z.boolean().default(true),
  })
  .superRefine(checkTimes);
export type ScheduleInput = z.input<typeof scheduleInput>;

/** The minutes the database keeps for a schedule's opening and due times. */
export function toOffsets(schedule: {
  opens: string | number;
  dueAfterMinutes: number;
}): { opensOffset: number; dueOffset: number } {
  const opensOffset =
    typeof schedule.opens === "string"
      ? minutesOf(schedule.opens)
      : schedule.opens;
  return { opensOffset, dueOffset: opensOffset + schedule.dueAfterMinutes };
}

/** A schedule's times as the editor shows them, from the database's minutes. */
export function fromOffsets(
  anchor: ScheduleAnchor,
  opensOffset: number,
  dueOffset: number,
): { opens: string | number; dueAfterMinutes: number } {
  const dueAfterMinutes = dueOffset - opensOffset;
  if (anchor !== "day") return { opens: opensOffset, dueAfterMinutes };
  const hours = Math.floor(opensOffset / 60);
  const minutes = opensOffset % 60;
  return {
    opens: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    dueAfterMinutes,
  };
}

/**
 * A list template as a global template writes it (`listTemplates` in
 * @domain/templates). A schedule without its own recipient goes to the
 * template's, which it reads as here, so a business set up from it reads the
 * same back.
 */
export const listTemplateSeed = z
  .strictObject({
    key,
    name: listName,
    note: listNote.optional(),
    recipient: recipientSeed.nullable().default(null),
    /** An order between departments: the department that asks. */
    fromDepartment: departmentKey.nullable().default(null),
    asksQuantities: z.boolean().default(false),
    items: z.array(listItemSeed).min(1).max(MAX_LIST_ITEMS),
    schedules: z.array(scheduleSeed).max(MAX_LIST_SCHEDULES).default([]),
  })
  .superRefine((template, ctx) => {
    if (template.schedules.some((s) => !s.recipient) && !template.recipient) {
      ctx.addIssue({
        code: "custom",
        message: `A schedule of ${template.key} goes to nobody`,
      });
    }
  })
  .transform((template) => ({
    ...template,
    schedules: template.schedules.map((schedule) => ({
      ...schedule,
      recipient: schedule.recipient ?? template.recipient,
    })),
  }));
export type ListTemplateSeed = z.output<typeof listTemplateSeed>;

export const listTemplateSeeds = z
  .array(listTemplateSeed)
  .max(MAX_LIVE_TEMPLATES)
  .refine(
    (templates) =>
      new Set(templates.map((t) => t.key)).size === templates.length,
    "List template keys must be unique",
  );

/**
 * What a template's lists point at must be in the template itself:
 * departments by key, shifts in its scheduling shift pattern. An order goes
 * from its department to another one. The first problem, or null.
 */
export function listTemplateProblem(
  templates: readonly ListTemplateSeed[],
  departmentKeys: readonly string[],
  shiftKeys: readonly string[],
): string | null {
  const department = (name: string) => departmentKeys.includes(name);
  const shift = (name: string) => shiftKeys.includes(name);
  const recipientProblem = (
    where: string,
    recipient: RecipientSeed | null,
  ): string | null => {
    if (recipient?.kind === "department" && !department(recipient.department)) {
      return `${where} goes to an unknown department: ${recipient.department}`;
    }
    if (recipient?.kind === "shift" && !shift(recipient.shift)) {
      return `${where} goes to an unknown shift: ${recipient.shift}`;
    }
    return null;
  };
  for (const template of templates) {
    const own = recipientProblem(`List ${template.key}`, template.recipient);
    if (own) return own;
    if (template.fromDepartment !== null) {
      if (!department(template.fromDepartment)) {
        return `List ${template.key} is asked for by an unknown department: ${template.fromDepartment}`;
      }
      if (
        template.recipient?.kind !== "department" ||
        template.recipient.department === template.fromDepartment
      ) {
        return `List ${template.key} is an order, and goes to another department`;
      }
    }
    for (const schedule of template.schedules) {
      if (schedule.shift !== undefined && !shift(schedule.shift)) {
        return `A schedule of ${template.key} follows an unknown shift: ${schedule.shift}`;
      }
      const theirs = recipientProblem(
        `A schedule of ${template.key}`,
        schedule.recipient,
      );
      if (theirs) return theirs;
    }
  }
  return null;
}

/** A list template as the editor saves it (`public.save_list_template`). */
export const listTemplateInput = z
  .strictObject({
    id: uuid.optional(),
    name: listName,
    note: listNote.optional(),
    recipient: templateRecipient.nullable().default(null),
    fromDepartment: uuid.nullable().default(null),
    asksQuantities: z.boolean().default(false),
    items: z
      .array(listItemInput)
      .min(1)
      .max(MAX_LIST_ITEMS)
      .refine((items) => {
        const ids = items.flatMap((item) => (item.id ? [item.id] : []));
        return new Set(ids).size === ids.length;
      }, "Each item once"),
    schedules: z.array(scheduleInput).max(MAX_LIST_SCHEDULES).default([]),
  })
  .superRefine((template, ctx) => {
    if (
      template.fromDepartment !== null &&
      (template.recipient?.kind !== "department" ||
        template.recipient.department === template.fromDepartment)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "An order goes from its department to another one",
      });
    }
  });
export type ListTemplateInput = z.input<typeof listTemplateInput>;

/** What `public.save_list_template` takes, from what the editor saves. */
export function templateForSave(input: ListTemplateInput) {
  const template = listTemplateInput.parse(input);
  return {
    ...template,
    schedules: template.schedules.map(
      ({ opens, dueAfterMinutes, ...schedule }) => ({
        ...schedule,
        ...toOffsets({ opens, dueAfterMinutes }),
      }),
    ),
  };
}

/**
 * A list sent now (`public.send_list`): from a template, or typed when
 * sending (a name and its items), to someone, by when if at all, with a note,
 * and a count per item for a template that asks for them (by the template's
 * item ids).
 */
export const sendInput = z
  .strictObject({
    template: uuid.optional(),
    name: listName.optional(),
    items: z
      .array(listItemInput)
      .min(1)
      .max(MAX_LIST_ITEMS)
      .refine(
        (items) => items.every((item) => item.id === undefined),
        "A typed item has no id",
      )
      .optional(),
    recipient: sendRecipient,
    dueAt: z.iso.datetime({ offset: true }).optional(),
    note: listNote.optional(),
    quantities: z.record(z.string(), count).optional(),
  })
  .superRefine((list, ctx) => {
    const fromTemplate = list.template !== undefined;
    if (
      fromTemplate === (list.name !== undefined || list.items !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A list comes from a template, or has a name and items",
      });
    }
    if (
      !fromTemplate &&
      (list.name === undefined || list.items === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A typed list has a name and items",
      });
    }
    if (list.quantities && !fromTemplate) {
      ctx.addIssue({ code: "custom", message: "Counts are for templates" });
    }
    if (
      list.quantities &&
      Object.keys(list.quantities).some((k) => !isUuid(k))
    ) {
      ctx.addIssue({ code: "custom", message: "Counts are by the item's id" });
    }
  });
export type SendInput = z.input<typeof sendInput>;

/**
 * What filling an item sends, by its kind: a tick (or how many were given, on
 * an order: ticking gives what was asked for), a reading, an answer, each with
 * an optional comment. Null clears it, which is the undo. Photos are set by
 * the server after an upload; here only their comment.
 */
export function itemResult(kind: ListItemKind, asksQuantities: boolean) {
  const comment = itemComment.optional();
  switch (kind) {
    case "check":
      return z
        .strictObject({
          checked: z.literal(true).optional(),
          given: count.optional(),
          comment,
        })
        .refine(
          (result) => asksQuantities || result.given === undefined,
          "Only orders say how many were given",
        )
        .nullable();
    case "number":
      return z.strictObject({ reading: bound.optional(), comment }).nullable();
    case "note":
      return z
        .strictObject({ answer: itemAnswer.optional(), comment })
        .nullable();
    case "photo":
      return z.strictObject({ comment }).nullable();
  }
}

export type ItemResult = {
  checked?: true;
  given?: number;
  reading?: number;
  answer?: string;
  comment?: string;
} | null;

/**
 * A result as a screen sends it, whatever the item's kind: each field in its
 * own bounds. The database holds it to the item's kind (`set_list_item`).
 */
export const anyItemResult = z
  .strictObject({
    checked: z.literal(true).optional(),
    given: count.optional(),
    reading: bound.optional(),
    answer: itemAnswer.optional(),
    comment: itemComment.optional(),
  })
  .nullable();

/** A typed reading ("4.5", "-18", "4,5"), or null when it isn't a number. */
export function parseReading(text: string): number | null {
  const clean = text.trim().replace(",", ".").replace("−", "-");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return bound.safeParse(value).success ? value : null;
}

/** How far a list is: what `public.set_list_item` returns too. */
export type ListProgress = {
  done: number;
  total: number;
  required: number;
  requiredLeft: number;
};

export function listProgress(
  items: readonly { required: boolean; done: boolean }[],
): ListProgress {
  let done = 0;
  let required = 0;
  let requiredLeft = 0;
  for (const item of items) {
    if (item.done) done += 1;
    if (item.required) {
      required += 1;
      if (!item.done) requiredLeft += 1;
    }
  }
  return { done, total: items.length, required, requiredLeft };
}

export const listProgressSchema = z.object({
  done: z.int().min(0),
  total: z.int().min(0),
  required: z.int().min(0),
  requiredLeft: z.int().min(0),
});

/** A reading outside its item's range, which the list flags. */
export function isOutOfRange(item: {
  reading: number | null;
  min: number | null;
  max: number | null;
}): boolean {
  if (item.reading === null) return false;
  return (
    (item.min !== null && item.reading < item.min) ||
    (item.max !== null && item.reading > item.max)
  );
}

/** Where a list stands for the screens. */
export type ListState =
  | "open"
  | "dueSoon"
  | "late"
  | "finished"
  | "missed"
  | "cancelled";

/**
 * An open list is due soon from `remindBeforeMinutes` before its due time, and
 * late `lateAfterMinutes` after it (the lists settings).
 */
export function listState(
  list: { status: ListStatus; dueAt: string | null },
  now: Date,
  settings: { remindBeforeMinutes: number; lateAfterMinutes: number },
): ListState {
  if (list.status !== "open") return list.status;
  if (list.dueAt === null) return "open";
  const due = Date.parse(list.dueAt);
  if (Number.isNaN(due)) return "open";
  const at = now.getTime();
  const minute = 60_000;
  if (at >= due + settings.lateAfterMinutes * minute) return "late";
  if (at >= due - settings.remindBeforeMinutes * minute) return "dueSoon";
  return "open";
}

const URGENCY: Record<ListState, number> = {
  late: 0,
  dueSoon: 1,
  open: 2,
  finished: 3,
  missed: 3,
  cancelled: 3,
};

/**
 * The order "now" shows lists in: late first, then due soon, then by due time
 * (none last), then by when they opened. Stable for equal lists.
 */
export function byUrgency<
  L extends { status: ListStatus; dueAt: string | null; opensAt: string },
>(
  lists: readonly L[],
  now: Date,
  settings: { remindBeforeMinutes: number; lateAfterMinutes: number },
): L[] {
  const due = (list: L) =>
    list.dueAt === null ? Number.POSITIVE_INFINITY : Date.parse(list.dueAt);
  return [...lists].sort(
    (a, b) =>
      URGENCY[listState(a, now, settings)] -
        URGENCY[listState(b, now, settings)] ||
      due(a) - due(b) ||
      Date.parse(a.opensAt) - Date.parse(b.opensAt),
  );
}

/** A business's lists of a day at a glance, for its managers. */
export type ListsTally = {
  total: number;
  open: number;
  finished: number;
  late: number;
};

export function listsTally(
  lists: readonly { status: ListStatus; dueAt: string | null }[],
  now: Date,
  settings: { remindBeforeMinutes: number; lateAfterMinutes: number },
): ListsTally {
  let open = 0;
  let finished = 0;
  let late = 0;
  for (const list of lists) {
    if (list.status === "open") open += 1;
    if (list.status === "finished") finished += 1;
    if (listState(list, now, settings) === "late") late += 1;
  }
  return { total: lists.length, open, finished, late };
}

/**
 * Until when whoever finished or cancelled a list may open it again by
 * themselves (the undo, `REOPEN_MINUTES`), or null when it isn't theirs to
 * undo or the time has passed. List managers reopen any time.
 */
export function undoDeadline(
  list: {
    status: ListStatus;
    finishedAt: string | null;
    finishedBy: string | null;
    closedAt: string | null;
    closedBy: string | null;
  },
  userId: string,
  now: Date,
): string | null {
  const [at, by] =
    list.status === "finished"
      ? [list.finishedAt, list.finishedBy]
      : list.status === "cancelled"
        ? [list.closedAt, list.closedBy]
        : [null, null];
  if (at === null || by !== userId) return null;
  const until = Date.parse(at) + REOPEN_MINUTES * 60_000;
  return Number.isNaN(until) || until <= now.getTime()
    ? null
    : new Date(until).toISOString();
}

/** A list's screen. */
export function listHref(id: string): `/${string}` {
  return isUuid(id) ? `/lists/${id.toLowerCase()}` : "/lists";
}

/** Who holds a list, as it is read. */
export type ListHolder =
  /** A person, or the people of a shift when it was sent. */
  | { kind: "person" | "shift"; people: string[] }
  | { kind: "department"; department: string }
  | { kind: "role"; role: Role };

/**
 * Whether the list is for this person now: among its people, in its
 * department, or in its role. What `private.holds_list` says, for lists already
 * read (a list manager reads every list, and holds few).
 */
export function holdsList(
  holder: ListHolder,
  person: { userId: string; role: Role; departments: readonly string[] },
): boolean {
  switch (holder.kind) {
    case "person":
    case "shift":
      return holder.people.includes(person.userId);
    case "department":
      return person.departments.includes(holder.department);
    case "role":
      return holder.role === person.role;
  }
}

/** A shift as a list keeps it: what everyone reads in the published week. */
export type ListShift = {
  day: string;
  name: string;
  start: string;
  end: string;
};

/** A list as the lists screens show it. */
export type ListSummary = {
  id: string;
  name: string;
  status: ListStatus;
  origin: ListOrigin;
  holder: ListHolder;
  /** The department that asked (orders). */
  fromDepartment: string | null;
  templateId: string | null;
  sentBy: string | null;
  opensAt: string;
  dueAt: string | null;
  finishedAt: string | null;
  finishedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  progress: ListProgress;
};

export type ListItem = {
  id: string;
  templateItemId: string | null;
  kind: ListItemKind;
  label: string;
  hint: string | null;
  required: boolean;
  unit: string | null;
  min: number | null;
  max: number | null;
  /** Orders: how many were asked for, and how many were given. */
  requested: number | null;
  given: number | null;
  checked: boolean;
  reading: number | null;
  answer: string | null;
  /**
   * A photo item's photo (L6), where the app shows it (`listPhotoSrc` in
   * @domain/list-photos), or null when none was taken or it is no longer kept.
   */
  photo: string | null;
  /**
   * The photo was taken, and the daily clean-up removed it after the days the
   * business keeps photos: the item stays done.
   */
  photoRemoved: boolean;
  comment: string | null;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
};

export type ListPass = {
  id: string;
  fromDepartment: string | null;
  toDepartment: string;
  passedBy: string | null;
  passedAt: string;
  note: string | null;
};

/** One list with everything on its screen. */
export type ListDetail = ListSummary & {
  note: string | null;
  asksQuantities: boolean;
  shift: ListShift | null;
  items: ListItem[];
  passes: ListPass[];
};

export type TemplateItem = {
  id: string;
  kind: ListItemKind;
  label: string;
  hint: string | null;
  required: boolean;
  unit: string | null;
  min: number | null;
  max: number | null;
  defaultQuantity: number | null;
};

export type ListSchedule = {
  id: string;
  days: number[];
  anchor: ScheduleAnchor;
  shift: string | null;
  opensOffset: number;
  dueOffset: number;
  recipient: ScheduleRecipient;
  active: boolean;
  startsOn: string;
  /**
   * From when its openings count: when it was saved, or last given other
   * days or hours, or switched back on. Nothing opens before then.
   */
  opensFrom: string;
};

/** A template as the editor and the send screen read it. */
export type ListTemplate = {
  id: string;
  /** From the global template; null for the business's own. */
  key: string | null;
  name: string;
  note: string | null;
  recipient: TemplateRecipient | null;
  fromDepartment: string | null;
  asksQuantities: boolean;
  version: number;
  archivedAt: string | null;
  items: TemplateItem[];
  /** Only list managers read them; empty for everyone else. */
  schedules: ListSchedule[];
};

/** One reading of a template's number item, for readings over time. */
export type Reading = {
  listId: string;
  itemId: string;
  reading: number;
  doneAt: string;
  doneBy: string | null;
  outOfRange: boolean;
};

/*
 * Editing templates and sending lists (L3): the shapes the template editor
 * and the send screen keep while someone works on them, and the small sums
 * they show.
 */

/**
 * A number below zero with a real minus sign, which a hyphen beside a range's
 * dash ("-25–-18") is not.
 */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/** A number item's range in words: between, at least or at most. */
export type NumberRange = {
  kind: "between" | "atLeast" | "atMost";
  /** "0–5 °C", "−25 – −18 °C" (spaced once a minus sign is in it), "0 ₪". */
  range: string;
};

export function numberRange(item: {
  min: number | null;
  max: number | null;
  unit: string | null;
}): NumberRange | null {
  const unit = item.unit ? ` ${item.unit}` : "";
  if (item.min !== null && item.max !== null) {
    const dash = item.min < 0 || item.max < 0 ? " – " : "–";
    return {
      kind: "between",
      range: `${signed(item.min)}${dash}${signed(item.max)}${unit}`,
    };
  }
  if (item.min !== null) {
    return { kind: "atLeast", range: `${signed(item.min)}${unit}` };
  }
  if (item.max !== null) {
    return { kind: "atMost", range: `${signed(item.max)}${unit}` };
  }
  return null;
}

/**
 * An item as the editor keeps it: `key` is its own on this screen and never
 * changes, `id` the database's once it is saved.
 */
export type DraftItem = {
  key: string;
  id: string | null;
  kind: ListItemKind;
  label: string;
  hint: string | null;
  required: boolean;
  unit: string | null;
  min: number | null;
  max: number | null;
  defaultQuantity: number | null;
};

/**
 * A range's bound as an item's sheet keeps it: its digits, and whether it is
 * below zero, which has its own toggle since a phone's number pad may have no
 * minus.
 */
export type TypedBound = { text: string; minus: boolean };

export function boundOf(value: number | null): TypedBound {
  return {
    text: value === null ? "" : String(Math.abs(value)),
    minus: value !== null && value < 0,
  };
}

/**
 * A bound as it is typed: a minus typed before the digits ("-18", "−18")
 * turns the bound's own minus on and leaves the digits, so the field and the
 * toggle always say the same.
 */
export function typedBound(minus: boolean, text: string): TypedBound {
  const start = text.trimStart();
  return /^[-−]/.test(start)
    ? { text: start.slice(1), minus: true }
    : { text, minus };
}

/**
 * A bound's number, null when it is empty, or "number" when it isn't one. A
 * minus typed with the digits counts as much as the toggle's: neither is ever
 * dropped.
 */
export function readBound(bound: TypedBound): number | null | "number" {
  if (bound.text.trim() === "") return null;
  const value = parseReading(bound.text);
  if (value === null) return "number";
  return bound.minus ? -Math.abs(value) : value;
}

/** A key for an item added on a screen. */
export function newItemKey(): string {
  const [random = 0] = crypto.getRandomValues(new Uint32Array(1));
  return `i-${random.toString(16).padStart(8, "0")}`;
}

/** A template's items as the editor starts with them. */
export function draftItemsOf(items: readonly TemplateItem[]): DraftItem[] {
  return items.map((item) => ({ ...item, key: item.id }));
}

/** An item in the shape the database takes, without what it doesn't have. */
function itemFieldsOf(item: Omit<DraftItem, "key" | "id">) {
  return {
    kind: item.kind,
    label: item.label,
    ...(item.hint ? { hint: item.hint } : {}),
    required: item.required,
    ...(item.unit ? { unit: item.unit } : {}),
    ...(item.min === null ? {} : { min: item.min }),
    ...(item.max === null ? {} : { max: item.max }),
    ...(item.defaultQuantity === null
      ? {}
      : { defaultQuantity: item.defaultQuantity }),
  };
}

/**
 * The items to save, in their order. An item keeps its id only while the
 * database still has it (`known`, what the last save left): one removed and
 * saved, then brought back by its undo, is added again rather than refused
 * as not the template's.
 */
export function itemsForSave(
  items: readonly DraftItem[],
  known: ReadonlySet<string>,
): ListItemInput[] {
  return items.map((item) => ({
    ...(item.id && known.has(item.id) ? { id: item.id } : {}),
    ...itemFieldsOf(item),
  }));
}

/**
 * What keeps the editor's draft from saving, by the rules the database holds
 * it to, whatever its ids: no name, no items or too many, an item that
 * doesn't keep its kind's rules, an order whose asking department is gone
 * (when the business's places are given) or without another department to go
 * to. Null when it can be saved.
 */
export function templateDraftProblem(
  draft: {
    name: string;
    note: string;
    recipient: TemplateRecipient | null;
    items: readonly DraftItem[];
    /** Its times, when the editor edits them: one that can't save holds the rest. */
    schedules?: readonly DraftSchedule[];
  },
  fromDepartment: string | null,
  /** The business's live departments and shift keys, to say a time points at one gone. */
  places?: SchedulePlaces,
):
  | "name"
  | "note"
  | "items"
  | "item"
  | "order"
  | "recipient"
  | "schedule"
  | null {
  if (!listName.safeParse(draft.name).success) return "name";
  if (draft.note.trim() !== "" && !listNote.safeParse(draft.note).success) {
    return "note";
  }
  if (draft.items.length === 0 || draft.items.length > MAX_LIST_ITEMS) {
    return "items";
  }
  if (
    draft.items.some(
      (item) => !listItemSeed.safeParse(itemFieldsOf(item)).success,
    )
  ) {
    return "item";
  }
  if (
    places &&
    fromDepartment !== null &&
    !places.departments.includes(fromDepartment)
  ) {
    return "order";
  }
  if (
    fromDepartment !== null &&
    (draft.recipient?.kind !== "department" ||
      draft.recipient.department === fromDepartment)
  ) {
    return "recipient";
  }
  if (
    (draft.schedules ?? []).length > MAX_LIST_SCHEDULES ||
    (draft.schedules ?? []).some(
      (schedule) => scheduleProblem(schedule, places) !== null,
    )
  ) {
    return "schedule";
  }
  return null;
}

/** Typed items of a list sent now, which have no ids. */
export function typedItems(items: readonly DraftItem[]): ListItemInput[] {
  return items.map((item) => itemFieldsOf(item));
}

/** What a schedule saves as, from its fields; its id only when it has one. */
function scheduleInputOf(
  schedule: Omit<ListSchedule, "id" | "startsOn" | "opensFrom"> & {
    id: string | null;
  },
): ScheduleInput {
  return {
    ...(schedule.id ? { id: schedule.id } : {}),
    days: [...schedule.days].sort((a, b) => a - b),
    anchor: schedule.anchor,
    ...(schedule.shift === null ? {} : { shift: schedule.shift }),
    ...fromOffsets(schedule.anchor, schedule.opensOffset, schedule.dueOffset),
    recipient: schedule.recipient,
    active: schedule.active,
  };
}

/**
 * A template as the editor saves it, with these fields of its own. What the
 * editor leaves out (an order's department and its counts, its times) goes
 * back as it was read, so a save never loses them.
 */
export function templateInputOf(
  template: Pick<
    ListTemplate,
    "fromDepartment" | "asksQuantities" | "schedules"
  > & { id: string | null },
  own: {
    name: string;
    note: string;
    recipient: TemplateRecipient | null;
    items: ListItemInput[];
    schedules?: ScheduleInput[];
    /** The department that asks, null for none: the list is then no order. */
    fromDepartment?: string | null;
    asksQuantities?: boolean;
  },
): ListTemplateInput {
  const note = own.note.trim();
  return {
    ...(template.id ? { id: template.id } : {}),
    name: own.name.trim(),
    ...(note ? { note } : {}),
    recipient: own.recipient,
    fromDepartment:
      own.fromDepartment === undefined
        ? template.fromDepartment
        : own.fromDepartment,
    asksQuantities: own.asksQuantities ?? template.asksQuantities,
    items: own.items,
    schedules: own.schedules ?? template.schedules.map(scheduleInputOf),
  };
}

/**
 * A template just saved: its id, its version now, its items' and its times'
 * ids in order, and each time's next openings as the database works them out.
 */
export type SavedTemplate = {
  id: string;
  version: number;
  items: string[];
  schedules: string[];
  openings: ScheduleOpenings;
};

/*
 * A template's times in its editor (L4): the shape the editor keeps while
 * someone works on them, as it keeps items.
 */

/**
 * A time as the editor keeps it: `key` is its own on this screen, `id` the
 * database's once it is saved. `startsOn` and `opensFrom` are the saved
 * one's, so its next openings read as the database will open them; null for
 * a new one, and `opensFrom` null too once its days or hours change or it is
 * switched back on here (`restartsOpenings`): it counts from now.
 */
export type DraftSchedule = {
  key: string;
  id: string | null;
  days: number[];
  anchor: ScheduleAnchor;
  shift: string | null;
  opensOffset: number;
  dueOffset: number;
  recipient: ScheduleRecipient;
  active: boolean;
  startsOn: string | null;
  opensFrom: string | null;
};

/**
 * A time's days as runs of days in a row, Sunday first, for its summary:
 * Sunday to Thursday and Saturday are [[0, 4], [6, 6]].
 */
export function dayRuns(days: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const day of [...new Set(days)].sort((a, b) => a - b)) {
    const last = runs.at(-1);
    if (last && day === last[1] + 1) last[1] = day;
    else runs.push([day, day]);
  }
  return runs;
}

/** A key for a time added on a screen. */
export function newScheduleKey(): string {
  const [random = 0] = crypto.getRandomValues(new Uint32Array(1));
  return `s-${random.toString(16).padStart(8, "0")}`;
}

/** A template's times as the editor starts with them. */
export function draftSchedulesOf(
  schedules: readonly ListSchedule[],
): DraftSchedule[] {
  return schedules.map((schedule) => ({ ...schedule, key: schedule.id }));
}

/**
 * The times to save, in their order. A time keeps its id only while the
 * database still has it (`known`), so one removed and saved, then brought
 * back by its undo, is added again rather than refused.
 */
export function schedulesForSave(
  schedules: readonly DraftSchedule[],
  known: ReadonlySet<string>,
): ScheduleInput[] {
  return schedules.map((schedule) =>
    scheduleInputOf({
      ...schedule,
      id: schedule.id && known.has(schedule.id) ? schedule.id : null,
    }),
  );
}

/**
 * Whether a time points at something gone: a shift it follows, or a
 * department or a shift it goes to, that the business no longer has. The
 * database takes neither in a save, and a shift that's gone opens nothing.
 * A person who has left is the database's to refuse.
 */
export function scheduleGone(
  schedule: Pick<ListSchedule, "shift" | "recipient">,
  liveDepartments: readonly string[],
  shiftKeys: readonly string[],
): boolean {
  return (
    (schedule.shift !== null && !shiftKeys.includes(schedule.shift)) ||
    (schedule.recipient.kind !== "person" &&
      recipientGone(schedule.recipient, liveDepartments, shiftKeys))
  );
}

/** The business's live departments and its scheduling settings' shift keys. */
export type SchedulePlaces = {
  departments: readonly string[];
  shifts: readonly string[];
};

/**
 * What keeps a time from saving, by the rules the database holds it to,
 * whatever its ids: its days (one to seven, each once), its times (a time of
 * the day, or up to 12 hours around a shift it names, due after it opens and
 * within a day), or (when the business's places are given) something it
 * points at that is gone.
 */
export function scheduleProblem(
  schedule: DraftSchedule,
  places?: SchedulePlaces,
): "days" | "times" | "gone" | null {
  if (places && scheduleGone(schedule, places.departments, places.shifts)) {
    return "gone";
  }
  const days = schedule.days;
  if (
    days.length === 0 ||
    new Set(days).size !== days.length ||
    days.some((day) => !dayOfWeek.safeParse(day).success)
  ) {
    return "days";
  }
  const byDay = schedule.anchor === "day";
  const { opensOffset: opens, dueOffset: due } = schedule;
  if (
    byDay !== (schedule.shift === null) ||
    (schedule.shift !== null && !shiftKey.safeParse(schedule.shift).success) ||
    !Number.isInteger(opens) ||
    !Number.isInteger(due)
  ) {
    return "times";
  }
  const opensOk = byDay
    ? opens >= 0 && opens < DAY_MINUTES
    : Math.abs(opens) <= MAX_SHIFT_OFFSET;
  return opensOk && due > opens && due <= opens + DAY_MINUTES ? null : "times";
}

/** The list with the entry at `index` moved one place up or down. */
export function moved<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [entry] = next.splice(index, 1);
  if (entry !== undefined) next.splice(to, 0, entry);
  return next;
}

/**
 * Whether a template's own recipient is gone: a department removed since, or
 * a shift the scheduling settings no longer have. The database takes neither
 * in a save, so the editor asks for another.
 */
export function recipientGone(
  recipient: TemplateRecipient | null,
  liveDepartments: readonly string[],
  shiftKeys: readonly string[],
): boolean {
  if (recipient?.kind === "department") {
    return !liveDepartments.includes(recipient.department);
  }
  if (recipient?.kind === "shift") return !shiftKeys.includes(recipient.shift);
  return false;
}

/**
 * Whether an order's asking department was removed since. The database takes
 * it in no save (22023), so the editor opens with no department asking and
 * says so, and the person chooses another or keeps it a list of its own.
 */
export function askingGone(
  template: Pick<ListTemplate, "fromDepartment">,
  liveDepartments: readonly string[],
): boolean {
  return (
    template.fromDepartment !== null &&
    !liveDepartments.includes(template.fromDepartment)
  );
}

/*
 * Between departments (L5): orders with their counts, and lists passed from
 * one department to another (`public.pass_list`).
 */

/** A note passed on with a list: trimmed, at most `MAX_PASS_NOTE`; blank is none. */
export const passNote = z.string().trim().max(MAX_PASS_NOTE);

/** What passing a list on sends: the department it goes to, and a note. */
export const passInput = z.strictObject({
  list: uuid,
  department: uuid,
  note: passNote.optional(),
});
export type PassInput = z.input<typeof passInput>;

/** A department a list can be passed to, with how many people are in it now. */
export type PassTarget = { id: string; name: string; people: number };

/**
 * Where a list can be passed: every live department but the one holding it,
 * in their order. One with nobody in it is there too, with its count of none,
 * which the sheet says and doesn't take.
 */
export function passTargets(
  departments: readonly {
    id: string;
    name: string;
    archivedAt: string | null;
    members: readonly string[];
  }[],
  holder: ListHolder,
  active: ReadonlySet<string>,
): PassTarget[] {
  return departments
    .filter(
      (d) =>
        d.archivedAt === null &&
        !(holder.kind === "department" && holder.department === d.id),
    )
    .map((d) => ({
      id: d.id,
      name: d.name,
      people: d.members.filter((person) => active.has(person)).length,
    }));
}

/**
 * Whether a list is a department's: it holds it, or asked for it (an order).
 * What the department filter on Lists keeps.
 */
export function ofDepartment(
  list: Pick<ListSummary, "holder" | "fromDepartment">,
  department: string,
): boolean {
  return (
    (list.holder.kind === "department" &&
      list.holder.department === department) ||
    list.fromDepartment === department
  );
}

/**
 * An order's count as it is typed ("24", " 6 "), or null when it is empty or
 * not a whole number from 0 to `MAX_QUANTITY`.
 */
export function parseQuantity(text: string): number | null {
  const clean = text.trim();
  if (!/^\d{1,4}$/.test(clean)) return null;
  const value = Number(clean);
  return count.safeParse(value).success ? value : null;
}

/**
 * The counts a list sent from a template asks for, by the template's item id,
 * from what the send screen has typed: only the check items, and only those
 * typed as a count; the rest take their usual one (`send_list`). When
 * something typed isn't a count, the ids of those items instead, in order, so
 * the form says which.
 */
export function quantitiesOf(
  items: readonly { id: string; kind: ListItemKind }[],
  typed: Readonly<Record<string, string>>,
):
  | { ok: true; counts: Record<string, number> }
  | { ok: false; invalid: string[] } {
  const counts: Record<string, number> = {};
  const invalid: string[] = [];
  for (const item of items) {
    if (item.kind !== "check") continue;
    const text = typed[item.id];
    if (text === undefined || text.trim() === "") continue;
    const value = parseQuantity(text);
    if (value === null) invalid.push(item.id);
    else counts[item.id] = value;
  }
  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, counts };
}

/**
 * Templates by the department they go to, in the departments' order, then
 * one group (`department: null`) for the rest: to a role or a shift, chosen
 * each time, or to a department removed since.
 */
export function templatesByDepartment<
  T extends { recipient: TemplateRecipient | null },
>(
  templates: readonly T[],
  departments: readonly { id: string }[],
): { department: string | null; templates: T[] }[] {
  const departmentOf = (template: T): string | null => {
    const recipient = template.recipient;
    return recipient?.kind === "department" &&
      departments.some((d) => d.id === recipient.department)
      ? recipient.department
      : null;
  };
  const groups = departments.flatMap((department) => {
    const own = templates.filter((t) => departmentOf(t) === department.id);
    return own.length > 0
      ? [{ department: department.id, templates: own }]
      : [];
  });
  const rest = templates.filter((t) => departmentOf(t) === null);
  return rest.length > 0
    ? [...groups, { department: null, templates: rest }]
    : groups;
}

/** When a list sent now is due: no time, or a time today or tomorrow. */
export const DUE_DAYS = ["none", "today", "tomorrow"] as const;
export type DueDay = (typeof DUE_DAYS)[number];

/**
 * The due time of a list sent now, from a day and an "HH:MM" in the
 * business's zone: "past" when it has already gone by (the database takes
 * only a time after sending), "time" when it isn't a time.
 */
export function dueAtOf(
  day: Exclude<DueDay, "none">,
  time: string,
  now: Date,
  timeZone: string,
): { ok: true; dueAt: string } | { ok: false; problem: "time" | "past" } {
  if (!timeOfDay.safeParse(time).success) {
    return { ok: false, problem: "time" };
  }
  const today = dateIn(now, timeZone);
  const date = day === "today" ? today : addDays(today, 1);
  const due = instantIn(date, time, timeZone);
  if (due.getTime() <= now.getTime()) return { ok: false, problem: "past" };
  return { ok: true, dueAt: due.toISOString() };
}

/** "HH:MM" of minutes after midnight. */
const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The due time the send screen starts with: an hour from now, up to the next
 * half hour, tomorrow when that is after midnight.
 */
export function suggestedDue(
  now: Date,
  timeZone: string,
): { day: "today" | "tomorrow"; time: string } {
  const later = Math.ceil((minutesOf(timeIn(now, timeZone)) + 60) / 30) * 30;
  return {
    day: later >= DAY_MINUTES ? "tomorrow" : "today",
    time: clockOf(later % DAY_MINUTES),
  };
}

/**
 * The due time a day starts with on the send screen, until the person sets
 * one: the suggestion (`suggestedDue`), except today once an hour ahead has
 * passed midnight, when it is the next half hour still today, or 23:59 in the
 * last half hour, so choosing today late in the evening never starts gone by.
 */
export function dueTimeFor(
  day: Exclude<DueDay, "none">,
  now: Date,
  timeZone: string,
): string {
  const suggested = suggestedDue(now, timeZone);
  if (day === "tomorrow" || suggested.day === "today") return suggested.time;
  const next = Math.ceil((minutesOf(timeIn(now, timeZone)) + 1) / 30) * 30;
  return next < DAY_MINUTES ? clockOf(next) : "23:59";
}

/**
 * Where a template sends itself on the send screen when nobody chooses: its
 * department while it is still there, its role, or the next of its shift
 * that has people on it; nothing chosen for a department removed since
 * (`gone`, which the screen says), and anyone else starts at a person.
 */
export function sendDefaults(
  recipient: TemplateRecipient | null | undefined,
  shifts: readonly SendShift[] | null,
  liveDepartments: readonly string[],
): {
  kind: RecipientKind;
  department: string | null;
  shift: string | null;
  role: StaffRole | null;
  gone: boolean;
} {
  const none = { department: null, shift: null, role: null, gone: false };
  if (recipient?.kind === "department") {
    const live = liveDepartments.includes(recipient.department);
    return {
      ...none,
      kind: "department",
      department: live ? recipient.department : null,
      gone: !live,
    };
  }
  if (recipient?.kind === "role") {
    return { ...none, kind: "role", role: recipient.role };
  }
  if (recipient?.kind === "shift" && shifts !== null) {
    const next = shifts.find(
      (s) => s.pattern === recipient.shift && s.people.length > 0,
    );
    return { ...none, kind: "shift", shift: next?.id ?? null };
  }
  return { ...none, kind: "person" };
}

/** A published shift a list can be sent to, with its people now. */
export type SendShift = {
  id: string;
  day: string;
  name: string;
  start: string;
  end: string;
  /** The scheduling settings' shift it was made from, if any. */
  pattern: string | null;
  people: string[];
};

/**
 * The shifts a list can go to now: from today to `SHIFT_DAYS_AHEAD` days
 * ahead, and not over yet (one ending at or before its start ends the next
 * day). Earliest first.
 */
export function upcomingShifts<
  S extends { day: string; start: string; end: string; name: string },
>(shifts: readonly S[], now: Date, timeZone: string): S[] {
  const today = dateIn(now, timeZone);
  const last = addDays(today, SHIFT_DAYS_AHEAD);
  return shifts
    .filter((shift) => {
      if (shift.day < today || shift.day > last) return false;
      const ends =
        instantIn(shift.day, shift.start, timeZone).getTime() +
        rangeMinutes(shift.start, shift.end) * 60_000;
      return ends > now.getTime();
    })
    .sort((a, b) =>
      `${a.day}${a.start}${a.name}`.localeCompare(
        `${b.day}${b.start}${b.name}`,
      ),
    );
}
