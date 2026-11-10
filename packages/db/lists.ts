import "server-only";
import type { ScheduleOpenings } from "@domain/list-openings";
import {
  holdsList,
  type ItemResult,
  isOutOfRange,
  LIST_ITEM_KINDS,
  LIST_ORIGINS,
  LIST_STATUSES,
  type ListDetail,
  type ListHolder,
  type ListItem,
  type ListItemKind,
  type ListPass,
  type ListProgress,
  type ListSchedule,
  type ListShift,
  type ListSummary,
  type ListTemplate,
  type ListTemplateInput,
  listProgress,
  listProgressSchema,
  type PassInput,
  passInput,
  type Reading,
  type SavedTemplate,
  SCHEDULE_ANCHORS,
  type ScheduleRecipient,
  type SendInput,
  sendInput,
  type TemplateItem,
  type TemplateRecipient,
  templateForSave,
} from "@domain/lists";
import { type Role, STAFF_ROLES, type StaffRole } from "@domain/modules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "./database.types";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Lists (supabase/migrations/20261109000600_lists.sql). Reads run under RLS as
 * the signed-in person: a list is read by whoever holds it, sent it, was given
 * it or asked for it, and by list managers, so "my lists" filters to what the
 * person holds. Writes run with the secret key for `actorId`; the database
 * checks who may do what, and callers check the actor is the signed-in person
 * and not viewing as someone else. Everything tolerates a project the
 * migration hasn't reached yet ("notYet").
 */

/** Why a write was refused, for the screens' words. */
export type ListFailure =
  /** Not theirs to do (42501), or nothing of theirs (P0002). */
  | "noAccess"
  /** A shape the database won't keep (22023). */
  | "invalid"
  /** Required items are left (23514). */
  | "left"
  /** Changed since it was read (40001). */
  | "changed"
  /** Closed: finished, cancelled, missed, or a removed template (55000). */
  | "finished"
  /** The migration isn't on this project yet. */
  | "notYet"
  | "failed";

export type ListWrite<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      failure: ListFailure;
      /**
       * A template the database did save before what came after failed: its
       * id, so an editor that was making it takes it and never makes it
       * twice (`saveListTemplate`).
       */
      saved?: string;
    };

function failureOf(error: { code?: string; message: string }): ListFailure {
  if (isMissingFunction(error)) return "notYet";
  switch (error.code) {
    case "42501":
    case "P0002":
      return "noAccess";
    case "22023":
      return "invalid";
    case "23514":
      return "left";
    case "40001":
      return "changed";
    case "55000":
      return "finished";
    default:
      console.error("a lists write failed", error.message);
      return "failed";
  }
}

const refused = (failure: ListFailure) => ({ ok: false, failure }) as const;

/** `at_time` for a write, when the caller says when it happened. */
const atTime = (at?: Date) => (at ? { at_time: at.toISOString() } : {});

/** A text column the database keeps to a list of words, read leniently. */
function oneOf<T extends string>(
  words: readonly T[],
  value: string | null,
  fallback: T,
): T {
  return words.find((word) => word === value) ?? fallback;
}

// A list goes to a staff role only (private.list_recipient refuses others).
const roleOf = (value: string | null): StaffRole =>
  oneOf(STAFF_ROLES, value, "worker");

type ListRow = Pick<
  Database["public"]["Tables"]["lists"]["Row"],
  | "id"
  | "name"
  | "status"
  | "origin"
  | "recipient_kind"
  | "recipient_department"
  | "recipient_role"
  | "from_department"
  | "template_id"
  | "sent_by"
  | "opens_at"
  | "due_at"
  | "finished_at"
  | "finished_by"
  | "closed_at"
  | "closed_by"
>;

const LIST_COLUMNS =
  "id, name, status, origin, recipient_kind, recipient_department, recipient_role, from_department, template_id, sent_by, opens_at, due_at, finished_at, finished_by, closed_at, closed_by";

function holderOf(row: ListRow, people: readonly string[]): ListHolder {
  switch (row.recipient_kind) {
    case "department":
      return { kind: "department", department: row.recipient_department ?? "" };
    case "role":
      return { kind: "role", role: roleOf(row.recipient_role) };
    case "shift":
      return { kind: "shift", people: [...people] };
    default:
      return { kind: "person", people: [...people] };
  }
}

