import { accentTokens, parseHex } from "./color";
import { isStaff, ROLES, type Role } from "./modules";
import {
  type IgnoredColumn,
  type ImportRoles,
  importRolesOf,
  listRoleOf,
  type PeopleLine,
  type PeopleNote,
  type PeopleProblem,
  parsePeopleList,
} from "./people-import";
import { STAFF_LIST_MAX, type StaffEntry } from "./staff-list";
import { inviteChoices } from "./team";
import {
  TEMPLATE_CLOSED_ON_SHABBAT,
  TEMPLATE_KEYS,
  type TemplateKey,
} from "./templates";

/**
 * A new business as the admin console's wizard collects it: a template,
 * then the name, the slug (the public page's address), an optional address,
 * whether it is open on Shabbat, the accent and the staff list to invite
 * (`parseStaffList`, below). `parseNewBusiness` is the one check both the
 * form (per step) and the server action run; the database repeats the hard
 * limits.
 */

export const BUSINESS_NAME_MAX = 80;
export const BUSINESS_ADDRESS_MAX = 200;
export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** Same rule as the `businesses.slug` check in the database. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Slugs that would collide with the app's own paths or read as ours. The
 * public page lives at a business's slug, so these stay free.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "clock",
  "conceptapp",
  "design",
  "help",
  "home",
  "manage",
  "reservations",
  "schedule",
  "sign-in",
  "enter",
  "storefront",
  "support",
  "www",
]);

/**
 * The slug as typed, tidied: trimmed, lower case, spaces and underscores
 * turned into single hyphens, no hyphen at either end. Anything else
 * (Hebrew letters, punctuation) is kept so the check can reject it.
 */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const NEW_BUSINESS_FIELDS = [
  "template",
  "name",
  "slug",
  "address",
  "shabbat",
  "accent",
  "staff",
] as const;
export type NewBusinessField = (typeof NEW_BUSINESS_FIELDS)[number];

/**
 * The wizard's question "העסק פתוח בשבת", as its form sends it: open, or
 * closed (scheduling's `closedOnShabbat`).
 */
export const SHABBAT_ANSWERS = ["open", "closed"] as const;
export type ShabbatAnswer = (typeof SHABBAT_ANSWERS)[number];

/**
 * The answer the question starts from for a template: the template's own
 * (`TEMPLATE_CLOSED_ON_SHABBAT`), until the person changes it.
 */
export function shabbatAnswerOf(template: TemplateKey): ShabbatAnswer {
  return TEMPLATE_CLOSED_ON_SHABBAT[template] ? "closed" : "open";
}

/**
 * What can be wrong with each field ("taken" and "elsewhere" come from the
 * database).
 */
export type NewBusinessErrors = {
  template?: "required" | "invalid";
  name?: "required" | "tooLong";
  slug?: "required" | "tooShort" | "tooLong" | "invalid" | "reserved" | "taken";
  address?: "tooLong";
  /** Neither answer, nor none: only a form not the wizard's sends it. */
  shabbat?: "invalid";
  accent?: "required" | "invalid";
  /**
   * Details per line come from `parseStaffList`. "elsewhere": a number in a
   * staff role is on another business's staff (payroll P3b). "phoneColumns":
   * two columns of mobiles, and nothing says which is the person's.
   */
  staff?: "invalid" | "tooMany" | "elsewhere" | "phoneColumns";
};

export type NewBusiness = {
  template: TemplateKey;
  name: string;
  slug: string;
  /** Null when left empty. */
  address: string | null;
  /**
   * The answer to "העסק פתוח בשבת", as scheduling's `closedOnShabbat`:
   * saved after the business opens, even when it is the template's, so the
   * business says it was answered (a stored `closedOnShabbat` and a
   * `module.settings` line). Null from a form with no answer (one drawn
   * before the wizard asked), which writes nothing and keeps the template's.
   */
  closedOnShabbat: boolean | null;
  /** The accent to store: the pick, darkened if it was not readable. */
  accent: string;
  /** People to invite, possibly none. */
  staff: StaffEntry[];
};

export type NewBusinessInput = Partial<Record<NewBusinessField, unknown>>;

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** A name or address as stored: trimmed, with single spaces. */
export const tidyText = (value: unknown) =>
  text(value).trim().replace(/\s+/g, " ");

function templateError(value: string): NewBusinessErrors["template"] | null {
  if (!value) return "required";
  return TEMPLATE_KEYS.includes(value as TemplateKey) ? null : "invalid";
}

export function nameError(value: string): NewBusinessErrors["name"] | null {
  if (!value) return "required";
  return value.length > BUSINESS_NAME_MAX ? "tooLong" : null;
}

