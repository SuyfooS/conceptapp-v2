"use client";

import type { StationTillOrder } from "@domain/order-stations";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { SkeletonBones } from "@ui/skeleton";
import { StationBanner } from "@ui/station-banner";
import {
  ChevronRight,
  Info,
  LockOpen,
  Receipt,
  ReceiptText,
  WifiOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { OrderFactsContext } from "@/app/(app)/orders/order-facts";
import { useModeToast } from "@/app/(app)/orders/orders-mode";
import { ltr, useOrderWords } from "@/app/(app)/orders/orders-parts";
import type { Say } from "@/app/(app)/orders/orders-types";
import { TillItemList, TillRoundLists } from "@/app/(app)/orders/till-parts";
import type { StationFacts } from "./kitchen-station";
import type { StationBackend } from "./station-backend";
import { stationFailureWords } from "./station-words";
import { type StationPoll, useStationPoll } from "./use-station-poll";

/**
 * The counter's tablet, locked as the till (waiter mode P8a, §4.10), with
 * nobody's account on it: the open orders and today's closed and cancelled
 * ones, and for the one chosen what to ring into the business's register,
 * by item or by round, in large type, with no total and no name. It closes an
 * order (refused while a held block waits, with "ביטול" in the toast for the
 * close's two minutes), and opens a closed one again while its place is free.
 * Phone: the list, then the order chosen on its own; tablet and desktop: the
 * list beside it. It opens straight on the list: a till has no sound to
 * unlock.
 */
export function TillStation({
  facts,
  backend,
  foot,
  leave,
  chosen: opensOn = null,
}: {
  facts: Omit<StationFacts, "department">;
  backend: StationBackend;
  foot: ReactNode;
  leave: () => void;
  /** The twin's: an order chosen as it opens. */
  chosen?: string | null;
}) {
  const poll = useStationPoll(backend, { enabled: true, leave });
  return (
    <OrderFactsContext.Provider
      value={{
        timeZone: facts.timeZone,
        departments: Object.fromEntries(
          (poll.till?.departments ?? []).map((d) => [d.id, d.name]),
        ),
        names: {},
        lateAfterMinutes: 15,
        now: poll.now,
      }}
    >
      <TillScreen
        facts={facts}
        backend={backend}
        poll={poll}
        foot={foot}
        opensOn={opensOn}
      />
    </OrderFactsContext.Provider>
  );
}

function TillScreen({
  facts,
  backend,
  poll,
  foot,
  opensOn,
}: {
  facts: Omit<StationFacts, "department">;
  backend: StationBackend;
  poll: StationPoll;
  foot: ReactNode;
  opensOn: string | null;
}) {
  const { t, placeTitle, time } = useOrderWords();
  const ts = useTranslations("app.orders.station");
  const tPage = useTranslations("station");
  // The screen's one toast: its "ביטול" stays while the cashier moves to the
  // next order, or back to the list, as the next steps at a till are.
  const { say, toast } = useModeToast();
  const [chosen, setChosen] = useState<string | null>(opensOn);
  const till = poll.till;
  const orders = till?.orders ?? [];
  const closed = till?.closed ?? [];
  const order = [...orders, ...closed].find((one) => one.id === chosen) ?? null;
  const named = (one: StationTillOrder) =>
    placeTitle({ placeName: one.place?.name ?? null, takeaway: one.takeaway });
  const loading = till === null && poll.refusal === null;

  /**
   * A close, its "ביטול" or a reopen, as the till's: a refusal says why in
   * the toast; done, the till reads again. The screen's, not the chosen
   * order's, so the undo still writes once another order is chosen.
   */
  async function write(body: TillWrite): Promise<boolean> {
    const result = await backend.write(body);
    if (!result.ok) {
      say(stationFailureWords(t, ts("checking"), result.failure, body.do));
      return false;
    }
    poll.pollNow();
    return true;
  }

  const row = (one: StationTillOrder) => {
    const at = (value: string | null) => time(value ?? poll.now);
    const subtitle =
      one.status === "open"
        ? one.ready > 0
          ? t("floor.state.ready")
          : t.rich("station.till.openedAt", { time: at(one.openedAt), ltr })
        : one.status === "cancelled"
          ? t.rich("station.till.cancelledRow", {
              time: at(one.cancelledAt),
              ltr,
            })
          : one.closedHere
            ? t.rich("station.till.closedHere", { time: at(one.closedAt), ltr })
            : t.rich("station.till.closedRow", { time: at(one.closedAt), ltr });
    return (
      <ListRow
        key={one.id}
        onClick={() => setChosen(one.id)}
        current={one.id === chosen}
        title={<span className="font-semibold text-lg">{named(one)}</span>}
        subtitle={<span className="text-base">{subtitle}</span>}
      />
    );
  };

  return (
    <PageBody className={cn(pageGlowClass, "min-h-dvh")}>
      <PageHeader
        eyebrow={facts.businessName}
        title={ts("till.title")}
        subtitle={
          till
            ? ts("till.status", { open: orders.length, closed: closed.length })
            : undefined
        }
      />
      {poll.connection === "down" ? (
        <StationBanner tone="danger" icon={<WifiOff />} title={ts("offline")} />
      ) : null}
      {poll.refusal === "off" ? (
        <Card>
          <p className="text-ink">{ts("off")}</p>
        </Card>
      ) : poll.refusal !== null ? (
        <Card>
          <p className="text-ink">{ts("checking")}</p>
        </Card>
      ) : null}
      {loading ? (
        <div role="status">
          <span className="sr-only">{tPage("till.loading")}</span>
          <SkeletonBones />
        </div>
      ) : poll.refusal !== null ? null : orders.length + closed.length === 0 ? (
        <EmptyState
          headingLevel="h2"
          icon={<ReceiptText />}
          title={ts("till.empty.title")}
          body={ts("till.empty.body")}
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[20rem_minmax(0,1fr)] md:items-start md:gap-8 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <div className={cn("flex flex-col gap-6", order && "hidden md:flex")}>
            <PageSection title={ts("till.open")}>
              {orders.length === 0 ? (
                <Card padding="lg">
                  <p className="text-ink-2">{ts("till.openEmpty")}</p>
                </Card>
              ) : (
                <ListGroup>{orders.map(row)}</ListGroup>
              )}
            </PageSection>
            <PageSection title={t("floor.closed.title")}>
              {closed.length === 0 ? (
                <Card padding="lg">
                  <p className="text-ink-2">{ts("till.closedEmpty")}</p>
                </Card>
              ) : (
                <ListGroup>{closed.map(row)}</ListGroup>
              )}
            </PageSection>
          </div>
          <div className={cn(!order && "hidden md:block")}>
            {order ? (
              <TillChosen
                key={order.id}
                order={order}
                title={named(order)}
                taken={
                  order.status === "closed" &&
                  order.place !== null &&
                  orders.some((one) => one.place?.id === order.place?.id)
                }
                write={write}
                say={say}
                onBack={() => setChosen(null)}
              />
            ) : (
              <Card padding="none">
                <EmptyState
                  headingLevel="h2"
                  icon={<ReceiptText />}
                  title={ts("till.choose.title")}
                  body={ts("till.choose.body")}
                />
              </Card>
            )}
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-col items-center gap-1 pt-2 md:flex-row md:justify-between">
        <p className="text-ink-2 text-sm">{ts("name", { name: facts.name })}</p>
        {foot}
      </div>
      {toast}
    </PageBody>
  );
}

/** What the till writes of an order. */
type TillWrite = { do: "close" | "reopen" | "undoClose"; order: string };

/** Below `md` the order chosen is drawn alone, in the list's place. */
const ALONE = "(max-width: 767.98px)";

function TillChosen({
  order,
  title,
  taken,
  write,
  say,
  onBack,
}: {
  order: StationTillOrder;
  title: string;
  /** A closed order whose place has another open one: it opens again later. */
  taken: boolean;
  /** The screen's write, which outlives this order's panel. */
  write: (body: TillWrite) => Promise<boolean>;
  /** The screen's toast. */
  say: Say;
  onBack: () => void;
}) {
  const { t, time, department } = useOrderWords();
  const ts = useTranslations("app.orders.station");
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<"item" | "round">("item");
  const [busy, setBusy] = useState(false);
  const open = order.status === "open";

  // The order chosen takes the focus. On a phone it takes the list's place,
  // so the page goes back to its top with it: chosen low in a long list, it
  // would open scrolled past its heading and its way back.
  useEffect(() => {
    if (window.matchMedia(ALONE).matches) window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, []);

  async function written(body: TillWrite): Promise<boolean> {
    setBusy(true);
    try {
      return await write(body);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (busy) return;
    if (!(await written({ do: "close", order: order.id }))) return;
    // Its "ביטול" gives the kitchen back what the close served, as the
    // phone's does, within the close's two minutes: the screen's write, so
    // it still goes once the cashier has chosen another order or gone back.
    const undo: TillWrite = { do: "undoClose", order: order.id };
    say(t("toast.closed", { place: title }), {
      undo: () => void write(undo),
      focus: true,
      after: () => heading.current,
    });
  }

  async function reopen() {
    if (busy) return;
    if (!(await written({ do: "reopen", order: order.id }))) return;
    say(t("toast.reopened", { place: title }));
    heading.current?.focus({ preventScroll: true });
  }

  const when =
    order.status === "cancelled" && order.cancelledAt
      ? t.rich("till.cancelledAtNobody", {
          time: time(order.cancelledAt),
          reason: order.cancelReason
            ? t(`reasons.order.${order.cancelReason}`)
            : "",
          ltr,
        })
      : order.status === "closed" && order.closedAt
        ? order.closedHere
          ? t.rich("station.till.closedHere", {
              time: time(order.closedAt),
              ltr,
            })
          : t.rich("till.closedAtNobody", { time: time(order.closedAt), ltr })
        : t.rich("station.till.openedAt", { time: time(order.openedAt), ltr });

  // Why the main action waits, said beside it.
  const why = open
    ? order.held > 0
      ? t("close.held")
      : order.unserved.length > 0
        ? t("close.unserved", {
            departments: order.unserved.map(department).join(", "),
          })
        : null
    : order.status === "closed" && taken
      ? t("failed.reopenTaken")
      : null;

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
        {ts("till.back")}
      </Button>
      <div className="flex flex-col gap-1">
        <h2
          ref={heading}
          id={`${order.id}-title`}
          tabIndex={-1}
          className="font-bold text-2xl outline-none"
        >
          {t("till.title", { place: title })}
        </h2>
        <p className="text-ink-2 text-lg">{when}</p>
      </div>
      {order.status === "cancelled" ? (
        <p className="rounded-card bg-surface px-4 py-4 text-ink-2 text-lg shadow-card">
          {t("till.cancelled")}
        </p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-ink-2">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t("till.note")}
          </p>
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
          {view === "item" ? (
            <TillItemList lines={order.byItem} large />
          ) : (
            <TillRoundLists rounds={order.byRound} level={3} large />
          )}
        </>
      )}
      {why ? <p className="text-ink-2 text-lg">{why}</p> : null}
      {open ? (
        <Button
          size="lg"
          className="self-start"
          disabled={order.held > 0 || busy}
          loading={busy}
          onClick={() => void close()}
        >
          <Receipt aria-hidden="true" />
          {order.place ? t("close.place") : t("close.takeaway")}
        </Button>
      ) : order.status === "closed" ? (
        <Button
          size="lg"
          className="self-start"
          disabled={taken || busy}
          loading={busy}
          onClick={() => void reopen()}
        >
          <LockOpen aria-hidden="true" />
          {t("close.reopen")}
        </Button>
      ) : null}
    </section>
  );
}