function summaryOf(
  row: ListRow,
  people: readonly string[],
  progress: ListProgress,
): ListSummary {
  return {
    id: row.id,
    name: row.name,
    status: oneOf(LIST_STATUSES, row.status, "open"),
    origin: oneOf(LIST_ORIGINS, row.origin, "sent"),
    holder: holderOf(row, people),
    fromDepartment: row.from_department,
    templateId: row.template_id,
    sentBy: row.sent_by,
    opensAt: row.opens_at,
    dueAt: row.due_at,
    finishedAt: row.finished_at,
    finishedBy: row.finished_by,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    progress,
  };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The people and the progress of these lists, read under RLS. */
async function partsOf(
  supabase: Supabase,
  ids: readonly string[],
): Promise<
  | { people: Map<string, string[]>; progress: Map<string, ListProgress> }
  | "notYet"
> {
  const people = new Map<string, string[]>();
  const items = new Map<string, { required: boolean; done: boolean }[]>();
  if (ids.length > 0) {
    const [peopleRows, itemRows] = await Promise.all([
      supabase
        .from("list_people")
        .select("list_id, user_id")
        .in("list_id", [...ids]),
      supabase
        .from("list_items")
        .select("list_id, required, done")
        .in("list_id", [...ids]),
    ]);
    for (const { error } of [peopleRows, itemRows]) {
      if (error) {
        if (isMissingTable(error)) return "notYet";
        throw error;
      }
    }
    for (const row of peopleRows.data ?? []) {
      people.set(row.list_id, [
        ...(people.get(row.list_id) ?? []),
        row.user_id,
      ]);
    }
    for (const row of itemRows.data ?? []) {
      items.set(row.list_id, [...(items.get(row.list_id) ?? []), row]);
    }
  }
  const progress = new Map(
    ids.map((id) => [id, listProgress(items.get(id) ?? [])]),
  );
  return { people, progress };
}

async function summaries(
  supabase: Supabase,
  rows: readonly ListRow[],
): Promise<ListSummary[] | "notYet"> {
  const parts = await partsOf(
    supabase,
    rows.map((row) => row.id),
  );
  if (parts === "notYet") return parts;
  return rows.map((row) =>
    summaryOf(
      row,
      parts.people.get(row.id) ?? [],
      parts.progress.get(row.id) ?? listProgress([]),
    ),
  );
}

/** A window of time, as ISO instants: from, and up to but not including, to. */
export type Window = { from: string; to: string };

/** Every open list the person may read, and those closed that opened in the window. */
async function openAndClosed(
  supabase: Supabase,
  businessId: string,
  window: Window,
) {
  return Promise.all([
    supabase
      .from("lists")
      .select(LIST_COLUMNS)
      .eq("business_id", businessId)
      .eq("status", "open")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("opens_at", { ascending: true }),
    supabase
      .from("lists")
      .select(LIST_COLUMNS)
      .eq("business_id", businessId)
      .neq("status", "open")
      .gte("opens_at", window.from)
      .lt("opens_at", window.to)
      .order("opens_at", { ascending: false }),
  ]);
}

/**
 * The lists a person holds now (their people, their departments, their role):
 * every open one, and those that opened in the window and are closed. Not
 * every list they may read: a list manager reads them all. `asked` is the
 * open orders one of their departments asked for that another holds (L5),
 * which they follow from Lists.
 */
export async function getMyLists(
  businessId: string,
  person: { userId: string; role: Role },
  window: Window,
): Promise<{ held: ListSummary[]; asked: ListSummary[] } | "notYet"> {
  const supabase = await createClient();
  const [[open, closed], departments] = await Promise.all([
    openAndClosed(supabase, businessId, window),
    supabase
      .from("department_members")
      .select("department_id")
      .eq("business_id", businessId)
      .eq("user_id", person.userId),
  ]);
  for (const { error } of [open, closed, departments]) {
    if (error) {
      if (isMissingTable(error)) return "notYet";
      throw error;
    }
  }
  const all = await summaries(supabase, [
    ...(open.data ?? []),
    ...(closed.data ?? []),
  ]);
  if (all === "notYet") return all;
  const mine = {
    ...person,
    departments: (departments.data ?? []).map((row) => row.department_id),
  };
  const held = all.filter((list) => holdsList(list.holder, mine));
  const asked = all.filter(
    (list) =>
      list.status === "open" &&
      list.fromDepartment !== null &&
      mine.departments.includes(list.fromDepartment) &&
      !holdsList(list.holder, mine),
  );
  return { held, asked };
}

/**
 * Every open list of the business and those closed that opened in the window,
 * whoever holds them: what list managers and a view session read on Lists and
 * Today. Under RLS, so anyone else gets only what they may read.
 */
export async function getBusinessLists(
  businessId: string,
  window: Window,
): Promise<ListSummary[] | "notYet"> {
  const supabase = await createClient();
  const [open, closed] = await openAndClosed(supabase, businessId, window);
  for (const { error } of [open, closed]) {
    if (error) {
      if (isMissingTable(error)) return "notYet";
      throw error;
    }
  }
  return summaries(supabase, [...(open.data ?? []), ...(closed.data ?? [])]);
}

/**
 * The lists of a business that opened in the window, whatever became of them:
 * the manager's overview and its history. Under RLS, so only for those who
 * read every list (list managers, and the team viewing as a manager).
 */
export async function getListsOn(
  businessId: string,
  window: Window,
): Promise<ListSummary[] | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .select(LIST_COLUMNS)
    .eq("business_id", businessId)
    .gte("opens_at", window.from)
    .lt("opens_at", window.to)
    .order("opens_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  return summaries(supabase, data ?? []);
}

const shiftSchema = z.object({
  day: z.string(),
  name: z.string(),
  start: z.string(),
  end: z.string(),
});

/** One list with its items and passes, if the person may read it. */
export async function getList(
  listId: string,
): Promise<ListDetail | null | "notYet"> {
  const supabase = await createClient();
  const [list, items, people, passes] = await Promise.all([
    supabase
      .from("lists")
      .select(`${LIST_COLUMNS}, note, asks_quantities, shift`)
      .eq("id", listId)
      .maybeSingle(),
    supabase
      .from("list_items")
      .select(
        "id, template_item_id, kind, label, hint, required, unit, min_value, max_value, requested, given, checked, reading, answer, comment, done, done_by, done_at",
      )
      .eq("list_id", listId)
      .order("position"),
    supabase.from("list_people").select("user_id").eq("list_id", listId),
    supabase
      .from("list_passes")
      .select("id, from_department, to_department, passed_by, passed_at, note")
      .eq("list_id", listId)
      .order("passed_at"),
  ]);
  for (const { error } of [list, items, people, passes]) {
    if (error) {
      if (isMissingTable(error)) return "notYet";
      throw error;
    }
  }
  if (!list.data) return null;
  const itemList: ListItem[] = (items.data ?? []).map((row) => ({
    id: row.id,
    templateItemId: row.template_item_id,
    kind: oneOf<ListItemKind>(LIST_ITEM_KINDS, row.kind, "check"),
    label: row.label,
    hint: row.hint,
    required: row.required,
    unit: row.unit,
    min: row.min_value,
    max: row.max_value,
    requested: row.requested,
    given: row.given,
    checked: row.checked === true,
    reading: row.reading,
    answer: row.answer,
    comment: row.comment,
    done: row.done,
    doneBy: row.done_by,
    doneAt: row.done_at,
  }));
  const passList: ListPass[] = (passes.data ?? []).map((row) => ({
    id: row.id,
    fromDepartment: row.from_department,
    toDepartment: row.to_department,
    passedBy: row.passed_by,
    passedAt: row.passed_at,
    note: row.note,
  }));
  const shift = shiftSchema.safeParse(list.data.shift);
  return {
    ...summaryOf(
      list.data,
      (people.data ?? []).map((row) => row.user_id),
      listProgress(itemList),
    ),
    note: list.data.note,
    asksQuantities: list.data.asks_quantities,
    shift: shift.success ? (shift.data satisfies ListShift) : null,
    items: itemList,
    passes: passList,
  };
}

const TEMPLATE_COLUMNS =
  "id, key, name, note, recipient_kind, recipient_department, recipient_shift, recipient_role, from_department, asks_quantities, version, archived_at";

type TemplateRow = Pick<
  Database["public"]["Tables"]["list_templates"]["Row"],
  | "id"
  | "key"
  | "name"
  | "note"
  | "recipient_kind"
  | "recipient_department"
  | "recipient_shift"
  | "recipient_role"
  | "from_department"
  | "asks_quantities"
  | "version"
  | "archived_at"
>;

function templateRecipientOf(row: {
  recipient_kind: string | null;
  recipient_department: string | null;
  recipient_shift: string | null;
  recipient_role: string | null;
}): TemplateRecipient | null {
  switch (row.recipient_kind) {
    case "department":
      return row.recipient_department
        ? { kind: "department", department: row.recipient_department }
        : null;
    case "shift":
      return row.recipient_shift
        ? { kind: "shift", shift: row.recipient_shift }
        : null;
    case "role":
      return { kind: "role", role: roleOf(row.recipient_role) };
    default:
      return null;
  }
}

/**
 * Templates with their items and (for list managers, and the team through
 * the secret key) their schedules.
 */
async function templatesFrom(
  supabase: SupabaseClient<Database>,
  rows: readonly TemplateRow[],
): Promise<ListTemplate[] | "notYet"> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  const [items, schedules] = await Promise.all([
    supabase
      .from("list_template_items")
      .select(
        "id, template_id, kind, label, hint, required, unit, min_value, max_value, default_quantity",
      )
      .in("template_id", ids)
      .order("position"),
    supabase
      .from("list_schedules")
      .select(
        "id, template_id, days, anchor, shift_key, opens_offset, due_offset, recipient_kind, recipient_user, recipient_department, recipient_shift, recipient_role, active, starts_on, opens_from",
      )
      .in("template_id", ids)
      .order("position"),
  ]);
  for (const { error } of [items, schedules]) {
    if (error) {
      if (isMissingTable(error)) return "notYet";
      throw error;
    }
  }
  const itemsOf = new Map<string, TemplateItem[]>();
  for (const row of items.data ?? []) {
    itemsOf.set(row.template_id, [
      ...(itemsOf.get(row.template_id) ?? []),
      {
        id: row.id,
        kind: oneOf<ListItemKind>(LIST_ITEM_KINDS, row.kind, "check"),
        label: row.label,
        hint: row.hint,
        required: row.required,
        unit: row.unit,
        min: row.min_value,
        max: row.max_value,
        defaultQuantity: row.default_quantity,
      },
    ]);
  }
  const schedulesOf = new Map<string, ListSchedule[]>();
  for (const row of schedules.data ?? []) {
    const recipient: ScheduleRecipient | null =
      row.recipient_kind === "person" && row.recipient_user
        ? { kind: "person", user: row.recipient_user }
        : templateRecipientOf(row);
    if (!recipient) continue;
    schedulesOf.set(row.template_id, [
      ...(schedulesOf.get(row.template_id) ?? []),
      {
        id: row.id,
        days: row.days,
        anchor: oneOf(SCHEDULE_ANCHORS, row.anchor, "day"),
        shift: row.shift_key,
        opensOffset: row.opens_offset,
        dueOffset: row.due_offset,
        recipient,
        active: row.active,
        startsOn: row.starts_on,
        opensFrom: row.opens_from,
      },
    ]);
  }
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    note: row.note,
    recipient: templateRecipientOf(row),
    fromDepartment: row.from_department,
    asksQuantities: row.asks_quantities,
    version: row.version,
    archivedAt: row.archived_at,
    items: itemsOf.get(row.id) ?? [],
    schedules: schedulesOf.get(row.id) ?? [],
  }));
}

