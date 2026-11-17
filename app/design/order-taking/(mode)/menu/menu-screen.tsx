"use client";

import { parseShekels } from "@domain/money";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { ChoiceMenu, choiceShown } from "@ui/choice-menu";
import { cn } from "@ui/cn";
import { DataTable } from "@ui/data-table";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { fieldInputClass, ltrInputClass, TextField } from "@ui/text-field";
import { BookOpen, ClipboardPaste, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { saveItem, setSoldOut } from "../../changes";
import { useOrderDemo } from "../../demo-store";
import type { Category, MenuItem } from "../../model";
import {
  departmentName,
  type OrderT,
  Price,
  paths,
  useOrderWords,
  useUndoToast,
} from "../../parts";

/** An item's price at most, and its name's length (§5.1, §5.4). */
const PRICE_MAX = 1_000_000;
const NAME_MAX = 60;

/** Agorot as typed back into a field: "62" or "42.50". */
const typed = (agorot: number) =>
  agorot % 100 === 0 ? String(agorot / 100) : (agorot / 100).toFixed(2);

/**
 * The menu (§5.1, §5.3, §11) for whoever runs it: status first (how many
 * items are sold out), "הוספת מנה" as the main action, and the paste
 * import beside it. Each item's "נגמר" switch greys it on every phone at
 * once, with an undo. Phone: each category with its items, edited in a
 * sheet. Tablet: the categories beside the chosen one's items. Desktop:
 * one table, its prices edited in place. Items are never deleted.
 */
export function MenuScreen() {
  const { t } = useOrderWords();
  const { data, update } = useOrderDemo();
  const { say, toast } = useUndoToast();
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const { categories, items } = data.menu;
  const chosen = categories.find((c) => c.id === shown) ?? categories[0];
  const soldOut = data.soldOut.length;

  function toggleSoldOut(item: MenuItem, on: boolean) {
    update((d) => setSoldOut(d, item.id, on));
    say(
      on
        ? t("toast.soldOut", { name: item.name })
        : t("toast.available", { name: item.name }),
      () => update((d) => setSoldOut(d, item.id, !on)),
    );
  }

  function changePrice(item: MenuItem, price: number) {
    if (price === item.price) return;
    update((d) => saveItem(d, { ...item, price }));
    say(t("toast.price", { name: item.name }), () =>
      update((d) => saveItem(d, item)),
    );
  }

  const actions =
    items.length > 0 ? (
      <>
        <Button size="lg" onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" />
          {t("menu.add")}
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href={paths.import}>
            <ClipboardPaste aria-hidden="true" />
            {t("menu.import")}
          </Link>
        </Button>
      </>
    ) : undefined;

  const rows = (list: MenuItem[]) => (
    <ul className="overflow-hidden rounded-card bg-surface shadow-card">
      {list.map((item) => (
        <ItemRow
          key={item.id}
          t={t}
          item={item}
          soldOut={data.soldOut.includes(item.id)}
          onEdit={() => setEditing(item)}
          onSoldOut={(on) => toggleSoldOut(item, on)}
        />
      ))}
    </ul>
  );

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.app, label: t("leave") }}
        eyebrow={t("mode")}
        title={t("menu.title")}
        subtitle={
          items.length > 0
            ? t("menu.status", { soldOut, items: items.length })
            : undefined
        }
        actions={actions}
      />
      {items.length === 0 ? (
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
      ) : (
        <>
          {/* Phone: every category with its items. */}
          <div className="flex flex-col gap-6 md:hidden">
            {categories.map((category) => (
              <PageSection
                key={category.id}
                title={category.name}
                action={
                  <span className="text-ink-2 text-sm">
                    {departmentName(category.department)}
                  </span>
                }
              >
                {rows(items.filter((i) => i.categoryId === category.id))}
              </PageSection>
            ))}
          </div>
          {/* Tablet: the categories beside the chosen one's items. */}
          <div className="hidden gap-6 md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:items-start xl:hidden">
            <PageSection title={t("menu.categories")}>
              <ListGroup>
                {categories.map((category) => (
                  <ListRow
                    key={category.id}
                    onClick={() => setShown(category.id)}
                    current={category.id === chosen?.id}
                    title={category.name}
                    subtitle={t("menu.categoryLine", {
                      department: departmentName(category.department),
                      count: items.filter((i) => i.categoryId === category.id)
                        .length,
                    })}
                  />
                ))}
              </ListGroup>
            </PageSection>
            {chosen ? (
              <PageSection title={chosen.name}>
                {rows(items.filter((i) => i.categoryId === chosen.id))}
              </PageSection>
            ) : null}
          </div>
          {/* Desktop: one table, prices edited in place. */}
          <div className="hidden xl:block">
            <MenuTable
              t={t}
              categories={categories}
              items={items}
              soldOut={data.soldOut}
              onEdit={setEditing}
              onSoldOut={toggleSoldOut}
              onPrice={changePrice}
            />
          </div>
        </>
      )}
      <Sheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title={
          editing === "new" ? t("menu.sheet.newTitle") : (editing?.name ?? "")
        }
        closeLabel={t("sheet.close")}
      >
        {editing !== null ? (
          <ItemForm
            key={editing === "new" ? "new" : editing.id}
            item={editing === "new" ? null : editing}
            categories={categories}
            onSaved={(item, isNew) => {
              update((d) => saveItem(d, item));
              setEditing(null);
              say(
                isNew
                  ? t("toast.itemAdded", { name: item.name })
                  : t("toast.itemSaved", { name: item.name }),
              );
            }}
          />
        ) : null}
      </Sheet>
      {toast}
    </PageBody>
  );
}

