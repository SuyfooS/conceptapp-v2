import type { Department } from "./departments";
import { isStaff, type Role } from "./modules";
import { byNameThenId } from "./team";

/*
 * Who a person asks to correct their hours (closing the pilot, PR 8): a
 * worker who forgot to clock out, or whose press the clock refused for what
 * only whoever approves hours can fix (`FIX_FAILURES` in
 * time-clock-format.ts, beside the clock's other browser sums), writes to
 * that person from the clock, in chat, or is told their name. This bridges
 * the gap until the worker's own request for a correction
 * (docs/ROADMAP.md, "אחר כך").
 */

/**
 * Someone who may edit the clock in a business (clock.edit, as
 * `private.holds_perm` answers it: an active owner always, anyone else by
 * their role's rule or a grant of their own), as `public.clock_editors`
 * gives them: their id, their role and the name the business shows for
 * them (null when nobody wrote one down).
 */
export type ClockEditor = {
  id: string;
  role: Role;
  name: string | null;
};

/** One of those a person may ask, as the clock offers them. */
export type HoursFixer = ClockEditor & {
  /** The live departments they are in, by name, in the business's order. */
  departments: string[];
  /** They share a live department with the person asking. */
  near: boolean;
  /** Written to in chat: chat is on for the person asking, and they are on the staff. */
  chat: boolean;
};

/**
 * Whom the person asks to correct their hours, in the order they are
 * offered. Everyone who may edit the clock in the business but the person
 * themself, since every permission covers the whole business (there is no
 * department manager); the owners only when nobody else may. Those who
 * share a live department with the person come first, then the rest, each
 * group by name, the nameless last (`byNameThenId`, as the team's lists
 * order people). Someone who can be neither written to nor named (chat off,
 * no name) is left out before that choice, so the owners still come when
 * nobody else can be shown.
 */
export function hoursFixers({
  editors,
  person,
  departments,
  chat,
}: {
  editors: readonly ClockEditor[];
  /** The person whose hours need fixing, never offered to themself. */
  person: string;
  /** The business's departments, removed ones too (`getDepartments`). */
  departments: readonly Department[];
  /** Chat is on for the person asking (its module, and they are on the staff). */
  chat: boolean;
}): HoursFixer[] {
  const self = person.toLowerCase();
  const live = departments.filter((d) => d.archivedAt === null);
  const inIt = (department: Department, id: string) =>
    department.members.some((member) => member.toLowerCase() === id);
  const own = live.filter((d) => inIt(d, self));
  const seen = new Set<string>();
  const shown = editors.flatMap((editor): HoursFixer[] => {
    const id = editor.id.toLowerCase();
    if (id === self || seen.has(id)) return [];
    seen.add(id);
    const fixer: HoursFixer = {
      ...editor,
      departments: live.filter((d) => inIt(d, id)).map((d) => d.name),
      near: own.some((d) => inIt(d, id)),
      chat: chat && isStaff(editor.role),
    };
    return fixer.chat || fixer.name !== null ? [fixer] : [];
  });
  const others = shown.filter((fixer) => fixer.role !== "owner");
  const asked = others.length > 0 ? others : shown;
  return [
    ...asked.filter((fixer) => fixer.near).sort(byNameThenId),
    ...asked.filter((fixer) => !fixer.near).sort(byNameThenId),
  ];
}

/**
 * What the clock shows, from `hoursFixers`: one person to write to, a
 * choice among several (some of them, at least, written to in chat), or,
 * when none of them can be written to, their names. Null for nobody. Each
 * person as given, so a screen can carry more with them (where their chat
 * is).
 */
export type AskFix<P extends HoursFixer = HoursFixer> =
  | { kind: "write"; person: P }
  | { kind: "pick"; people: P[] }
  | { kind: "name"; people: P[] };

export function askFixOf<P extends HoursFixer>(
  fixers: readonly P[],
): AskFix<P> | null {
  const [first] = fixers;
  if (!first) return null;
  if (!fixers.some((fixer) => fixer.chat)) {
    return { kind: "name", people: [...fixers] };
  }
  return fixers.length === 1
    ? { kind: "write", person: first }
    : { kind: "pick", people: [...fixers] };
}
