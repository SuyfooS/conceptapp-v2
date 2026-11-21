import type { OrderFloor } from "@domain/orders";
import { ListGroup, ListRow } from "@ui/list-row";
import { ClipboardList } from "lucide-react";
import { type AppWording, translator } from "../wording";

/**
 * The owner's line on taking orders' settings (waiter mode P5): today's
 * take-backs, cancels and lines on the house, for the whole business and
 * in no shekels, leading to the activity log for who did what and why.
 * For those who run orders, or a view as such (`order_floor`'s fixes).
 */
export function OrderFixesLine({
  fixes,
  activityHref,
  wording,
}: {
  fixes: NonNullable<OrderFloor["fixes"]>;
  activityHref: string;
  wording: AppWording;
}) {
  const t = translator(wording, "app.manage");
  return (
    <ListGroup className="md:max-w-2xl">
      <ListRow
        href={activityHref}
        leading={<ClipboardList />}
        title={t("orderFixes.today", fixes)}
        subtitle={t("orderFixes.details")}
      />
    </ListGroup>
  );
}
