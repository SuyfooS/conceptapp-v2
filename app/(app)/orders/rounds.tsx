"use client";

import { lineFixes } from "@domain/order-screens";
import type { Menu } from "@domain/order-taking";
import {
  type CompReason,
  type LineCancelReason,
  lineStateOf,
  type OrderDetail,
  type OrderLine,
  type OrderTicket,
  takeBackOffered,
  takeBackState,
} from "@domain/orders";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { IconButton } from "@ui/icon-button";
import { PageSection } from "@ui/page";
import { Spinner } from "@ui/spinner";
import { Check, CloudOff, Ellipsis, Flame, Receipt, Undo2 } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { HOLD_MS } from "../use-held-write";
import type { LineSheetTarget } from "./line-sheet";
import { useOrdersMode } from "./orders-mode";
import {
  ltr,
  SentLineView,
  TicketBadgeView,
  useOrderWords,
} from "./orders-parts";
import type { PendingSend } from "./orders-types";

/** A sent line as the screen shows it: where it is, and why, for a fix. */
export type LineShown =
  | { state: "live" | "takenBack" }
  | { state: "cancelled"; reason: LineCancelReason | null }
  | { state: "comped"; reason: CompReason | null };

/** A line as the order's read has it. */
export function shownOf(line: OrderLine): LineShown {
  const state = lineStateOf(line);
  if (state === "cancelled") return { state, reason: line.cancelReason };
  if (state === "comped") return { state, reason: line.compReason };
  return { state };
}

/** Still sent: neither taken back nor cancelled (on the house still is). */
const stillSent = (shown: LineShown) =>
  shown.state !== "takenBack" && shown.state !== "cancelled";

/**
 * What was sent (the design's §3.2 step 6): each round with its time and
 * sender, and each department's ticket with its state in words. "הוגש" on
 * any ticket not held, even one still new; "להוציא" on a held block (default
 * 4); "החזרה מהשליחה" on a line its sender may still take back, held for 8
 * seconds with "ביטול" and offered only while that fits in the window
 * (default 13); and beside it "תיקון" (P5), which opens the line's sheet
 * while there is a fix the person may make, or one to read why not. A
 * cancelled line is struck with its reason, one on the house marked so. A
 * round still on its way says so: being sent, and only once an attempt
 * failed or the phone is offline that it goes when there is a connection.
 * No sum of money.
 */
export function Rounds({
  order,
  pending,
  menu,
  headingRef,
  served,
  fixed,
  held,
  onServe,
  onFire,
  onTakeBack,
  onFix,
}: {
  order: OrderDetail | null;
  /** The sends on their way, not answered yet, in the order they went. */
  pending: readonly PendingSend[];
  menu: Menu | null;
  headingRef: Ref<HTMLHeadingElement>;
  /** Tickets served here, until the order's next read. */
  served: readonly string[];
  /** Lines as a fix made here shows them, until the order's next read. */
  fixed: Readonly<Record<string, LineShown>>;
  /** Lines whose fix waits for its "ביטול": their way back is on the toast. */
  held: readonly string[];
  onServe: (ticket: OrderTicket) => void;
  onFire: (ticket: OrderTicket) => void;
  onTakeBack: (line: OrderLine) => void;
  onFix: (target: LineSheetTarget) => void;
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
        order ? (
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
                  const shownLine = (line: OrderLine) =>
                    fixed[line.id] ?? shownOf(line);
                  const liveCount = ticket.lines.filter((line) =>
                    stillSent(shownLine(line)),
                  ).length;
                  const live = liveCount > 0;
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
                            lines: liveCount,
                          }}
                          department={name}
                        />
                      </div>
                      <ul className="flex flex-col divide-y divide-line">
                        {ticket.lines.map((line) => {
                          const shown = shownLine(line);
                          const state = shown.state;
                          const takeBack = {
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
                          };
                          const offered =
                            !frame.viewing &&
                            state === "live" &&
                            order.status === "open" &&
                            takeBackOffered(takeBack, HOLD_MS);
                          const fixes = lineFixes({
                            order,
                            ticket: { status },
                            line: state,
                            runs: frame.runs,
                            viewing: frame.viewing,
                          });
                          const fixable =
                            !held.includes(line.id) &&
                            (fixes.fixes.length > 0 || fixes.readyLocked);
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
                              gone={
                                shown.state === "cancelled" && shown.reason
                                  ? t("line.cancelledWhy", {
                                      reason: t(`reasons.line.${shown.reason}`),
                                    })
                                  : null
                              }
                              mark={
                                shown.state === "comped"
                                  ? shown.reason
                                    ? t("line.comped", {
                                        reason: t(
                                          `reasons.comp.${shown.reason}`,
                                        ),
                                      })
                                    : t("till.free")
                                  : null
                              }
                              trailing={
                                offered || fixable ? (
                                  <span className="-my-1.5 flex shrink-0 items-center gap-1">
                                    {offered ? (
                                      <Button
                                        variant="ghost"
                                        className="shrink-0 px-3 text-base"
                                        onClick={() => onTakeBack(line)}
                                      >
                                        <Undo2 aria-hidden="true" />
                                        {t("rounds.takeBack")}
                                        <span className="sr-only">
                                          {t("draft.forItem", {
                                            name: line.name,
                                          })}
                                        </span>
                                      </Button>
                                    ) : null}
                                    {fixable ? (
                                      <IconButton
                                        label={t("line.fix", {
                                          name: line.name,
                                        })}
                                        icon={<Ellipsis />}
                                        onClick={() =>
                                          onFix({
                                            line,
                                            ticket: { ...ticket, status },
                                            state,
                                            ownDepartment:
                                              takeBackState(takeBack) ===
                                              "ownDepartment",
                                          })
                                        }
                                      />
                                    ) : null}
                                  </span>
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
