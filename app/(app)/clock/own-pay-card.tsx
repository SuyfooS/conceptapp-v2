import {
  flagValues,
  hasEstimate,
  ratesShown,
  restNameOf,
} from "@domain/pay-rates";
import type { OneOffRestDayKey } from "@domain/payroll-calendar";
import { Card } from "@ui/card";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../wording";
import type { OwnPay } from "./clock-types";
import { MethodButton } from "./pay/method-sheet";
import { useMonthName, useShekels, useShortDate } from "./pay/pay-parts";
import { type ClockT, RateText, useFlagFormat } from "./pay/rates-parts";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The person's own month in shekels (payroll P7; Orel, 9 November 2026): an
 * estimate before tax, labelled so, with the hours at each rate, the pay for
 * a holiday or election day not worked and what it depends on, the wage it
 * was worked out by, what it leaves out and how it is worked out. Their own
 * adult limits in neutral words, and for a minor only that it's worth talking
 * to the business. Nobody else's. A flat card everywhere, the total at
 * `text-xl` (plan §10.2): on `/clock` the punch circle is the screen's hero,
 * on the history the month is. A shift still open is said apart: the clock's
 * hours count it up to now, the estimate once it ends. A month with nothing
 * to estimate says what comes; the history leaves the card out then.
 */
export function OwnPayCard({
  pay,
  wording,
}: {
  pay: OwnPay;
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock.ownPay");
  const tPay = translator(wording, "app.pay");
  const tc: ClockT = translator(wording, "modules.time_clock");
  const monthName = useMonthName();
  const shekels = useShekels();
  const date = useShortDate();
  const format = useFlagFormat(tc);
  const rest = restNameOf(pay.restDay);
  const titleId = `own-pay-${pay.month}`;
  // Hours at a rate, or pay for a day not worked: either is an estimate.
  const worked = hasEstimate(pay);
  const rates = ratesShown(pay.buckets);
  const open =
    pay.open > 0 ? (
      <p className="text-ink-2">{t("openShift", { count: pay.open })}</p>
    ) : null;

  const holidayLines = pay.holidayPay.map((line) => {
    if (line.holiday) {
      const holiday = tc(`holidays.${line.holiday}`);
      return {
        key: line.date,
        text:
          line.agorot !== null
            ? t.rich("holidayPay", {
                ltr,
                holiday,
                amount: shekels(line.agorot),
              })
            : line.averageMinutes === null
              ? t("holidayPayNoAverage", { holiday })
              : t("holidayPayNoAmount", { holiday }),
      };
    }
    const day = tc(
      `oneOffRestDays.${(line.oneOffRestDay ?? "") as OneOffRestDayKey}`,
    );
    return {
      key: line.date,
      text:
        line.agorot !== null
          ? t.rich("oneOff", {
              ltr,
              day,
              amount: shekels(line.agorot),
              form: pay.form,
            })
          : line.averageMinutes === null
            ? t("oneOffNoAverage", { day, form: pay.form })
            : t("oneOffNoAmount", { day, form: pay.form }),
    };
  });

  return (
    <section aria-labelledby={titleId}>
      <Card padding="lg" className="flex flex-col gap-3">
        <h2 id={titleId} className="font-semibold text-ink text-md">
          {t("title", { month: monthName(pay.month) })}
        </h2>
        {!worked ? (
          // Only a shift still running: it counts once it ends.
          (open ?? <p className="text-ink-2">{t("empty")}</p>)
        ) : (
          <>
            {pay.estimateAgorot !== null ? (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span
                  dir="ltr"
                  className="font-bold text-ink text-xl tabular-nums"
                >
                  {shekels(pay.estimateAgorot)}
                </span>
                <span className="font-medium text-ink">{t("label")}</span>
              </p>
            ) : (
              <p className="font-medium text-warning">
                {t("missingWage", { business: pay.business })}
              </p>
            )}
            {rates.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-ink">
                {rates.map((bucket) => (
                  <li key={bucket}>
                    <RateText
                      bucket={bucket}
                      minutes={pay.buckets[bucket]}
                      rest={rest}
                      t={tPay}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {holidayLines.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-ink">
                {holidayLines.map((line) => (
                  <li key={line.key}>{line.text}</li>
                ))}
              </ul>
            ) : null}
            {open}
            {pay.limits.length > 0 || pay.minor ? (
              <ul className="flex flex-col gap-0.5 text-ink">
                {pay.limits.map((flag) => (
                  <li
                    key={`${flag.code}:${"date" in flag ? flag.date : flag.weekOf}`}
                  >
                    {t.rich(`limits.${flag.code}`, {
                      ...flagValues(flag, format),
                      ltr,
                    })}
                  </li>
                ))}
                {pay.minor ? (
                  <li>{t("minor", { business: pay.business })}</li>
                ) : null}
              </ul>
            ) : null}
            <div className="flex flex-col gap-0.5 text-ink-2 text-sm">
              {pay.wages.length === 1 && pay.wages[0] ? (
                <p>
                  {t.rich("basis", {
                    ltr,
                    amount: shekels(pay.wages[0].agorot),
                  })}
                </p>
              ) : pay.wages.length > 1 ? (
                <>
                  <p>{t("basisChanged")}</p>
                  <ul>
                    {pay.wages.map((wage) => (
                      <li key={wage.from}>
                        {t.rich("wageSpan", {
                          ltr,
                          from: date(wage.from),
                          to: date(wage.to),
                          amount: shekels(wage.agorot),
                        })}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p>{t("excluded")}</p>
            </div>
          </>
        )}
        <MethodButton audience="worker" />
      </Card>
    </section>
  );
}
