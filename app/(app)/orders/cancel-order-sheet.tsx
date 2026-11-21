"use client";

import { ORDER_CANCEL_REASONS, type OrderCancelReason } from "@domain/orders";
import { Sheet } from "@ui/sheet";
import { Ban } from "lucide-react";
import { useOrderWords } from "./orders-parts";
import { ReasonRows } from "./reason-rows";

/**
 * "ביטול ההזמנה" (waiter mode P5), for those who run orders: it says how
 * many items go and that the order doesn't open again, as CLAUDE.md asks of
 * what nothing brings back; one tap on a reason, and the cancel waits 8
 * seconds for its "ביטול" on the mode's toast (default 4).
 */
export function CancelOrderSheet({
  open,
  place,
  count,
  onClose,
  onPick,
  returnFocus,
}: {
  open: boolean;
  /** The order's place, in words. */
  place: string;
  /**
   * How many items go: the quantities of its lines still live, as the
   * screen shows them, its own fixes held included (`liveItemCount`).
   */
  count: number;
  onClose: () => void;
  onPick: (reason: OrderCancelReason) => void;
  returnFocus?: () => HTMLElement | null | undefined;
}) {
  const { t } = useOrderWords();
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("cancelOrder.title", { place })}
      closeLabel={t("fix.close")}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-4 px-2 pb-2">
        <p className="px-2 text-ink-2">
          {t("cancelOrder.subtitle", { count })}
        </p>
        <ReasonRows
          title={t("cancelOrder.why")}
          reasons={ORDER_CANCEL_REASONS}
          words={(reason) => t(`reasons.order.${reason}`)}
          icon={<Ban />}
          onPick={onPick}
        />
      </div>
    </Sheet>
  );
}
