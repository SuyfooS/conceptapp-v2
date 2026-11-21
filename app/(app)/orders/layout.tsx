import type { ReactNode } from "react";
import {
  cancelLineAction,
  cancelOrderAction,
  closeOrderAction,
  compLineAction,
  fireAction,
  moveOrderAction,
  reopenOrderAction,
  serveAction,
  setLabelAction,
  setReadyAction,
  takeBackAction,
} from "./actions";
import { frameOf, ordersAccess } from "./orders-access";
import { OrdersModeProvider } from "./orders-provider";

// Waiter mode (P4): every screen under /orders shares one provider, so the
// drafts, the send on its way, the sync and the toast go with the person
// from screen to screen. Someone the mode gives no item (a worker reading
// the menu by a link) gets the screens as they are.
export default async function OrdersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await ordersAccess();
  if (!access) return children;
  const business = access.businessId;
  return (
    <OrdersModeProvider
      frame={frameOf(access)}
      actions={{
        serve: serveAction.bind(null, business),
        setReady: setReadyAction.bind(null, business),
        takeBack: takeBackAction.bind(null, business),
        fire: fireAction.bind(null, business),
        setLabel: setLabelAction.bind(null, business),
        cancelLine: cancelLineAction.bind(null, business),
        compLine: compLineAction.bind(null, business),
        cancelOrder: cancelOrderAction.bind(null, business),
        move: moveOrderAction.bind(null, business),
        close: closeOrderAction.bind(null, business),
        reopen: reopenOrderAction.bind(null, business),
      }}
    >
      {children}
    </OrdersModeProvider>
  );
}
