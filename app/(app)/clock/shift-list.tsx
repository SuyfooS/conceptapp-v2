import type { ShiftRecord } from "@domain/time-clock";
import { formatHours } from "@domain/time-clock-format";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const th = "px-4 py-3 text-start font-medium text-ink-2 text-sm";
const td = "border-line border-t px-4 py-3";

function useDayLabel() {
  const format = useFormatter();
  return (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "long",
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
}

/**
 * Shifts as a list on phones and tablets and as a table on desktop. Each shows
 * the times, the break and what it counted for.
 */
export function ShiftList({
  records,
  onEdit,
  className,
}: {
  records: ShiftRecord[];
  /** For a manager: pressing a shift offers to correct it. */
  onEdit?: (record: ShiftRecord) => void;
  className?: string;
}) {
  return (
    <>
      <ShiftRows
        records={records}
        onEdit={onEdit}
        className={cn("xl:hidden", className)}
      />
      <ShiftTable records={records} onEdit={onEdit} className={className} />
    </>
  );
}

function StateBadge({ record }: { record: ShiftRecord }) {
  const t = useTranslations("app.clock.history");
  return record.overdue ? (
    <Badge tone="danger">{t("needsFix")}</Badge>
  ) : (
    <Badge tone="accent">{t("now")}</Badge>
  );
}

function ShiftRows({
  records,
  onEdit,
  className,
}: {
  records: ShiftRecord[];
  onEdit?: (record: ShiftRecord) => void;
  className?: string;
}) {
  const t = useTranslations("app.clock.history");
  const dayLabel = useDayLabel();
  return (
    <ListGroup className={className}>
      {records.map((record) => {
        const row = {
          title: dayLabel(record.date),
          subtitle: (
            <>
              {record.out
                ? t.rich("times", { in: record.in, out: record.out, ltr })
                : t.rich("since", { in: record.in, ltr })}
              {record.breakMinutes > 0
                ? t("withBreak", { minutes: record.breakMinutes })
                : null}
              {record.byManager ? t("byManager") : null}
            </>
          ),
          trailing: (
            <span className="flex items-center gap-2">
              {record.out ? null : <StateBadge record={record} />}
              {record.out || record.overdue ? (
                <span dir="ltr" className="font-semibold text-ink tabular-nums">
                  {formatHours(record.minutes)}
                </span>
              ) : null}
            </span>
          ),
        };
        return onEdit ? (
          <ListRow key={record.id} {...row} onClick={() => onEdit(record)} />
        ) : (
          <ListRow key={record.id} {...row} />
        );
      })}
    </ListGroup>
  );
}

function ShiftTable({
  records,
  onEdit,
  className,
}: {
  records: ShiftRecord[];
  onEdit?: (record: ShiftRecord) => void;
  className?: string;
}) {
  const t = useTranslations("app.clock.history");
  const dayLabel = useDayLabel();
  return (
    <div
      className={cn(
        "hidden overflow-hidden rounded-card bg-surface shadow-card xl:block",
        className,
      )}
    >
      <table className="w-full border-collapse">
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {t("columns.day")}
            </th>
            <th scope="col" className={th}>
              {t("columns.in")}
            </th>
            <th scope="col" className={th}>
              {t("columns.out")}
            </th>
            <th scope="col" className={th}>
              {t("columns.break")}
            </th>
            <th scope="col" className={th}>
              {t("columns.hours")}
            </th>
            {onEdit ? (
              <th scope="col" className={th}>
                <span className="sr-only">{t("columns.fix")}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <th
                scope="row"
                className={cn(td, "text-start font-medium text-ink")}
              >
                {dayLabel(record.date)}
                {record.byManager ? (
                  <span className="block font-normal text-ink-2 text-sm">
                    {t("addedByManager")}
                  </span>
                ) : null}
              </th>
              <td className={cn(td, "tabular-nums")}>
                <span dir="ltr">{record.in}</span>
              </td>
              <td className={cn(td, "tabular-nums")}>
                {record.out ? (
                  <span dir="ltr">{record.out}</span>
                ) : (
                  <StateBadge record={record} />
                )}
              </td>
              <td className={cn(td, "text-ink-2")}>
                {record.breakMinutes > 0
                  ? t("breakMinutes", { minutes: record.breakMinutes })
                  : t("noBreak")}
              </td>
              <td className={cn(td, "font-semibold tabular-nums")}>
                {record.out || record.overdue ? (
                  <span dir="ltr">{formatHours(record.minutes)}</span>
                ) : (
                  t("running")
                )}
              </td>
              {onEdit ? (
                <td className={cn(td, "text-end")}>
                  <Button
                    variant="ghost"
                    aria-label={t("fixShift", { day: dayLabel(record.date) })}
                    onClick={() => onEdit(record)}
                  >
                    {t("fix")}
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
