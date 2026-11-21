"use client";

import { lineFixes, ticketStage } from "@domain/order-screens";
import {
  COMP_REASONS,
  type CompReason,
  LINE_CANCEL_REASONS,
  type LineCancelReason,
  type LineState,
  type OrderDetail,
  type OrderLine,
  type OrderTicket,
} from "@domain/orders";
import { ListGroup, ListRow } from "@ui/list-row";
import { Sheet } from "@ui/sheet";
import { Ban, Gift, Undo2 } from "lucide-react";
import { useOrdersMode } from "./orders-mode";
import { ltr, useOrderWords } from "./orders-parts";
import { ReasonRows } from "./reason-rows";

/** What a tap in the line's sheet does. */
export type LineFixPick =
  | { kind: "cancel"; reason: LineCancelReason }
  | { kind: "restore" }
  | { kind: "comp"; reason: CompReason }
  | { kind: "uncomp" };

/** A sent line, as the order screen shows it now. */
export type LineSheetTarget = {
  line: OrderLine;
  ticket: OrderTicket;
  state: LineState;
  /**
   * Its sender, on the staff of the department it went to: they cancel it
   * with a reason, never take it back (`takeBackState` "ownDepartment").
   */
  ownDepartment: boolean;
};

/**
 * A sent line's fixes (waiter mode P5, the plan's T3): one tap on a reason
 * cancels it ("ביטול הפריט"), or gives it on the house for those who run
 * orders; a cancelled line is put back, and one on the house taken off it,
 * while the order is open. Who may do what is `lineFixes`, as the database
 * decides it; a taker on a ticket already ready reads why the reasons, or
 * the putting back, are dimmed. Its subtitle names the ticket's state as its
 * badge does (`ticketStage`). Every fix waits 8 seconds for its "ביטול" on
 * the mode's toast.
 */
export function LineSheet({
  order,
  target,
  onClose,
  onPick,
  returnFocus,
}: {
  order: OrderDetail;
  target: LineSheetTarget | null;
  onClose: () => void;
  onPick: (target: LineSheetTarget, pick: LineFixPick) => void;
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const { t, department } = useOrderWords();
  const { frame } = useOrdersMode();
  const offered = target
    ? lineFixes({
        order,
        ticket: target.ticket,
        line: target.state,
        runs: frame.runs,
        viewing: frame.viewing,
      })
    : { fixes: [], readyLocked: false };
  // Why a taker can't, in words of what they tried: cancel it, or put it back.
  const locked = !offered.readyLocked
    ? null
    : target?.state === "cancelled"
      ? t("failed.managersOnlyRestore")
      : t("failed.managersOnly");
  const pick = (choice: LineFixPick) => {
    if (target) onPick(target, choice);
  };
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        target
          ? t.rich("line.qtyName", {
              qty: target.line.quantity,
              name: target.line.name,
              ltr,
            })
          : ""
      }
      subtitle={
        target
          ? t("fix.subtitle", {
              department: department(target.ticket.department),
              state: t(`fix.state.${ticketStage(target.ticket)}`),
            })
          : undefined
      }
      closeLabel={t("fix.close")}
      returnFocus={returnFocus}
    >
      {target ? (
        <div className="flex flex-col gap-4 px-2 pb-2">
          {target.state === "live" ? (
            <>
              <div className="flex flex-col gap-1 px-2">
                <p className="text-ink-2 text-sm">{t("fix.hint")}</p>
                {target.ownDepartment ? (
                  <p className="text-ink-2 text-sm">
                    {t("failed.ownDepartment")}
                  </p>
                ) : null}
              </div>
              {offered.fixes.includes("cancel") || offered.readyLocked ? (
                <ReasonRows
                  title={t("fix.cancel")}
                  reasons={LINE_CANCEL_REASONS}
                  words={(reason) => t(`reasons.line.${reason}`)}
                  icon={<Ban />}
                  disabled={locked}
                  onPick={(reason) => pick({ kind: "cancel", reason })}
                />
              ) : null}
              {offered.fixes.includes("comp") ? (
                <ReasonRows
                  title={t("fix.comp")}
                  hint={t("fix.compHint")}
                  reasons={COMP_REASONS}
                  words={(reason) => t(`reasons.comp.${reason}`)}
                  icon={<Gift />}
                  onPick={(reason) => pick({ kind: "comp", reason })}
                />
              ) : null}
            </>
          ) : target.state === "cancelled" ? (
            <OneFix
              title={t("fix.restore")}
              disabled={locked}
              onClick={() => pick({ kind: "restore" })}
            />
          ) : target.state === "comped" && offered.fixes.includes("uncomp") ? (
            <OneFix
              title={t("fix.uncomp")}
              onClick={() => pick({ kind: "uncomp" })}
            />
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

/** One fix with no reason to choose: putting a line back, or off the house. */
function OneFix({
  title,
  disabled = null,
  onClick,
}: {
  title: string;
  /** Why it isn't the person's to press, or null. */
  disabled?: string | null;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {disabled ? <p className="px-2 text-ink-2 text-sm">{disabled}</p> : null}
      <ListGroup className="bg-elevated shadow-none">
        <ListRow
          leading={<Undo2 />}
          title={title}
          disabled={disabled !== null}
          onClick={onClick}
        />
      </ListGroup>
    </div>
  );
}
