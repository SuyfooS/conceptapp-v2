import {
  type ActivityDay,
  type ActivityEntry,
  type ActivityPerson,
  type ActivityRecipient,
  type ActivityShift,
  breakFitKind,
  type ClockTimes,
  type FieldChange,
} from "@domain/activity";
import { dateIn } from "@domain/availability";
import { WEEKDAY_KEYS } from "@domain/availability-form";
import { accentTokens } from "@domain/color";
import {
  type ModuleKey,
  type ModuleManifest,
  type Role,
  readModuleSettings,
} from "@domain/modules";
import { describeSettings } from "@domain/settings-form";
import { shabbatCityOf, timeIn } from "@domain/shabbat";
import { manifests } from "@modules/registry";
import { accentProps } from "@ui/accent";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { History, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import { useFullDate, useShekels } from "../../clock/pay/pay-parts";
import { type AppWording, translator } from "../../wording";

export type ActivityPaths = {
  manage: string;
  /** This screen, for the newest page and the cursor of an older one. */
  self: string;
  business: string;
  clockTeam: string;
  /** The business's departments, where their lines lead. */
  departments: string;
  /** Who sees pay, where its lines lead: the owner's alone. */
  access?: string;
  /** The hours for payroll, where a wage's line leads (only pay holders read it). */
  pay?: string;
};

/**
 * A setting or detail as words. Without `values` the label says it all ("changed
 * the shifts"); `from` is left out when nothing says what it was.
 */
type Change = {
  key: string;
  label: string;
  values?: { from?: ReactNode; to: ReactNode };
};

type Described = {
  what: ReactNode;
  notes: ReactNode[];
  changes: Change[];
  href?: string;
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const HEX = /^#[0-9a-f]{6}$/i;

const th = "px-4 py-3 text-start font-medium text-ink-2 text-sm";
const td = "border-line border-t px-4 py-3 align-top";

/** The colour a business picked, as a dot in that colour, readable or not by eye. */
function Swatch({ hex, label }: { hex: string; label: string }) {
  return (
    <span
      {...accentProps(accentTokens(hex))}
      className="inline-flex items-center align-middle"
    >
      <span
        aria-hidden="true"
        className="inline-block size-4 rounded-full border border-edge bg-accent"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ActorAvatar({ actor }: { actor: ActivityPerson }) {
  if (actor.kind === "team") {
    return (
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5"
      >
        <ShieldCheck />
      </span>
    );
  }
  return <PersonAvatar name={actor.kind === "member" ? actor.name : null} />;
}

/**
 * The business's activity log: who changed what, and when, a day at a time,
 * newest first. A list on phones and tablets, a table with what each change was
 * before and after on a computer. The words are worked out once per line, so
 * every shape says the same. Also on the design demo.
 */
export function ActivityView({
  days,
  timeZone,
  older,
  earlier,
  manageable,
  clockOn,
  listsOn,
  paths,
  wording,
}: {
  days: ActivityDay[];
  timeZone: string;
  /** The cursor of the next older page, or null at the start of the log. */
  older: number | null;
  /** Whether this is an older page rather than the newest. */
  earlier: boolean;
  /** Modules whose settings this business edits on its own screen. */
  manageable: readonly ModuleKey[];
  /** The time clock is on, so its punches, left out here, exist somewhere. */
  clockOn: boolean;
  /** Lists are on, so the departments have their screen to link to. */
  listsOn: boolean;
  paths: ActivityPaths;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.manage.activity");
  const tRoles = translator(wording, "app.team.roles");
  const tm = translator(wording, "modules");
  const tCities = translator(wording, "cities");
  const tDays = translator(wording, "days");
  const tDetails = translator(wording, "app.manage.business");
  const tManage = translator(wording, "app.manage");
  const format = useFormatter();
  const shekels = useShekels();
  const fullDate = useFullDate();

  const dayName = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
  const shortDate = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
  const who = (person: ActivityPerson) =>
    person.kind === "member"
      ? (person.name ?? t("who.noName"))
      : t(`who.${person.kind}`);
  const roleName = (role: Role) => tRoles(role);
  const names = (list: readonly string[]) =>
    format.list(list, { type: "conjunction" });
  /** Who a list went to: "to the kitchen", "to Noa", "to the workers". */
  const sentTo = (to: ActivityRecipient) => {
    switch (to.kind) {
      case "person":
        return t("actions.lists.to.person", { person: who(to.person) });
      case "department":
        return to.name
          ? t("actions.lists.to.department", { name: to.name })
          : t("actions.lists.to.departmentUnknown");
      case "shift":
        return t("actions.lists.to.shift");
      case "role":
        return t("actions.lists.to.role", { role: to.role ?? "other" });
    }
  };
  const moduleWords = (key: string, part: string) => `${key}.${part}` as never;
  const moduleName = (key: string) =>
    tm.has(moduleWords(key, "name"))
      ? tm(moduleWords(key, "name"))
      : t("aModule");
  const shiftWords = (shift: ActivityShift) =>
    t("shift", { name: shift.name, day: dayName(shift.day) });
  const clockDay = (times: ClockTimes) =>
    dayName(dateIn(new Date(times.clockIn), timeZone));
  const clockTime = (instant: string) => timeIn(new Date(instant), timeZone);
  const hours = (times: ClockTimes) =>
    times.clockOut
      ? t.rich("times", {
          ltr,
          in: clockTime(times.clockIn),
          out: clockTime(times.clockOut),
        })
      : t.rich("timesOpen", { ltr, in: clockTime(times.clockIn) });
  /** A break's times; one still open says it hadn't ended, not "no clock-out". */
  const breakHours = (times: ClockTimes) =>
    times.clockOut
      ? hours(times)
      : t.rich("actions.clock.breakOpen", {
          ltr,
          in: clockTime(times.clockIn),
        });
  /** Why hours were added or corrected, as its own line under the change. */
  const reasonNotes = (note: string | null): ReactNode[] =>
    note ? [t("actions.clock.reason", { note })] : [];

  /** A module's setting as words, from what its manifest says the field is. */
  function settingChanges(module: string, changes: FieldChange[]): Change[] {
    const manifest: ModuleManifest | undefined = manifests.find(
      (m) => m.key === module,
    );
    if (!manifest) {
      return [{ key: "advanced", label: t("advanced") }];
    }
    const fields = describeSettings(manifest.settings);
    const defaults = readModuleSettings(manifest, {}) as Record<
      string,
      unknown
    >;
    let advanced = false;
    const words: Change[] = [];
    // In the order the settings screen shows them.
    const order = (key: string) => {
      const index = fields.findIndex((f) => f.key === key);
      return index === -1 ? fields.length : index;
    };
    const ordered = [...changes].sort((a, b) => order(a.key) - order(b.key));
    for (const change of ordered) {
      const field = fields.find((f) => f.key === change.key);
      const label = tm.has(moduleWords(module, `settings.${change.key}.label`))
        ? tm(moduleWords(module, `settings.${change.key}.label`))
        : null;
      if (!field || label === null) {
        advanced = true;
        continue;
      }
      if (
        field.kind === "editor" &&
        (field.editor === "positions" || field.editor === "shifts")
      ) {
        words.push({ key: change.key, label: t("changedList", { label }) });
        continue;
      }
      const value = (raw: unknown): ReactNode => {
        switch (field.kind) {
          case "toggle":
            return raw === true ? t("yes") : t("no");
          case "choice": {
            const option = moduleWords(
              module,
              `settings.${change.key}.options.${String(raw)}`,
            );
            return tm.has(option) ? tm(option) : String(raw);
          }
          case "editor": {
            if (field.editor === "weekday" && typeof raw === "number") {
              const day = WEEKDAY_KEYS[raw];
              return day ? tDays(`${day}.long`) : String(raw);
            }
            return <span dir="ltr">{String(raw)}</span>;
          }
          case "number":
            return <span dir="ltr">{String(raw)}</span>;
          default:
            return String(raw);
        }
      };
      // Never set: it had the module's default. Unknown: say only what it is now.
      const before = change.from === null ? defaults[change.key] : change.from;
      words.push({
        key: change.key,
        label,
        values:
          before === undefined
            ? { to: value(change.to) }
            : { from: value(before), to: value(change.to) },
      });
    }
    if (advanced) words.push({ key: "advanced", label: t("advanced") });
    return words;
  }

  function detailValue(key: string, value: unknown, label: string): ReactNode {
    if (key === "accent") {
      return typeof value === "string" && HEX.test(value) ? (
        <Swatch hex={value} label={label} />
      ) : (
        "—"
      );
    }
    if (key === "shabbatCity") {
      const city = shabbatCityOf(value);
      return city ? tCities(city) : t("noCity");
    }
    if (key === "address") {
      return typeof value === "string" ? value : t("noAddress");
    }
    return typeof value === "string" ? value : "—";
  }

  function describe(entry: ActivityEntry): Described {
    const { line } = entry;
    const plain = (what: ReactNode, href?: string): Described => ({
      what,
      notes: [],
      changes: [],
      href,
    });
    switch (line.action) {
      case "business.create":
        return plain(t("actions.business.create", { invites: line.invites }));
      case "business.details":
        return {
          what: t("actions.business.details"),
          notes: [],
          href: paths.business,
          changes: line.changes.map((change) => {
            return {
              key: change.key,
              label: tDetails(`${change.key}.label`),
              values: {
                from: detailValue(change.key, change.from, t("accentOld")),
                to: detailValue(change.key, change.to, t("accentNew")),
              },
            };
          }),
        };
      case "module.settings":
        return {
          what: t("actions.module.settings", {
            module: moduleName(line.module),
          }),
          notes: [],
          changes: settingChanges(line.module, line.changes),
          href: (manageable as readonly string[]).includes(line.module)
            ? `${paths.manage}/${line.module}`
            : undefined,
        };
      case "wording.change":
        return plain(
          line.to === null
            ? t("actions.wording.clear", { from: line.from ?? "" })
            : t("actions.wording.change", { to: line.to }),
        );
      case "module.enabled":
        return plain(
          t("actions.module.enabled", {
            enabled: String(line.enabled),
            module: moduleName(line.module),
          }),
        );
      case "clock.add":
        return {
          what: line.times.clockOut
            ? t.rich("actions.clock.add", {
                ltr,
                person: who(line.person),
                day: clockDay(line.times),
                in: clockTime(line.times.clockIn),
                out: clockTime(line.times.clockOut),
              })
            : t.rich("actions.clock.addOpen", {
                ltr,
                person: who(line.person),
                day: clockDay(line.times),
                in: clockTime(line.times.clockIn),
              }),
          notes: reasonNotes(line.note),
          changes: [],
        };
      case "clock.correct": {
        // When the fix moved the shift to another day, each side says its day.
        const moved = clockDay(line.from) !== clockDay(line.to);
        const side = (times: ClockTimes) =>
          moved
            ? t.rich("actions.clock.onDay", {
                day: clockDay(times),
                hours: () => hours(times),
              })
            : hours(times);
        const sameHours =
          !moved &&
          clockTime(line.from.clockIn) === clockTime(line.to.clockIn) &&
          (line.from.clockOut && clockTime(line.from.clockOut)) ===
            (line.to.clockOut && clockTime(line.to.clockOut));
        return {
          what: t("actions.clock.correct", {
            person: who(line.person),
            day: clockDay(line.to),
          }),
          notes: reasonNotes(line.note),
          changes: sameHours
            ? []
            : [
                {
                  key: "hours",
                  label: t("actions.clock.hours"),
                  values: { from: side(line.from), to: side(line.to) },
                },
              ],
        };
      }
      case "clock.break_fit":
        return {
          what: t("actions.clock.breakFit", {
            kind: breakFitKind(line.breaks),
            count: line.breaks.length,
            person: who(line.person),
            // The corrected shift's day, as the correction beside it says it;
            // a row from before the start was logged falls back to its first
            // break's.
            day: clockDay({
              clockIn: line.clockIn ?? line.breaks[0].from.clockIn,
              clockOut: null,
            }),
          }),
          notes: [],
          changes: line.breaks.map((pause, index) => ({
            key: `break-${index}`,
            label: t("actions.clock.break"),
            values: {
              from: breakHours(pause.from),
              to: pause.to
                ? breakHours(pause.to)
                : t("actions.clock.breakRemoved"),
            },
          })),
        };
      case "clock.confirm":
        return plain(
          t("actions.clock.confirm", { person: who(line.person) }),
          paths.clockTeam,
        );
      case "clock.code.locked":
        return plain(t("actions.clock.codeLocked"));
      case "profile.bio_cleared":
        // Never the line itself: the log keeps who and when only.
        return plain(
          t("actions.profile.bioCleared", { person: who(line.person) }),
        );
      case "invite.create":
        return plain(
          line.name && line.role
            ? t("actions.invite.create", {
                name: line.name,
                role: roleName(line.role),
              })
            : line.role
              ? t("actions.invite.createNoName", { role: roleName(line.role) })
              : t("actions.invite.createPlain"),
        );
      case "invite.send":
        return plain(
          line.name
            ? t("actions.invite.send", { name: line.name })
            : t("actions.invite.sendNoName"),
        );
      case "invite.claim":
        return plain(
          line.role
            ? t("actions.invite.claim", { role: roleName(line.role) })
            : t("actions.invite.claimPlain"),
        );
      case "view_as.start":
        return plain(
          line.role
            ? t("actions.view_as.start", { role: roleName(line.role) })
            : t("actions.view_as.startPlain"),
        );
      case "view_as.end":
        return plain(t("actions.view_as.end"));
      case "swap.request":
        return plain(
          line.shift
            ? t("actions.swap.request", { shift: shiftWords(line.shift) })
            : t("actions.swap.requestPlain"),
        );
      case "swap.take":
        return plain(
          line.shift && line.from
            ? t("actions.swap.take", {
                from: who(line.from),
                shift: shiftWords(line.shift),
              })
            : t("actions.swap.takePlain"),
        );
      case "swap.cancel":
        return plain(
          line.shift
            ? t("actions.swap.cancel", { shift: shiftWords(line.shift) })
            : t("actions.swap.cancelPlain"),
        );
      case "swap.approve": {
        const people = {
          from: who(line.from),
          to: line.to ? who(line.to) : t("who.unknown"),
        };
        return plain(
          line.shift
            ? t("actions.swap.approveShift", {
                ...people,
                shift: shiftWords(line.shift),
              })
            : t("actions.swap.approve", people),
        );
      }
      case "swap.decline":
        return plain(
          line.shift
            ? t("actions.swap.declineShift", {
                from: who(line.from),
                shift: shiftWords(line.shift),
              })
            : t("actions.swap.decline", { from: who(line.from) }),
        );
      case "schedule.publish":
        return {
          what: t("actions.schedule.publish", {
            first: String(line.first),
            week: shortDate(line.startsOn),
          }),
          notes: [
            t("actions.schedule.shifts", { count: line.shifts }),
            ...(line.swapsRemoved > 0
              ? [
                  t("actions.schedule.swapsRemoved", {
                    count: line.swapsRemoved,
                  }),
                ]
              : []),
          ],
          changes: [],
        };
      case "departments.change":
        return {
          what: t("actions.departments.change"),
          notes: [
            ...(line.added.length > 0
              ? [
                  t("actions.departments.added", {
                    count: line.added.length,
                    names: names(line.added),
                  }),
                ]
              : []),
            ...(line.removed.length > 0
              ? [
                  t("actions.departments.removed", {
                    count: line.removed.length,
                    names: names(line.removed),
                  }),
                ]
              : []),
            ...line.renamed.map((rename) =>
              t("actions.departments.renamed", rename),
            ),
            ...(line.reordered ? [t("actions.departments.reordered")] : []),
          ],
          changes: [],
          href: listsOn ? paths.departments : undefined,
        };
      case "departments.members":
        return {
          what: line.department
            ? t("actions.departments.members", { department: line.department })
            : t("actions.departments.membersPlain"),
          notes: [
            ...(line.added.length > 0
              ? [
                  t("actions.departments.joined", {
                    count: line.added.length,
                    names: names(line.added.map(who)),
                  }),
                ]
              : []),
            ...(line.removed.length > 0
              ? [
                  t("actions.departments.left", {
                    count: line.removed.length,
                    names: names(line.removed.map(who)),
                  }),
                ]
              : []),
          ],
          changes: [],
          href: listsOn ? paths.departments : undefined,
        };
      case "lists.template.save":
        return plain(
          line.created
            ? t("actions.lists.templateCreate", { name: line.name })
            : t("actions.lists.templateSave", { name: line.name }),
        );
      case "lists.template.archive":
        return plain(t("actions.lists.templateArchive", { name: line.name }));
      case "lists.template.restore":
        return plain(t("actions.lists.templateRestore", { name: line.name }));
      case "lists.send":
        return plain(
          t("actions.lists.send", { name: line.name, to: sentTo(line.to) }),
        );
      case "lists.finish":
        return {
          what: line.late
            ? t("actions.lists.finishLate", { name: line.name })
            : t("actions.lists.finish", { name: line.name }),
          notes:
            line.leftOptional > 0
              ? [
                  t("actions.lists.leftOptional", {
                    count: line.leftOptional,
                  }),
                ]
              : [],
          changes: [],
        };
      case "lists.cancel":
        return plain(t("actions.lists.cancel", { name: line.name }));
      case "lists.reopen":
        return plain(
          t("actions.lists.reopen", {
            name: line.name,
            was: line.was ?? "other",
          }),
        );
      case "permission.grant":
      case "permission.revoke": {
        const perm = line.perm === "clock.payroll" ? "payroll" : "other";
        const side = line.action === "permission.grant" ? "to" : "from";
        const whom =
          line.to.kind === "role"
            ? t(`actions.permission.${side}.role`, {
                role: line.to.role ?? "other",
              })
            : t(`actions.permission.${side}.person`, {
                person: who(line.to.person),
              });
        return plain(
          line.action === "permission.grant"
            ? t("actions.permission.grant", { perm, to: whom })
            : t("actions.permission.revoke", { perm, from: whom }),
          paths.access,
        );
      }
      case "wage.set": {
        // The minimum of that day, as the log kept it: under it, it says so.
        const below = line.minimum !== null && line.agorot < line.minimum;
        return {
          what: t.rich("actions.wage.set", {
            ltr,
            person: who(line.person),
            amount: shekels(line.agorot),
            date: fullDate(line.from),
          }),
          notes: [
            ...(below && line.minimum !== null
              ? [
                  t.rich("actions.wage.belowMinimum", {
                    ltr,
                    minimum: shekels(line.minimum),
                  }),
                ]
              : []),
            ...(line.note ? [t("actions.wage.note", { note: line.note })] : []),
          ],
          changes:
            line.previous === null || line.previous === line.agorot
              ? []
              : [
                  {
                    key: "wage",
                    label: t("actions.wage.label"),
                    values: {
                      from: <span dir="ltr">{shekels(line.previous)}</span>,
                      to: <span dir="ltr">{shekels(line.agorot)}</span>,
                    },
                  },
                ],
          href: paths.pay,
        };
      }
      case "payroll.details":
        // Which fields, never their values: the log holds none.
        return plain(
          line.fields.length > 0
            ? t("actions.payroll.details", {
                person: who(line.person),
                fields: names(
                  line.fields.map((field) =>
                    t(`actions.payroll.fields.${field}`),
                  ),
                ),
              })
            : t("actions.payroll.detailsPlain", { person: who(line.person) }),
          paths.pay,
        );
      case "payroll.period": {
        const person = who(line.person);
        const what = line.added
          ? t("actions.payroll.periodAdded", { person })
          : line.fields.length > 0
            ? t("actions.payroll.periodChanged", {
                person,
                fields: names(
                  line.fields.map((field) =>
                    t(`actions.payroll.periodFields.${field}`),
                  ),
                ),
              })
            : t("actions.payroll.periodConfirmed", { person });
        return {
          what,
          notes:
            line.confirmed && line.fields.length > 0
              ? [t("actions.payroll.wasJoined")]
              : [],
          changes: [],
          href: paths.pay,
        };
      }
      case "other":
        return plain(t("actions.other"));
      default: {
        // A new kind of line needs its words here: typecheck says so.
        const unhandled: never = line;
        return unhandled;
      }
    }
  }

  /** One change on one line: what it is now, and what it was when that's known. */
  const changeLine = ({ label, values }: Change) =>
    !values
      ? label
      : values.from === undefined
        ? t.rich("changeTo", { label, to: () => values.to })
        : t.rich("change", {
            label,
            to: () => values.to,
            from: () => values.from,
          });

  const lines = days.map((day) => ({
    ...day,
    title:
      day.relative === "today"
        ? t("today")
        : day.relative === "yesterday"
          ? t("yesterday")
          : dayName(day.date),
    rows: day.entries.map((entry) => ({
      entry,
      time: timeIn(new Date(entry.at), timeZone),
      ...describe(entry),
    })),
  }));

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.manage, label: tManage("title") }}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {clockOn && lines.length > 0 ? (
        <p className="px-1 text-ink-2 text-sm md:max-w-2xl">
          {t.rich("clockNote", {
            link: (chunks) => (
              <Link
                href={paths.clockTeam}
                className="font-medium text-ink underline underline-offset-2"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}

      {lines.length === 0 ? (
        older !== null ? (
          // Everything on these pages went back to what it was.
          <p className="px-1 text-ink-2 md:max-w-2xl">{t("quiet")}</p>
        ) : earlier ? (
          <EmptyState
            headingLevel="h2"
            icon={<History />}
            title={t("noOlder.title")}
            body={t("noOlder.body")}
          >
            <Button asChild variant="secondary">
              <Link href={paths.self}>{t("noOlder.action")}</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            headingLevel="h2"
            icon={<History />}
            title={t("empty.title")}
            body={t("empty.body")}
          >
            <Button asChild variant="secondary">
              <Link href={paths.manage}>{t("empty.action")}</Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="flex flex-col gap-8">
          {lines.map((day) => (
            <PageSection key={day.date} title={day.title}>
              <ListGroup className="md:max-w-2xl xl:hidden">
                {day.rows.map((row) => {
                  const content = {
                    leading: <ActorAvatar actor={row.entry.actor} />,
                    title: who(row.entry.actor),
                    subtitle: (
                      <RowLines
                        what={row.what}
                        more={[...row.notes, ...row.changes.map(changeLine)]}
                      />
                    ),
                    trailing: (
                      <span
                        dir="ltr"
                        className="text-ink-2 text-sm tabular-nums"
                      >
                        {row.time}
                      </span>
                    ),
                  };
                  return row.href ? (
                    <ListRow key={row.entry.id} href={row.href} {...content} />
                  ) : (
                    <ListRow key={row.entry.id} {...content} />
                  );
                })}
              </ListGroup>

              <div className="hidden overflow-hidden rounded-card bg-surface shadow-card xl:block">
                <table className="w-full border-collapse">
                  <caption className="sr-only">
                    {t("caption", { day: dayName(day.date) })}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className={cn(th, "w-24")}>
                        {t("columns.time")}
                      </th>
                      <th scope="col" className={th}>
                        {t("columns.who")}
                      </th>
                      <th scope="col" className={th}>
                        {t("columns.what")}
                      </th>
                      <th scope="col" className={th}>
                        {t("columns.before")}
                      </th>
                      <th scope="col" className={th}>
                        {t("columns.after")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map((row) => (
                      <tr key={row.entry.id}>
                        <td className={cn(td, "text-ink-2 tabular-nums")}>
                          <span dir="ltr">{row.time}</span>
                        </td>
                        <th
                          scope="row"
                          className={cn(td, "text-start font-medium")}
                        >
                          <span className="flex items-center gap-3">
                            <ActorAvatar actor={row.entry.actor} />
                            <span>{who(row.entry.actor)}</span>
                          </span>
                        </th>
                        <td className={td}>
                          <span className="flex flex-col gap-0.5">
                            {row.href ? (
                              <Link
                                href={row.href}
                                className="flex min-h-11 items-center rounded-control font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                              >
                                {row.what}
                              </Link>
                            ) : (
                              <span className="text-ink">{row.what}</span>
                            )}
                            {row.notes.map((note, index) => (
                              <span
                                // biome-ignore lint/suspicious/noArrayIndexKey: a line's notes have no ids and never move
                                key={index}
                                className="text-ink-2 text-sm"
                              >
                                {note}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className={cn(td, "text-ink-2")}>
                          <ChangeCells changes={row.changes} side="from" />
                        </td>
                        <td className={td}>
                          <ChangeCells changes={row.changes} side="to" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PageSection>
          ))}
        </div>
      )}

      {older !== null || earlier ? (
        <nav
          aria-label={t("older")}
          className="flex flex-col gap-2 md:max-w-2xl md:flex-row"
        >
          {older !== null ? (
            <Button asChild variant="secondary">
              <Link href={`${paths.self}?before=${older}`}>{t("older")}</Link>
            </Button>
          ) : null}
          {earlier && lines.length > 0 ? (
            <Button asChild variant="ghost">
              <Link href={paths.self}>{t("newest")}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </PageBody>
  );
}

/** What happened, then a line for each detail of it. */
function RowLines({ what, more }: { what: ReactNode; more: ReactNode[] }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-ink">{what}</span>
      {more.map((text, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a line's details have no ids and never move
        <span key={index}>{text}</span>
      ))}
    </span>
  );
}

/** One side of each change, a line apiece, in the table's before or after column. */
function ChangeCells({
  changes,
  side,
}: {
  changes: Change[];
  side: "from" | "to";
}) {
  if (changes.length === 0) return null;
  return (
    <span className="flex flex-col gap-0.5">
      {changes.map(({ key, label, values }) =>
        !values ? (
          side === "to" ? (
            <span key={key}>{label}</span>
          ) : null
        ) : (
          <span key={key}>
            <span className="text-ink-2">{label}: </span>
            {side === "to" ? values.to : (values.from ?? "—")}
          </span>
        ),
      )}
    </span>
  );
}