/** An item as the editor lists it: open it, or switch it sold out. */
function ItemRow({
  t,
  item,
  soldOut,
  onEdit,
  onSoldOut,
}: {
  t: OrderT;
  item: MenuItem;
  soldOut: boolean;
  onEdit: () => void;
  onSoldOut: (on: boolean) => void;
}) {
  const id = useId();
  return (
    <li className="relative flex min-h-16 items-center gap-2 pe-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-h-16 min-w-0 flex-1 flex-col justify-center px-4 py-2.5 text-start transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span
          id={`${id}-name`}
          className={cn("font-medium", soldOut && "text-ink-2")}
        >
          {item.name}
        </span>
        <span className="text-ink-2 text-sm">
          <Price agorot={item.price} />
          {item.groups.length > 0
            ? ` · ${t("menu.choices", { count: item.groups.length })}`
            : null}
        </span>
      </button>
      <span id={`${id}-sold`} className="shrink-0 text-ink-2 text-sm">
        {t("picker.soldOut")}
      </span>
      <Switch
        checked={soldOut}
        onChange={onSoldOut}
        aria-labelledby={`${id}-sold ${id}-name`}
      />
    </li>
  );
}

/** The desktop's table: every item, its price edited in place. */
function MenuTable({
  t,
  categories,
  items,
  soldOut,
  onEdit,
  onSoldOut,
  onPrice,
}: {
  t: OrderT;
  categories: Category[];
  items: MenuItem[];
  soldOut: string[];
  onEdit: (item: MenuItem) => void;
  onSoldOut: (item: MenuItem, on: boolean) => void;
  onPrice: (item: MenuItem, price: number) => void;
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <DataTable
        caption={t("menu.title")}
        controls
        columns={[
          { key: "name", label: t("menu.columns.name") },
          { key: "category", label: t("menu.columns.category") },
          { key: "department", label: t("menu.columns.department") },
          { key: "price", label: t("menu.columns.price") },
          { key: "soldOut", label: t("menu.columns.soldOut") },
        ]}
        rows={items.map((item) => {
          const category = categories.find((c) => c.id === item.categoryId);
          return {
            key: item.id,
            cells: {
              name: (
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="flex min-h-11 items-center rounded-control text-start font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {item.name}
                </button>
              ),
              category: category?.name ?? "",
              department: category ? departmentName(category.department) : "",
              price: (
                <PriceCell
                  key={item.price}
                  t={t}
                  item={item}
                  onPrice={(price) => onPrice(item, price)}
                />
              ),
              soldOut: (
                <Switch
                  checked={soldOut.includes(item.id)}
                  onChange={(on) => onSoldOut(item, on)}
                  aria-label={t("menu.soldOutFor", { name: item.name })}
                />
              ),
            },
          };
        })}
      />
    </Card>
  );
}

