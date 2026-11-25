import type { ListSummary, ListsTally } from "@domain/lists";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ListChecks,
  Send,
} from "lucide-react";
import Link from "next/link";
import { type AppWording, type Translator, translator } from "../wording";
import { DepartmentFilter } from "./department-filter";
import { ListCard, type ListShown, ListTable } from "./list-card";
import {
  ALL_DEPARTMENTS,
  type ListActionResult,
  type ListsHomeData,
} from "./list-types";
import { sentWords } from "./list-words";
import { PassedNotice } from "./passed-notice";
import { SentNotice } from "./sent-notice";

type T = Translator<"app.lists">;

export type ListsPaths = {
  lists: string;
  home: string;
  list: (id: string) => string;
  /** Prefixes the send screen's own link (the demo's, under /design/shell). */
  base: string;
};

/**
 * The business's day, for those who manage lists: one line, late in warning,
 * leading to the day's overview (L4).
 */
export function TeamToday({
  t,
  team,
  href,
}: {
  t: T;
  team: ListsTally;
  /** The overview of the day. */
  href: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "pressable flex min-h-[4.5rem] items-center gap-3 rounded-card bg-surface p-5 shadow-card",
        "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-semibold text-ink text-md">
          {t("team.title")}
        </span>
        <span className="text-base text-ink-2">
          {team.total === 0
            ? t("team.none")
            : t("team.counts", { open: team.open, finished: team.finished })}
        </span>
        {team.late > 0 ? (
          <Badge tone="warning">{t("team.late", { count: team.late })}</Badge>
        ) : null}
        <span className="sr-only">{t("team.open")}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
      />
    </Link>
  );
}

/**
 * Lists: what is for the person now, most urgent first, the orders their
 * departments asked for that wait in another one, what closed today, and,
 * for someone given "תיקון רשימות שנסגרו" (L6b-2), the lists of earlier days
 * they may still fix, only when there are some.
 * Someone in more than one department chooses which one's lists show (L5).
 * Phone: one card under the other, today's closed ones folded. Tablet: now
 * beside closed. Desktop: tables. Whoever manages lists sees the business's
 * day on top; whoever may send one has the main action, and one who manages
 * lists without sending them is told who does. Also on /design/shell/lists
 * with mock data.
 */
