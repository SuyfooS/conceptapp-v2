"use client";

import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { MonitorSmartphone, Receipt } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { FloorView } from "../../../(app)/orders/floor-view";
import { MineView } from "../../../(app)/orders/mine-view";
import { NoPlace, OrderView } from "../../../(app)/orders/order-view";
import { useOrdersMode } from "../../../(app)/orders/orders-mode";
import { PrepView } from "../../../(app)/orders/prep-view";
import { markSeen } from "../changes";
import { mostOrdered } from "../data";
import { useOrderDemo } from "../demo-store";
import { paths } from "../parts";
import { twinMenu, twinPlaces } from "../real-menu";
import {
  twinDetail,
  twinFloor,
  twinMine,
  twinOrderAt,
  twinPrep,
} from "../real-orders";
import { useTwinData } from "../twin-mode";

/*
 * The mode's screens on the twin (waiter mode P4): the app's own views,
 * drawn from the twin's store through real-orders.ts, as P2 did for the
 * menu. What they change goes through the twin's stand-ins (twin-mode.tsx).
 */

/** The twin's menu at the version its rows are at, with its tables. */
function useMenu() {
  const { data, version } = useTwinData();
  return twinMenu(data, version, twinPlaces(data.tables));
}

export function FloorTwin() {
  const { data, now, version } = useTwinData();
  return (
    <FloorView
      floor={twinFloor(data, now, version)}
      places={twinPlaces(data.tables)}
    />
  );
}

/**
 * A place's order, or a takeaway's: `?place=table-6`, `?place=takeaway-new`
 * for a new one, or `?order=` for one by its id (where "ההזמנות שלי" and the
 * ready toast lead).
 */
export function OrderTwin() {
  const params = useSearchParams();
  const { data, now, version } = useTwinData();
  const menu = useMenu();
  const floor = twinFloor(data, now, version);
  const placeId = params.get("place");
  const orderId = params.get("order");
  const byOrder = orderId
    ? (data.orders.find((o) => o.id === orderId) ?? null)
    : null;
  const table = data.tables.find((p) => p.id === (byOrder?.placeId ?? placeId));
  if (table) {
    const open = twinOrderAt(data, table.id);
    return (
      <OrderView
        where={{
          kind: "place",
          place: { id: table.id, name: table.name ?? "" },
        }}
        order={open ? twinDetail(data, open.id, now) : null}
        menu={menu}
        favourites={mostOrdered}
        floor={floor}
      />
    );
  }
  if (placeId === "takeaway-new") {
    return (
      <OrderView
        where={{ kind: "takeaway", order: null }}
        order={null}
        menu={menu}
        favourites={mostOrdered}
        floor={floor}
      />
    );
  }
  const takeaway =
    byOrder ??
    data.orders.find((o) => o.placeId === placeId && placeId !== null) ??
    null;
  if (!takeaway) return <NoPlace />;
  return (
    <OrderView
      key={takeaway.id}
      where={{ kind: "takeaway", order: takeaway.id }}
      order={twinDetail(data, takeaway.id, now)}
      menu={menu}
      favourites={mostOrdered}
      floor={floor}
    />
  );
}

export function MineTwin() {
  const { data, now, version } = useTwinData();
  return <MineView mine={twinMine(data, now, version)} />;
}

/**
 * Preparing on the twin: the kitchen's and the bar's for Shiran, a manager;
 * the kitchen's alone for Noa (`?state=kitchen`). What it shows is on a
 * screen now, as the kitchen's read marks it. Under it, locking this device
 * as the kitchen's or the till's screen, which the twin opens (P8).
 */
export function PrepTwin() {
  const t = useTranslations("design.orderTaking");
  const { data, now, version } = useTwinData();
  const { update } = useOrderDemo();
  const { frame } = useOrdersMode();
  const prep = twinPrep(data, frame.prepares, now, version);
  const unseen = prep.tickets
    .filter((ticket) => ticket.status === "new")
    .map((ticket) => ticket.id)
    .join(" ");
  const marked = useRef("");
  useEffect(() => {
    if (!unseen || marked.current === unseen) return;
    marked.current = unseen;
    update((d) => markSeen(d, unseen.split(" ")));
  }, [unseen, update]);
  return (
    <PrepView prep={prep}>
      <PageSection title={t("prep.devices")}>
        <ListGroup className="md:max-w-2xl">
          <ListRow
            href={paths.kitchen}
            leading={<MonitorSmartphone />}
            title={t("prep.lockKitchen")}
            subtitle={t("prep.lockKitchenHint")}
          />
          <ListRow
            href={paths.counter}
            leading={<Receipt />}
            title={t("prep.lockTill")}
            subtitle={t("prep.lockTillHint")}
          />
        </ListGroup>
      </PageSection>
    </PrepView>
  );
}
