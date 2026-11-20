"use client";

import {
  type ItemChange,
  type ItemInput,
  itemSaveInput,
  type Menu,
  type MenuItem,
  marksSoldOut,
  menuStatus,
} from "@domain/order-taking";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { DataTable } from "@ui/data-table";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { MenuEditRow, MenuItemList } from "@ui/menu-item-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { Switch } from "@ui/switch";
import { BookOpen, ClipboardPaste, LayoutGrid, Plus, Tags } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { type Editing, ItemSheet } from "./item-sheet";
import { FailureLine, type MenuPaths, Price, useUndoToast } from "./menu-parts";
import type {
  MenuActionFailure,
  MenuActions,
  MenuDepartment,
  MenuReach,
} from "./menu-types";
import { PriceCell } from "./price-cell";

/** A write that threw is one that didn't go through. */
async function tried<T extends { ok: boolean }>(
  write: () => Promise<T>,
): Promise<T | { ok: false; failure: "failed" }> {
  try {
    return await write();
  } catch {
    return { ok: false, failure: "failed" };
  }
}

/**
 * The menu (waiter mode P2, the design's §5.1, §5.3 and §11), for the staff
 * while taking orders is on: status first (how many items, how many sold
 * out, how many reach no department), then the categories with their items.
 * Whoever runs the menu adds and edits items in a sheet, changes a price in
 * place on a computer, and leads on to the categories, the places and the
 * paste import; someone in a department marks sold out what it prepares;
 * anyone else reads. Each write shows at once and comes back from the
 * server (the new version resets what is held here), and what it undoes is
 * offered for 8 seconds. Phone: each category with its items. Tablet: the
 * categories beside the chosen one's items. Desktop: one table. Also on the
 * twin, inside the mode's shell, with stand-in actions.
 */
