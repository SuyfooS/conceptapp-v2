import { getDepartments } from "@db/departments";
import type { ModeEntry, ModuleIcon, ModuleKey } from "@domain/modules";
import { ListGroup, ListRow } from "@ui/list-row";
import { currentMember } from "./member";
import { currentModes, type ModeReach, type ModeStatus } from "./modes";
import { moduleIcons } from "./module-icons";
import type { AppWording, Translator } from "./wording";
import { translator } from "./wording";

/** A mode's way in, in words: where it leads, its name and its line. */
export type ModeRow = {
  key: ModuleKey;
  href: string;
  icon: ModuleIcon;
  title: string;
  subtitle: string;
  /** On a shift (or needing none) and taking orders: Home's card, not a row. */
  open: boolean;
  /** The card's one action, a verb that says where it goes. */
  action: string;
};

/**
 * What a mode's way in says (`app.orders.home`): off a shift, that it opens
 * on one; taking orders, what is ready and being made, or how to start;
 * only preparing, what waits in each department ("מטבח · 2 בהכנה"). Names a
 * department after its separator only.
 */
export function modeLine(
  t: Translator<"app.orders.home">,
  status: ModeStatus,
  departmentName: (id: string) => string,
): string {
  if (status.takes && status.clock) return t("offClock");
  if (status.takes) {
    const parts = [
      status.ready > 0 ? t("ready", { count: status.ready }) : null,
      status.making > 0 ? t("making", { count: status.making }) : null,
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" · ") : t("idle");
  }
  return status.waiting.length > 0
    ? status.waiting
        .map(({ department, count }) =>
          t("waiting", { department: departmentName(department), count }),
        )
        .join(", ")
    : t("nothingWaiting");
}

/**
 * The modes' ways in for `where` (the clock's live shift, the profile, Home),
 * in the business's words: one row each, leading where its read says. The
 * departments' names are read only when a line names one.
 */
export async function currentModeRows(
  where: ModeEntry,
  wording: AppWording,
): Promise<ModeRow[]> {
  const modes = (await currentModes()).filter((mode) =>
    mode.entries.includes(where),
  );
  if (modes.length === 0) return [];
  const t = translator(wording, "app.orders.home");
  const tm = translator(wording, "modules");
  const names = await departmentNames(modes);
  return modes.map((mode) => ({
    key: mode.key,
    href: mode.entry,
    icon: mode.icon,
    title: tm(`${mode.key}.name`),
    subtitle: modeLine(t, mode.status, (id) => names.get(id) ?? ""),
    open: mode.status.takes && mode.status.clock === null,
    action: t("open"),
  }));
}

async function departmentNames(
  modes: readonly ModeReach[],
): Promise<Map<string, string>> {
  if (!modes.some((m) => !m.status.takes && m.status.waiting.length > 0)) {
    return new Map();
  }
  const business = (await currentMember())?.membership?.business.id;
  if (!business) return new Map();
  const departments = await getDepartments(business).catch(() => "notYet");
  return departments === "notYet" || typeof departments === "string"
    ? new Map()
    : new Map(departments.map((d) => [d.id, d.name]));
}

/** The modes' rows, one each, in a group of their own. */
export function ModeRows({ rows }: { rows: readonly ModeRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ListGroup>
      {rows.map((row) => (
        <ListRow
          key={row.key}
          href={row.href}
          leading={moduleIcons[row.icon]}
          title={row.title}
          subtitle={row.subtitle}
        />
      ))}
    </ListGroup>
  );
}
