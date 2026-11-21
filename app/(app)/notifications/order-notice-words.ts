import "server-only";
import type { NotificationLine } from "@domain/notifications";
import { placeTitleKind } from "@domain/order-screens";
import { type AppWording, translator } from "../wording";

type OrderLine = Extract<
  NotificationLine,
  { kind: "order.ready" | "order.unseen" }
>;

/**
 * Where a line about a ticket is, in the business's words, as the mode names
 * it (`usePlaceWords`): a number takes the word ("שולחן 4" in a restaurant,
 * "מקום 4" elsewhere), a name stands alone ("בר 3"), a takeaway goes by its
 * number. Null when the line lost it.
 */
export function orderPlace(
  where: OrderLine["where"],
  wording: AppWording,
): string | null {
  const t = translator(wording, "app.orders.place");
  if (where.placeName !== null) {
    return placeTitleKind(where.placeName) === "numbered"
      ? t("numbered", { name: where.placeName })
      : t("named", { name: where.placeName });
  }
  return where.takeaway === null
    ? null
    : t("takeaway", { number: where.takeaway });
}

/**
 * A line about a ticket in words, the inbox's and the phone's alike (waiter
 * mode P8b): the title names the place and the department ("שולחן 4 · מטבח:
 * מוכן", "שולחן 9: המסך לא מחובר · מטבח"), or says it plainly when the line
 * lost either; the note says how many items wait to be served, or what to do
 * about the screen, or, settled, that it no longer waits. Never a price.
 */
export function orderNoticeWords(
  line: OrderLine,
  settled: boolean,
  wording: AppWording,
): { title: string; note: string | null } {
  const t = translator(wording, "app.notifications.kinds.order");
  const place = orderPlace(line.where, wording);
  const { department } = line;
  if (line.kind === "order.ready") {
    return {
      title:
        place && department
          ? t("ready.title", { place, department })
          : t("ready.titlePlain"),
      note: settled
        ? t("ready.settledNote")
        : line.count > 0
          ? t("ready.body", { count: line.count })
          : null,
    };
  }
  return {
    title:
      place && department
        ? t("unseen.title", { place, department })
        : t("unseen.titlePlain"),
    note: settled ? t("unseen.settledNote") : t("unseen.body"),
  };
}
