"use client";

import { minutesSince } from "@domain/order-screens";
import { stationSince as since } from "@domain/order-stations";
import type { OrderPrep, PrepTicket } from "@domain/orders";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { ChefHat } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useOrdersMode } from "./orders-mode";
import {
  ConnectionNote,
  failureWords,
  useModeHeading,
  useOrderWords,
} from "./orders-parts";
import { RecentlyReady, recentlyReady, TicketGrid, toMake } from "./prep-parts";

/**
 * "הכנה" on a phone (waiter mode P4; the design's §4.2): the tickets of the
 * departments the person prepares for, oldest first and the held blocks
 * after them, greyed and with no "מוכן" until they are called. "מוכן" puts
 * a ticket in "מוכנים לאחרונה" for five minutes, to put back. Phone: one
 * column, a department at a time when there are several; tablet: two;
 * desktop: a grid of three. No price at all. The kitchen's station (P8a)
 * draws the same tickets (prep-parts.tsx); the locks and the list of screens
 * follow the tickets for whoever runs orders (`children`).
 */
export function PrepView({
  prep,
  children,
}: {
  prep: OrderPrep | null;
  /** What follows the tickets: the kitchen's and the till's screens. */
  children?: ReactNode;
}) {
  const { t, department } = useOrderWords();
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
  const of = (id: string) =>
    tickets.filter((ticket) => ticket.department === id);
  const open = (id: string) =>
    toMake(of(id)).filter((ticket) => ticket.status === "new");
  const shown = toMake(of(current));
  const recent = recentlyReady(of(current), now);
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
      <ConnectionNote />
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
        <TicketGrid
          tickets={shown}
          label={t("prep.listLabel", { department: department(current) })}
          layout="phone"
          busy={busy}
          onReady={
            frame.viewing ? null : (ticket, place) => void ready(ticket, place)
          }
        />
      )}
      <RecentlyReady
        tickets={recent}
        layout="phone"
        disabled={frame.viewing}
        onPutBack={(ticket, place) => void putBack(ticket, place)}
      />
      {frame.viewing ? (
        <p className="text-ink-2">{t("failed.viewOnly")}</p>
      ) : null}
      {children}
    </PageBody>
  );
}
