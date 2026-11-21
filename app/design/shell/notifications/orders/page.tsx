import { wordingFrom } from "../../../../(app)/wording";
import { restaurantWording } from "../../../order-taking/data";
import {
  demoOrderEarlier,
  demoOrderInboxNow,
  demoOrderUnread,
  orderTwinLead,
} from "../data";
import { InboxDemo } from "../view";

// The inbox on the order twin's evening (waiter mode P8b), in the
// restaurant's words: table 4's kitchen screen not connected and table 11
// ready, both new; table 4's beers ready and served since. Each leads into
// the order twin.
export default function ShellNotificationsOrders() {
  return (
    <InboxDemo
      unread={demoOrderUnread}
      earlier={demoOrderEarlier}
      now={demoOrderInboxNow}
      enabled={["scheduling", "time_clock", "order_taking"]}
      wording={wordingFrom({ template: restaurantWording, business: {} })}
      lead={orderTwinLead}
    />
  );
}
