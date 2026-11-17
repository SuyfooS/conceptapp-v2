"use client";

import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { DataTable } from "@ui/data-table";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Check, Send } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { changeTicket } from "../../changes";
import { READER } from "../../data";
import { type DemoData, useOrderDemo } from "../../demo-store";
import { liveLines, type Order, type Round, type Ticket } from "../../model";
import {
  ago,
  departmentName,
  linesCount,
  ltr,
  type OrderT,
  paths,
  placeById,
  placeTitle,
  SentLineView,
  TicketStateBadge,
  ticketsOf,
  useOrderWords,
  useUndoToast,
} from "../../parts";

type Sent = { order: Order; round: Round; ticket: Ticket; place: string };

/** What the reader sent today, still open, each ticket on its own. */
function sentBy(t: OrderT, data: DemoData): Sent[] {
  return ticketsOf(data)
    .filter(({ round, ticket }) => round.by === READER && linesCount(ticket))
    .map((sent) => {
      const place = placeById(data, sent.order.placeId);
      return { ...sent, place: place ? placeTitle(t, place) : "" };
    });
}

/**
 * "ההזמנות שלי" (§3.2 step 6): what Shiran sent, ready to serve first, each
 * served with one tap. Phone: one list, ready first. Tablet: what is still
 * being made beside what is ready. Desktop: one table. No sum of money.
 */
export function MineScreen() {
  const { t } = useOrderWords();
  const { data, update } = useOrderDemo();
  const { say, toast } = useUndoToast();
  const heading = useRef<HTMLHeadingElement>(null);
  const sent = sentBy(t, data);
  const ready = sent.filter((s) => s.ticket.state === "ready");
  const making = sent.filter((s) => s.ticket.state === "new");
  const served = sent.filter((s) => s.ticket.state === "served");

  function serve({ ticket, place }: Sent) {
    const before = ticket.state;
    update((d) => changeTicket(d, ticket.id, { state: "served" }));
    // The card moves away with its button: the way back takes the focus.
    say(
      t("toast.served", {
        place,
        department: departmentName(ticket.department),
      }),
      () => update((d) => changeTicket(d, ticket.id, { state: before })),
      { focus: true, after: () => heading.current },
    );
  }

  const header = (
    <PageHeader
      back={{ href: paths.app, label: t("leave") }}
      eyebrow={t("mode")}
      title={t("mine.title")}
      headingRef={heading}
      subtitle={
        sent.length
          ? t("mine.status", { ready: ready.length, making: making.length })
          : undefined
      }
    />
  );

  if (sent.length === 0) {
    return (
      <PageBody className={pageGlowClass}>
        {header}
        <EmptyState
          headingLevel="h2"
          icon={<Send />}
          title={t("mine.empty.title")}
          body={t("mine.empty.body")}
        >
          <Button asChild>
            <Link href={paths.floor}>{t("mine.empty.action")}</Link>
          </Button>
        </EmptyState>
      </PageBody>
    );
  }

  const cards = (list: Sent[], empty: string) =>
    list.length === 0 ? (
      <Card padding="lg">
        <p className="text-ink-2">{empty}</p>
      </Card>
    ) : (
      <ul className="flex flex-col gap-3">
        {list.map((s) => (
          <li key={s.ticket.id}>
            <SentCard t={t} sent={s} onServe={() => serve(s)} />
          </li>
        ))}
      </ul>
    );

  return (
    <PageBody className={pageGlowClass}>
      {header}
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-6 xl:hidden">
        <PageSection title={t("mine.ready")} className="md:order-2">
          {cards(ready, t("mine.readyEmpty"))}
        </PageSection>
        <PageSection title={t("mine.making")} className="md:order-1">
          {cards(making, t("mine.makingEmpty"))}
        </PageSection>
      </div>
      <div className="hidden xl:block">
        <MineTable t={t} sent={[...ready, ...making]} onServe={serve} />
      </div>
      {served.length > 0 ? (
        <PageSection title={t("mine.served")}>
          <ul className="overflow-hidden rounded-card bg-surface shadow-card md:max-w-2xl">
            {served.map((s) => (
              <li
                key={s.ticket.id}
                className="relative flex min-h-14 flex-col justify-center px-4 py-2.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
              >
                <span className="font-medium">
                  {t("mine.cardTitle", {
                    place: s.place,
                    department: departmentName(s.ticket.department),
                  })}
                </span>
                <span className="text-ink-2 text-sm">
                  {liveLines(s.ticket)
                    .map((line) => line.name)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}
      {toast}
    </PageBody>
  );
}

function SentCard({
  t,
  sent,
  onServe,
}: {
  t: OrderT;
  sent: Sent;
  onServe: () => void;
}) {
  const { time } = useOrderWords();
  const { now } = useOrderDemo();
  const { order, round, ticket, place } = sent;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={paths.order(order.placeId)}
          className="inline-flex min-h-11 items-center rounded-control font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("mine.cardTitle", {
            place,
            department: departmentName(ticket.department),
          })}
        </Link>
        <TicketStateBadge t={t} ticket={ticket} />
      </div>
      <p className="-mt-2 text-ink-2 text-sm">
        {t.rich("mine.sentAt", {
          time: time(round.at),
          ago: ago(t, round.at, now),
          ltr,
        })}
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {liveLines(ticket).map((line) => (
          <SentLineView key={line.id} t={t} line={line} />
        ))}
      </ul>
      {ticket.held ? null : (
        <Button variant="secondary" className="self-start" onClick={onServe}>
          <Check aria-hidden="true" />
          {t("order.serve")}
          <span className="sr-only">{t("draft.forItem", { name: place })}</span>
        </Button>
      )}
    </Card>
  );
}

/** The desktop's one table of what is still to serve. */
function MineTable({
  t,
  sent,
  onServe,
}: {
  t: OrderT;
  sent: Sent[];
  onServe: (sent: Sent) => void;
}) {
  const { time } = useOrderWords();
  const { now } = useOrderDemo();
  return (
    <PageSection title={t("mine.tableTitle")}>
      <Card padding="none" className="overflow-hidden">
        <DataTable
          caption={t("mine.tableTitle")}
          controls
          columns={[
            { key: "place", label: t("mine.columns.place") },
            { key: "department", label: t("mine.columns.department") },
            { key: "items", label: t("mine.columns.items") },
            { key: "sent", label: t("mine.columns.sent") },
            { key: "state", label: t("mine.columns.state") },
            { key: "serve", label: t("mine.columns.serve") },
          ]}
          rows={sent.map((s) => ({
            key: s.ticket.id,
            cells: {
              place: (
                <Link
                  href={paths.order(s.order.placeId)}
                  className="flex min-h-11 items-center rounded-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {s.place}
                </Link>
              ),
              department: departmentName(s.ticket.department),
              items: liveLines(s.ticket)
                .map((line) =>
                  line.qty > 1 ? `${line.qty} × ${line.name}` : line.name,
                )
                .join(", "),
              sent: t.rich("mine.sentAt", {
                time: time(s.round.at),
                ago: ago(t, s.round.at, now),
                ltr,
              }),
              state: <TicketStateBadge t={t} ticket={s.ticket} />,
              serve: s.ticket.held ? null : (
                <Button variant="secondary" onClick={() => onServe(s)}>
                  {t("order.serve")}
                  <span className="sr-only">
                    {t("draft.forItem", { name: s.place })}
                  </span>
                </Button>
              ),
            },
          }))}
        />
      </Card>
    </PageSection>
  );
}
