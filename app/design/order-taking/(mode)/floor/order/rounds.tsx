"use client";

import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { PageSection } from "@ui/page";
import { Check, Flame, Receipt, Undo2 } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { useOrderDemo } from "../../../demo-store";
import {
  type Order,
  type SentLine,
  type Ticket,
  takeBackOpen,
  ticketCount,
} from "../../../model";
import {
  departmentName,
  ltr,
  paths,
  personName,
  SentLineView,
  TicketStateBadge,
  useOrderWords,
  viewer,
} from "../../../parts";

/**
 * What was sent (§3.2 step 6): each round with its time and sender, and
 * each department's ticket with its state in words. A ticket is served
 * with one tap, even one still new, and a held block goes with "להוציא".
 * Within two minutes the sender takes a line back, unless it went to a
 * department they work in (`takeBackOpen`). No sum of money.
 */
export function Rounds({
  order,
  headingRef,
  onServe,
  onFire,
  onTakeBack,
}: {
  order: Order;
  headingRef: Ref<HTMLHeadingElement>;
  onServe: (ticket: Ticket) => void;
  onFire: (ticket: Ticket) => void;
  onTakeBack: (line: SentLine) => void;
}) {
  const { t, time } = useOrderWords();
  const { now } = useOrderDemo();
  return (
    <PageSection
      title={t("rounds.title")}
      headingRef={headingRef}
      action={
        <Button asChild variant="ghost" className="-me-2 px-3">
          <Link href={paths.till(order.id)}>
            <Receipt aria-hidden="true" />
            {t("rounds.till")}
          </Link>
        </Button>
      }
    >
      <ol className="flex flex-col gap-3">
        {order.rounds.map((round, index) => (
          <li key={round.id}>
            <Card className="flex flex-col gap-4">
              <h3 className="font-semibold text-base text-ink-2">
                {t.rich("rounds.round", {
                  n: index + 1,
                  time: time(round.at),
                  name: personName(round.by),
                  ltr,
                })}
              </h3>
              {round.tickets.map((ticket) => {
                const canTakeBack = takeBackOpen(round, ticket, now, viewer);
                const live = ticketCount(ticket) > 0;
                return (
                  // Not a region: a round may hold two of a department (one held).
                  <div key={ticket.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">
                        {departmentName(ticket.department)}
                      </span>
                      {live ? <TicketStateBadge t={t} ticket={ticket} /> : null}
                    </div>
                    <ul className="flex flex-col divide-y divide-line">
                      {ticket.lines.map((line) => (
                        <SentLineView
                          key={line.id}
                          t={t}
                          line={line}
                          trailing={
                            canTakeBack && !line.takenBack ? (
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
                      ))}
                    </ul>
                    {live && ticket.held && ticket.state === "new" ? (
                      <Button
                        variant="secondary"
                        className="self-start"
                        onClick={() => onFire(ticket)}
                      >
                        <Flame aria-hidden="true" />
                        {t("rounds.fire")}
                      </Button>
                    ) : live && !ticket.held && ticket.state !== "served" ? (
                      <Button
                        variant="secondary"
                        className="self-start"
                        onClick={() => onServe(ticket)}
                      >
                        <Check aria-hidden="true" />
                        {t("order.serve")}
                        <span className="sr-only">
                          {t("draft.forItem", {
                            name: departmentName(ticket.department),
                          })}
                        </span>
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </Card>
          </li>
        ))}
      </ol>
    </PageSection>
  );
}