/** A price typed in place, saved as the field is left; one that isn't clear goes back. */
function PriceCell({
  t,
  item,
  onPrice,
}: {
  t: OrderT;
  item: MenuItem;
  onPrice: (price: number) => void;
}) {
  const [value, setValue] = useState(typed(item.price));
  const [unclear, setUnclear] = useState(false);
  return (
    <span className="flex flex-col gap-1">
      <input
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        aria-label={t("menu.priceFor", { name: item.name })}
        aria-invalid={unclear || undefined}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setUnclear(false);
        }}
        onBlur={() => {
          const price = parseShekels(value, PRICE_MAX);
          if (price === null) {
            setUnclear(true);
            return;
          }
          onPrice(price);
        }}
        className={cn(fieldInputClass, ltrInputClass, "min-h-11 w-28 py-1.5")}
      />
      {unclear ? (
        <span role="alert" className="text-danger text-sm">
          {t("menu.priceUnclear")}
        </span>
      ) : null}
    </span>
  );
}

/** An item's name, price and category; its choices are edited in P6. */
function ItemForm({
  item,
  categories,
  onSaved,
}: {
  item: MenuItem | null;
  categories: Category[];
  onSaved: (item: MenuItem, isNew: boolean) => void;
}) {
  const { t } = useOrderWords();
  const nameField = useRef<HTMLInputElement>(null);
  const priceField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? typed(item.price) : "");
  const [category, setCategory] = useState(
    item?.categoryId ?? categories[0]?.id ?? "",
  );
  const [problem, setProblem] = useState<"name" | "price" | null>(null);
  const options = categories.map((c) => ({
    key: c.id,
    label: c.name,
    hint: departmentName(c.department),
  }));

  function save() {
    const words = name.trim();
    if (!words || words.length > NAME_MAX) {
      setProblem("name");
      nameField.current?.focus();
      return;
    }
    const agorot = parseShekels(price, PRICE_MAX);
    if (agorot === null) {
      setProblem("price");
      priceField.current?.focus();
      return;
    }
    onSaved(
      {
        id: item?.id ?? crypto.randomUUID(),
        categoryId: category,
        name: words,
        price: agorot,
        groups: item?.groups ?? [],
      },
      item === null,
    );
  }

  return (
    <div className="flex flex-col gap-4 px-2 pt-1">
      <TextField
        ref={nameField}
        label={t("menu.sheet.name")}
        value={name}
        maxLength={NAME_MAX}
        autoComplete="off"
        error={problem === "name" ? t("menu.sheet.nameMissing") : undefined}
        onChange={(event) => {
          setName(event.target.value);
          if (problem === "name") setProblem(null);
        }}
      />
      <TextField
        ref={priceField}
        label={t("menu.sheet.price")}
        hint={t("menu.sheet.priceHint")}
        error={problem === "price" ? t("menu.priceUnclear") : undefined}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        value={price}
        className={ltrInputClass}
        onChange={(event) => {
          setPrice(event.target.value);
          if (problem === "price") setProblem(null);
        }}
      />
      {item === null ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <span className="font-medium text-sm">
            {t("menu.sheet.category")}
          </span>
          <ChoiceMenu
            label={`${t("menu.sheet.category")}: ${choiceShown(options, category) ?? ""}`}
            value={category}
            options={options}
            onChange={setCategory}
            className="text-ink"
          />
        </div>
      ) : item.groups.length > 0 ? (
        <p className="px-1 text-ink-2 text-sm">
          {t("menu.sheet.choices", {
            groups: item.groups.map((g) => g.name).join(", "),
          })}
        </p>
      ) : null}
      <Button size="lg" onClick={save}>
        {item === null ? t("menu.sheet.add") : t("menu.sheet.save")}
      </Button>
    </div>
  );
}
