import { z } from "zod";

/**
 * A business's departments: its own groups of people (kitchen, bar,
 * storeroom), from its template, edited by owners, managers and the team like
 * positions. Lists go to a department, and pass between them. A person can be
 * in several, managers too. Removing one archives it in the database
 * (`public.set_departments`), so old lists keep its name and saving it again
 * brings it back.
 */

/** At most this many; `public.set_departments` says the same. */
export const MAX_DEPARTMENTS = 30;

export const departmentKey = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Expected a lowercase key")
  .max(40);

export const departmentName = z.string().trim().min(1).max(40);

export const department = z.strictObject({
  key: departmentKey,
  name: departmentName,
});

export type DepartmentInput = z.infer<typeof department>;

/** Names compare as the database compares them: case aside. */
const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * The departments a business saves, in order: each key once and each name
 * once (case aside), at most `MAX_DEPARTMENTS`.
 */
export const departments = z
  .array(department)
  .max(MAX_DEPARTMENTS)
  .refine(
    (list) => new Set(list.map((d) => d.key)).size === list.length,
    "Department keys must be unique",
  )
  .refine(
    (list) => new Set(list.map((d) => nameKey(d.name))).size === list.length,
    "Department names must be unique",
  );

/** A template's departments: the same shape, keys the lists refer to. */
export const departmentSeeds = departments;

export type DepartmentSeed = z.output<typeof department>;

/**
 * A key for a department added on a screen. Nobody types it: names change, and
 * templates and lists keep pointing at the department.
 */
export function newDepartmentKey(): string {
  const [random = 0] = crypto.getRandomValues(new Uint32Array(1));
  return `d-${random.toString(16).padStart(8, "0")}`;
}

/** A department as the app reads it, with its people's ids. */
export type Department = {
  id: string;
  key: string;
  name: string;
  /** Null while it is live; removed ones stay so old lists keep their name. */
  archivedAt: string | null;
  members: string[];
};

/**
 * The ids of the departments a person is in. `live` leaves the removed ones
 * out: what they may send from and to. Without it removed ones count too, as
 * in `private.holds_list`: a list a removed department already holds stays
 * with its people, so it is never left with nobody to fill it.
 */
export function departmentsOf(
  all: readonly Pick<Department, "id" | "archivedAt" | "members">[],
  userId: string,
  { live }: { live: boolean },
): string[] {
  return all
    .filter(
      (d) => d.members.includes(userId) && (!live || d.archivedAt === null),
    )
    .map((d) => d.id);
}
