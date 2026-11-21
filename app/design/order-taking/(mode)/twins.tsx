"use client";

import { MAX_STATIONS } from "@domain/clock-station";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { FloorView } from "../../../(app)/orders/floor-view";
import { MineView } from "../../../(app)/orders/mine-view";
import { NoPlace, OrderView } from "../../../(app)/orders/order-view";
import { useOrdersMode } from "../../../(app)/orders/orders-mode";
import { PrepView } from "../../../(app)/orders/prep-view";
import { OrderStations } from "../../../(app)/orders/stations/order-stations";
import type { OrderStationsData } from "../../../(app)/orders/stations/stations-types";
import { TillView } from "../../../(app)/orders/till-view";
import { markSeen } from "../changes";
import { mostOrdered, orderDemoDepartments } from "../data";
import { useOpenedWith, useOrderDemo } from "../demo-store";
import { twinMenu, twinPlaces } from "../real-menu";
import {
  twinDetail,
  twinFloor,
  twinMine,
  twinOrderAt,
  twinPrep,
} from "../real-orders";
import {
  demoLockOrderDevice,
  demoRestartOrderStation,
  demoStopOrderStation,
} from "../station/actions";
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
 * ready toast lead). `&state=choices` opens the burger's choices (P6).
 */
export function OrderTwin() {
  const params = useSearchParams();
  const opened = useOpenedWith();
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
        choosing={opened === "choices" ? "burger" : null}
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
  if (!takeaway) {
    // A takeaway closed or cancelled while it was on screen says so (P5).
    const closed = orderId ? data.closed.find((o) => o.id === orderId) : null;
    if (!closed) return <NoPlace />;
    return (
      <OrderView
        key={closed.id}
        where={{ kind: "takeaway", order: closed.id }}
        order={null}
        closedOrder={twinDetail(data, closed.id, now)}
        menu={menu}
        favourites={mostOrdered}
        floor={floor}
      />
    );
  }
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

/**
 * "לקופה" on the twin (P5): the app's own till, for `?order=` open or closed
 * this evening; `&state=byRound` opens it by round.
 */
export function TillTwin() {
  const params = useSearchParams();
  const opened = useOpenedWith();
  const { data, now, version } = useTwinData();
  const orderId = params.get("order");
  return (
    <TillView
      order={orderId ? twinDetail(data, orderId, now) : null}
      floor={twinFloor(data, now, version)}
      view={opened === "byRound" ? "round" : "item"}
    />
  );
}

export function MineTwin() {
  const { data, now, version } = useTwinData();
  return <MineView mine={twinMine(data, now, version)} />;
}

/** The twin's kitchen, by its name: its screen is called after it. */
const KITCHEN = orderDemoDepartments.find((d) => d.key === "kitchen");

/**
 * The kitchen's and the till's screens the twin's prep screen lists (P8a):
 * the kitchen's, open now, which last marked a ticket ready at 20:40, and
 * the till, seen at 20:31. With `full` ten run in all, so neither lock is
 * offered.
 */
function twinStations(
  till: string,
  viewOnly: boolean,
  full: boolean,
): OrderStationsData {
  const kitchen = KITCHEN?.name ?? "";
  const running = [kitchen, till];
  const offer = {
    current: null,
    running,
    total: full ? MAX_STATIONS : running.length,
    other: null,
  };
  return {
    kitchen: offer,
    till: offer,
    departments: orderDemoDepartments.map((d) => ({ id: d.key, name: d.name })),
    rows: [
      {
        id: "station-kitchen",
        name: kitchen,
        shows: "prep",
        department: kitchen,
        every: false,
        seen: { kind: "showing" },
        last: { what: "ready", time: "20:40" },
      },
      {
        id: "station-till",
        name: till,
        shows: "till",
        department: null,
        every: false,
        seen: { kind: "seen", date: "2026-11-19", time: "20:31" },
        last: null,
      },
    ],
    today: "2026-11-19",
    viewOnly,
  };
}

/**
 * Preparing on the twin: the kitchen's and the bar's for Shiran, a manager;
 * the kitchen's alone for Noa (`?state=kitchen`). What it shows is on a
 * screen now, as the kitchen's read marks it. Under it, for Shiran, who
 * runs orders, the real "מסך במטבח או בקופה" (P8a): locking this device as
 * the kitchen's screen or the till goes to its twin, and the screens
 * running stop in memory. `?state=fullStations` with ten running in all.
 */
export function PrepTwin() {
  const tLock = useTranslations("app.orders.stations.lock");
  const [opened] = useState(useOpenedWith());
  const { data, now, version } = useTwinData();
  const { update } = useOrderDemo();
  const { frame } = useOrdersMode();
  const prep = twinPrep(data, frame.prepares, now, version);
  // Kept across the clock's ticks: a screen stopped here stays off the list.
  const till = tLock("defaultTill");
  const stations = useMemo(
    () => twinStations(till, frame.viewing, opened === "fullStations"),
    [till, frame.viewing, opened],
  );
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
      {frame.runs ? (
        <OrderStations
          stations={stations}
          actions={{
            lock: demoLockOrderDevice,
            stop: demoStopOrderStation,
            restart: demoRestartOrderStation,
            clearsDevice: false,
          }}
        />
      ) : null}
    </PrepView>
  );
}
