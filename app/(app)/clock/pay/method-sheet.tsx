"use client";

import { Button } from "@ui/button";
import { Sheet } from "@ui/sheet";
import { Calculator } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * "איך זה מחושב": the way the hours become rates and an estimate, in plain
 * words, in a sheet (payroll P7, plan §10). For a pay holder it adds that some
 * rules wait for an accountant, and how each week of a business whose week
 * isn't set was worked out; for a worker, only how their own month is read.
 * Each week is a short row under one heading (`weeks.row`), since the page
 * already says once that the week isn't set and where to set it; P6's
 * sentence per week (`modules.time_clock.payroll.notes.workWeekUnset`), which
 * says both every time, is kept for P8's file.
 */
export function MethodButton({
  audience,
  weeks = [],
}: {
  audience: "payroll" | "worker";
  /** How each week was worked out, while the business's week isn't set. */
  weeks?: readonly { weekOf: string; used: "five" | "six" | "smaller" }[];
}) {
  const t = useTranslations("app.pay.method");
  const format = useFormatter();
  // Mounted closed, so it opens already inside the business's colour.
  const [open, setOpen] = useState(false);
  const date = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
  const steps: { key: string; text: ReactNode }[] = [
    { key: "hours", text: t("hours") },
    { key: "day", text: t.rich("day", { ltr }) },
    { key: "week", text: t.rich("week", { ltr }) },
    { key: "rest", text: t("rest") },
    { key: "holidayPay", text: t("holidayPay") },
    { key: "amounts", text: t("amounts") },
    ...(audience === "payroll"
      ? [{ key: "readings", text: t("readings") }]
      : []),
    { key: "excluded", text: t("excluded") },
  ];

  return (
    <>
      <Button
        variant="secondary"
        size="lg"
        onClick={() => setOpen(true)}
        className="self-start"
      >
        <Calculator aria-hidden="true" />
        {t("open")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        closeLabel={t("close")}
        readingLabel={t("title")}
      >
        <div className="flex flex-col gap-4 px-2 pb-2">
          <ol className="flex list-decimal flex-col gap-2 ps-6 text-ink">
            {steps.map((step) => (
              <li key={step.key}>{step.text}</li>
            ))}
          </ol>
          {audience === "payroll" && weeks.length > 0 ? (
            <section className="flex flex-col gap-1">
              <h3 className="font-semibold text-ink">{t("weeks.title")}</h3>
              <ul className="flex flex-col gap-1 text-ink-2">
                {weeks.map((week) => (
                  <li key={week.weekOf}>
                    {t.rich("weeks.row", {
                      ltr,
                      weekOf: date(week.weekOf),
                      used: week.used,
                    })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
