import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { PageBody, PageHeader } from "@ui/page";
import { Copy, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  assigned,
  byId,
  days,
  firstName,
  initials,
  missingAvailability,
  openSlots,
  shiftFor,
  staff,
  totalOpenSlots,
  weeklyHours,
} from "../data";
import { PhoneDay } from "./phone-day";

const th = "px-3 py-2.5 text-start font-medium text-ink-2 text-sm";

/** Tablet: shifts down the side, days across — the shape of the paper schedule. */
function TabletWeek() {
  const t = useTranslations("shell.schedule");
  const tDays = useTranslations("days");
  const rows = [
    { key: "m", name: t("morning") },
    { key: "e", name: t("evening") },
  ] as const;
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <table className="w-full min-w-[640px] table-fixed border-collapse">
        <thead>
          <tr className="border-line border-b bg-surface-2">
            <th scope="col" className={cn(th, "w-20")}>
              <span className="sr-only">{t("shift")}</span>
            </th>
            {days.map((d) => (
              <th key={d.key} scope="col" className={cn(th, "text-center")}>
                <span className="block text-ink">
                  {tDays(`${d.key}.short`)}
                </span>
                <span className="block text-sm">{d.date}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-line border-b last:border-b-0">
              <th scope="row" className={cn(th, "align-top text-ink")}>
                {row.name}
              </th>
              {days.map((d) => {
                const shift = d.shifts.find((s) => s.key === row.key);
                if (!shift) {
                  return (
                    <td
                      key={d.key}
                      className="bg-surface-2/60 p-2 text-center align-top text-ink-2 text-sm"
                    >
                      {t("closed")}
                    </td>
                  );
                }
                const people = assigned(d, shift);
                const missing = shift.needed - people.length;
                return (
                  <td key={d.key} className="p-1.5 align-top">
                    <ul className="flex flex-col gap-1">
                      {people.map((id) => (
                        <li
                          key={id}
                          className="truncate rounded-[6px] bg-surface-2 px-1.5 py-1 text-center text-sm"
                        >
                          {firstName(byId[id]?.name ?? "")}
                        </li>
                      ))}
                      {missing > 0 ? (
                        <li className="rounded-[6px] border border-warning/50 border-dashed px-1.5 py-1 text-center text-sm text-warning">
                          {t("missing", { count: missing })}
                        </li>
                      ) : null}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Desktop: one row per person, the full week across, with weekly hours. */
function DesktopWeek() {
  const t = useTranslations("shell.schedule");
  const tDays = useTranslations("days");
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-line border-b bg-surface-2">
            <th scope="col" className={cn(th, "w-56")}>
              {t("worker")}
            </th>
            {days.map((d) => (
              <th key={d.key} scope="col" className={cn(th, "text-center")}>
                <span className="text-ink">
                  {t("dayHeader", { day: tDays(`${d.key}.short`) })}
                </span>{" "}
                <span>{d.date}.10</span>
              </th>
            ))}
            <th scope="col" className={cn(th, "w-24 text-center")}>
              {t("hours")}
            </th>
          </tr>
        </thead>
        <tbody>
          {staff.map((p) => (
            <tr
              key={p.id}
              className="border-line border-b hover:bg-surface-2/50"
            >
              <th scope="row" className="px-3 py-2 text-start font-normal">
                <span className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-ink-2 text-sm">
                    {initials(p.name)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="flex items-center gap-2 text-ink-2 text-sm">
                      {p.role}
                      {missingAvailability.includes(p.id) ? (
                        <Badge tone="warning" className="h-5 px-2 text-[12px]">
                          {t("noAvailability")}
                        </Badge>
                      ) : null}
                    </span>
                  </span>
                </span>
              </th>
              {days.map((d) => {
                const shift = shiftFor(p.id, d);
                return (
                  <td key={d.key} className="p-1.5 text-center">
                    {shift ? (
                      <span
                        className={cn(
                          "flex flex-col items-center rounded-[8px] px-1 py-1.5",
                          shift.key === "m" ? "bg-accent-soft" : "bg-surface-2",
                        )}
                      >
                        <span className="font-medium text-sm">
                          {shift.name}
                        </span>
                        <span dir="ltr" className="text-[12px] text-ink-2">
                          {shift.time}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-2 text-sm">—</span>
                    )}
                  </td>
                );
              })}
              <td className="text-center font-medium tabular-nums">
                {weeklyHours(p.id)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2">
            <th scope="row" className={cn(th, "text-ink")}>
              {t("coverage")}
            </th>
            {days.map((d) => {
              const open = openSlots(d);
              return (
                <td key={d.key} className="px-1.5 py-2.5 text-center text-sm">
                  {open > 0 ? (
                    <span className="font-medium text-warning">
                      {t("missing", { count: open })}
                    </span>
                  ) : (
                    <span className="text-success">{t("full")}</span>
                  )}
                </td>
              );
            })}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function ShellSchedule() {
  const t = useTranslations("shell.schedule");
  return (
    <PageBody>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Button variant="secondary">
              <Copy aria-hidden="true" />
              {t("copy")}
            </Button>
            <Button>
              <Send aria-hidden="true" className="rtl:-scale-x-100" />
              {t("publish")}
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone="warning">
          {t("openSlots", { count: totalOpenSlots })}
        </Badge>
        <Badge tone="warning">
          {t("missingAvailability", { count: missingAvailability.length })}
        </Badge>
        <Badge>{t("weekendRule")}</Badge>
      </div>

      <div className="md:hidden">
        <PhoneDay />
      </div>
      <div className="hidden md:block xl:hidden">
        <TabletWeek />
      </div>
      <div className="hidden xl:block">
        <DesktopWeek />
      </div>
    </PageBody>
  );
}
