import { z } from "zod";
import { isUuid } from "./activity";
import { departmentKey } from "./departments";
import { dayOfWeek, minutesOf, timeOfDay } from "./hours";
import { ROLES, type Role } from "./modules";

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
const count = z.int().min(0).max(9999);
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
  defaultQuantity: z.int().min(1).max(9999).optional(),
};

type ItemShape = {
  kind: ListItemKind;
  unit?: string;
  min?: number;
  max?: number;
  defaultQuantity?: number;
};

/** The rules an item keeps whatever holds it; photos come with their own part. */
function checkItem(item: ItemShape, ctx: z.RefinementCtx) {
  if (item.kind === "photo") {
    ctx.addIssue({ code: "custom", message: "Photo items come later" });
  }
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
  role: z.enum(ROLES),
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
