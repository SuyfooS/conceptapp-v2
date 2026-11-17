"use client";

import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { DataTable } from "@ui/data-table";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { changeTicket, newTakeaway } from "../../changes";
import { orderDemoTables } from "../../data";
import { useOrderDemo } from "../../demo-store";
import { draftCount, placeStatus, type Ticket } from "../../model";
import {
  ago,
  closerName,
  departmentName,
  ltr,
  type OrderT,
  openOrderOf,
  PlaceTile,
  paths,
  personName,
  placeById,
  placeTitle,
  SentLineView,
  ticketsOf,
  useOrderWords,
  useUndoToast,
} from "../../parts";

/**
 * The floor (§3.2 step 2, §11): every table and open takeaway as a tile
 * with its one state, a status line under the title ("2 מוכנים להגשה · 1
 * מחכה · 6 פתוחים"), and "קבלת הזמנה לקחת" as the main action. Phone:
 * three tiles a row, then today's closed orders. Tablet: the tiles beside
 * what is ready to serve, each served with one tap. Desktop: the same,
 * with a table of the open orders under the tiles. One shared floor:
 * everyone sees every table, and who opened it.
 */
export function FloorScreen() {
  const { t, time } = useOrderWords();
  const { data, now, update } = useOrderDemo();
  const router = useRouter();
  const { say, toast } = useUndoToast();
  const readyHeading = useRef<HTMLHeadingElement>(null);

  const tiles = (places: typeof orderDemoTables) =>
    places.map((place) => {
      const order = openOrderOf(data, place.id);
      return {
        place,
        order,
        status: placeStatus(order, now),
        draft: draftCount(data.drafts[place.id] ?? []),
      };
    });
  const tables = tiles(orderDemoTables);
  // A takeaway shows once sent, or while its draft has something in it.
  const takeaways = tiles(
    data.takeaways.filter(
      (place) =>
        place.name !== null || (data.drafts[place.id]?.length ?? 0) > 0,
    ),
  );
  const all = [...tables, ...takeaways];
  const ready = all.filter((tile) => tile.status.kind === "ready").length;
  const late = all.filter((tile) => tile.status.kind === "late").length;
  const open = all.filter((tile) => tile.order).length;
  const status = [
    ready ? t("floor.status.ready", { count: ready }) : null,
    late ? t("floor.status.late", { count: late }) : null,
    open ? t("floor.status.open", { count: open }) : null,
  ].filter(Boolean);

  function takeaway() {
    const placeId = `takeaway-${crypto.randomUUID()}`;
    update((d) => newTakeaway(d, placeId));
    router.push(paths.order(placeId));
  }

  function serve(ticket: Ticket, place: string) {
    const before = ticket.state;
    update((d) => changeTicket(d, ticket.id, { state: "served" }));
    // The card goes with its button: the way back takes the focus.
    say(
      t("toast.served", {
        place,
        department: departmentName(ticket.department),
      }),
      () => update((d) => changeTicket(d, ticket.id, { state: before })),
      { focus: true, after: () => readyHeading.current },
    );
  }

  const readyTickets = ticketsOf(data).filter(
    ({ ticket }) => ticket.state === "ready",
  );

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.app, label: t("leave") }}
        eyebrow={t("mode")}
        title={t("floor.title")}
        subtitle={status.length ? status.join(" · ") : t("floor.status.free")}
        actions={
          <Button size="lg" onClick={takeaway}>
            <ShoppingBag aria-hidden="true" />
            {t("floor.takeaway")}
          </Button>
        }
      />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start md:gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <PageSection title={t("floor.tables")}>
            <ul className="grid grid-cols-3 gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {tables.map(({ place, order, status, draft }) => (
                <li key={place.id} className="flex">
                  <PlaceTile
                    t={t}
                    place={place}
                    status={status}
                    by={order ? personName(order.openedBy) : null}
                    draft={draft}
                    href={paths.order(place.id)}
                  />
                </li>
              ))}
            </ul>
          </PageSection>
          {takeaways.length > 0 ? (
            <PageSection title={t("floor.takeaways")}>
              <ul className="grid grid-cols-3 gap-2.5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {takeaways.map(({ place, order, status, draft }) => (
                  <li key={place.id} className="flex">
                    <PlaceTile
                      t={t}
                      place={place}
                      status={status}
                      by={order ? personName(order.openedBy) : null}
                      draft={draft}
                      href={paths.order(place.id)}
                    />
                  </li>
                ))}
              </ul>
            </PageSection>
          ) : null}
          <div className="hidden xl:block">
            <OpenOrders t={t} />
          </div>
        </div>
        <div className="hidden md:block">
          <PageSection title={t("floor.readyTitle")} headingRef={readyHeading}>
            {readyTickets.length === 0 ? (
              <Card padding="lg">
                <p className="text-ink-2">{t("floor.readyEmpty")}</p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {readyTickets.map(({ order, ticket }) => {
                  const place = placeById(data, order.placeId);
                  const name = place ? placeTitle(t, place) : "";
                  return (
                    <li key={ticket.id}>
                      <Card className="flex flex-col gap-3">
                        <p className="font-semibold">
                          {t("floor.readyCard", {
                            place: name,
                            department: departmentName(ticket.department),
                          })}
                        </p>
                        <ul className="flex flex-col divide-y divide-line">
                          {ticket.lines
                            .filter((line) => !line.takenBack)
                            .map((line) => (
                              <SentLineView key={line.id} t={t} line={line} />
                            ))}
                        </ul>
                        <Button
                          variant="secondary"
                          onClick={() => serve(ticket, name)}
                        >
                          {t("order.serve")}
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
      <PageSection title={t("floor.closedTitle")}>
        {data.closed.length === 0 ? (
          <Card padding="lg">
            <p className="text-ink-2">{t("floor.closedEmpty")}</p>
          </Card>
        ) : (
          <ListGroup className="md:max-w-2xl">
            {data.closed.map((order) => {
              const place = placeById(data, order.placeId);
              return (
                <ListRow
                  key={order.id}
                  href={paths.till(order.id)}
                  title={place ? placeTitle(t, place) : ""}
                  subtitle={t.rich("floor.closedRow", {
                    time: time(order.closedAt ?? now),
                    name: closerName(t, order),
                    ltr,
                  })}
                />
              );
            })}
          </ListGroup>
        )}
      </PageSection>
      {toast}
    </PageBody>
  );
}

/** The desktop's full picture: every open order, who opened it, when it last sent. */
function OpenOrders({ t }: { t: OrderT }) {
  const { time } = useOrderWords();
  const { data, now } = useOrderDemo();
  const router = useRouter();
  const rows = data.orders.map((order) => {
    const place = placeById(data, order.placeId);
    const status = placeStatus(order, now);
    const last = order.rounds.at(-1)?.at ?? order.openedAt;
    return {
      key: order.placeId,
      cells: {
        place: place ? placeTitle(t, place) : "",
        by: personName(order.openedBy),
        last: t.rich("floor.table.last", {
          time: time(last),
          ago: ago(t, last, now),
          ltr,
        }),
        state:
          status.kind === "ready"
            ? t("floor.state.ready")
            : status.kind === "late"
              ? t("floor.state.late", { count: status.minutes })
              : t("floor.table.open"),
      },
    };
  });
  return (
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
          rows={rows}
          onSelect={(key) => router.push(paths.order(key))}
          rowHint={t("floor.table.hint")}
        />
      </Card>
    </PageSection>
  );
}
