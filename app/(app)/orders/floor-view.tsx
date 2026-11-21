"use client";

import {
  closedToday,
  draftKey,
  floorStatus,
  type PlaceState,
  placeState,
} from "@domain/order-screens";
import type { OrderPlace } from "@domain/order-taking";
import type { FloorOrder, OrderFloor, ReadyTicket } from "@domain/orders";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { DataTable } from "@ui/data-table";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Ban, LayoutGrid, Receipt, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useOrdersMode } from "./orders-mode";
import {
  ConnectionNote,
  failureWords,
  ltr,
  OffShiftCard,
  PlaceTileView,
  placeStateWords,
  SentLineView,
  useModeHeading,
  useOrderWords,
  type Where,
} from "./orders-parts";

/** A tile of the floor: a place, or a takeaway, with its order if it has one. */
type Tile = {
  key: string;
  where: Where;
  order: FloorOrder | null;
  state: PlaceState;
  draft: number;
  /** Its rounds that haven't gone (P7). */
  unsent: number;
  href: string;
};

/**
 * The floor (waiter mode P4, the design's §3.2 and §11): every place and
 * open takeaway as a tile with its one state, a status line under the title
 * ("1 מוכן להגשה · 1 מחכה · 5 פתוחים"), and "פתיחת הזמנה בלי מקום" as the
 * main action. Phone: three tiles a row. Tablet: four or five beside what is
 * ready to serve, each served with one tap and its undo. Desktop: six a row,
 * the ready column, and the open orders' table under the tiles. One shared
 * floor: everyone sees every place, and who opened it. Under the places,
 * "נסגרו היום" (P5), each leading to its list for the till, where a closed
 * one opens again: the newest five on a phone and a tablet, with the rest a
 * tap away (default 6), all of them in a table on a desktop. A place with a
 * round of one's own that hasn't gone says "לא נשלח" (P7), first on the
 * status line, and "אין חיבור" shows under the title while there is none.
 */
