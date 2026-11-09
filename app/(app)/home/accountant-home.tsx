import { instantIn } from "@domain/availability";
import { firstNameOf } from "@domain/people";
import { clockAt, dayPart } from "@domain/today";
import { Ambient } from "@ui/ambient";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { PersonAvatar } from "@ui/person-row";
import {
  Bell,
  CircleCheck,
  Clock3,
  PencilLine,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import { getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import type { PayHomeData } from "../clock/pay/pay";
import { useHoursText, useMonthName } from "../clock/pay/pay-parts";
import { type AppWording, translator } from "../wording";
import { RefreshOnReturn } from "./refresh-on-return";

export type AccountantHomeData = {
  /** ISO timestamp of the moment the screen is read. */
  now: string;
  timeZone: string;
  name: string | null;
  photo: string | null;
  businessName: string;
  /** Null when the business has the clock off: no hours come yet. */
  pay: PayHomeData | null;
  /** The bell and how many lines are unread; null when there is none. */
  bell: { unread: number } | null;
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * Home for someone off the staff, who does the books (payroll P3): the month
 * to pay and its one action, what to look at before paying, and on a desktop
 * the months before. Nothing to punch, no schedule. Phone: one under the
 * other. Tablet: the hero beside the card. Desktop: a third column with the
 * months before. With the clock off, a card says the hours come once it is on.
 * `base` keeps the links inside the demo on /design/shell.
 */
export async function AccountantHome({
  data,
  wording,
  base = "",
}: {
  data: AccountantHomeData;
  wording: AppWording;
  base?: string;
}) {
  const t = translator(wording, "app");
  const format = await getFormatter();
  const clock = clockAt(new Date(data.now), data.timeZone);
  const path = (to: string) => `${base}${to}`;
  const { pay } = data;
  const payHref = (month: string) => path(`/clock/pay?month=${month}`);

  return (
    <div className="relative isolate">
      <Ambient className="xl:-start-[17.5rem]" />
      <RefreshOnReturn />
      <PageBody>
        <div className="flex items-center gap-3">
          <Link
            href={path("/me")}
            aria-label={t("me.open")}
            title={t("me.open")}
            className="pressable shrink-0 rounded-full p-0.5 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <PersonAvatar name={data.name} photo={data.photo} />
          </Link>
          <div className="min-w-0 flex-1">
            <PageHeader
              eyebrow={t("home.eyebrow", {
                date: format.dateTime(
                  instantIn(clock.date, "12:00", data.timeZone),
                  {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: data.timeZone,
                  },
                ),
                business: data.businessName,
              })}
              title={
                data.name
                  ? t("home.greeting", {
                      part: dayPart(clock.time),
                      name: firstNameOf(data.name),
                    })
                  : t("home.title")
              }
            />
          </div>
          {data.bell ? (
            <IconButton
              href={path("/notifications")}
              label={t("notifications.bell")}
              badge={{
                count: data.bell.unread,
                label: t("notifications.bellCount", {
                  count: data.bell.unread,
                }),
              }}
              icon={<Bell />}
              variant="ghost"
            />
          ) : null}
        </div>

        {pay ? (
          <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] xl:gap-8">
            <PayMonthCard
              pay={pay}
              wording={wording}
              href={payHref(pay.month)}
            />
            <BeforeCard pay={pay} wording={wording} href={payHref(pay.month)} />
            <div className="hidden xl:block">
              <EarlierMonths pay={pay} wording={wording} hrefFor={payHref} />
            </div>
          </div>
        ) : (
          <Card
            tone="flat"
            padding="lg"
            className="flex flex-col gap-2 md:max-w-xl"
          >
            <CardTitle as="h2">{t("home.accountant.noClock.title")}</CardTitle>
            <CardText>{t("home.accountant.noClock.body")}</CardText>
          </Card>
        )}
      </PageBody>
    </div>
  );
}

/** The month to pay, on the business's colour, with the screen's one action. */
function PayMonthCard({
  pay,
  wording,
  href,
}: {
  pay: PayHomeData;
  wording: AppWording;
  href: string;
}) {
  const t = translator(wording, "app.home.accountant");
  const tPay = translator(wording, "app.pay");
  const hours = useHoursText();
  const format = useMonthOnly();
  const label = t("title", { month: format(pay.month) });
  return (
    <section aria-label={label}>
      <Card tone="hero" padding="lg" className="flex flex-col gap-4">
        <h2 className="font-medium text-base">{label}</h2>
        <p>
          {tPay.rich("hours", {
            hours: hours(pay.minutes),
            ltr: (chunks) => (
              <span dir="ltr" className="font-bold text-2xl tabular-nums">
                {chunks}
              </span>
            ),
          })}
          <span className="block text-base">
            {tPay("caption", { people: pay.people, toCheck: pay.toCheck })}
          </span>
        </p>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="bg-accent-ink text-accent hover:bg-accent-ink hover:opacity-90 active:bg-accent-ink focus-visible:outline-accent-ink"
        >
          <Link href={href}>
            <ReceiptText aria-hidden="true" />
            {t("open")}
          </Link>
        </Button>
      </Card>
    </section>
  );
}

/** A month's name alone, as the hero says it. */
function useMonthOnly(): (month: string) => string {
  const format = useFormatter();
  return (month) =>
    format.dateTime(new Date(`${month}-15T12:00:00Z`), {
      month: "long",
      timeZone: "UTC",
    });
}

/** What to look at before paying, each leading into the month. */
function BeforeCard({
  pay,
  wording,
  href,
}: {
  pay: PayHomeData;
  wording: AppWording;
  href: string;
}) {
  const t = translator(wording, "app.home.accountant");
  const tPay = translator(wording, "app.pay.beforePayroll");
  const rows = [
    pay.before.ownerOnly > 0
      ? {
          key: "ownerOnly",
          icon: <Clock3 />,
          text: tPay("ownerOnly", { count: pay.before.ownerOnly }),
        }
      : null,
    pay.before.waiting > 0
      ? {
          key: "waiting",
          icon: <Clock3 />,
          text: tPay("waiting", { count: pay.before.waiting }),
        }
      : null,
    pay.before.open > 0
      ? {
          key: "open",
          icon: <Clock3 />,
          text: tPay("open", { count: pay.before.open }),
        }
      : null,
    pay.before.corrected > 0
      ? {
          key: "corrected",
          icon: <PencilLine />,
          text: tPay("corrected", { count: pay.before.corrected }),
        }
      : null,
  ].filter((row) => row !== null);
  return (
    <PageSection title={t("before.title")}>
      {rows.length > 0 ? (
        <ListGroup>
          {rows.map((row) => (
            <ListRow
              key={row.key}
              href={href}
              leading={row.icon}
              title={row.text}
            />
          ))}
        </ListGroup>
      ) : pay.people === 0 ? (
        // No hours at all: nothing is "closed and approved" yet.
        <Card>
          <p className="text-ink-2">{t("before.noHours")}</p>
        </Card>
      ) : (
        <Card className="flex items-start gap-3">
          <CircleCheck
            aria-hidden="true"
            className="size-5 shrink-0 text-success"
          />
          <p className="text-ink-2">{t("before.nothing")}</p>
        </Card>
      )}
      {pay.before.rounding ? (
        <p className="px-1 text-ink-2 text-sm">{tPay("rounding")}</p>
      ) : null}
    </PageSection>
  );
}

/** The months before, for a desktop: each with its hours, leading to it. */
function EarlierMonths({
  pay,
  wording,
  hrefFor,
}: {
  pay: PayHomeData;
  wording: AppWording;
  hrefFor: (month: string) => string;
}) {
  const t = translator(wording, "app.home.accountant");
  const hours = useHoursText();
  const monthName = useMonthName();
  return (
    <PageSection title={t("earlier.title")}>
      <ListGroup>
        {pay.earlier.map((month) => (
          <ListRow
            key={month.month}
            href={hrefFor(month.month)}
            title={monthName(month.month)}
            subtitle={t.rich("earlier.row", {
              ltr,
              hours: hours(month.minutes),
            })}
          />
        ))}
      </ListGroup>
    </PageSection>
  );
}
