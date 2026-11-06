import type { WeekScheduleShift } from "@db/schedule";
import { weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { type Approval, approvalsFor } from "@domain/swaps";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { PublishedSchedule } from "../week";
import type { DecideState } from "./actions";
import { DecideButton } from "./decide-button";

type T = Awaited<ReturnType<typeof getTranslations<"app">>>;
type DecideAction = (
  state: DecideState,
  form: FormData,
) => Promise<DecideState>;
type Row = Approval<WeekScheduleShift>;
type ViewProps = { t: T; data: PublishedSchedule; decide: DecideAction };

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const weekday = (t: T, date: string) =>
  t(`availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);

/** The requests waiting for a manager, from today on, in both weeks. */
export function pendingApprovals(data: PublishedSchedule): Row[] {
  return approvalsFor(
    data.swaps,
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    data.today,
  );
}

/**
 * The manager's list of shifts colleagues took, to approve or decline.
 * Phone: one request under the other; tablet: two columns of cards;
 * desktop: one table with the people in columns. `decide` is
 * `decideSwapAction`, or the demo's stand-in. Also rendered with mock
 * data on /design/shell/schedule/swaps.
 */
export async function SwapApprovalsView({
  data,
  decide,
}: {
  data: PublishedSchedule;
  decide: DecideAction;
}) {
  const t = await getTranslations("app");
  const rows = pendingApprovals(data);
  const view = { t, data, decide };
  const title = t("swaps.list.title");
  return (
    <PageBody>
      <PageHeader title={t("swaps.title")} subtitle={t("swaps.subtitle")} />
      <PageSection
        title={title}
        action={
          rows.length > 0 ? (
            <Badge tone="warning">
              {t("swaps.count", { count: rows.length })}
            </Badge>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <Card tone="flat" padding="lg" className="md:max-w-xl">
            <CardText>{t("swaps.empty")}</CardText>
          </Card>
        ) : (
          <>
            <p className="text-ink-2 text-sm md:max-w-xl">
              {t("swaps.explain")}
            </p>
            <ul
              aria-label={title}
              className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:hidden"
            >
              {rows.map((row) => (
                <RequestCard key={row.swap.id} {...view} row={row} />
              ))}
            </ul>
            <RequestTable {...view} rows={rows} title={title} />
          </>
        )}
      </PageSection>
    </PageBody>
  );
}

function people(t: T, data: PublishedSchedule, row: Row) {
  const name = (userId: string) =>
    data.people.find((p) => p.userId === userId)?.name ?? t("shifts.noName");
  return { from: name(row.swap.requestedBy), to: name(row.swap.takenBy) };
}

const positionName = (t: T, data: PublishedSchedule, row: Row) =>
  data.positions.find((p) => p.key === row.position)?.name ??
  t("swaps.noPosition");

const dayLabel = (t: T, row: Row) =>
  t("shifts.day", {
    day: weekday(t, row.shift.day),
    date: dayMonth(row.shift.day),
  });

function subject(t: T, data: PublishedSchedule, row: Row) {
  return t("swaps.subject", {
    ...people(t, data, row),
    shift: t("shifts.shift", {
      name: row.shift.name,
      day: weekday(t, row.shift.day),
      date: dayMonth(row.shift.day),
    }),
  });
}

function Decide({
  t,
  data,
  decide,
  row,
  className,
}: ViewProps & { row: Row; className?: string }) {
  const about = subject(t, data, row);
  return (
    <div className={cn("flex flex-wrap items-start gap-2", className)}>
      <DecideButton
        action={decide}
        decision="approve"
        id={row.swap.id}
        subject={about}
      />
      <DecideButton
        action={decide}
        decision="decline"
        id={row.swap.id}
        subject={about}
      />
    </div>
  );
}

function RequestCard(props: ViewProps & { row: Row }) {
  const { t, data, row } = props;
  const { from, to } = people(t, data, row);
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-4">
      <span className="font-medium">{dayLabel(t, row)}</span>
      <span className="text-ink-2 text-sm">
        {t.rich("shifts.mine.line", {
          name: row.shift.name,
          start: row.shift.start,
          end: row.shift.end,
          ltr,
        })}
        {` · ${positionName(t, data, row)}`}
      </span>
      <p className="break-words text-sm">{t("swaps.people", { from, to })}</p>
      <Decide {...props} className="pt-2" />
    </li>
  );
}

const th = "px-3 py-2.5 text-start align-bottom font-medium text-ink-2 text-sm";
const td = "px-3 py-3 align-top";

function RequestTable(props: ViewProps & { rows: Row[]; title: string }) {
  const { t, data, rows, title } = props;
  const columns = ["day", "shift", "position", "from", "to"] as const;
  return (
    <div className="hidden overflow-x-auto rounded-card border border-line bg-surface xl:block">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr className="border-line border-b bg-surface-2">
            {columns.map((c) => (
              <th key={c} scope="col" className={th}>
                {t(`swaps.columns.${c}`)}
              </th>
            ))}
            <th scope="col" className={th}>
              <span className="sr-only">{t("swaps.columns.decision")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { from, to } = people(t, data, row);
            return (
              <tr
                key={row.swap.id}
                className="border-line border-b last:border-b-0"
              >
                <th scope="row" className={cn(td, "text-start font-medium")}>
                  {dayLabel(t, row)}
                </th>
                <td className={td}>
                  {row.shift.name}
                  <span className="block text-ink-2">
                    {t.rich("shifts.time", {
                      start: row.shift.start,
                      end: row.shift.end,
                      ltr,
                    })}
                  </span>
                </td>
                <td className={td}>{positionName(t, data, row)}</td>
                <td className={cn(td, "break-words")}>{from}</td>
                <td className={cn(td, "break-words")}>{to}</td>
                <td className={td}>
                  <Decide {...props} row={row} className="justify-end" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
