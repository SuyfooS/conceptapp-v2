import type { Department } from "@domain/departments";
import {
  type ListTemplate,
  type SchedulePlaces,
  scheduleGone,
} from "@domain/lists";
import { STAFF_ROLES } from "@domain/modules";
import type { ShiftPattern } from "@domain/staffing";
import type {
  EditorTimes,
  TemplateEditorData,
  TemplateRow,
  TemplatesScreenData,
} from "../list-types";

/*
 * The template screens' data from what was read, the same for the business's
 * own people (under RLS) and for the team in the console (with the secret
 * key), so both draw the same screen.
 */

/**
 * A template's row: its items, who it goes to, and its times in short (the
 * first that runs, how many more, and how many point at something gone, by
 * the business's live departments and shift keys).
 */
export function templateRow(
  template: ListTemplate,
  places: SchedulePlaces,
): TemplateRow {
  const first = template.schedules.find((s) => s.active);
  return {
    id: template.id,
    name: template.name,
    recipient: template.recipient,
    fromDepartment: template.fromDepartment,
    items: template.items.length,
    archivedAt: template.archivedAt,
    times: {
      count: template.schedules.length,
      first: first
        ? {
            days: first.days,
            anchor: first.anchor,
            shift: first.shift,
            opensOffset: first.opensOffset,
          }
        : null,
      gone: template.schedules.filter((s) =>
        scheduleGone(s, places.departments, places.shifts),
      ).length,
    },
  };
}

/** The business's live departments and shift keys, which a time may point at. */
export function placesOf(
  departments: readonly Department[],
  shifts: readonly ShiftPattern[],
): SchedulePlaces {
  return {
    departments: departments
      .filter((d) => d.archivedAt === null)
      .map((d) => d.id),
    shifts: shifts.map((s) => s.key),
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
  const places = placesOf(departments, shifts);
  const row = (template: ListTemplate) => templateRow(template, places);
  return {
    templates: live.map(row),
    removed: readOnly ? [] : gone.map(row),
    ...departmentsOf(departments),
    shiftNames: Object.fromEntries(shifts.map((s) => [s.key, s.name])),
    justRemoved: just ? row(just) : null,
    readOnly,
  };
}

export function templateEditor({
  template,
  departments,
  shifts,
  readOnly,
  changed,
  times,
}: {
  template: ListTemplate | null;
  departments: readonly Department[];
  shifts: readonly ShiftPattern[];
  readOnly: boolean;
  changed: boolean;
  times: EditorTimes;
}): TemplateEditorData {
  return {
    template,
    ...departmentsOf(departments),
    shifts: shifts.map((s) => ({ key: s.key, name: s.name })),
    roles: STAFF_ROLES,
    // A removed template is only read: the database saves none.
    readOnly: readOnly || template?.archivedAt != null,
    changed,
    times,
  };
}
