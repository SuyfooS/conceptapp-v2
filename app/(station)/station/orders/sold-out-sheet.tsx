"use client";

import type { StationMenu, StationMenuItem } from "@domain/order-stations";
import { Button } from "@ui/button";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

/** The last change made here, with its way back while the sheet is open. */
type Change = { item: StationMenuItem; soldOut: boolean } | null;

/**
 * "מה נגמר" on the kitchen's screen (waiter mode P8a, default 7): the items
 * that go to the screen's department (every department's, for a screen of
 * all of them), by category, each with a switch "נגמר" named by the item. A
 * switch writes at once, and everyone taking orders sees it at their next
 * read; the sheet says what just changed, with "ביטול" to put it back (in
 * the sheet itself, which holds the keyboard while it is open). No prices.
 */
export function SoldOutSheet({
  open,
  onOpenChange,
  title,
  menu,
  setSoldOut,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  menu: StationMenu | null;
  /** Writes it; true when it went. The sheet says why not itself otherwise. */
  setSoldOut: (
    item: StationMenuItem,
    soldOut: boolean,
  ) => Promise<string | null>;
}) {
  const t = useTranslations("app.orders.station.soldOut");
  const tToast = useTranslations("app.orders.toast");
  const ids = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [change, setChange] = useState<Change>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Switched here, until the menu is read again with it. */
  const [shown, setShown] = useState<Record<string, boolean>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: the menu read again is what clears it
  useEffect(() => {
    setShown({});
  }, [menu]);

  const items = menu?.items ?? [];
  const categories = [
    ...new Map(items.map((item) => [item.category.id, item.category])),
  ].map(([, category]) => ({
    ...category,
    items: items.filter((item) => item.category.id === category.id),
  }));
  const available = (item: StationMenuItem) => shown[item.id] ?? item.available;

  async function flip(item: StationMenuItem, soldOut: boolean, tell = true) {
    setBusy(item.id);
    setFailure(null);
    setShown((was) => ({ ...was, [item.id]: !soldOut }));
    const refused = await setSoldOut(item, soldOut);
    setBusy(null);
    if (refused) {
      setShown((was) =>
        Object.fromEntries(
          Object.entries(was).filter(([id]) => id !== item.id),
        ),
      );
      setFailure(refused);
      return;
    }
    setChange(tell ? { item, soldOut } : null);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setChange(null);
        onOpenChange(next);
      }}
      title={title}
      subtitle={t("hint")}
      closeLabel={t("close")}
    >
      <div className="flex flex-col gap-4 px-2 pt-1 pb-2">
        {change ? (
          <p
            role="status"
            className="flex flex-wrap items-center gap-2 rounded-card bg-elevated px-4 py-2 font-medium"
          >
            <span className="min-w-0 flex-1">
              {change.soldOut
                ? t("done", { name: change.item.name })
                : t("back", { name: change.item.name })}
            </span>
            <Button
              variant="ghost"
              className="shrink-0 px-3"
              onClick={() => void flip(change.item, !change.soldOut, false)}
            >
              <Undo2 aria-hidden="true" />
              {tToast("undo")}
            </Button>
          </p>
        ) : null}
        {failure ? (
          <p role="alert" className="px-1 font-medium text-danger">
            {failure}
          </p>
        ) : null}
        {categories.length === 0 ? (
          <p className="rounded-card bg-elevated px-4 py-4 text-ink-2">
            {t("empty")}
          </p>
        ) : (
          categories.map((category) => (
            <section
              key={category.id}
              aria-labelledby={`${ids}-${category.id}`}
              className="flex flex-col gap-2"
            >
              <h3
                id={`${ids}-${category.id}`}
                className="px-1 font-semibold text-base text-ink-2"
              >
                {category.name}
              </h3>
              <ul className="overflow-hidden rounded-card bg-elevated">
                {category.items.map((item) => {
                  const name = `${ids}-${item.id}`;
                  return (
                    <li
                      key={item.id}
                      className="relative flex min-h-16 items-center gap-3 px-4 py-2 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
                    >
                      <span
                        id={name}
                        className="min-w-0 flex-1 font-medium text-lg"
                      >
                        {item.name}
                      </span>
                      <span className="text-ink-2 text-sm" aria-hidden="true">
                        {t("switch")}
                      </span>
                      <Switch
                        aria-labelledby={name}
                        aria-describedby={`${name}-what`}
                        checked={!available(item)}
                        disabled={busy === item.id}
                        onChange={(soldOut) => void flip(item, soldOut)}
                      />
                      <span id={`${name}-what`} className="sr-only">
                        {t("switch")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}
