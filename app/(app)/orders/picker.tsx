"use client";

import { nameMatches } from "@domain/hebrew-search";
import { type DraftLine, pickState } from "@domain/order-screens";
import type { Menu, MenuItem } from "@domain/order-taking";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { MenuItemList, MenuItemRow } from "@ui/menu-item-row";
import { PageSection } from "@ui/page";
import { fieldInputClass } from "@ui/text-field";
import { BookOpen, Search } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useOrdersMode } from "./orders-mode";
import { Price, useOrderWords } from "./orders-parts";

type Section = { id: string; name: string; items: MenuItem[] };

/**
 * Adding items (the design's §3.2 step 3): one tap adds an item, and the row
 * counts what of it the draft holds. A search above finds any item by the
 * starts of its words, Hebrew written loosely. Phone: "הכי מוזמנים", then
 * every category, one under the other. Tablet and desktop: a rail of them
 * beside the items of the one chosen. Sold out is greyed with "נגמר", and
 * one no department prepares with why. Since P6 an item with a choice to
 * make opens its choices, saying so under its price; one with only optional
 * choices is added at once, and says its line in the draft changes them.
 * "הכי מוזמנים" are items, so a favourite burger opens its choices too.
 */
export function Picker({
  menu,
  favourites,
  draft,
  onPick,
}: {
  menu: Menu | null;
  /** The items ordered most lately, by id. */
  favourites: readonly string[];
  draft: readonly DraftLine[];
  onPick: (item: MenuItem) => void;
}) {
  const { t } = useOrderWords();
  const { frame, paths } = useOrdersMode();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState("most");
  const inDraft = (item: string) =>
    draft
      .filter((line) => line.item === item)
      .reduce((sum, line) => sum + line.quantity, 0);
  const row = (item: MenuItem) => {
    const state = pickState(item);
    return (
      <MenuItemRow
        key={item.id}
        name={item.name}
        detail={<Price agorot={item.priceAgorot} />}
        count={inDraft(item.id)}
        countLabel={t("picker.inDraft")}
        soldOut={state === "soldOut" ? t("picker.soldOut") : null}
        reason={state === "noRoute" ? t("picker.noRoute") : null}
        opens={state === "choose"}
        hint={
          state === "choose"
            ? t("picker.needsChoice")
            : state === "add" && item.optionGroups.length > 0
              ? t("picker.optionalChoices")
              : null
        }
        // Viewing, nothing is added: the row is greyed as every action is.
        disabled={frame.viewing}
        onPick={() => {
          if (!frame.viewing) onPick(item);
        }}
      />
    );
  };

  if (!menu || menu.items.length === 0) {
    return (
      <EmptyState
        headingLevel="h2"
        icon={<BookOpen />}
        title={t("picker.noMenu.title")}
        body={frame.runs ? t("picker.noMenu.body") : t("picker.noMenu.waiter")}
      >
        {frame.runs && !frame.viewing ? (
          <Button asChild>
            <Link href={paths.menuImport}>{t("picker.noMenu.import")}</Link>
          </Button>
        ) : null}
      </EmptyState>
    );
  }

  const most = favourites
    .map((id) => menu.items.find((item) => item.id === id))
    .filter((item): item is MenuItem => Boolean(item));
  const sections: Section[] = [
    ...(most.length
      ? [{ id: "most", name: t("picker.most"), items: most }]
      : []),
    ...menu.categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: menu.items.filter((item) => item.category === category.id),
    })),
  ].filter((section) => section.items.length > 0);
  const chosen =
    sections.find((section) => section.id === shown) ?? sections[0];
  const typed = query.trim();
  const found = typed
    ? menu.items.filter((item) => nameMatches(item.name, typed))
    : null;

  return (
    <section
      aria-labelledby={`${searchId}-title`}
      className="flex flex-col gap-4"
    >
      <h2 id={`${searchId}-title`} className="px-1 font-bold text-lg">
        {t("picker.title")}
      </h2>
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          {t("picker.search")}
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-2"
        />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("picker.searchPlaceholder")}
          autoComplete="off"
          className={cn(fieldInputClass, "ps-11")}
        />
      </div>
      {found ? (
        found.length ? (
          <MenuItemList aria-label={t("picker.found")}>
            {found.map(row)}
          </MenuItemList>
        ) : (
          <p role="status" className="px-1 text-ink-2">
            {t("picker.nothingFound", { query: typed })}
          </p>
        )
      ) : (
        <>
          {/* Phone: every section, one under the other. */}
          <div className="flex flex-col gap-6 md:hidden">
            {sections.map((section) => (
              <PageSection key={section.id} title={section.name} level={3}>
                <MenuItemList aria-label={section.name}>
                  {section.items.map(row)}
                </MenuItemList>
              </PageSection>
            ))}
          </div>
          {/* Tablet and desktop: the categories beside their items. */}
          <div className="hidden gap-3 md:grid md:grid-cols-[8.5rem_minmax(0,1fr)] md:items-start">
            <nav
              aria-label={t("picker.categories")}
              className="flex flex-col gap-1"
            >
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={section.id === chosen?.id}
                  onClick={() => setShown(section.id)}
                  className={cn(
                    "pressable flex min-h-12 items-center rounded-control px-3 text-start font-medium transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-accent",
                    section.id === chosen?.id
                      ? "bg-surface text-ink shadow-card"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {section.name}
                </button>
              ))}
            </nav>
            {chosen ? (
              <MenuItemList aria-label={chosen.name}>
                {chosen.items.map(row)}
              </MenuItemList>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
