import { isStaff, type Role, type Viewer } from "./modules";

/**
 * Who sees pay (payroll P2 and P3; Orel, 8 and 9 November 2026, issue #1).
 * `clock.payroll` opens everyone's hours for payroll, and from P4 wages,
 * payroll details and estimates. Owners and accountants always hold it; an
 * owner gives it to managers or workers as a role, or to one person. The
 * database decides every read (`private.holds_perm`); these say what the
 * screens offer.
 */

/** The permission that opens the pay screens. */
export const PAY_PERMISSION = "clock.payroll";

/**
 * Whether the viewer opens the pay screens: they hold `clock.payroll`, as
 * `public.my_permissions` says, and nothing else decides it. A view as an owner
 * or a manager holds it never, as an accountant always: by role, a view as
 * owner would open the screens and read no pay at all.
 */
export function canSeePay(viewer: Viewer): boolean {
  return viewer.perms.includes(PAY_PERMISSION);
}

/** Who gives pay access, and adds an accountant: the owner (and the team, from the console). */
export function canGrantPay(role: Role): boolean {
  return role === "owner";
}

/** The roles an owner switches pay access on or off for, in the order shown. */
export const PAY_ROLES = [
  "manager",
  "worker",
] as const satisfies readonly Role[];

export type PayRole = (typeof PAY_ROLES)[number];

/**
 * More people than this seeing pay moves a business up a security level
 * (profile design §4.2): the access screen says so.
 */
export const PAY_HOLDERS_WARNING = 10;

/** Someone in the business, as the access screen counts them. */
export type PayHolderCandidate = {
  userId: string;
  role: Role;
  /** Given pay access to them alone (`memberships.perms`). */
  personal: boolean;
};

/**
 * How many active people see pay: owners and accountants always, everyone in
 * a role given it, and everyone given it personally, each once.
 */
export function payHolderCount(
  people: readonly PayHolderCandidate[],
  roles: readonly Role[],
): number {
  return people.filter(
    (person) =>
      person.role === "owner" ||
      !isStaff(person.role) ||
      roles.includes(person.role) ||
      person.personal,
  ).length;
}

/** Whether the count is past the warning. */
export function overPayHoldersWarning(count: number): boolean {
  return count > PAY_HOLDERS_WARNING;
}

/**
 * Who may be given pay access personally: active staff who hold it neither as
 * owners nor by their role, and don't have it yet. Never the giver.
 */
export function canGetPersonalPay(
  person: PayHolderCandidate,
  roles: readonly Role[],
  giverId: string,
): boolean {
  return (
    person.userId !== giverId &&
    person.role !== "owner" &&
    isStaff(person.role) &&
    !roles.includes(person.role) &&
    !person.personal
  );
}

/**
 * Whether the business has anyone pay access is given to, by role or on their
 * own: a manager or a worker. A business the team has just set up may have
 * nobody yet, or only its owner, and the access screen says so rather than
 * that everyone already sees pay.
 */
export function hasPayRoleStaff(people: readonly { role: Role }[]): boolean {
  return people.some((person) =>
    (PAY_ROLES as readonly Role[]).includes(person.role),
  );
}

/**
 * The order the access screen lists people in, the owner's and the console's
 * alike: by name in Hebrew order, and those without one last.
 */
export function accessOrder(
  a: { name: string | null },
  b: { name: string | null },
): number {
  return (
    (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
    (a.name ?? "").localeCompare(b.name ?? "", "he")
  );
}

/** The day of the month up to which the pay screens open on the month before. */
export const PAY_MONTH_TURNS_ON = 10;

/**
 * The month the pay screens open on, from the business's date today
 * (`YYYY-MM-DD`): the month before until the 10th, when payroll is done for
 * it, and this month from the 11th.
 */
export function defaultPayMonth(today: string): string {
  const day = Number(today.slice(8, 10));
  const month = today.slice(0, 7);
  return day <= PAY_MONTH_TURNS_ON ? previousMonth(month) : month;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The month from the address (`?month=`), when it is a real month no later
 * than the current one; the default month otherwise.
 */
export function payMonthFrom(
  asked: unknown,
  currentMonth: string,
  fallback: string,
): string {
  return typeof asked === "string" && MONTH.test(asked) && asked <= currentMonth
    ? asked
    : fallback;
}

function previousMonth(month: string): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  return index === 1
    ? `${year - 1}-12`
    : `${year}-${String(index - 1).padStart(2, "0")}`;
}

/**
 * Hours as payroll writes them: minutes summed first, then to hours with two
 * decimals (`168.50`), never a sum of rounded days.
 */
export function decimalHours(minutes: number): string {
  return (Math.max(0, minutes) / 60).toFixed(2);
}