export function MenuView({
  menu,
  departments,
  myDepartments,
  reach,
  actions,
  paths,
  eyebrow,
}: {
  /** The menu now, or null while the project hasn't its tables yet. */
  menu: Menu | null;
  /** The business's departments, removed ones too, for their names. */
  departments: MenuDepartment[];
  /** The person's own live departments, which mark sold out what they prepare. */
  myDepartments: readonly string[];
  reach: MenuReach;
  actions: MenuActions;
  paths: MenuPaths;
  /** Above the title; the module's name in the business's words by default. */
  eyebrow?: string;
}) {
  const t = useTranslations("app.orders.menu");
  const tm = useTranslations("modules");
  const heading = useRef<HTMLHeadingElement>(null);
  const { say, toast } = useUndoToast(() => heading.current);

  // What this screen shows: the server's menu, with its own writes on top
  // until the next version comes back.
  const [held, setHeld] = useState(menu);
  const [heldVersion, setHeldVersion] = useState(menu?.version ?? null);
  if ((menu?.version ?? null) !== heldVersion) {
    setHeldVersion(menu?.version ?? null);
    setHeld(menu);
  }
  const [failure, setFailure] = useState<MenuActionFailure | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [sheetFailure, setSheetFailure] = useState<MenuActionFailure | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const categories = held?.categories ?? [];
  const items = held?.items ?? [];
  const places = held?.places ?? [];
  const live = new Map(
    departments.filter((d) => d.live).map((d) => [d.id, d.name]),
  );
  const editingItem =
    editingId && editingId !== "new"
      ? (items.find((item) => item.id === editingId) ?? null)
      : null;
  const editing: Editing =
    editingId === "new"
      ? { kind: "new" }
      : editingItem
        ? { kind: "item", item: editingItem }
        : null;

  /** Where an item's lines go: its own department, else its category's, while live. */
  const routeOf = (category: string, department: string | null) => {
    const goes =
      department ?? categories.find((c) => c.id === category)?.department;
    return goes && live.has(goes) ? goes : null;
  };
  const change = (id: string, fields: Partial<MenuItem>) =>
    setHeld((now) =>
      now
        ? {
            ...now,
            items: now.items.map((item) =>
              item.id === id ? { ...item, ...fields } : item,
            ),
          }
        : now,
    );
  /** An item in, where it was, or last. */
  const put = (item: MenuItem, at?: number) =>
    setHeld((now) => {
      if (!now) return now;
      if (now.items.some((i) => i.id === item.id)) {
        return {
          ...now,
          items: now.items.map((i) => (i.id === item.id ? item : i)),
        };
      }
      const next = [...now.items];
      next.splice(at ?? next.length, 0, item);
      return { ...now, items: next };
    });
  const drop = (id: string) =>
    setHeld((now) =>
      now ? { ...now, items: now.items.filter((i) => i.id !== id) } : now,
    );

  function closeSheet() {
    setEditingId(null);
    setSheetFailure(null);
  }

  /**
   * Sold out, or back. From a row or the table its undo is on the toast. From
   * the item's sheet the toast says it with no undo: the sheet is modal, so
   * pressing the toast under it would close the sheet and lose what was
   * typed there, and the switch in the sheet is the way back. For the same
   * reason a failure there is said in the sheet, not on the page's line
   * under it.
   */
  async function markSoldOut(
    item: MenuItem,
    on: boolean,
    undo: "offer" | "none" | "undoing" = "offer",
  ) {
    const fromSheet = undo === "none";
    change(item.id, { available: !on });
    const result = await tried(() => actions.setAvailable(item.id, !on));
    if (!result.ok) {
      change(item.id, { available: item.available });
      if (fromSheet) setSheetFailure(result.failure);
      else setFailure(result.failure);
      return;
    }
    if (fromSheet) setSheetFailure(null);
    setFailure(null);
    if (undo === "undoing") return;
    const words = on
      ? t("toast.soldOut", { name: item.name })
      : t("toast.available", { name: item.name });
    say(
      words,
      undo === "offer"
        ? () => void markSoldOut({ ...item, available: !on }, !on, "undoing")
        : undefined,
    );
  }

  async function savePrice(item: MenuItem, agorot: number, undoing = false) {
    change(item.id, { priceAgorot: agorot });
    const result = await tried(() =>
      actions.saveItem(
        itemSaveInput(item, { priceAgorot: agorot }),
        item.version,
      ),
    );
    if (!result.ok) {
      const current = "current" in result ? result.current : undefined;
      if (current) put(current);
      else change(item.id, { priceAgorot: item.priceAgorot });
      setFailure(result.failure);
      return;
    }
    setFailure(null);
    const after = {
      ...item,
      priceAgorot: agorot,
      version: result.value.version,
    };
    change(item.id, { version: result.value.version });
    if (undoing) return;
    say(
      t("toast.price", { name: item.name }),
      () => void savePrice(after, item.priceAgorot, true),
    );
  }

  async function saveSheet(fields: Required<ItemChange>) {
    setSaving(true);
    if (editingId === "new") {
      const input: ItemInput = {
        category: fields.category,
        name: fields.name,
        description: fields.description,
        priceAgorot: fields.priceAgorot,
        department: fields.department,
      };
      const result = await tried(() => actions.saveItem(input, null));
      setSaving(false);
      if (!result.ok) {
        setSheetFailure(result.failure);
        return;
      }
      put({
        id: result.value.id,
        category: fields.category,
        name: fields.name,
        description: fields.description,
        priceAgorot: fields.priceAgorot,
        department: fields.department,
        route: routeOf(fields.category, fields.department),
        available: true,
        optionGroups: [],
        version: result.value.version,
      });
      closeSheet();
      setFailure(null);
      say(t("toast.added", { name: fields.name }));
      return;
    }
    const item = editingItem;
    if (!item) {
      setSaving(false);
      return;
    }
    const result = await tried(() =>
      actions.saveItem(itemSaveInput(item, fields), item.version),
    );
    setSaving(false);
    if (!result.ok) {
      if (result.failure === "changed") {
        const current = "current" in result ? result.current : null;
        if (!current) {
          drop(item.id);
          closeSheet();
          setFailure("gone");
          return;
        }
        put(current);
      }
      setSheetFailure(result.failure);
      return;
    }
    put({
      ...item,
      ...fields,
      route: routeOf(fields.category, fields.department),
      version: result.value.version,
    });
    closeSheet();
    setFailure(null);
    say(t("toast.saved", { name: fields.name }));
  }

  async function restore(item: MenuItem, at: number) {
    put(item, at);
    const result = await tried(() => actions.restoreItem(item.id));
    if (!result.ok) {
      drop(item.id);
      setFailure(result.failure);
      return;
    }
    setFailure(null);
  }

  async function remove(item: MenuItem) {
    const at = items.findIndex((i) => i.id === item.id);
    closeSheet();
    drop(item.id);
    const result = await tried(() => actions.archiveItem(item.id));
    if (!result.ok) {
      put(item, at);
      setFailure(result.failure);
      return;
    }
    setFailure(null);
    // The sheet went with the button pressed: the way back takes the focus.
    say(t("toast.removed", { name: item.name }), () => void restore(item, at), {
      focus: true,
    });
  }

  const status = menuStatus({ items });
  const subtitle =
    items.length > 0
      ? [
          t("status.items", { count: status.items }),
          ...(status.soldOut > 0
            ? [t("status.soldOut", { count: status.soldOut })]
            : []),
          ...(status.noRoute > 0
            ? [t("status.noRoute", { count: status.noRoute })]
            : []),
        ].join(" · ")
      : undefined;

  const readOnly =
    reach.readOnly === "viewing"
      ? t("readOnly.viewing")
      : reach.readOnly === "menu"
        ? items.some(
            (item) => item.route !== null && myDepartments.includes(item.route),
          )
          ? t("readOnly.department")
          : t("readOnly.menu")
        : null;

  const marks = (item: MenuItem) =>
    reach.marks &&
    marksSoldOut(item, { runsMenu: reach.runsMenu, myDepartments });
  const detail = (item: MenuItem) => (
    <>
      <Price agorot={item.priceAgorot} />
      {item.optionGroups.length > 0
        ? ` · ${t("choices", { count: item.optionGroups.length })}`
        : null}
    </>
  );
  const itemsOf = (category: string) =>
    items.filter((item) => item.category === category);
  const departmentLabel = (department: string) => {
    const name = live.get(department);
    return name ? (
      <span className="text-ink-2 text-sm">{name}</span>
    ) : (
      <Badge tone="warning">{t("noRoute")}</Badge>
    );
  };

  const rows = (list: MenuItem[]) =>
    list.length === 0 ? (
      <p className="rounded-card bg-surface px-4 py-3.5 text-ink-2 shadow-card">
        {t("emptyCategory")}
      </p>
    ) : (
      <MenuItemList>
        {list.map((item) => (
          <MenuEditRow
            key={item.id}
            name={item.name}
            detail={detail(item)}
            flag={item.route === null ? t("noRoute") : null}
            onEdit={reach.edits ? () => setEditingId(item.id) : undefined}
            soldOut={{
              checked: !item.available,
              label: t("soldOutFor", { name: item.name }),
              word: t("soldOut"),
              onChange: marks(item)
                ? (on) => void markSoldOut(item, on)
                : undefined,
            }}
          />
        ))}
      </MenuItemList>
    );

  const links = reach.runsMenu ? (
    <ListGroup className="md:max-w-2xl">
      <ListRow
        href={paths.categories}
        leading={<Tags />}
        title={t("categoriesRow")}
        subtitle={t("categoriesCount", { count: categories.length })}
      />
      <ListRow
        href={paths.places}
        leading={<LayoutGrid />}
        title={t("placesRow")}
        subtitle={t("placesCount", { count: places.length })}
      />
    </ListGroup>
  ) : null;

  const actionsShown =
    reach.edits && categories.length > 0 ? (
      <>
        <Button size="lg" onClick={() => setEditingId("new")}>
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href={paths.import}>
            <ClipboardPaste aria-hidden="true" />
            {t("import")}
          </Link>
        </Button>
      </>
    ) : undefined;

  const current =
    categories.find((category) => category.id === chosen) ?? categories[0];
  const withControls = reach.edits || items.some(marks);

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={paths.back}
        eyebrow={eyebrow ?? tm("order_taking.name")}
        title={t("title")}
        subtitle={subtitle}
        actions={actionsShown}
        headingRef={heading}
      />
      <FailureLine failure={failure} />
      {readOnly ? <p className="text-ink-2 md:max-w-2xl">{readOnly}</p> : null}
      {held === null || categories.length === 0 ? (
        <>
          <EmptyState
            headingLevel="h2"
            icon={<BookOpen />}
            title={t("empty.title")}
            body={
              held === null
                ? t("failed.notYet")
                : reach.edits
                  ? t("empty.body")
                  : t("empty.bodyView")
            }
          >
            {held !== null && reach.edits ? (
              <>
                <Button asChild>
                  <Link href={paths.import}>{t("import")}</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={paths.categories}>{t("addCategory")}</Link>
                </Button>
              </>
            ) : null}
          </EmptyState>
          {held !== null ? links : null}
        </>
      ) : (
        <>
          {/* Phone: every category with its items. */}
          <div className="flex flex-col gap-6 md:hidden">
            {categories.map((category) => (
              <PageSection
                key={category.id}
                title={category.name}
                action={departmentLabel(category.department)}
              >
                {rows(itemsOf(category.id))}
              </PageSection>
            ))}
            {links}
          </div>
          {/* Tablet: the categories beside the chosen one's items. */}
          <div className="hidden items-start gap-6 md:grid md:grid-cols-[16rem_minmax(0,1fr)] xl:hidden">
            <div className="flex flex-col gap-6">
              <PageSection title={t("categoriesRow")}>
                <ListGroup>
                  {categories.map((category) => (
                    <ListRow
                      key={category.id}
                      onClick={() => setChosen(category.id)}
                      current={category.id === current?.id}
                      title={category.name}
                      subtitle={t("categoryLine", {
                        department:
                          live.get(category.department) ?? t("noRoute"),
                        count: itemsOf(category.id).length,
                      })}
                    />
                  ))}
                </ListGroup>
              </PageSection>
              {links}
            </div>
            {current ? (
              <PageSection
                title={current.name}
                action={departmentLabel(current.department)}
              >
                {rows(itemsOf(current.id))}
              </PageSection>
            ) : null}
          </div>
          {/* Desktop: one table, prices edited in place. */}
          <div className="hidden flex-col gap-6 xl:flex">
            {items.length === 0 ? (
              <p className="rounded-card bg-surface px-4 py-3.5 text-ink-2 shadow-card">
                {t("emptyCategory")}
              </p>
            ) : (
              <Card padding="none" className="overflow-hidden">
                <DataTable
                  caption={t("title")}
                  controls={withControls}
                  columns={[
                    { key: "name", label: t("columns.name") },
                    { key: "category", label: t("columns.category") },
                    { key: "department", label: t("columns.department") },
                    { key: "price", label: t("columns.price") },
                    { key: "soldOut", label: t("columns.soldOut") },
                  ]}
                  rows={items.map((item) => {
                    const category = categories.find(
                      (c) => c.id === item.category,
                    );
                    const name = (
                      <>
                        <span
                          className={
                            item.available
                              ? "font-medium"
                              : "font-medium text-ink-2"
                          }
                        >
                          {item.name}
                        </span>
                        {item.optionGroups.length > 0 ? (
                          <span className="text-ink-2 text-sm">
                            {t("choices", { count: item.optionGroups.length })}
                          </span>
                        ) : null}
                      </>
                    );
                    return {
                      key: item.id,
                      cells: {
                        name: reach.edits ? (
                          <button
                            type="button"
                            onClick={() => setEditingId(item.id)}
                            className="flex min-h-11 flex-col items-start justify-center rounded-control text-start underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            {name}
                          </button>
                        ) : (
                          <span className="flex flex-col">{name}</span>
                        ),
                        category: category?.name ?? "",
                        department:
                          item.route !== null ? (
                            (live.get(item.route) ?? "")
                          ) : (
                            <Badge tone="warning">{t("noRoute")}</Badge>
                          ),
                        price: reach.edits ? (
                          <PriceCell
                            key={`${item.priceAgorot}:${item.version}`}
                            agorot={item.priceAgorot}
                            label={t("priceFor", { name: item.name })}
                            unclearWords={t("priceUnclear")}
                            onPrice={(agorot) => void savePrice(item, agorot)}
                          />
                        ) : (
                          <Price agorot={item.priceAgorot} />
                        ),
                        soldOut: marks(item) ? (
                          <Switch
                            checked={!item.available}
                            onChange={(on) => void markSoldOut(item, on)}
                            aria-label={t("soldOutFor", { name: item.name })}
                          />
                        ) : !item.available ? (
                          <Badge>{t("soldOut")}</Badge>
                        ) : null,
                      },
                    };
                  })}
                />
              </Card>
            )}
            {links}
          </div>
        </>
      )}
      <ItemSheet
        editing={editing}
        categories={categories}
        departments={departments}
        failure={sheetFailure}
        saving={saving}
        onClose={closeSheet}
        onSave={(fields) => void saveSheet(fields)}
        onSoldOut={(item, on) => void markSoldOut(item, on, "none")}
        onRemove={(item) => void remove(item)}
      />
      {toast}
    </PageBody>
  );
}