export function ListsView({
  data,
  wording,
  paths,
  cancel,
}: {
  data: ListsHomeData;
  /** The business's words. */
  wording: AppWording;
  paths: ListsPaths;
  cancel: (listId: string) => Promise<ListActionResult>;
}) {
  const t = translator(wording, "app.lists");
  const shown: ListShown = {
    t,
    lookups: data.lookups,
    userId: data.userId,
    now: new Date(data.now),
    timeZone: data.timeZone,
    timing: data.timing,
    href: paths.list,
  };
  const send = data.send ? (
    <Button asChild size="lg">
      <Link href={`${paths.base}${data.send.href}`}>
        <Send aria-hidden="true" />
        {data.send.only
          ? t("sendOne", { name: data.send.only })
          : t("send.action")}
      </Link>
    </Button>
  ) : null;
  const chosen = data.filter?.chosen ?? null;
  // A department chosen with nothing of its own still shows its sections,
  // each saying so, rather than "nothing for you".
  const nothing =
    data.open.length === 0 &&
    data.closed.length === 0 &&
    data.asked.length === 0 &&
    data.fixable.length === 0 &&
    chosen === null;

  const cards = (lists: readonly ListSummary[]) => (
    <div className="flex flex-col gap-3">
      {lists.map((list) => (
        <ListCard key={list.id} list={list} shown={shown} />
      ))}
    </div>
  );
  const noneOpen = (
    <p className="px-1 text-ink-2">
      {data.view === "business"
        ? t("noneOpenBusiness")
        : chosen
          ? t("noneOpenDepartment")
          : t("noneOpen")}
    </p>
  );
  const noneClosed = (
    <p className="px-1 text-ink-2">
      {chosen ? t("noneClosedDepartment") : t("noneClosed")}
    </p>
  );
  const askedTitle = t("asked", { count: data.asked.length });
  // Orders asked for that wait elsewhere: the same cards, in every shape.
  const asked =
    data.asked.length > 0 ? (
      <PageSection title={askedTitle}>
        <p className="-mt-1 px-1 text-ink-2 text-sm">{t("askedHint")}</p>
        {cards(data.asked)}
      </PageSection>
    ) : null;
  // Lists of earlier days still to fix (L6b-2), after today's closed ones:
  // the same cards on a phone and a tablet, a table on a computer, each
  // saying until when.
  const fixableTitle = t("fixable.title", { count: data.fixable.length });
  const fixableHint = (
    <p className="-mt-1 px-1 text-ink-2 text-sm">{t("fixable.hint")}</p>
  );
  const fixableUntil = Object.fromEntries(
    data.fixable.map(({ list, until }) => [list.id, until]),
  );
  const fixable =
    data.fixable.length > 0 ? (
      <PageSection title={fixableTitle}>
        {fixableHint}
        <div className="flex flex-col gap-3">
          {data.fixable.map(({ list, until }) => (
            <ListCard
              key={list.id}
              list={list}
              shown={shown}
              fixUntil={until}
            />
          ))}
        </div>
      </PageSection>
    ) : null;
  const filter = data.filter ? (
    <DepartmentFilter
      label={t("filter.label")}
      value={chosen ?? ALL_DEPARTMENTS}
      options={[
        { key: ALL_DEPARTMENTS, label: t("filter.all") },
        ...data.filter.departments.map((d) => ({ key: d.id, label: d.name })),
      ]}
      hrefs={Object.fromEntries([
        [ALL_DEPARTMENTS, paths.lists],
        ...data.filter.departments.map((d) => [
          d.id,
          `${paths.lists}?department=${d.id}`,
        ]),
      ])}
    />
  ) : null;

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={send} />
      {/* Runs the lists without sending them (lists.manage without
          lists.send): no way to send but a department's own order, and
          who sends the rest, or every list when there is none. */}
      {data.othersSend ? (
        <p className="px-1 text-ink-2">
          {t("othersSend", { own: data.send ? "yes" : "no" })}
        </p>
      ) : null}

      {/* Always here, so its word that the sending was taken back outlives
          the list it took back. */}
      <SentNotice
        sent={
          data.sent
            ? {
                listId: data.sent.id,
                message: sentWords(
                  t,
                  data.sent.holder,
                  data.lookups,
                  data.userId,
                ),
              }
            : null
        }
        cancel={cancel}
        listsHref={paths.lists}
      />
      {/* A list just passed on by someone who no longer reads it (L5). */}
      <PassedNotice
        message={
          data.passed ? t("list.pass.passed", { name: data.passed }) : null
        }
      />

      {data.team || data.templates !== null ? (
        // For those who manage lists: the business's day, and the way to
        // its templates, side by side from a tablet up.
        <div className="grid items-start gap-3 md:grid-cols-2 md:gap-4">
          {data.team ? (
            <TeamToday
              t={t}
              team={data.team}
              href={`${paths.base}/lists/today`}
            />
          ) : null}
          {data.templates !== null ? (
            <ListGroup>
              <ListRow
                href={`${paths.base}/lists/templates`}
                leading={<ClipboardList />}
                title={t("templatesRow.title")}
                subtitle={t("templatesRow.subtitle", {
                  count: data.templates,
                })}
              />
            </ListGroup>
          ) : null}
        </div>
      ) : null}

      {data.view === "viewOnly" ? (
        <EmptyState
          headingLevel="h2"
          icon={<ListChecks />}
          title={t("viewOnly.title")}
          body={t("viewOnly.body")}
          className="md:py-12"
        />
      ) : nothing ? (
        // Viewing as a role that manages lists reads the business, which
        // has nothing today: not the worker's words, and nothing to send
        // while viewing.
        <EmptyState
          headingLevel="h2"
          icon={<ListChecks />}
          title={
            data.view === "business"
              ? t("empty.businessTitle")
              : t("empty.title")
          }
          body={
            data.view === "business"
              ? t("empty.businessBody")
              : data.send
                ? t("empty.sender")
                : t("empty.body")
          }
          className="md:py-12"
        />
      ) : (
        <>
          {filter}

          {/* Phone: one thing at a time, today's closed lists folded away. */}
          <div className="flex flex-col gap-6 md:hidden">
            <PageSection title={t("now")}>
              {data.open.length > 0 ? cards(data.open) : noneOpen}
            </PageSection>
            {asked}
            {/* Always there, as on the wider screens, saying so when empty.
                Its title is a heading too, just before it, for the headings
                a screen reader moves by: one inside the summary, which reads
                as a button, isn't one for all of them (accessibility, part
                8). */}
            <h2 className="sr-only">
              {t("closedToday", { count: data.closed.length })}
            </h2>
            <details className="group flex flex-col gap-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-full px-1 font-bold text-lg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                {t("closedToday", { count: data.closed.length })}
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 text-ink-2 transition-transform duration-200 group-open:rotate-180"
                />
              </summary>
              <div className="mt-3">
                {data.closed.length > 0 ? cards(data.closed) : noneClosed}
              </div>
            </details>
            {fixable}
          </div>

          {/* Tablet: what's open, and what waits elsewhere, beside what
              closed today. */}
          <div className="hidden items-start gap-6 md:grid md:grid-cols-2 xl:hidden">
            <div className="flex min-w-0 flex-col gap-6">
              <PageSection title={t("now")}>
                {data.open.length > 0 ? cards(data.open) : noneOpen}
              </PageSection>
              {asked}
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <PageSection
                title={t("closedToday", { count: data.closed.length })}
              >
                {data.closed.length > 0 ? cards(data.closed) : noneClosed}
              </PageSection>
              {fixable}
            </div>
          </div>

          {/* Desktop: the full picture, as tables. */}
          <div className="hidden flex-col gap-8 xl:flex">
            <PageSection title={t("now")}>
              {data.open.length > 0 ? (
                <ListTable lists={data.open} shown={shown} caption={t("now")} />
              ) : (
                noneOpen
              )}
            </PageSection>
            {data.asked.length > 0 ? (
              <PageSection title={askedTitle}>
                <p className="-mt-1 px-1 text-ink-2 text-sm">
                  {t("askedHint")}
                </p>
                <ListTable
                  lists={data.asked}
                  shown={shown}
                  caption={askedTitle}
                />
              </PageSection>
            ) : null}
            <PageSection
              title={t("closedToday", { count: data.closed.length })}
            >
              {data.closed.length > 0 ? (
                <ListTable
                  lists={data.closed}
                  shown={shown}
                  caption={t("closedToday", { count: data.closed.length })}
                />
              ) : (
                noneClosed
              )}
            </PageSection>
            {data.fixable.length > 0 ? (
              <PageSection title={fixableTitle}>
                {fixableHint}
                <ListTable
                  lists={data.fixable.map(({ list }) => list)}
                  shown={shown}
                  caption={fixableTitle}
                  fixUntil={fixableUntil}
                />
              </PageSection>
            ) : null}
          </div>
        </>
      )}
    </PageBody>
  );
}