function slugError(value: string): NewBusinessErrors["slug"] | null {
  if (!value) return "required";
  if (value.length < SLUG_MIN) return "tooShort";
  if (value.length > SLUG_MAX) return "tooLong";
  if (!SLUG_PATTERN.test(value)) return "invalid";
  return RESERVED_SLUGS.has(value) ? "reserved" : null;
}

export function accentError(value: string): NewBusinessErrors["accent"] | null {
  if (!value) return "required";
  return /^#[0-9a-f]{6}$/i.test(value) && parseHex(value) ? null : "invalid";
}

export type ParsedNewBusiness =
  | { ok: true; value: NewBusiness }
  | { ok: false; errors: NewBusinessErrors };

/**
 * Checks the wizard's fields. Pass `only` to check some of them (one step
 * of the wizard); the result is then `ok` when those fields pass, with
 * `value` built from whatever was given. `reading` is how the staff list is
 * read (`parseStaffList`): the form and the action pass the same words.
 */
export function parseNewBusiness(
  input: NewBusinessInput,
  only: readonly NewBusinessField[] = NEW_BUSINESS_FIELDS,
  reading: StaffReading = {},
): ParsedNewBusiness {
  const template = text(input.template).trim();
  const name = tidyText(input.name);
  const slug = normalizeSlug(text(input.slug));
  const address = tidyText(input.address);
  const shabbat = text(input.shabbat).trim();
  const accent = text(input.accent).trim();
  const staff = parseStaffList(text(input.staff), reading);

  const found: { [F in NewBusinessField]-?: NewBusinessErrors[F] | null } = {
    template: templateError(template),
    name: nameError(name),
    slug: slugError(slug),
    address: address.length > BUSINESS_ADDRESS_MAX ? "tooLong" : null,
    shabbat:
      shabbat === "" || SHABBAT_ANSWERS.includes(shabbat as ShabbatAnswer)
        ? null
        : "invalid",
    accent: accentError(accent),
    staff: staff.error,
  };

  const errors: NewBusinessErrors = {};
  for (const field of only) {
    const error = found[field];
    // Each field keeps its own error type; the loop only copies them over.
    if (error) Object.assign(errors, { [field]: error });
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      template: template as TemplateKey,
      name,
      slug,
      address: address || null,
      closedOnShabbat: shabbat === "" ? null : shabbat === "closed",
      accent: found.accent ? accent : accentTokens(accent).accent,
      staff: staff.entries,
    },
  };
}

/** Which wizard step each field is asked on, in order. */
export const NEW_BUSINESS_STEPS = [
  ["template"],
  ["name", "slug", "address", "shabbat"],
  ["accent"],
  ["staff"],
] as const satisfies readonly (readonly NewBusinessField[])[];

/** The first step holding one of the errors, so the form can go back to it. */
export function firstStepWithError(errors: NewBusinessErrors): number {
  const index = NEW_BUSINESS_STEPS.findIndex((fields) =>
    fields.some((field) => errors[field]),
  );
  return index === -1 ? 0 : index;
}

// ---------------------------------------------------------------------------
// The staff list

/**
 * The words for the built-in roles when none are given: each role's own
 * key, which is a role's word already ("owner", "manager").
 */
const ROLE_KEYS = Object.fromEntries(ROLES.map((role) => [role, role])) as {
  [R in Role]: R;
};

/** The words for the built-in roles, one by one: `app.roles`, as a translator gives them. */
export function roleWordsOf(
  word: (role: Role) => string,
): Record<Role, string> {
  return {
    owner: word("owner"),
    manager: word("manager"),
    worker: word("worker"),
    accountant: word("accountant"),
  };
}

/** How the wizard reads its staff list. */
export type StaffReading = {
  /**
   * The app's words for the built-in roles (`app.roles`: "ניהול", "צוות"),
   * read on a line as the import reads a business's own words, beside the
   * built-in role words ("מנהלת", "בעלים", "owner"). The form and the
   * action pass the same, in the viewer's language.
   */
  labels?: Record<Role, string>;
  /**
   * The numbers (E.164) the database found on another business's staff when
   * the list was sent (`onAnotherStaff` in @db/invites): a line that would
   * invite one of them to the staff is to fix (`elsewhere`) until it goes.
   * A line naming an accountant never is: they may keep any business's books.
   */
  elsewhere?: ReadonlySet<string>;
};

/**
 * The roles the wizard's list is read against: every one, as the ConceptApp
 * team gives as an owner does (`public.create_business` takes any role), so
 * a line may name an owner or an accountant too, and nothing is blocked.
 * Managers and workers are the import's choices, owners and accountants its
 * one by one, which `parseStaffList` invites from the list all the same.
 */
export function staffRolesOf(
  labels: Record<Role, string> = ROLE_KEYS,
): ImportRoles {
  return importRolesOf({
    choices: inviteChoices({ role: "owner", perms: [] }),
    named: [],
    labels,
  });
}