/**
 * The business's list templates, in their order: live ones for every member,
 * the removed ones too for list managers (for the undo).
 */
export async function getListTemplates(
  businessId: string,
): Promise<ListTemplate[] | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("business_id", businessId)
    .order("position")
    .order("name");
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  return templatesFrom(supabase, data ?? []);
}

/**
 * One template of the business, if the person may read it. Someone in
 * several businesses reads it only in the one they are in now.
 */
export async function getListTemplate(
  businessId: string,
  templateId: string,
): Promise<ListTemplate | null | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("business_id", businessId)
    .eq("id", templateId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  if (!data) return null;
  const templates = await templatesFrom(supabase, [data]);
  return templates === "notYet" ? templates : (templates[0] ?? null);
}

/**
 * A business's list templates for the console, removed ones too, with their
 * times: the team sets a business's lists up but isn't a member, so RLS has
 * nothing to show it. Callers check that the person is on the team first.
 */
export async function getListTemplatesForTeam(
  businessId: string,
): Promise<ListTemplate[] | "notYet"> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("list_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("business_id", businessId)
    .order("position")
    .order("name");
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  return templatesFrom(admin, data ?? []);
}

/**
 * Where a business is, for its times in the console: its zone and the city
 * its Shabbat follows. The team isn't a member, so this reads with the
 * secret key; callers check that the person is on the team first.
 */
