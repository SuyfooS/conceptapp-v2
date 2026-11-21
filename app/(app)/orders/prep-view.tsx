"use client";

import { minutesSince } from "@domain/order-screens";
import { ORDER_RULES, type OrderPrep, type PrepTicket } from "@domain/orders";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { ChefHat, Undo2 } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useOrdersMode } from "./orders-mode";
import {
  failureWords,
  ltr,
  TicketView,
  useModeHeading,
  useOrderWords,
} from "./orders-parts";

/** Since when a ticket waits: sent, or fired for a held block. */
const since = (ticket: PrepTicket) => ticket.firedAt ?? ticket.sentAt;

/** A ticket still to make: a line of it is live. */
const live = (ticket: PrepTicket) =>
  ticket.lines.some((line) => line.state === "live");

/**
 * "הכנה" on a phone (waiter mode P4; the design's §4.2): the tickets of the
 * departments the person prepares for, oldest first and the held blocks
 * after them, greyed and with no "מוכן" until they are called. "מוכן" puts
 * a ticket in "מוכנים לאחרונה" for five minutes, to put back. Phone: one
 * column, a department at a time when there are several; tablet: two;
 * desktop: a grid of three. No price at all. The stations come in P8.
 */
export function PrepView({
  prep,
  children,
}: {
  prep: OrderPrep | null;
  /** What follows the tickets (the twin's stations). */
  children?: ReactNode;
}) {
  const { t, placeTitle, department, time } = useOrderWords();
  const heading = useModeHeading();
  const mode = useOrdersMode();
  const { frame, now, actions, say } = mode;
  const title = useRef<HTMLHeadingElement>(null);
  // Marked here: shown at once, until the next read.
  const [marked, setMarked] = useState<{
    version: number;
    ready: string[];
    back: string[];
  }>({ version: prep?.version ?? 0, ready: [], back: [] });
  const [busy, setBusy] = useState<string | null>(null);
  if (prep && prep.version !== marked.version) {
    setMarked({ version: prep.version, ready: [], back: [] });
  }

  const tickets = (prep?.tickets ?? []).map((ticket) =>
    marked.ready.includes(ticket.id)
      ? {
          ...ticket,
          status: "ready" as const,
          readyAt: new Date(now).toISOString(),
        }
      : marked.back.includes(ticket.id)
        ? { ...ticket, status: "new" as const }
        : ticket,
  );
  // The departments: those they prepare for, and any a ticket went to.
  const order = prep?.departments ?? frame.prepares;
  const ids = order.filter(
    (id) =>
      frame.prepares.includes(id) ||
      tickets.some((ticket) => ticket.department === id),
  );
  const [chosen, setChosen] = useState(ids[0] ?? "");
  const current = ids.includes(chosen) ? chosen : (ids[0] ?? "");
  const toMake = (id: string) => {
    const mine = tickets.filter(
      (ticket) =>
        ticket.department === id &&
        (ticket.status === "new" || ticket.status === "held") &&
        live(ticket),
    );
    return [
      ...mine.filter((ticket) => ticket.status === "new"),
      ...mine.filter((ticket) => ticket.status === "held"),
    ];
  };
  const open = (id: string) =>
    toMake(id).filter((ticket) => ticket.status === "new");
  const shown = toMake(current);
  const recent = tickets
    .filter(
      (ticket) =>
        ticket.department === current &&
        ticket.status === "ready" &&
        ticket.readyAt !== null &&
        minutesSince(ticket.readyAt, now) < ORDER_RULES.readyUndoMinutes,
    )
    .sort((a, b) => Date.parse(b.readyAt ?? "") - Date.parse(a.readyAt ?? ""));
  const oldest = open(current)[0];

  async function ready(ticket: PrepTicket, place: string) {
    setBusy(ticket.id);
    const result = await actions.setReady(ticket.id, true).catch(() => null);
    setBusy(null);
    if (!result?.ok) {
      say(failureWords(t, result ? result.failure : "failed"));
      return;
    }
    setMarked((was) => ({ ...was, ready: [...was.ready, ticket.id] }));
    mode.syncNow();
    say(
      t("toast.ready", { place, department: department(ticket.department) }),
      {
        undo: () => void putBack(ticket, place, false),
        focus: true,
        after: () => title.current,
      },
    );
  }

  async function putBack(ticket: PrepTicket, place: string, tell = true) {
    setMarked((was) => ({
      ...was,
      ready: was.ready.filter((id) => id !== ticket.id),
      back: [...was.back, ticket.id],
    }));
    const result = await actions.setReady(ticket.id, false).catch(() => null);
    if (!result?.ok) {
      setMarked((was) => ({
        ...was,
        back: was.back.filter((id) => id !== ticket.id),
      }));
      say(failureWords(t, result ? result.failure : "failed"));
      return;
    }
    mode.syncNow();
    if (tell) {
      say(t("toast.putBack", { place }));
      title.current?.focus({ preventScroll: true });
    }
  }

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={heading.back}
        eyebrow={heading.eyebrow}
        title={t("prep.title")}
        headingRef={title}
        // With nothing to make, the empty state below says so, once.
        subtitle={
          shown.length > 0
            ? oldest
              ? t("prep.status", {
                  count: open(current).length,
                  minutes: minutesSince(since(oldest), now),
                })
              : t("prep.nothingOpen")
            : undefined
        }
      />
      {ids.length > 1 ? (
        <Segmented
          label={t("prep.department")}
          value={current}
          onChange={setChosen}
          className="self-start"
          options={ids.map((id) => {
            const count = open(id).length;
            return {
              value: id,
              label: department(id),
              badge: { count, label: t("prep.openCount", { count }) },
            };
          })}
        />
      ) : null}
      {shown.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<ChefHat />}
          title={t("prep.empty.title")}
          body={t("prep.empty.body")}
        />
      ) : (
        <ul
          aria-label={t("prep.listLabel", { department: department(current) })}
          className="grid gap-4 md:grid-cols-2 md:items-start xl:grid-cols-3"
        >
          {shown.map((ticket) => {
            const place = placeTitle(ticket);
            return (
              <li key={ticket.id}>
                <TicketView
                  title={place}
                  department={department(ticket.department)}
                  sentBy={ticket.sentBy}
                  since={since(ticket)}
                  held={ticket.status === "held"}
                  lines={ticket.lines}
                  ready={frame.viewing ? null : () => void ready(ticket, place)}
                  busy={busy === ticket.id}
                />
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 ? (
        <PageSection title={t("prep.recent")}>
          <ul className="overflow-hidden rounded-card bg-surface shadow-card md:max-w-2xl">
            {recent.map((ticket) => {
              const place = placeTitle(ticket);
              return (
                <li
                  key={ticket.id}
                  className="relative flex min-h-16 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{place}</span>
                    <span className="text-ink-2 text-sm">
                      {t.rich("prep.readyAt", {
                        time: time(ticket.readyAt ?? now),
                        ltr,
                      })}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    className="shrink-0 px-3"
                    disabled={frame.viewing}
                    onClick={() => void putBack(ticket, place)}
                  >
                    <Undo2 aria-hidden="true" />
                    {t("prep.putBack")}
                    <span className="sr-only">
                      {t("draft.forItem", { name: place })}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </PageSection>
      ) : null}
      {frame.viewing ? (
        <p className="text-ink-2">{t("failed.viewOnly")}</p>
      ) : null}
      {children}
    </PageBody>
  );
}
