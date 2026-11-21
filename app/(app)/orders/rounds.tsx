"use client";

import type { Menu } from "@domain/order-taking";
import {
  type LineState,
  type OrderDetail,
  type OrderLine,
  type OrderTicket,
  takeBackOffered,
} from "@domain/orders";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PageSection } from "@ui/page";
import { Spinner } from "@ui/spinner";
import { Check, CloudOff, Flame, Receipt, Undo2 } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { HOLD_MS } from "../use-held-write";
import { useOrdersMode } from "./orders-mode";
import {
  ltr,
  SentLineView,
  TicketBadgeView,
  useOrderWords,
} from "./orders-parts";
import type { PendingSend } from "./orders-types";

/** Where a line is now. */
export const lineState = (line: OrderLine): LineState =>
  line.takenBackAt
    ? "takenBack"
    : line.cancelledAt
      ? "cancelled"
      : line.compedAt
        ? "comped"
        : "live";

const liveCount = (ticket: OrderTicket) =>
  ticket.lines.filter(
    (line) =>
      lineState(line) !== "takenBack" && lineState(line) !== "cancelled",
  ).length;

/**
 * What was sent (the design's §3.2 step 6): each round with its time and
 * sender, and each department's ticket with its state in words. "הוגש" on
 * any ticket not held, even one still new; "להוציא" on a held block (default
 * 4); "החזרה מהשליחה" on a line its sender may still take back, held for 8
 * seconds with "ביטול" and offered only while that fits in the window
 * (default 13). A round still on its way says so: being sent, and only once
 * an attempt failed or the phone is offline that it goes when there is a
 * connection. No sum of money.
 */
export function Rounds({
  order,
  pending,
  menu,
  headingRef,
  served,
  takenBack,
  onServe,
  onFire,
  onTakeBack,
}: {
  order: OrderDetail | null;
  /** The sends on their way, not answered yet, in the order they went. */
  pending: readonly PendingSend[];
  menu: Menu | null;
  headingRef: Ref<HTMLHeadingElement>;
  /** Tickets served here, until the order's next read. */
  served: readonly string[];
  /** Lines taken back here, or held to be. */
  takenBack: readonly string[];
  onServe: (ticket: OrderTicket) => void;
  onFire: (ticket: OrderTicket) => void;
  onTakeBack: (line: OrderLine) => void;
}) {
  const { t, time, person, department } = useOrderWords();
  const { now, frame, paths } = useOrdersMode();
  if (!order && pending.length === 0) return null;
  const nameOf = (item: string) =>
    menu?.items.find((i) => i.id === item)?.name ?? "";
  return (
    <PageSection
      title={t("rounds.title")}
      headingRef={headingRef}
      action={
        order && paths.till ? (
          <Button asChild variant="ghost" className="-me-2 px-3">
            <Link href={paths.till(order.id)}>
              <Receipt aria-hidden="true" />
              {t("rounds.till")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      <ol className="flex flex-col gap-3">
        {pending.map((round) => (
          <li key={round.key}>
            <Card className="flex flex-col gap-3">
              {/* Being sent, in calm words; a warning only once an attempt
                  failed or the phone is offline. */}
              {round.waiting ? (
                <p className="flex items-center gap-2 font-semibold text-warning">
                  <CloudOff aria-hidden="true" className="size-5 shrink-0" />
                  {t("ticketState.notSent")}
                </p>
              ) : (
                <p className="flex items-center gap-2 font-semibold text-ink-2">
                  <Spinner className="shrink-0" />
                  {t("ticketState.sending")}
                </p>
              )}
              <ul className="flex flex-col divide-y divide-line">
                {round.lines.map((line) => (
                  <SentLineView
                    key={line.id}
                    line={{
                      id: line.id,
                      name: nameOf(line.item),
                      choices: [],
                      quantity: line.quantity,
                      note: line.note,
                      allergy: line.allergy,
                    }}
                  />
                ))}
              </ul>
            </Card>
          </li>
        ))}
        {order?.rounds.map((round, index) => {
          const by = person(round.sentBy);
          return (
            <li key={round.id}>
              <Card className="flex flex-col gap-4">
                <h3 className="font-semibold text-base text-ink-2">
                  {by
                    ? t.rich("rounds.round", {
                        n: index + 1,
                        time: time(round.sentAt),
                        name: by,
                        ltr,
                      })
                    : t.rich("rounds.roundAt", {
                        n: index + 1,
                        time: time(round.sentAt),
                        ltr,
                      })}
                </h3>
                {round.tickets.map((ticket) => {
                  const status = served.includes(ticket.id)
                    ? "served"
                    : ticket.status;
                  const live = liveCount(ticket) > 0;
                  const name = department(ticket.department);
                  return (
                    // Not a region: a round may hold two of a department (one held).
                    <div key={ticket.id} className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{name}</span>
                        <TicketBadgeView
                          ticket={{
                            status,
                            kitchenSeenAt: ticket.kitchenSeenAt,
                            lines: liveCount(ticket),
                          }}
                          department={name}
                        />
                      </div>
                      <ul className="flex flex-col divide-y divide-line">
                        {ticket.lines.map((line) => {
                          const state = takenBack.includes(line.id)
                            ? "takenBack"
                            : lineState(line);
                          const offered =
                            !frame.viewing &&
                            state === "live" &&
                            takeBackOffered(
                              {
                                sentAt: new Date(round.sentAt),
                                now: new Date(now),
                                minutes: order.takeBackMinutes,
                                ticket: { status, prepared: ticket.prepared },
                                isSender:
                                  round.sentBy?.toLowerCase() ===
                                  frame.userId.toLowerCase(),
                                senderInDepartment: frame.own.includes(
                                  ticket.department,
                                ),
                                line: state,
                              },
                              HOLD_MS,
                            );
                          return (
                            <SentLineView
                              key={line.id}
                              line={{
                                id: line.id,
                                name: line.name,
                                choices: line.choices.map((c) => c.option),
                                quantity: line.quantity,
                                note: line.note,
                                allergy: line.allergy,
                                state:
                                  state === "takenBack" || state === "cancelled"
                                    ? state
                                    : "live",
                              }}
                              trailing={
                                offered ? (
                                  <Button
                                    variant="ghost"
                                    className="-my-1.5 shrink-0 px-3 text-base"
                                    onClick={() => onTakeBack(line)}
                                  >
                                    <Undo2 aria-hidden="true" />
                                    {t("rounds.takeBack")}
                                    <span className="sr-only">
                                      {t("draft.forItem", { name: line.name })}
                                    </span>
                                  </Button>
                                ) : null
                              }
                            />
                          );
                        })}
                      </ul>
                      {live && status === "held" ? (
                        <Button
                          variant="secondary"
                          className="self-start"
                          disabled={frame.viewing}
                          onClick={() => onFire(ticket)}
                        >
                          <Flame aria-hidden="true" />
                          {t("rounds.fire")}
                        </Button>
                      ) : live && status !== "served" ? (
                        <Button
                          variant="secondary"
                          className="self-start"
                          disabled={frame.viewing}
                          onClick={() => onServe(ticket)}
                        >
                          <Check aria-hidden="true" />
                          {t("order.serve")}
                          <span className="sr-only">
                            {t("draft.forItem", { name })}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </Card>
            </li>
          );
        })}
      </ol>
    </PageSection>
  );
}
