"use client";

import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Segmented } from "@ui/segmented";
import { LockOpen, Receipt, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { closeOrder, reopenOrder } from "../../../changes";
import { READER } from "../../../data";
import { useOpenedWith, useOrderDemo } from "../../../demo-store";
import { hasHeld, type Order } from "../../../model";
import {
  closerName,
  ltr,
  openOrderOf,
  orderById,
  paths,
  personName,
  placeById,
  placeTitle,
  TillList,
  TillNote,
  useOrderWords,
  useUndoToast,
} from "../../../parts";

/**
 * "לקופה" (§3.2 step 10): what the cashier rings into the business's own
 * register, by item or by round, with no total and the label that says so.
 * Phone and tablet: one view at a time. Desktop: both side by side. The
 * main action closes the order, refused while a held block waits; a closed
 * one opens again while its place is free.
 */
export function TillScreen() {
  const orderId = useSearchParams().get("order");
  const opened = useOpenedWith();
  const { t } = useOrderWords();
  const { data } = useOrderDemo();
  const order = orderById(data, orderId);
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
  return <Till key={order.id} order={order} opened={opened} />;
}

function Till({ order, opened }: { order: Order; opened: string | null }) {
  const { t, time } = useOrderWords();
  const { data, now, update } = useOrderDemo();
  const { say, toast } = useUndoToast();
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<"item" | "round">(
    opened === "byRound" ? "round" : "item",
  );
  const [refused, setRefused] = useState(false);
  const place = placeById(data, order.placeId);
  const title = place ? placeTitle(t, place) : "";
  const closed = order.closedAt !== null;
  const taken = closed && Boolean(openOrderOf(data, order.placeId));

  function close() {
    if (hasHeld(order)) {
      setRefused(true);
      return;
    }
    setRefused(false);
    update((d) => closeOrder(d, order.placeId, READER, now));
    say(
      t("toast.closed", { place: title }),
      () => update((d) => reopenOrder(d, order.id)),
      { focus: true, after: () => heading.current },
    );
  }

  function reopen() {
    update((d) => reopenOrder(d, order.id));
    say(t("toast.reopened", { place: title }));
    heading.current?.focus({ preventScroll: true });
  }

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={
          closed
            ? { href: paths.floor, label: t("nav.places") }
            : { href: paths.order(order.placeId), label: title }
        }
        eyebrow={t("mode")}
        title={t("till.title", { place: title })}
        headingRef={heading}
        subtitle={
          closed
            ? t.rich("till.closedAt", {
                time: time(order.closedAt ?? now),
                name: closerName(t, order),
                ltr,
              })
            : t.rich("order.opened", {
                time: time(order.openedAt),
                name: personName(order.openedBy),
                ltr,
              })
        }
        actions={
          closed ? (
            <Button size="lg" disabled={taken} onClick={reopen}>
              <LockOpen aria-hidden="true" />
              {t("till.reopen")}
            </Button>
          ) : (
            <Button size="lg" onClick={close}>
              <Receipt aria-hidden="true" />
              {place?.kind === "takeaway"
                ? t("till.closeOrder")
                : t("till.closeTable")}
            </Button>
          )
        }
      />
      {refused ? (
        <p role="alert" className="font-medium text-danger md:max-w-2xl">
          {t("till.refusedHeld")}
        </p>
      ) : null}
      {taken ? (
        <p className="text-ink-2 md:max-w-2xl">{t("till.taken")}</p>
      ) : null}
      <TillNote t={t} />
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
          <TillList order={order} view={view} headingLevel={2} />
        </div>
      </div>
      <div className="hidden gap-8 xl:grid xl:grid-cols-2 xl:items-start">
        <PageSection title={t("till.byItem")}>
          <TillList order={order} view="item" />
        </PageSection>
        <PageSection title={t("till.byRound")}>
          <TillList order={order} view="round" />
        </PageSection>
      </div>
      {toast}
    </PageBody>
  );
}
