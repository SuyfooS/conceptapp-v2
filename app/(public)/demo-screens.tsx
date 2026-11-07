import { Ambient } from "@ui/ambient";
import { Avatar, AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { CoverageBar } from "@ui/coverage-bar";
import { ListGroup, ListRow } from "@ui/list-row";
import { PunchCircle } from "@ui/punch-circle";
import { Check, Clock, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const FIRST_DATE = 15;
const SELECTED_DAY = 2;

/**
 * The app's screens as pictures, with sample data from the message files: the
 * same components the app uses, and no real business behind them.
 */
export async function TodayDemo() {
  const t = await getTranslations("landing.demo.today");
  return (
    <div className="relative isolate flex flex-col gap-3 px-3 pt-11 pb-5">
      <Ambient />
      <div className="px-2">
        <p className="text-base text-ink-2">{t("day")}</p>
        <p className="font-bold text-xl">{t("greeting")}</p>
      </div>
      <div>
        <Card
          tone="hero"
          padding="lg"
          className="grain relative flex flex-col gap-1 pb-16"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-base">{t("heroLabel")}</span>
            <span className="rounded-full bg-black/20 px-3 py-1 font-semibold text-sm">
              {t("heroWhen")}
            </span>
          </div>
          <p className="mt-2 font-bold text-2xl">
            {t.rich("heroTitle", { ltr })}
          </p>
          <p className="text-base">{t.rich("heroBody", { ltr })}</p>
          <div className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent-ink font-semibold text-accent">
            <Clock aria-hidden="true" className="size-5" />
            {t("punch")}
          </div>
        </Card>
        <Card
          tone="float"
          className="relative mx-3 -mt-11 flex items-center gap-2.5 p-3"
        >
          <Avatar name={t("requestPerson")} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-base">{t("requestTitle")}</p>
            <p className="text-ink-2 text-sm">{t("requestBody")}</p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2">
            <X aria-hidden="true" className="size-5" />
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
            <Check aria-hidden="true" className="size-5" />
          </span>
        </Card>
      </div>
      <p className="mt-2 px-2 font-bold text-lg">{t("onShift")}</p>
      <ListGroup>
        <ListRow
          leading={<Avatar name={t("person1")} />}
          title={t("person1")}
          subtitle={t("person1Role")}
          trailing={
            <Badge tone="success">
              <span>{t.rich("person1Since", { ltr })}</span>
            </Badge>
          }
        />
        <ListRow
          leading={<Avatar name={t("person2")} />}
          title={t("person2")}
          subtitle={t("person2Role")}
          trailing={
            <Badge tone="success">
              <span>{t.rich("person2Since", { ltr })}</span>
            </Badge>
          }
        />
        <ListRow
          leading={<Avatar name={t("person3")} />}
          title={t("person3")}
          subtitle={t("person3Role")}
          trailing={<Badge tone="warning">{t("person3Late")}</Badge>}
        />
      </ListGroup>
    </div>
  );
}

export async function ScheduleDemo() {
  const t = await getTranslations("landing.demo.schedule");
  const tDays = await getTranslations("days");
  return (
    <div
      role="img"
      aria-label={t("label")}
      className="flex flex-col gap-2 rounded-[28px] bg-bg p-2"
    >
      <div className="grid grid-cols-7 gap-0.5">
        {DAYS.map((day, i) => (
          <div
            key={day}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-[18px]",
              i === SELECTED_DAY && "bg-ink text-bg",
            )}
          >
            <span
              className={cn(
                "text-[12px] leading-4",
                i !== SELECTED_DAY && "text-ink-2",
              )}
            >
              {tDays(`${day}.short`)}
            </span>
            <span className="font-bold text-[19px] leading-6">
              {FIRST_DATE + i}
            </span>
          </div>
        ))}
      </div>
      <Card className="flex flex-col gap-3 rounded-[22px]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-lg">{t("shift")}</p>
            <p className="text-base text-ink-2">{t.rich("hours", { ltr })}</p>
          </div>
          <Badge tone="warning">{t("missing")}</Badge>
        </div>
        <CoverageBar filled={2} total={3} />
        <div className="flex items-center gap-2">
          <AvatarStack names={[t("person1"), t("person2")]} />
          <span className="min-w-0 text-base text-ink-2">{t("names")}</span>
        </div>
      </Card>
    </div>
  );
}

const LOG = ["1", "2", "3"] as const;

export async function ManageDemo() {
  const t = await getTranslations("landing.demo.manage");
  return (
    <div
      role="img"
      aria-label={t("label")}
      className="flex flex-col gap-2 rounded-[28px] bg-bg p-2"
    >
      <p className="px-3 pt-2 font-bold text-lg">{t("title")}</p>
      <ListGroup className="rounded-[22px]">
        {LOG.map((n) => (
          <ListRow
            key={n}
            leading={<Avatar name={t(`person${n}`)} />}
            title={t(`action${n}`)}
            subtitle={t.rich(`when${n}`, { ltr })}
          />
        ))}
      </ListGroup>
    </div>
  );
}

export async function ClockDemo() {
  const t = await getTranslations("landing.demo.clock");
  return (
    <div
      role="img"
      aria-label={t("label")}
      inert
      className="flex flex-col items-center gap-4 rounded-[28px] bg-bg p-5"
    >
      <PunchCircle
        tone="live"
        progress={0.55}
        figure={t("running")}
        label={t("punchOut")}
        className="max-w-[188px]"
      />
      <p className="flex w-full items-baseline justify-between gap-3 px-1">
        <span className="text-base text-ink-2">{t("month")}</span>
        <span className="font-bold text-lg">{t("monthHours")}</span>
      </p>
    </div>
  );
}