export function FloorView({
  floor,
  places,
}: {
  /** The floor now; null for a taker off a shift. */
  floor: OrderFloor | null;
  /** The live places, in their order. */
  places: OrderPlace[];
}) {
  const { t, placeTitle, person, department, time, ago } = useOrderWords();
  const heading = useModeHeading();
  const mode = useOrdersMode();
  const { frame, paths, now, drafts, sender, actions, say, off } = mode;
  const router = useRouter();
  const readyHeading = useRef<HTMLHeadingElement>(null);
  // Served here: off the column at once, until the floor's next version.
  const [served, setServed] = useState<{ version: number; ids: string[] }>({
    version: floor?.version ?? 0,
    ids: [],
  });
  if (floor && floor.version !== served.version) {
    setServed({ version: floor.version, ids: [] });
  }

  // "פתיחת הזמנה בלי מקום": the screen's one main action, unless the empty
  // floor's "הוספת מקומות" is (then quieter). None off a shift, where the
  // card's way to the clock is, and none while viewing, where nothing opens.
  const header = (
    subtitle?: string,
    takeaway: "primary" | "secondary" | null = null,
  ) => (
    <PageHeader
      back={heading.back}
      eyebrow={heading.eyebrow}
      title={t("floor.title")}
      subtitle={subtitle}
      actions={
        takeaway ? (
          <Button
            asChild
            size="lg"
            variant={takeaway === "primary" ? "primary" : "secondary"}
          >
            <Link href={paths.takeaway(null)}>
              <ShoppingBag aria-hidden="true" />
              {t("floor.takeaway")}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  if (!floor || off) {
    return (
      <PageBody className={pageGlowClass}>
        {header()}
        <ConnectionNote />
        <OffShiftCard off={off ?? "clock"} />
      </PageBody>
    );
  }

  const tileOf = (
    where: Where,
    order: FloorOrder | null,
    key: string,
    href: string,
  ): Tile => ({
    key,
    where,
    order,
    state: placeState(order, now, frame.lateAfterMinutes),
    draft: drafts.counts[key] ?? 0,
    unsent: sender.unsent[key]?.count ?? 0,
    href,
  });
  const live = new Set(places.map((place) => place.id));
  const placeTiles = [
    ...places.map((place) =>
      tileOf(
        { placeName: place.name, takeaway: null },
        floor.orders.find((order) => order.place === place.id) ?? null,
        draftKey({ place: place.id }),
        paths.place(place.id),
      ),
    ),
    // An open order at a place removed since stays on the floor.
    ...floor.orders
      .filter((order) => order.place && !live.has(order.place))
      .map((order) =>
        tileOf(
          { placeName: order.placeName, takeaway: null },
          order,
          draftKey({ place: order.place ?? "" }),
          paths.place(order.place ?? ""),
        ),
      ),
  ];
  // A new takeaway is a tile while its draft has lines or its first round
  // is on its way.
  const newKey = draftKey({ takeaway: null });
  const newTakeaway =
    (drafts.counts[newKey] ?? 0) + sender.pending(newKey).length;
  const takeawayTiles = [
    ...floor.orders
      .filter((order) => order.takeaway !== null)
      .map((order) =>
        tileOf(
          { placeName: null, takeaway: order.takeaway },
          order,
          draftKey({ takeaway: order.id }),
          paths.takeaway(order.id),
        ),
      ),
    ...(newTakeaway > 0
      ? [
          tileOf(
            { placeName: null, takeaway: null },
            null,
            draftKey({ takeaway: null }),
            paths.takeaway(null),
          ),
        ]
      : []),
  ];
  const status = floorStatus(
    [...placeTiles, ...takeawayTiles].map((tile) => tile.state),
  );
  const unsent = Object.values(sender.unsent).reduce(
    (sum, one) => sum + one.count,
    0,
  );
  const line = [
    unsent ? t("floor.status.unsent", { count: unsent }) : null,
    status.ready ? t("floor.status.ready", { count: status.ready }) : null,
    status.late ? t("floor.status.late", { count: status.late }) : null,
    status.open ? t("floor.status.open", { count: status.open }) : null,
  ].filter(Boolean);
  const ready = floor.ready.filter(
    (ticket) => !served.ids.includes(ticket.ticket),
  );

  async function serve(ticket: ReadyTicket, place: string) {
    setServed((was) => ({ ...was, ids: [...was.ids, ticket.ticket] }));
    const back = () =>
      setServed((was) => ({
        ...was,
        ids: was.ids.filter((id) => id !== ticket.ticket),
      }));
    const result = await actions.serve(ticket.ticket, true).catch(() => null);
    if (!result?.ok) {
      back();
      say(failureWords(t, result ? result.failure : "failed"));
      return;
    }
    mode.syncNow();
    // The card goes with its button: the way back takes the focus.
    say(
      t("toast.served", { place, department: department(ticket.department) }),
      {
        undo: () => {
          back();
          void actions.serve(ticket.ticket, false).then(() => mode.syncNow());
        },
        focus: true,
        after: () => readyHeading.current,
      },
    );
  }

  const tiles = (list: Tile[]) => (
    <ul className="grid grid-cols-3 gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {list.map((tile) => (
        <li key={tile.key} className="flex">
          <PlaceTileView
            where={tile.where}
            state={tile.state}
            by={tile.order ? person(tile.order.openedBy) || null : null}
            label={tile.order?.label}
            draft={tile.draft}
            unsent={tile.unsent}
            href={tile.href}
          />
        </li>
      ))}
    </ul>
  );

  // With no places, whoever runs orders is offered to add them: that is the
  // screen's main action then.
  const addsPlaces = placeTiles.length === 0 && frame.runs && !frame.viewing;
  return (
    <PageBody className={pageGlowClass}>
      {header(
        line.length ? line.join(" · ") : t("floor.status.free"),
        frame.viewing ? null : addsPlaces ? "secondary" : "primary",
      )}
      <ConnectionNote />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start md:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          {placeTiles.length === 0 ? (
            <EmptyState
              headingLevel="h2"
              icon={<LayoutGrid />}
              title={t("floor.empty.title")}
              body={
                frame.runs ? t("floor.empty.body") : t("floor.empty.waiter")
              }
            >
              {addsPlaces ? (
                <Button asChild>
                  <Link href={paths.menuPlaces}>{t("floor.empty.action")}</Link>
                </Button>
              ) : null}
            </EmptyState>
          ) : (
            <PageSection title={t("floor.places")}>
              {tiles(placeTiles)}
            </PageSection>
          )}
          {takeawayTiles.length > 0 ? (
            <PageSection title={t("floor.takeaways")}>
              {tiles(takeawayTiles)}
            </PageSection>
          ) : null}
          {floor.orders.length > 0 ? (
            <div className="hidden xl:block">
              <PageSection title={t("floor.table.title")}>
                <Card padding="none" className="overflow-hidden">
                  <DataTable
                    caption={t("floor.table.title")}
                    columns={[
                      { key: "place", label: t("floor.table.place") },
                      { key: "by", label: t("floor.table.by") },
                      { key: "last", label: t("floor.table.lastSent") },
                      { key: "state", label: t("floor.table.state") },
                    ]}
                    rows={floor.orders.map((order) => {
                      const state = placeState(
                        order,
                        now,
                        frame.lateAfterMinutes,
                      );
                      const unsentHere =
                        sender.unsent[
                          order.place
                            ? draftKey({ place: order.place })
                            : draftKey({ takeaway: order.id })
                        ]?.count ?? 0;
                      const last = order.lastSentAt ?? order.openedAt;
                      return {
                        key: order.id,
                        cells: {
                          place: placeTitle(order),
                          by: person(order.openedBy),
                          last: t.rich("floor.table.last", {
                            time: time(last),
                            ago: ago(last, now),
                            ltr,
                          }),
                          state:
                            state.kind === "open" && unsentHere === 0
                              ? t("floor.table.open")
                              : placeStateWords(t, state, 0, unsentHere),
                        },
                      };
                    })}
                    onSelect={(key) => {
                      const order = floor.orders.find((o) => o.id === key);
                      if (!order) return;
                      router.push(
                        order.place
                          ? paths.place(order.place)
                          : paths.takeaway(order.id),
                      );
                    }}
                    rowHint={t("floor.table.hint")}
                  />
                </Card>
              </PageSection>
            </div>
          ) : null}
          {floor.closed.length > 0 ? (
            <PageSection title={t("floor.closed.title")}>
              <ClosedToday closed={floor.closed} />
            </PageSection>
          ) : null}
        </div>
        <div className="hidden md:block">
          <PageSection title={t("floor.readyTitle")} headingRef={readyHeading}>
            {ready.length === 0 ? (
              <Card padding="lg">
                <p className="text-ink-2">{t("floor.readyEmpty")}</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {ready.map((ticket) => {
                  const place = placeTitle(ticket);
                  // A table's kitchen and bar tickets: each by both.
                  const card = t("floor.readyCard", {
                    place,
                    department: department(ticket.department),
                  });
                  return (
                    <li key={ticket.ticket}>
                      <Card className="flex flex-col gap-3">
                        <p className="font-semibold">{card}</p>
                        <ul className="flex flex-col divide-y divide-line">
                          {ticket.lines.map((line) => (
                            <SentLineView key={line.id} line={line} />
                          ))}
                        </ul>
                        <Button
                          variant="secondary"
                          disabled={frame.viewing}
                          onClick={() => void serve(ticket, place)}
                        >
                          {t("order.serve")}
                          <span className="sr-only">
                            {t("draft.forItem", { name: card })}
                          </span>
                        </Button>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </PageSection>
        </div>
      </div>
      {frame.viewing ? (
        <p className="text-ink-2">{t("failed.viewOnly")}</p>
      ) : null}
    </PageBody>
  );
}

/**
 * Today's closed and cancelled orders, newest first, each leading to its list
 * for the till: a list on a phone and a tablet, five and then the rest; a
 * table on a desktop, with every one of them, each row's button named by its
 * place, its state and its time, as two orders at one table read apart.
 */
function ClosedToday({ closed }: { closed: OrderFloor["closed"] }) {
  const { t, placeTitle, time } = useOrderWords();
  const { paths } = useOrdersMode();
  const router = useRouter();
  const [all, setAll] = useState(false);
  const { rows, rest } = closedToday(closed);
  const list = useRef<HTMLDivElement>(null);
  // "הצגת כל" goes with its press: the first row it showed takes the focus.
  const firstShown = useRef<number | null>(null);
  useEffect(() => {
    const at = firstShown.current;
    if (!all || at === null) return;
    firstShown.current = null;
    list.current?.querySelectorAll<HTMLElement>("a")[at]?.focus();
  }, [all]);
  const when = (row: OrderFloor["closed"][number]) =>
    row.status === "cancelled"
      ? t.rich("floor.closed.cancelledAt", { time: time(row.closedAt), ltr })
      : t.rich("floor.closed.closedAt", { time: time(row.closedAt), ltr });
  return (
    <>
      <div className="flex flex-col gap-2 xl:hidden">
        <ListGroup ref={list}>
          {(all ? closed : rows).map((row) => (
            <ListRow
              key={row.id}
              href={paths.till(row.id)}
              leading={row.status === "cancelled" ? <Ban /> : <Receipt />}
              title={placeTitle(row)}
              subtitle={when(row)}
            />
          ))}
        </ListGroup>
        {rest.length > 0 && !all ? (
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => {
              firstShown.current = rows.length;
              setAll(true);
            }}
          >
            {t("floor.closed.more", { count: closed.length })}
          </Button>
        ) : null}
      </div>
      <div className="hidden xl:block">
        <Card padding="none" className="overflow-hidden">
          <DataTable
            caption={t("floor.closed.title")}
            columns={[
              { key: "place", label: t("floor.closed.table.place") },
              { key: "at", label: t("floor.closed.table.at") },
              { key: "state", label: t("floor.closed.table.state") },
            ]}
            rows={closed.map((row) => ({
              key: row.id,
              label: t("floor.closed.rowLabel", {
                place: placeTitle(row),
                status: row.status,
                time: time(row.closedAt),
              }),
              cells: {
                place: placeTitle(row),
                at: <span dir="ltr">{time(row.closedAt)}</span>,
                state:
                  row.status === "cancelled"
                    ? t("floor.closed.state.cancelled")
                    : t("floor.closed.state.closed"),
              },
            }))}
            onSelect={(key) => router.push(paths.till(key))}
            rowHint={t("floor.closed.hint")}
          />
        </Card>
      </div>
    </>
  );
}
