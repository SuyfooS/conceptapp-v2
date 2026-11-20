"use client";

import type { MyOrders } from "@domain/orders";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { DataTable } from "@ui/data-table";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Check, Send } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useOrdersMode } from "./orders-mode";
import {
  failureWords,
  ltr,
  OffShiftCard,
  SentLineView,
  TicketBadgeView,
  useModeHeading,
  useOrderWords,
} from "./orders-parts";

type Round = MyOrders["rounds"][number];
type Sent = {
  round: Round;
  ticket: Round["tickets"][number];
  place: string;
  department: string;
};

/**
 * "ההזמנות שלי" (waiter mode P4; the design's §3.2 step 6, brought forward
 * from P5, default 3): what the person sent today, ready to serve first,
 * each with its lines and served with one tap, its undo in the toast.
 * Phone: one list, ready first. Tablet: what is ready beside what is still
 * being made. Desktop: one table, each ticket with its lines. No sum of
 * money.
 */
export function MineView({ mine }: { mine: MyOrders | null }) {
  const { t, placeTitle, department, time, ago } = useOrderWords();
  const heading = useModeHeading();
  const mode = useOrdersMode();
  const { paths, now, actions, say, off, frame } = mode;
  const title = useRef<HTMLHeadingElement>(null);
  const [served, setServed] = useState<{ version: number; ids: string[] }>({
    version: mine?.version ?? 0,
    ids: [],
  });
  if (mine && mine.version !== served.version) {
    setServed({ version: mine.version, ids: [] });
  }

  const sent: Sent[] = (mine?.rounds ?? []).flatMap((round) =>
    round.tickets
      .filter((ticket) => ticket.lines > 0 && round.orderStatus === "open")
      .map((ticket) => ({
        round,
        ticket: served.ids.includes(ticket.id)
          ? { ...ticket, status: "served" as const }
          : ticket,
        place: placeTitle(round),
        department: department(ticket.department),
      })),
  );
  const ready = sent.filter((s) => s.ticket.status === "ready");
  const making = sent.filter(
    (s) => s.ticket.status === "new" || s.ticket.status === "held",
  );
  const done = sent.filter((s) => s.ticket.status === "served");

  async function serve(s: Sent) {
    setServed((was) => ({ ...was, ids: [...was.ids, s.ticket.id] }));
    const undo = () =>
      setServed((was) => ({
        ...was,
        ids: was.ids.filter((id) => id !== s.ticket.id),
      }));
    const result = await actions.serve(s.ticket.id, true).catch(() => null);
    if (!result?.ok) {
      undo();
      say(failureWords(t, result ? result.failure : "failed"));
      return;
    }
    mode.syncNow();
    // The card moves away with its button: the way back takes the focus.
    say(t("toast.served", { place: s.place, department: s.department }), {
      undo: () => {
        undo();
        void actions.serve(s.ticket.id, false).then(() => mode.syncNow());
      },
      focus: true,
      after: () => title.current,
    });
  }

  const header = (
    <PageHeader
      back={heading.back}
      eyebrow={heading.eyebrow}
      title={t("mine.title")}
      headingRef={title}
      subtitle={
        !off && sent.length
          ? t("mine.status", { ready: ready.length, making: making.length })
          : undefined
      }
    />
  );

  if (off) {
    return (
      <PageBody className={pageGlowClass}>
        {header}
        <OffShiftCard off={off} />
      </PageBody>
    );
  }
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

  const serveButton = (s: Sent) =>
    s.ticket.status === "held" || s.ticket.status === "served" ? null : (
      <Button
        variant="secondary"
        className="self-start"
        disabled={frame.viewing}
        onClick={() => void serve(s)}
      >
        <Check aria-hidden="true" />
        {t("order.serve")}
        <span className="sr-only">{t("draft.forItem", { name: s.place })}</span>
      </Button>
    );

  const card = (s: Sent) => (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={paths.takeaway(s.round.order)}
          className="inline-flex min-h-11 items-center rounded-control font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("mine.cardTitle", { place: s.place, department: s.department })}
        </Link>
        <TicketBadgeView ticket={s.ticket} department={s.department} />
      </div>
      <p className="-mt-2 text-ink-2 text-sm">
        {t.rich("mine.sentAt", {
          time: time(s.round.sentAt),
          ago: ago(s.round.sentAt, now),
          ltr,
        })}
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {s.ticket.items.map((line) => (
          <SentLineView key={line.id} line={line} />
        ))}
      </ul>
      {serveButton(s)}
    </Card>
  );

  const cards = (list: Sent[], empty: string) =>
    list.length === 0 ? (
      <Card padding="lg">
        <p className="text-ink-2">{empty}</p>
      </Card>
    ) : (
      <ul className="flex flex-col gap-3">
        {list.map((s) => (
          <li key={s.ticket.id}>{card(s)}</li>
        ))}
      </ul>
    );

  return (
    <PageBody className={pageGlowClass}>
      {header}
      {/* Ready first on every shape: the page reads, and the keyboard goes,
          from it to what is still being made. */}
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-6 xl:hidden">
        <PageSection title={t("mine.ready")}>
          {cards(ready, t("mine.readyEmpty"))}
        </PageSection>
        <PageSection title={t("mine.making")}>
          {cards(making, t("mine.makingEmpty"))}
        </PageSection>
      </div>
      <div className="hidden xl:block">
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
              rows={[...ready, ...making].map((s) => ({
                key: s.ticket.id,
                cells: {
                  place: (
                    <Link
                      href={paths.takeaway(s.round.order)}
                      className="flex min-h-11 items-center rounded-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {s.place}
                    </Link>
                  ),
                  department: s.department,
                  // The same lines as the cards: how many, the choices, the
                  // note and the allergy, so the desktop misses nothing.
                  items: (
                    <ul className="flex min-w-48 flex-col divide-y divide-line">
                      {s.ticket.items.map((line) => (
                        <SentLineView key={line.id} line={line} />
                      ))}
                    </ul>
                  ),
                  sent: t.rich("mine.sentAt", {
                    time: time(s.round.sentAt),
                    ago: ago(s.round.sentAt, now),
                    ltr,
                  }),
                  state: (
                    <TicketBadgeView
                      ticket={s.ticket}
                      department={s.department}
                    />
                  ),
                  serve: serveButton(s),
                },
              }))}
            />
          </Card>
        </PageSection>
      </div>
      {done.length > 0 ? (
        <PageSection title={t("mine.served")}>
          <ul className="overflow-hidden rounded-card bg-surface shadow-card md:max-w-2xl">
            {done.map((s) => (
              <li
                key={s.ticket.id}
                className="relative flex min-h-14 flex-col justify-center px-4 py-2.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
              >
                <span className="font-medium">
                  {t("mine.cardTitle", {
                    place: s.place,
                    department: s.department,
                  })}
                </span>
                <span className="text-ink-2 text-sm">
                  {s.ticket.items
                    .filter((line) => line.state === "live")
                    .map((line) => line.name)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}
    </PageBody>
  );
}
