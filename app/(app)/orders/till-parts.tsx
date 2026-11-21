"use client";

import type { TillLine } from "@domain/orders";
import { cn } from "@ui/cn";
import { TillList } from "@ui/till-list";
import { ltr, Price, useOrderWords } from "./orders-parts";

/*
 * What to ring up, as the phone's "לקופה" (waiter mode P5) and the till's
 * station (P8a) draw it alike: by item, and by round. No total: the till
 * adds it up.
 */

const rowsOf = (lines: readonly TillLine[], prefix: string, free: string) =>
  lines.map((line, index) => ({
    key: `${prefix}-${index}`,
    qty: line.quantity,
    name: line.name,
    choices: line.choices,
    price: <Price agorot={line.unitAgorot} />,
    free: line.comped ? free : null,
  }));

/** The order's live lines, identical ones together. */
export function TillItemList({
  lines,
  large = false,
}: {
  lines: readonly TillLine[];
  large?: boolean;
}) {
  const { t } = useOrderWords();
  return (
    <TillList
      label={t("till.byItem")}
      rows={rowsOf(lines, "item", t("till.free"))}
      empty={t("till.empty")}
      qtyLabel={t("till.qty")}
      priceLabel={t("till.unit")}
      large={large}
    />
  );
}

/**
 * Each round's lines as they were sent, headed by its number and time, and
 * by who sent it where the screen names people (`sentBy`, the phone's only).
 */
export function TillRoundLists({
  rounds,
  level,
  large = false,
}: {
  rounds: readonly {
    id: string;
    sentAt: string;
    sentBy?: string | null;
    lines: readonly TillLine[];
  }[];
  level: 2 | 3;
  large?: boolean;
}) {
  const { t, time, person } = useOrderWords();
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-col gap-4">
      {rounds.length === 0 ? (
        <p
          className={cn(
            "rounded-card bg-surface px-4 py-4 text-ink-2 shadow-card",
            large && "text-lg",
          )}
        >
          {t("till.empty")}
        </p>
      ) : null}
      {rounds.map((round, index) => {
        const by = person(round.sentBy ?? null);
        return (
          <section key={round.id} className="flex flex-col gap-2">
            <Heading
              className={cn(
                "px-1 font-semibold text-ink-2",
                large ? "text-md" : "text-base",
              )}
            >
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
              rows={rowsOf(round.lines, round.id, t("till.free"))}
              empty={t("till.roundEmpty")}
              qtyLabel={t("till.qty")}
              priceLabel={t("till.unit")}
              large={large}
            />
          </section>
        );
      })}
    </div>
  );
}