type StaffLineBase = {
  /** Numbered from 1 as pasted. */
  line: number;
  /** A name line and its number line read as one: the second one's number. */
  last?: number;
  /** The line as pasted, cleaned. */
  text: string;
  /** What of the line wasn't read: another number, an ID, a job title. */
  dropped: string[];
};

/** A line of the wizard's staff list, and what it became. */
export type StaffLine = StaffLineBase &
  /** The columns' headers. */
  (
    | { kind: "header" }
    /** Before the header row, with no mobile in it: a sheet's name, a list's heading. */
    | { kind: "title" }
    | { kind: "person"; entry: StaffEntry; notes: PeopleNote[] }
    /** The same person as an earlier line, by number, name and role: left out. */
    | { kind: "sameLine"; first: number }
    /**
     * Why the line can't be invited as it is, in the import's own problems
     * (`duplicate` with the earlier line holding the number, `elsewhere`
     * with the database's numbers, `beforeHeader` for a line above the
     * header row with a mobile in it); never one about a role, since the
     * wizard gives every role.
     */
    | {
        kind: "problem";
        problem: PeopleProblem;
        first?: number;
        /** With `elsewhere`: the number (E.164) on another staff. */
        phone?: string;
      }
  );

export type StaffList = {
  /** Every non-empty line, in order. Empty with `tooMany` and `phoneColumns`. */
  lines: StaffLine[];
  /** The people to invite, in the list's order. */
  entries: StaffEntry[];
  /** The columns not read (an ID's, a wage's), by header or place. */
  ignored: IgnoredColumn[];
  /** With `phoneColumns`: the phone columns' headers, when a header named them. */
  phoneHeaders?: string[];
  /**
   * "invalid": a line has a problem. "tooMany": over `STAFF_LIST_MAX`
   * people, or more than the import reads at once (nothing drawn then).
   * "phoneColumns": two columns of mobiles, and nothing says which.
   */
  error: "invalid" | "tooMany" | "phoneColumns" | null;
};

/** Names compared case aside, as the import compares them. */
const nameKey = (name: string) => name.toLowerCase();

/**
 * A line's person as the wizard invites them: the import's person, or a
 * line the import holds for one by one, an owner's or an accountant's, which
 * the wizard takes from its list.
 */
function entryOf(line: PeopleLine): StaffEntry | null {
  if (line.kind === "person") {
    const { name, phone, role } = line.person;
    return { name, phone, role };
  }
  if (
    line.kind === "problem" &&
    line.problem === "oneByOne" &&
    line.role !== undefined &&
    line.phone !== undefined &&
    line.name !== undefined
  ) {
    return { name: line.name, phone: line.phone, role: line.role };
  }
  return null;
}

/**
 * Reads the wizard's pasted staff list as the import reads a list of people
 * (`parsePeopleList` in @domain/people-import): from WhatsApp, Excel, Google
 * Sheets or a note, a name and an Israeli mobile in any order, a header row
 * and its columns (an ID's or a wage's left out and named), direction marks
 * dropped, Excel's dropped zero in a phone column, names as the app keeps
 * them (`parseTeamName`), and each line's problem in the import's words.
 * Unlike the import, a line may name an owner or an accountant, whom the
 * wizard invites too, and at most `STAFF_LIST_MAX` people. The same number
 * twice is one person by the same name and role (`sameLine`, left out),
 * else a `duplicate` naming the first line with it; the same name with
 * another number is a note (`sameNameList`), owners and accountants among
 * them. A line above the header row with a mobile in it is to fix
 * (`beforeHeader`), where the import leaves it out as a title. Empty input
 * is a valid, empty list.
 */
