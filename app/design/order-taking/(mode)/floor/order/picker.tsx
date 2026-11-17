"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { PageSection } from "@ui/page";
import { fieldInputClass } from "@ui/text-field";
import { BookOpen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { mostOrdered } from "../../../data";
import { useOrderDemo } from "../../../demo-store";
import { type MenuItem, nameMatches } from "../../../model";
import { Price, paths, useOrderWords } from "../../../parts";

type Section = { id: string; name: string; items: MenuItem[] };

/** A grouped list's card, as ListGroup draws it, for a list of item rows. */
const listClass = "overflow-hidden rounded-card bg-surface shadow-card";

/**
 * Adding items (§3.2 step 3): one tap adds an item without choices, and
 * one with choices opens its sheet. A search above finds any item by the
 * start of its words. Phone: "הכי מוזמנים", then every category, one under
 * the other. Tablet and desktop: a rail of the categories beside the items
 * of the one chosen. A sold-out item is greyed, says so, and can't be
 * added. Each row counts what of it is in the draft.
 */
export function Picker({
  placeId,
  onPick,
}: {
  placeId: string;
  onPick: (item: MenuItem) => void;
}) {
  const { t } = useOrderWords();
  const { data } = useOrderDemo();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState("most");
  const draft = data.drafts[placeId] ?? [];
  const inDraft = (itemId: string) =>
    draft
      .filter((line) => line.itemId === itemId)
      .reduce((sum, line) => sum + line.qty, 0);
  const row = (item: MenuItem) => (
    <ItemRow
      key={item.id}
      item={item}
      count={inDraft(item.id)}
      soldOut={data.soldOut.includes(item.id)}
      onPick={() => onPick(item)}
    />
  );

  if (data.menu.items.length === 0) {
    return (
      <EmptyState
        headingLevel="h2"
        icon={<BookOpen />}
        title={t("picker.noMenu.title")}
        body={t("picker.noMenu.body")}
      >
        <Button asChild>
          <Link href={paths.import}>{t("picker.noMenu.import")}</Link>
        </Button>
      </EmptyState>
    );
  }

  const most = mostOrdered
    .map((id) => data.menu.items.find((item) => item.id === id))
    .filter((item): item is MenuItem => Boolean(item));
  const sections: Section[] = [
    ...(most.length
      ? [{ id: "most", name: t("picker.most"), items: most }]
      : []),
    ...data.menu.categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: data.menu.items.filter((item) => item.categoryId === category.id),
    })),
  ].filter((section) => section.items.length > 0);
  const chosen =
    sections.find((section) => section.id === shown) ?? sections[0];
  const found = query.trim()
    ? data.menu.items.filter((item) => nameMatches(item.name, query))
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
          <ul aria-label={t("picker.found")} className={listClass}>
            {found.map(row)}
          </ul>
        ) : (
          <p role="status" className="px-1 text-ink-2">
            {t("picker.nothingFound", { query: query.trim() })}
          </p>
        )
      ) : (
        <>
          {/* Phone: every section, one under the other. */}
          <div className="flex flex-col gap-6 md:hidden">
            {sections.map((section) => (
              <PageSection key={section.id} title={section.name} level={3}>
                <ul aria-label={section.name} className={listClass}>
                  {section.items.map(row)}
                </ul>
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
              <ul aria-label={chosen.name} className={listClass}>
                {chosen.items.map(row)}
              </ul>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * An item to add: its name, its price, and how many of it the draft holds.
 * The whole row adds it; one with choices says so, and opens its sheet.
 */
function ItemRow({
  item,
  count,
  soldOut,
  onPick,
}: {
  item: MenuItem;
  count: number;
  soldOut: boolean;
  onPick: () => void;
}) {
  const { t } = useOrderWords();
  return (
    <li className="relative not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']">
      <button
        type="button"
        disabled={soldOut}
        onClick={onPick}
        className={cn(
          "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          soldOut
            ? "opacity-50"
            : "transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{item.name}</span>
          <span className="text-ink-2 text-sm">
            <Price agorot={item.price} />
            {item.groups.length > 0 ? ` · ${t("picker.withChoices")}` : null}
          </span>
        </span>
        {soldOut ? (
          <Badge>{t("picker.soldOut")}</Badge>
        ) : (
          <>
            {count > 0 ? (
              <span className="grid min-w-8 place-items-center rounded-full bg-accent-soft px-2 py-1 font-bold text-base tabular-nums">
                {count}
                <span className="sr-only"> {t("picker.inDraft")}</span>
              </span>
            ) : null}
            <Plus aria-hidden="true" className="size-6 shrink-0 text-accent" />
          </>
        )}
      </button>
    </li>
  );
}
