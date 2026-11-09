import { Card, CardText } from "@ui/card";
import { PageSection } from "@ui/page";
import Link from "next/link";
import { type AppWording, translator } from "../wording";
import { ListCard, type ListShown } from "./list-card";
import type { ListsHomeData } from "./list-types";
import { TeamToday } from "./lists-view";

/** How many of the person's lists Today shows; Lists has the rest. */
const SHOWN = 3;

/**
 * Lists' part of Today: the person's most urgent open lists, and for whoever
 * manages lists the business's day in one line. `path` keeps the links inside
 * the demo on /design/shell.
 */
export function TodayLists({
  data,
  wording,
  path,
  className,
}: {
  data: ListsHomeData;
  /** The business's words. */
  wording: AppWording;
  path: (to: string) => string;
  className?: string;
}) {
  const t = translator(wording, "app.lists");
  const shown: ListShown = {
    t,
    lookups: data.lookups,
    userId: data.userId,
    now: new Date(data.now),
    timeZone: data.timeZone,
    timing: data.timing,
    href: (id) => path(`/lists/${id}`),
  };
  const first = data.open.slice(0, SHOWN);
  const more = data.open.length - first.length;
  return (
    <PageSection
      title={data.view === "business" ? t("today.business") : t("today.title")}
      className={className}
      action={
        <Link
          href={path("/lists")}
          className="-my-2.5 flex min-h-11 items-center rounded-full text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("today.all")}
        </Link>
      }
    >
      {data.team ? <TeamToday t={t} team={data.team} /> : null}
      {data.view === "viewOnly" ? (
        <Card tone="flat" padding="lg">
          <CardText>{t("viewOnly.title")}</CardText>
        </Card>
      ) : first.length > 0 ? (
        <div className="flex flex-col gap-3">
          {first.map((list) => (
            <ListCard key={list.id} list={list} shown={shown} />
          ))}
        </div>
      ) : data.team ? null : (
        <Card tone="flat" padding="lg">
          <CardText>{t("today.none")}</CardText>
        </Card>
      )}
      {more > 0 ? (
        <p className="px-1 text-ink-2 text-sm">
          {t("today.more", { count: more })}
        </p>
      ) : null}
    </PageSection>
  );
}