export function parseStaffList(
  input: string,
  reading: StaffReading = {},
): StaffList {
  const roles = staffRolesOf(reading.labels);
  const fallback = listRoleOf(roles);
  // Never: the wizard gives every role, workers first.
  if (!fallback) throw new Error("The wizard's list has no role to give");
  const parsed = parsePeopleList(input, roles, fallback);
  if (parsed.error === "tooLong" || parsed.error === "tooMany") {
    return {
      lines: [],
      entries: [],
      ignored: parsed.ignored,
      error: "tooMany",
    };
  }
  if (parsed.error === "phoneColumns") {
    return {
      lines: [],
      entries: [],
      ignored: [],
      ...(parsed.phoneHeaders ? { phoneHeaders: parsed.phoneHeaders } : {}),
      error: "phoneColumns",
    };
  }

  const elsewhere = reading.elsewhere ?? new Set<string>();
  // Each line's person, by line: a line the import left out as the same as
  // an earlier one is that one's person.
  const read = new Map<number, StaffEntry>();
  for (const line of parsed.lines) {
    const entry = entryOf(line);
    if (entry) read.set(line.line, entry);
  }
  // The first line with each number, owners and accountants among them,
  // which the import's own check leaves out.
  const firsts = new Map<string, { line: number; entry: StaffEntry }>();
  /** A line with a person: the first with its number, the same again, or a conflict. */
  const checked = (
    base: StaffLineBase,
    entry: StaffEntry,
    notes: PeopleNote[],
  ): StaffLine => {
    const first = firsts.get(entry.phone);
    if (first) {
      return first.entry.role === entry.role &&
        nameKey(first.entry.name) === nameKey(entry.name)
        ? { ...base, kind: "sameLine", first: first.line }
        : { ...base, kind: "problem", problem: "duplicate", first: first.line };
    }
    firsts.set(entry.phone, { line: base.line, entry });
    if (isStaff(entry.role) && elsewhere.has(entry.phone)) {
      return {
        ...base,
        kind: "problem",
        problem: "elsewhere",
        phone: entry.phone,
      };
    }
    return { ...base, kind: "person", entry, notes };
  };

  const mapped = parsed.lines.map((line): StaffLine => {
    const base: StaffLineBase = {
      line: line.line,
      ...(line.last !== undefined ? { last: line.last } : {}),
      text: line.text,
      dropped: line.dropped,
    };
    // A line above the header row with a mobile in it was never read: a
    // person typed above a pasted sheet is never left out unsaid.
    if (line.kind === "title" && line.mobile) {
      return { ...base, kind: "problem", problem: "beforeHeader" };
    }
    if (line.kind === "header" || line.kind === "title") {
      return { ...base, kind: line.kind };
    }
    if (line.kind === "person") {
      const { name, phone, role } = line.person;
      return checked(base, { name, phone, role }, line.notes);
    }
    if (line.kind === "sameLine") {
      // As its first line is: that one may be a conflict here, with an
      // owner's or an accountant's line before it.
      const entry = read.get(line.first);
      return entry
        ? checked(base, entry, [])
        : { ...base, kind: "sameLine", first: line.first };
    }
    const entry = entryOf(line);
    if (entry) return checked(base, entry, []);
    // Another name or role on a number already listed: named by the first
    // line with it, an owner's or an accountant's too.
    const first =
      line.problem === "duplicate" && line.phone !== undefined
        ? (firsts.get(line.phone)?.line ?? line.first)
        : line.first;
    return {
      ...base,
      kind: "problem",
      problem: line.problem,
      ...(first !== undefined ? { first } : {}),
    };
  });

  // The same name with another number, as the import notes it, now among
  // every person the wizard invites: the import's own note leaves out the
  // owners' and the accountants' lines, the owner pasted twice among them.
  const byName = new Map<string, number[]>();
  for (const line of mapped) {
    if (line.kind !== "person") continue;
    const key = nameKey(line.entry.name);
    byName.set(key, [...(byName.get(key) ?? []), line.line]);
  }
  const lines = mapped.map((line): StaffLine => {
    if (line.kind !== "person") return line;
    const other = byName
      .get(nameKey(line.entry.name))
      ?.find((one) => one !== line.line);
    const notes = line.notes.filter((note) => note.kind !== "sameNameList");
    return {
      ...line,
      notes:
        other === undefined
          ? notes
          : [{ kind: "sameNameList", line: other }, ...notes],
    };
  });

  const entries = lines.flatMap((line) =>
    line.kind === "person" ? [line.entry] : [],
  );
  const error = lines.some((line) => line.kind === "problem")
    ? "invalid"
    : entries.length > STAFF_LIST_MAX
      ? "tooMany"
      : null;
  return { lines, entries, ignored: parsed.ignored, error };
}

/**
 * The numbers found on another staff that are still on a line of the list
 * (its `elsewhere` lines), in the list's order: the ones the field names.
 */
export function elsewhereOf(list: StaffList): string[] {
  return list.lines.flatMap((line) =>
    line.kind === "problem" && line.problem === "elsewhere" && line.phone
      ? [line.phone]
      : [],
  );
}

/**
 * The staff field's error once its text is edited, from the one it shows.
 * None stays none, since the preview says each problem as it is typed. The
 * server's "elsewhere" stays while a line still holds one of its numbers
 * (`elsewhereOf`); otherwise the error is the list's own, and goes once the
 * list is fine, so the field never names a number that has left the list.
 */
export function staffErrorAfterEdit(
  shown: NewBusinessErrors["staff"],
  list: StaffList,
): NewBusinessErrors["staff"] {
  if (!shown) return undefined;
  if (shown === "elsewhere" && elsewhereOf(list).length > 0) return shown;
  return list.error ?? undefined;
}