export async function getBusinessPlaceForTeam(
  businessId: string,
): Promise<{ timeZone: string; shabbatCity: string | null } | null> {
  const { data, error } = await createAdminClient()
    .from("businesses")
    .select("timezone, shabbat_city")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { timeZone: data.timezone, shabbatCity: data.shabbat_city }
    : null;
}

/** One template of the business for the console, or null when it isn't one. */
export async function getListTemplateForTeam(
  businessId: string,
  templateId: string,
): Promise<ListTemplate | null | "notYet"> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("list_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("business_id", businessId)
    .eq("id", templateId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  if (!data) return null;
  const templates = await templatesFrom(admin, [data]);
  return templates === "notYet" ? templates : (templates[0] ?? null);
}

/**
 * The lists the person sent that opened in the window, newest first: "sent
 * today" on the send screen. Under RLS, which lets a sender read their own.
 */
export async function getSentLists(
  businessId: string,
  userId: string,
  window: Window,
): Promise<ListSummary[] | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .select(LIST_COLUMNS)
    .eq("business_id", businessId)
    .eq("sent_by", userId)
    .gte("opens_at", window.from)
    .lt("opens_at", window.to)
    .order("opens_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  return summaries(supabase, data ?? []);
}

/**
 * The readings of a template's number item in the window, oldest first, each
 * flagged when it was outside the item's range: the walk-in fridge across a
 * month.
 */
export async function getReadings(
  templateItemId: string,
  window: Window,
): Promise<Reading[] | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_items")
    .select("id, list_id, reading, min_value, max_value, done_at, done_by")
    .eq("template_item_id", templateItemId)
    .not("reading", "is", null)
    .gte("done_at", window.from)
    .lt("done_at", window.to)
    .order("done_at");
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  return (data ?? []).flatMap((row) =>
    row.reading === null || row.done_at === null
      ? []
      : [
          {
            listId: row.list_id,
            itemId: row.id,
            reading: row.reading,
            doneAt: row.done_at,
            doneBy: row.done_by,
            outOfRange: isOutOfRange({
              reading: row.reading,
              min: row.min_value,
              max: row.max_value,
            }),
          },
        ],
  );
}

