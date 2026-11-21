"use client";

import { closeState, reopenState } from "@domain/order-screens";
import {
  type OrderDetail,
  type OrderFloor,
  orderTill,
  type TillLine,
} from "@domain/orders";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { TillList } from "@ui/till-list";
import { Info, LockOpen, Receipt, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { useOrdersMode } from "./orders-mode";
import {
  fixFailureWords,
  ltr,
  OffShiftCard,
  Price,
  useModeHeading,
  useOrderWords,
} from "./orders-parts";

/**
 * "לקופה" for an order (waiter mode P5, the design's §3.2 step 10): what the
 * cashier rings into the business's own register, by item (identical lines
 * together) and by round (who sent what, and when), with no total and the
 * note that says it is no receipt; a line on the house marked, its price
 * struck. Drawn from the order whole (`orderTill`), so it stays current with
 * the mode's sync. Phone and tablet: one view at a time. Desktop: both side
 * by side. The main action closes an open order (refused while a held
 * block waits, with its "ביטול" that opens it again and gives the kitchen
 * back what the close served), or opens a closed one again the same day
 * while its place is free; a cancelled order says who cancelled it and why,
 * with no list.
 */
export function TillView({
  order,
  floor,
  view = "item",
}: {
  /** The order, open or not; null when there is none to read. */
  order: OrderDetail | null;
  floor: OrderFloor | null;
  /** The view a phone or a tablet opens on. */
  view?: "item" | "round";
}) {
  const { t, placeTitle } = useOrderWords();
  const heading = useModeHeading();
  const { paths, off } = useOrdersMode();
  if (off) {
    return (
      <PageBody className={pageGlowClass}>
        <PageHeader
          back={{ href: paths.floor, label: t("floor.title") }}
          eyebrow={heading.eyebrow}
          title={t("till.metaTitle")}
        />
        <OffShiftCard off={off} />
      </PageBody>
    );
  }
  if (!order) {
    return (
      <PageBody>
        <EmptyState
          icon={<ReceiptText />}
          title={t("till.noOrder.title")}
          body={t("till.noOrder.body")}
        >
          <Button asChild>
            <Link href={paths.floor}>{t("order.noPlace.back")}</Link>
          </Button>
        </EmptyState>
      </PageBody>
    );
  }
  const title = placeTitle({
    placeName: order.place?.name ?? null,
    takeaway: order.takeaway?.number ?? null,
  });
  return (
    <Till
      key={order.id}
      order={order}
      floor={floor}
      title={title}
      opensOn={view}
    />
  );
}

function Till({
  order,
  floor,
  title,
  opensOn,
}: {
  order: OrderDetail;
  floor: OrderFloor | null;
  title: string;
  opensOn: "item" | "round";
}) {
  const { t, time, person, department } = useOrderWords();
  const heading = useModeHeading();
  const mode = useOrdersMode();
  const { frame, paths, actions, say } = mode;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState(opensOn);
  const [busy, setBusy] = useState(false);
  const till = orderTill(order);
  const open = order.status === "open";
  const closing = closeState(order, frame.departmentOrder);
  const reopen = floor ? reopenState(order, floor) : "ok";

  async function write(
    run: () => ReturnType<typeof actions.close>,
    what: "close" | "reopen" | "undoClose",
  ): Promise<boolean> {
    setBusy(true);
    const result = await run().catch(() => null);
    setBusy(false);
    mode.syncNow();
    if (!result?.ok) {
      say(fixFailureWords(t, result ? result.failure : "failed", what));
      return false;
    }
    return true;
  }

  async function close() {
    if (!(await write(() => actions.close(order.id), "close"))) return;
    // The button turns into "פתיחה מחדש": the way back takes the focus. It
    // takes the close back whole, what it served back in the kitchen as it
    // was; "פתיחה מחדש" leaves that served.
    say(t("toast.closed", { place: title }), {
      undo: () => void write(() => actions.undoClose(order.id), "undoClose"),
      focus: true,
      after: () => titleRef.current,
    });
  }

  async function reopenNow() {
    if (!(await write(() => actions.reopen(order.id), "reopen"))) return;
    say(t("toast.reopened", { place: title }));
    titleRef.current?.focus({ preventScroll: true });
  }

  const subtitle = () => {
    if (order.status === "cancelled" && order.cancelledAt) {
      const reason = order.cancelReason
        ? t(`reasons.order.${order.cancelReason}`)
        : "";
      const by = person(order.cancelledBy);
      return by
        ? t.rich("till.cancelledAt", {
            time: time(order.cancelledAt),
            name: by,
            reason,
            ltr,
          })
        : t.rich("till.cancelledAtNobody", {
            time: time(order.cancelledAt),
            reason,
            ltr,
          });
    }
    if (order.status === "closed" && order.closedAt) {
      const by = person(order.closedBy);
      return by
        ? t.rich("till.closedAt", { time: time(order.closedAt), name: by, ltr })
        : t.rich("till.closedAtNobody", { time: time(order.closedAt), ltr });
    }
    const opener = person(order.openedBy);
    const reopener = person(order.reopenedBy);
    return (
      <>
        <span className="block">
          {opener
            ? t.rich("order.opened", {
                time: time(order.openedAt),
                name: opener,
                ltr,
              })
            : t.rich("order.openedAt", { time: time(order.openedAt), ltr })}
        </span>
        {order.reopenedAt ? (
          <span className="block">
            {reopener
              ? t.rich("order.reopened", {
                  time: time(order.reopenedAt),
                  name: reopener,
                  ltr,
                })
              : t.rich("order.reopenedAt", {
                  time: time(order.reopenedAt),
                  ltr,
                })}
          </span>
        ) : null}
      </>
    );
  };

  // Why the main action waits, said beside it.
  const why = open
    ? closing.held
      ? t("close.held")
      : closing.unserved.length > 0
        ? t("close.unserved", {
            departments: closing.unserved.map(department).join(", "),
          })
        : null
    : order.status === "closed"
      ? reopen === "taken"
        ? t("failed.reopenTaken")
        : reopen === "dayOver"
          ? t("failed.day")
          : null
      : null;

  const action = open ? (
    <Button
      size="lg"
      disabled={frame.viewing || closing.held || busy}
      loading={busy}
      onClick={() => void close()}
    >
      <Receipt aria-hidden="true" />
      {order.place ? t("close.place") : t("close.takeaway")}
    </Button>
  ) : order.status === "closed" ? (
    <Button
      size="lg"
      disabled={frame.viewing || reopen !== "ok" || busy}
      loading={busy}
      onClick={() => void reopenNow()}
    >
      <LockOpen aria-hidden="true" />
      {t("close.reopen")}
    </Button>
  ) : undefined;

  const itemRows = (lines: readonly TillLine[], prefix: string) =>
    lines.map((line, index) => ({
      key: `${prefix}-${index}`,
      qty: line.quantity,
      name: line.name,
      choices: line.choices,
      price: <Price agorot={line.unitAgorot} />,
      free: line.comped ? t("till.free") : null,
    }));
  const byItem = (
    <TillList
      label={t("till.byItem")}
      rows={itemRows(till.byItem, "item")}
      empty={t("till.empty")}
      qtyLabel={t("till.qty")}
      priceLabel={t("till.unit")}
    />
  );
  const byRound = (level: 2 | 3) => {
    const Heading = level === 2 ? "h2" : "h3";
    return (
      <div className="flex flex-col gap-4">
        {till.byRound.length === 0 ? (
          <p className="rounded-card bg-surface px-4 py-4 text-ink-2 shadow-card">
            {t("till.empty")}
          </p>
        ) : null}
        {till.byRound.map((round, index) => {
          const by = person(round.sentBy);
          return (
            <section key={round.id} className="flex flex-col gap-2">
              <Heading className="px-1 font-semibold text-base text-ink-2">
                {by
                  ? t.rich("till.round", {
                      n: index + 1,
                      time: time(round.sentAt),
                      name: by,
                      ltr,
                    })
                  : t.rich("till.roundAt", {
                      n: index + 1,
                      time: time(round.sentAt),
                      ltr,
                    })}
              </Heading>
              <TillList
                label={t("till.roundLabel", { n: index + 1 })}
                rows={itemRows(round.lines, round.id)}
                empty={t("till.roundEmpty")}
                qtyLabel={t("till.qty")}
                priceLabel={t("till.unit")}
              />
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={
          open
            ? {
                href: order.place
                  ? paths.place(order.place.id)
                  : paths.takeaway(order.id),
                label: title,
              }
            : { href: paths.floor, label: t("floor.title") }
        }
        eyebrow={heading.eyebrow}
        title={t("till.title", { place: title })}
        headingRef={titleRef}
        subtitle={subtitle()}
        actions={action}
      />
      {why ? <p className="text-ink-2 md:max-w-2xl">{why}</p> : null}
      {frame.viewing ? (
        <p className="text-ink-2 md:max-w-2xl">{t("failed.viewOnly")}</p>
      ) : null}
      {order.status === "cancelled" ? (
        <p className="rounded-card bg-surface px-4 py-4 text-ink-2 shadow-card md:max-w-2xl">
          {t("till.cancelled")}
        </p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-ink-2 md:max-w-2xl">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t("till.note")}
          </p>
          <div className="flex flex-col gap-4 xl:hidden">
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
            <div className="md:max-w-2xl">
              {view === "item" ? byItem : byRound(2)}
            </div>
          </div>
          <div className="hidden gap-8 xl:grid xl:grid-cols-2 xl:items-start">
            <PageSection title={t("till.byItem")}>{byItem}</PageSection>
            <PageSection title={t("till.byRound")}>{byRound(3)}</PageSection>
          </div>
        </>
      )}
    </PageBody>
  );
}
