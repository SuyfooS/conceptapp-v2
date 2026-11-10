import type { ListSummary, ListsTally } from "@domain/lists";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { ChevronDown, ClipboardList, ListChecks, Send } from "lucide-react";
import Link from "next/link";
import { type AppWording, type Translator, translator } from "../wording";
import { ListCard, type ListShown, ListTable } from "./list-card";
import type { ListActionResult, ListsHomeData } from "./list-types";
import { sentWords } from "./list-words";
import { SentNotice } from "./sent-notice";

type T = Translator<"app.lists">;

export type ListsPaths = {
  lists: string;
  home: string;
  list: (id: string) => string;
  /** Prefixes the send screen's own link (the demo's, under /design/shell). */
  base: string;
};

/** The business's day, for those who manage lists: one line, late in warning. */
export function TeamToday({ t, team }: { t: T; team: ListsTally }) {
  return (
    <Card
      tone="flat"
      padding="lg"
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <span className="font-semibold text-md">{t("team.title")}</span>
      <span className="text-base text-ink-2">
        {team.total === 0
          ? t("team.none")
          : t("team.counts", { open: team.open, finished: team.finished })}
      </span>
      {team.late > 0 ? (
        <Badge tone="warning">{t("team.late", { count: team.late })}</Badge>
      ) : null}
    </Card>
  );
}

/**
 * Lists: what is for the person now, most urgent first, and what closed today.
 * Phone: one card under the other, today's closed ones folded. Tablet: now
 * beside closed. Desktop: both as tables. Whoever manages lists sees the
 * business's day on top; whoever may send one has the main action. Also on
 * /design/shell/lists with mock data.
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
  const nothing = data.open.length === 0 && data.closed.length === 0;

  const cards = (lists: readonly ListSummary[]) => (
    <div className="flex flex-col gap-3">
      {lists.map((list) => (
        <ListCard key={list.id} list={list} shown={shown} />
      ))}
    </div>
  );
  const noneOpen = (
    <p className="px-1 text-ink-2">
      {data.view === "business" ? t("noneOpenBusiness") : t("noneOpen")}
    </p>
  );

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={send} />

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

      {data.team || data.templates !== null ? (
        // For those who manage lists: the business's day, and the way to
        // its templates, side by side from a tablet up.
        <div className="grid items-start gap-3 md:grid-cols-2 md:gap-4">
          {data.team ? <TeamToday t={t} team={data.team} /> : null}
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
        // Viewing as a manager reads the business, which has nothing today:
        // not the worker's words, and nothing to send while viewing.
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
          {/* Phone: one thing at a time, today's closed lists folded away. */}
          <div className="flex flex-col gap-6 md:hidden">
            <PageSection title={t("now")}>
              {data.open.length > 0 ? cards(data.open) : noneOpen}
            </PageSection>
            {data.closed.length > 0 ? (
              <details className="group flex flex-col gap-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-full px-1 font-bold text-lg focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                  {t("closedToday", { count: data.closed.length })}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-5 text-ink-2 transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <div className="mt-3">{cards(data.closed)}</div>
              </details>
            ) : null}
          </div>

          {/* Tablet: what's open beside what closed today. */}
          <div className="hidden gap-6 md:grid md:grid-cols-2 xl:hidden">
            <PageSection title={t("now")}>
              {data.open.length > 0 ? cards(data.open) : noneOpen}
            </PageSection>
            <PageSection
              title={t("closedToday", { count: data.closed.length })}
            >
              {data.closed.length > 0 ? (
                cards(data.closed)
              ) : (
                <p className="px-1 text-ink-2">{t("noneClosed")}</p>
              )}
            </PageSection>
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
            {data.closed.length > 0 ? (
              <PageSection
                title={t("closedToday", { count: data.closed.length })}
              >
                <ListTable
                  lists={data.closed}
                  shown={shown}
                  caption={t("closedToday", { count: data.closed.length })}
                />
              </PageSection>
            ) : null}
          </div>
        </>
      )}
    </PageBody>
  );
}
