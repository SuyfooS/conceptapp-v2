import type { Department } from "@domain/departments";
import type { ListTemplate } from "@domain/lists";
import { STAFF_ROLES } from "@domain/modules";
import type { ShiftPattern } from "@domain/staffing";
import type {
  TemplateEditorData,
  TemplateRow,
  TemplatesScreenData,
} from "../list-types";

/*
 * The template screens' data from what was read, the same for the business's
 * own people (under RLS) and for the team in the console (with the secret
 * key), so both draw the same screen.
 */

export function templateRow(template: ListTemplate): TemplateRow {
  return {
    id: template.id,
    name: template.name,
    recipient: template.recipient,
    fromDepartment: template.fromDepartment,
    items: template.items.length,
    archivedAt: template.archivedAt,
  };
}

function departmentsOf(departments: readonly Department[]) {
  return {
    departments: departments
      .filter((d) => d.archivedAt === null)
      .map((d) => ({ id: d.id, name: d.name })),
    departmentNames: Object.fromEntries(departments.map((d) => [d.id, d.name])),
  };
}

export function templatesScreen({
  templates,
  departments,
  shifts,
  removed,
  readOnly,
}: {
  templates: readonly ListTemplate[];
  departments: readonly Department[];
  shifts: readonly ShiftPattern[];
  /** `?removed=`: the template just removed in its editor. */
  removed: string | undefined;
  readOnly: boolean;
}): TemplatesScreenData {
  const live = templates.filter((t) => t.archivedAt === null);
  const gone = templates
    .filter((t) => t.archivedAt !== null)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const just = readOnly ? undefined : gone.find((t) => t.id === removed);
  return {
    templates: live.map(templateRow),
    removed: readOnly ? [] : gone.map(templateRow),
    ...departmentsOf(departments),
    shiftNames: Object.fromEntries(shifts.map((s) => [s.key, s.name])),
    justRemoved: just ? templateRow(just) : null,
    readOnly,
  };
}

export function templateEditor({
  template,
  departments,
  shifts,
  readOnly,
  changed,
}: {
  template: ListTemplate | null;
  departments: readonly Department[];
  shifts: readonly ShiftPattern[];
  readOnly: boolean;
  changed: boolean;
}): TemplateEditorData {
  return {
    template,
    ...departmentsOf(departments),
    shifts: shifts.map((s) => ({ key: s.key, name: s.name })),
    roles: STAFF_ROLES,
    // A removed template is only read: the database saves none.
    readOnly: readOnly || template?.archivedAt != null,
    changed,
  };
}