/** A number item of a list, with its reading if it has one. */
export type ListReading = {
  listId: string;
  itemId: string;
  templateItemId: string | null;
  label: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  reading: number | null;
  doneAt: string | null;
  doneBy: string | null;
  outOfRange: boolean;
};

/**
 * The number items of these lists, in each list's order, with their readings:
 * the manager's overview of a day and its week. Under RLS, which lets the
 * reader see the items of the lists they read.
 */
export async function getListReadings(
  listIds: readonly string[],
): Promise<ListReading[] | "notYet"> {
  if (listIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_items")
    .select(
      "id, list_id, template_item_id, label, unit, min_value, max_value, reading, done_at, done_by",
    )
    .in("list_id", [...listIds])
    .eq("kind", "number")
    .order("position");
  if (error) {
    if (isMissingTable(error)) return "notYet";
    throw error;
  }
  return (data ?? []).map((row) => ({
    listId: row.list_id,
    itemId: row.id,
    templateItemId: row.template_item_id,
    label: row.label,
    unit: row.unit,
    min: row.min_value,
    max: row.max_value,
    reading: row.reading,
    doneAt: row.done_at,
    doneBy: row.done_by,
    outOfRange: isOutOfRange({
      reading: row.reading,
      min: row.min_value,
      max: row.max_value,
    }),
  }));
}

/**
 * The Lists tab's count: the open lists `actorId` holds (`public.my_open_lists`,
 * with the secret key, since under RLS a list manager would count every list).
 * None before the migration reaches the project.
 */
export async function countMyOpenLists(
  actorId: string,
  businessId: string,
): Promise<number> {
  const { data, error } = await createAdminClient().rpc("my_open_lists", {
    actor: actorId,
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return 0;
    throw error;
  }
  return data ?? 0;
}

const savedSchema = z.object({ id: z.string(), version: z.int() });

const openingsSchema = z.array(
  z.object({
    schedule: z.string(),
    openings: z.array(
      z.object({
        occursOn: z.string(),
        opensAt: z.string(),
        dueAt: z.string(),
      }),
    ),
  }),
);

/** Instants as the screens compare them: ISO, in UTC. */
const iso = (stamp: string) => new Date(stamp).toISOString();

/**
 * The next three openings of each of a template's times, as the database's
 * minute job will open them (`public.next_list_openings`, with the secret key
 * for `actorId`, a list manager or the team). Empty when it can't say: the
 * migration not on this project yet, or not theirs to read.
 */
export async function nextListOpenings(
  actorId: string,
  templateId: string,
  at?: Date,
): Promise<ScheduleOpenings> {
  const { data, error } = await createAdminClient().rpc("next_list_openings", {
    actor: actorId,
    template: templateId,
    ...atTime(at),
  });
  if (error) {
    if (
      !isMissingFunction(error) &&
      error.code !== "P0002" &&
      error.code !== "42501"
    ) {
      console.error("reading a template's next openings failed", error.message);
    }
    return {};
  }
  const parsed = openingsSchema.safeParse(data);
  if (!parsed.success) return {};
  return Object.fromEntries(
    parsed.data.map((row) => [
      row.schedule,
      row.openings.map((opening) => ({
        occursOn: opening.occursOn,
        opensAt: iso(opening.opensAt),
        dueAt: iso(opening.dueAt),
        shiftId: null,
      })),
    ]),
  );
}

/**
 * Creates or saves a template with its items and times
 * (`public.save_list_template`). `seenVersion` is the version the editor read:
 * a save behind it is refused ("changed"). The function gives back the id and
 * the version; the items' ids, which the editor needs for its next save, are
 * read after it, and a save that something else followed at once reads as
 * "changed", since the editor's next save would be refused anyway. Once the
 * function has saved, a failure after it carries the template's id
 * (`saved`), so a new one is never made again by the next save.
 */
export async function saveListTemplate(
  actorId: string,
  businessId: string,
  input: ListTemplateInput,
  seenVersion?: number,
): Promise<ListWrite<SavedTemplate>> {
  let template: ReturnType<typeof templateForSave>;
  try {
    template = templateForSave(input);
  } catch {
    return refused("invalid");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("save_list_template", {
    actor: actorId,
    business: businessId,
    template: template as Json,
    ...(seenVersion === undefined ? {} : { seen_version: seenVersion }),
  });
  if (error) return refused(failureOf(error));
  const saved = savedSchema.safeParse(data);
  if (!saved.success) return refused("failed");
  const [now, items, schedules, openings] = await Promise.all([
    admin
      .from("list_templates")
      .select("version")
      .eq("id", saved.data.id)
      .eq("business_id", businessId)
      .maybeSingle(),
    admin
      .from("list_template_items")
      .select("id")
      .eq("template_id", saved.data.id)
      .eq("business_id", businessId)
      .order("position"),
    admin
      .from("list_schedules")
      .select("id")
      .eq("template_id", saved.data.id)
      .eq("business_id", businessId)
      .order("position"),
    nextListOpenings(actorId, saved.data.id),
  ]);
  if (now.error || items.error || schedules.error) {
    console.error(
      "reading a saved template failed",
      (now.error ?? items.error ?? schedules.error)?.message,
    );
    return { ...refused("failed"), saved: saved.data.id };
  }
  if (now.data?.version !== saved.data.version) {
    return { ...refused("changed"), saved: saved.data.id };
  }
  return {
    ok: true,
    value: {
      ...saved.data,
      items: (items.data ?? []).map((row) => row.id),
      schedules: (schedules.data ?? []).map((row) => row.id),
      openings,
    },
  };
}

/** Removes a template from the screens (`public.archive_list_template`). */
export async function archiveListTemplate(
  actorId: string,
  templateId: string,
): Promise<ListWrite<null>> {
  const { error } = await createAdminClient().rpc("archive_list_template", {
    actor: actorId,
    template: templateId,
  });
  return error ? refused(failureOf(error)) : { ok: true, value: null };
}

/** Brings a removed template back: the undo (`public.restore_list_template`). */
export async function restoreListTemplate(
  actorId: string,
  templateId: string,
): Promise<ListWrite<null>> {
  const { error } = await createAdminClient().rpc("restore_list_template", {
    actor: actorId,
    template: templateId,
  });
  return error ? refused(failureOf(error)) : { ok: true, value: null };
}

/** Sends a list now (`public.send_list`). Returns its id. */
export async function sendList(
  actorId: string,
  businessId: string,
  input: SendInput,
  at?: Date,
): Promise<ListWrite<string>> {
  const list = sendInput.safeParse(input);
  if (!list.success) return refused("invalid");
  const { data, error } = await createAdminClient().rpc("send_list", {
    actor: actorId,
    business: businessId,
    list: list.data as Json,
    ...atTime(at),
  });
  if (error) return refused(failureOf(error));
  return typeof data === "string"
    ? { ok: true, value: data }
    : refused("failed");
}

/**
 * Fills an item, or clears it with null (`public.set_list_item`). Callers check
 * the result against the item's kind first (`itemResult`). Returns the list's
 * progress.
 */
export async function setListItem(
  actorId: string,
  itemId: string,
  result: ItemResult,
  at?: Date,
): Promise<ListWrite<ListProgress>> {
  const { data, error } = await createAdminClient().rpc("set_list_item", {
    actor: actorId,
    item: itemId,
    result: result as Json,
    ...atTime(at),
  });
  if (error) return refused(failureOf(error));
  const progress = listProgressSchema.safeParse(data);
  return progress.success
    ? { ok: true, value: progress.data }
    : refused("failed");
}

type ListChange =
  | "finish_list"
  | "cancel_list"
  | "cancel_unstarted_list"
  | "reopen_list";

async function changeList(
  change: ListChange,
  actorId: string,
  listId: string,
  at?: Date,
): Promise<ListWrite<null>> {
  const { error } = await createAdminClient().rpc(change, {
    actor: actorId,
    list: listId,
    ...atTime(at),
  });
  return error ? refused(failureOf(error)) : { ok: true, value: null };
}

/** Finishes an open list once every required item is done ("left" otherwise). */
export function finishList(
  actorId: string,
  listId: string,
  at?: Date,
): Promise<ListWrite<null>> {
  return changeList("finish_list", actorId, listId, at);
}

/** Cancels an open list: whoever sent it, the department that asked, list managers. */
export function cancelList(
  actorId: string,
  listId: string,
  at?: Date,
): Promise<ListWrite<null>> {
  return changeList("cancel_list", actorId, listId, at);
}

/**
 * Takes back a list just sent: cancels it as `cancelList` does, only while
 * nobody has started it ("finished" once someone has: an item done or
 * commented). Checked under the list's lock, so a tick and the undo never
 * cross (`public.cancel_unstarted_list`).
 */
export function cancelUnstartedList(
  actorId: string,
  listId: string,
  at?: Date,
): Promise<ListWrite<null>> {
  return changeList("cancel_unstarted_list", actorId, listId, at);
}

/**
 * Opens a finished or cancelled list again: whoever did it within
 * `REOPEN_MINUTES` (the undo), or a list manager at any time.
 */
export function reopenList(
  actorId: string,
  listId: string,
  at?: Date,
): Promise<ListWrite<null>> {
  return changeList("reopen_list", actorId, listId, at);
}

/**
 * Passes an open list to another department of its business, with a note if
 * there is one (`public.pass_list`): whoever holds it, or a list manager.
 * "invalid" for the department holding it already, a removed one, or a note
 * too long; "finished" once it is closed.
 */
export async function passList(
  actorId: string,
  input: PassInput,
  at?: Date,
): Promise<ListWrite<null>> {
  const pass = passInput.safeParse(input);
  if (!pass.success) return refused("invalid");
  const { error } = await createAdminClient().rpc("pass_list", {
    actor: actorId,
    list: pass.data.list,
    department: pass.data.department,
    ...(pass.data.note ? { pass_note: pass.data.note } : {}),
    ...atTime(at),
  });
  return error ? refused(failureOf(error)) : { ok: true, value: null };
}
