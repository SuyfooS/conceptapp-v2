"use client";

import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { ChevronRight, LockOpen, Receipt, ReceiptText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { closeOrder, reopenOrder } from "../../changes";
import { orderDemoBusiness } from "../../data";
import { useOrderDemo } from "../../demo-store";
import { hasHeld, type Order, placeStatus } from "../../model";
import {
  closerName,
  ltr,
  type OrderT,
  openOrderOf,
  orderById,
  personName,
  placeById,
  placeTitle,
  StationFoot,
  TillNote,
  TillView,
  useOrderWords,
  useUndoToast,
} from "../../parts";

/**
 * The counter's tablet, locked as the till (§4.10), with nobody's account
 * on it: the open places and today's closed orders, each with its list for
 * the register by item or by round, and no total, all in large type to
 * read from a step away. It closes an order and opens one again. Phone:
 * the places, then the one chosen on its own. Tablet and desktop: the
 * places beside the list chosen.
 */
export function TillStation() {
  const { t } = useOrderWords();
  const { data } = useOrderDemo();
  const [chosen, setChosen] = useState<string | null>(null);
  const order = orderById(data, chosen);
  const named = (o: Order) => {
    const place = placeById(data, o.placeId);
    return place ? placeTitle(t, place) : "";
  };

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        eyebrow={t("station.tillEyebrow", { business: orderDemoBusiness })}
        title={t("station.tillTitle")}
        subtitle={t("station.tillStatus", {
          open: data.orders.length,
          closed: data.closed.length,
        })}
      />
      <div className="grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)] md:items-start md:gap-8">
        <div className={cn("flex flex-col gap-6", order && "hidden md:flex")}>
          <PlacesList
            t={t}
            title={t("station.openTitle")}
            orders={data.orders}
            named={named}
            chosen={chosen}
            onChoose={setChosen}
            empty={t("station.openEmpty")}
          />
          <PlacesList
            t={t}
            title={t("floor.closedTitle")}
            orders={data.closed}
            named={named}
            chosen={chosen}
            onChoose={setChosen}
            empty={t("floor.closedEmpty")}
          />
        </div>
        <div className={cn(!order && "hidden md:block")}>
          {order ? (
            <TillDetail
              key={order.id}
              order={order}
              name={named(order)}
              onBack={() => setChosen(null)}
            />
          ) : (
            <Card padding="none">
              <EmptyState
                headingLevel="h2"
                icon={<ReceiptText />}
                title={t("station.chooseTitle")}
                body={t("station.chooseBody")}
              />
            </Card>
          )}
        </div>
      </div>
      <StationFoot />
    </PageBody>
  );
}

function PlacesList({
  t,
  title,
  orders,
  named,
  chosen,
  onChoose,
  empty,
}: {
  t: OrderT;
  title: string;
  orders: Order[];
  named: (order: Order) => string;
  chosen: string | null;
  onChoose: (id: string) => void;
  empty: string;
}) {
  const { time } = useOrderWords();
  const { now } = useOrderDemo();
  return (
    <PageSection title={title}>
      {orders.length === 0 ? (
        <Card padding="lg">
          <p className="text-ink-2">{empty}</p>
        </Card>
      ) : (
        <ListGroup>
          {orders.map((order) => {
            const status = placeStatus(order, now);
            return (
              <ListRow
                key={order.id}
                onClick={() => onChoose(order.id)}
                current={order.id === chosen}
                // Large, as the station reads.
                title={
                  <span className="font-semibold text-lg">{named(order)}</span>
                }
                subtitle={
                  <span className="text-base">
                    {order.closedAt !== null
                      ? t.rich("floor.closedRow", {
                          time: time(order.closedAt),
                          name: closerName(t, order),
                          ltr,
                        })
                      : status.kind === "ready"
                        ? t("floor.state.ready")
                        : t.rich("order.opened", {
                            time: time(order.openedAt),
                            name: personName(order.openedBy),
                            ltr,
                          })}
                  </span>
                }
              />
            );
          })}
        </ListGroup>
      )}
    </PageSection>
  );
}

function TillDetail({
  order,
  name,
  onBack,
}: {
  order: Order;
  name: string;
  onBack: () => void;
}) {
  const { t } = useOrderWords();
  const { data, now, update } = useOrderDemo();
  const { say, toast } = useUndoToast();
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<"item" | "round">("item");
  // A refused close shows only while held courses still wait: a screen kept
  // hidden and shown again may meet the order fired or closed meanwhile.
  const [refused, setRefused] = useState(false);
  const closed = order.closedAt !== null;
  const taken = closed && Boolean(openOrderOf(data, order.placeId));
  const takeaway = placeById(data, order.placeId)?.kind === "takeaway";

  // The list chosen takes the focus, where the phone shows it on its own.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  function close() {
    if (hasHeld(order)) {
      setRefused(true);
      return;
    }
    // Closed now: what refused it before no longer holds.
    setRefused(false);
    update((d) => closeOrder(d, order.placeId, "station", now));
    say(
      t("toast.closed", { place: name }),
      () => update((d) => reopenOrder(d, order.id)),
      { focus: true, after: () => heading.current },
    );
  }

  return (
    <section
      aria-labelledby={`${order.id}-title`}
      className="flex flex-col gap-4"
    >
      <Button
        variant="ghost"
        className="-ms-2 self-start px-2 md:hidden"
        onClick={onBack}
      >
        <ChevronRight aria-hidden="true" className="ltr:-scale-x-100" />
        {t("station.backToPlaces")}
      </Button>
      <h2
        ref={heading}
        id={`${order.id}-title`}
        tabIndex={-1}
        className="font-bold text-2xl outline-none"
      >
        {t("till.title", { place: name })}
      </h2>
      <TillNote t={t} />
      <Segmented
        label={t("till.view")}
        value={view}
        onChange={setView}
        className="self-start"
        options={[
          { value: "item", label: t("till.byItem") },
          { value: "round", label: t("till.byRound") },
        ]}
      />
      <TillView order={order} view={view} large />
      {refused && !closed && hasHeld(order) ? (
        <p role="alert" className="font-semibold text-danger text-lg">
          {t("till.refusedHeld")}
        </p>
      ) : null}
      {taken ? <p className="text-ink-2 text-lg">{t("till.taken")}</p> : null}
      {closed ? (
        <Button
          size="lg"
          disabled={taken}
          className="self-start"
          onClick={() => {
            update((d) => reopenOrder(d, order.id));
            say(t("toast.reopened", { place: name }));
          }}
        >
          <LockOpen aria-hidden="true" />
          {t("till.reopen")}
        </Button>
      ) : (
        <Button size="lg" className="self-start" onClick={close}>
          <Receipt aria-hidden="true" />
          {takeaway ? t("till.closeOrder") : t("till.closeTable")}
        </Button>
      )}
      {toast}
    </section>
  );
}
