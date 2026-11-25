"use client";

import {
  type CategoryInput,
  MENU_CAPS,
  MENU_TEXT_MAX,
  type MenuCategory,
} from "@domain/order-taking";
import { Button } from "@ui/button";
import { ChoiceMenu, choiceShown } from "@ui/choice-menu";
import { cn } from "@ui/cn";
import { ignoreHeldEnter } from "@ui/focus-after";
import { IconButton } from "@ui/icon-button";
import { ListGroup } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { UndoRow } from "@ui/undo-row";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { inputClass } from "../../../manage/list-rows";
import { FailureLine } from "../menu-parts";
import type {
  MenuActionFailure,
  MenuDepartment,
  SaveCategories,
} from "../menu-types";
import { arrowClass, type MoveBy, useRowMoves } from "../row-moves";
import { useLastSaved } from "../saved-list";

/** A category's row, as its list keys it: one not saved yet by its name. */
const categoryKey = (category: CategoryInput) =>
  category.id ?? `new:${category.name}`;

/** A category's row: its name over the rest on a phone, all in a line from a computer. */
const rowClass =
  "relative flex flex-wrap items-center gap-x-1 gap-y-0.5 py-1.5 ps-4 pe-1.5 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-[''] xl:flex-nowrap xl:py-0";

/**
 * The menu's categories (waiter mode P2): each a name to type over, the
 * department that prepares its items, how many it has, and its place in the
 * menu, saved whole with each change, as the departments are. A move keeps
 * the focus on the category's arrow (the other one once it reaches an end)
 * and says where it went once it saved, or where it is back
 * (`useRowMoves`); Enter held down moves it once, so the other arrow takes
 * no key repeating. Removing one
 * has an undo, which brings it back with its items. One whose department was
 * removed says so until another is chosen, and still saves as it is.
 * Phone: one list. Tablet: the list beside the items of the category whose
 * count was pressed. Computer: the list with the department and the count as
 * columns.
 */
export function CategoriesEditor({
  categories,
  items,
  departments,
  disabled,
  save,
  departmentsHref,
  version,
}: {
  categories: MenuCategory[];
  /** The live items, for each category's count and the tablet's list. */
  items: readonly { id: string; category: string; name: string }[];
  /** The business's departments, removed ones too, for their names. */
  departments: MenuDepartment[];
  disabled: boolean;
  save: SaveCategories;
  /** Where the departments are made, for a business that has none; null when the person can't. */
  departmentsHref: string | null;
  /** The menu's version: a new one is the server's list, which replaces this screen's. */
  version: number;
}) {
  const t = useTranslations("app.orders.categories");
  const tm = useTranslations("app.orders.menu");
  // What this screen saved last, in its order, until the server's comes back.
  const [order, setOrder] = useState<CategoryInput[] | null>(null);
  // Saves on their way: while any is, a new version (the server's answer to
  // an earlier one) leaves this screen's newer list, which its own save has.
  const [sending, setSending] = useState(0);
  const [heldVersion, setHeldVersion] = useState(version);
  if (heldVersion !== version) {
    setHeldVersion(version);
    if (sending === 0) setOrder(null);
  }
  // Which change is the latest: only its answer says what the list is.
  const latest = useRef(0);
  const liveDepartments = departments.filter((d) => d.live);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState(liveDepartments[0]?.id ?? "");
  const [taken, setTaken] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{
    category: CategoryInput;
    index: number;
    count: number;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failure, setFailure] = useState<MenuActionFailure | null>(null);
  // Each refusal a line of its own, so the same words again are heard.
  const [refusals, setRefusals] = useState(0);
  const [saved, setSaved] = useState(0);

  const shown: CategoryInput[] = order ?? categories;
  const moves = useRowMoves(shown, categoryKey);
  const server = useLastSaved<CategoryInput>(categories);
  const countOf = (id: string | undefined) =>
    id ? items.filter((item) => item.category === id).length : 0;
  const current =
    shown.find((c) => c.id !== undefined && c.id === selected) ?? shown[0];
  const options = liveDepartments.map((d) => ({ key: d.id, label: d.name }));
  const chosenDepartment = liveDepartments.some((d) => d.id === department)
    ? department
    : (liveDepartments[0]?.id ?? "");

  const named = (text: string, except?: number) =>
    shown.some(
      (c, at) => at !== except && c.name.toLowerCase() === text.toLowerCase(),
    );

  /**
   * Saves the list (the server checks it again): true when it saved, false
   * when it was refused, null when a later change's answer decides. A
   * change made before the answer came was made from this list, and saves
   * it whole: only the latest change's answer says what the list is, so an
   * earlier answer leaves the screen as it is, its caller too (an undo, a
   * name typed), and no press made meanwhile is lost. Refused, the screen
   * shows the server's list again: an earlier change's, saved, when Next
   * hasn't drawn its answer yet (`useLastSaved`). Every answer is told to
   * the moves, so a move is said by the saves that have it (`useRowMoves`).
   */
  async function change(next: CategoryInput[]): Promise<boolean | null> {
    latest.current += 1;
    const mine = latest.current;
    setOrder(next);
    setSending((count) => count + 1);
    let result: Awaited<ReturnType<SaveCategories>>;
    try {
      result = await save(next);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    setSending((count) => count - 1);
    const decides = mine === latest.current;
    moves.answered(mine, result.ok, decides);
    if (result.ok) {
      // Saved, overtaken or not: what the server has now. The new ones have
      // their ids, so a removal of one can be undone.
      const ids = result.value;
      const kept = next.map((c, at) => ({ ...c, id: ids[at] ?? c.id }));
      server.saved(kept);
      if (!decides) return null;
      setOrder(kept);
      setFailure(null);
      setSaved((count) => count + 1);
      return true;
    }
    if (!decides) return null;
    setOrder(server.refused());
    setFailure(result.failure);
    setRefusals((count) => count + 1);
    return false;
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const text = name.trim();
    if (!text || !chosenDepartment) return;
    if (named(text)) {
      setTaken(text);
      return;
    }
    setName("");
    setTaken(null);
    const saved = await change([
      ...shown,
      { name: text, department: chosenDepartment },
    ]);
    if (saved) setRemoved(null);
    else if (saved === false) setName((typing) => typing || text);
  }

  /** False when the name stays as it was. */
  function rename(index: number, text: string): boolean {
    const category = shown[index];
    const clean = text.trim();
    if (!category || !clean || clean === category.name) return false;
    if (named(clean, index)) {
      setTaken(clean);
      return false;
    }
    setTaken(null);
    void change(
      shown.map((c, at) => (at === index ? { ...c, name: clean } : c)),
    );
    return true;
  }

  function route(index: number, to: string) {
    void change(
      shown.map((c, at) => (at === index ? { ...c, department: to } : c)),
    );
  }

  function move(index: number, by: MoveBy) {
    const to = index + by;
    if (to < 0 || to >= shown.length) return;
    const next = [...shown];
    const [moving] = next.splice(index, 1);
    if (!moving) return;
    next.splice(to, 0, moving);
    void change(next);
    // The move with the change that carries it, numbered as it was sent.
    moves.moving(
      categoryKey(moving),
      by,
      {
        moved: (place, count) =>
          t("movedTo", { name: moving.name, place, count }),
        back: (place, count) =>
          t("movedBack", { name: moving.name, place, count }),
      },
      latest.current,
    );
  }

  async function remove(index: number) {
    const category = shown[index];
    if (!category) return;
    const before = removed;
    setRemoved({ category, index, count: countOf(category.id) });
    if ((await change(shown.filter((_, at) => at !== index))) === false) {
      setRemoved(before);
    }
  }

  async function undo() {
    if (!removed) return;
    const { category, index } = removed;
    setRemoved(null);
    if (shown.some((c) => c.id !== undefined && c.id === category.id)) return;
    const next = [...shown];
    next.splice(index, 0, category);
    if ((await change(next)) === false) setRemoved(removed);
  }

  const atMost = shown.length >= MENU_CAPS.categories;
  const currentItems = current?.id
    ? items.filter((item) => item.category === current.id)
    : [];

  return (
    <>
      <StatusToast
        message={saved > 0 ? t("saved") : null}
        stamp={String(saved)}
        duration={1800}
      />
      <FailureLine key={refusals} failure={failure} />
      <div className="grid items-start gap-6 md:grid-cols-2 md:gap-8 xl:grid-cols-1">
        <PageSection title={t("listTitle")} className="xl:max-w-3xl">
          <ListGroup>
            {shown.length === 0 ? (
              <p className="px-4 py-3.5 text-ink-2">
                {/* The row below is there only with a department to choose. */}
                {t(
                  disabled || liveDepartments.length === 0
                    ? "emptyView"
                    : "empty",
                )}
              </p>
            ) : null}
            {shown.map((category, index) => {
              const unrouted = !liveDepartments.some(
                (d) => d.id === category.department,
              );
              const menuLabel = `${t("department", { name: category.name })}: ${
                choiceShown(options, category.department, tm("noRoute")) ?? ""
              }`;
              return (
                <div
                  key={categoryKey(category)}
                  className={cn(
                    rowClass,
                    current === category &&
                      "md:bg-surface-2/60 xl:bg-transparent",
                  )}
                >
                  <input
                    // Back to the stored name after a failed save.
                    key={category.name}
                    aria-label={t("nameOf", { name: category.name })}
                    defaultValue={category.name}
                    maxLength={MENU_TEXT_MAX.category}
                    disabled={disabled}
                    className={cn(inputClass, "min-w-40 flex-1 basis-40")}
                    onBlur={(event) => {
                      if (!rename(index, event.target.value)) {
                        event.target.value = category.name;
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-1 max-xl:w-full xl:contents">
                    <div className="flex min-w-0 flex-1 items-center xl:w-48 xl:flex-none">
                      {disabled ? (
                        <span
                          className={cn(
                            "px-2.5 text-sm",
                            unrouted
                              ? "font-semibold text-warning"
                              : "text-ink-2",
                          )}
                        >
                          {choiceShown(
                            options,
                            category.department,
                            tm("noRoute"),
                          )}
                        </span>
                      ) : (
                        <ChoiceMenu
                          label={menuLabel}
                          value={category.department}
                          options={options}
                          placeholder={tm("noRoute")}
                          onChange={(to) => route(index, to)}
                          className={unrouted ? "text-warning" : "text-ink"}
                        />
                      )}
                    </div>
                    {/* Phone and computer: how many items it has. */}
                    <span className="shrink-0 whitespace-nowrap px-2 text-ink-2 text-sm md:hidden xl:block xl:w-24">
                      {t("count", { count: countOf(category.id) })}
                    </span>
                    {/*
                     * Tablet: the same count chooses the category whose
                     * items show beside the list, for anyone, a view too,
                     * and apart from typing its name. Named with the
                     * category for a screen reader ("4 פריטים בעיקריות").
                     */}
                    <button
                      type="button"
                      aria-current={current === category ? "true" : undefined}
                      onClick={() => setSelected(category.id ?? null)}
                      className="pressable hidden min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-ink-2 text-sm hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent aria-[current=true]:font-semibold aria-[current=true]:text-ink md:inline-flex xl:hidden"
                    >
                      {t("count", { count: countOf(category.id) })}
                      <span className="sr-only">
                        {" "}
                        {t("itemsWhere", { name: category.name })}
                      </span>
                    </button>
                    {disabled ? null : (
                      <>
                        <IconButton
                          ref={moves.arrowRef(categoryKey(category), -1)}
                          label={t("upFor", { name: category.name })}
                          icon={<ArrowUp />}
                          className={arrowClass}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          onKeyDown={ignoreHeldEnter}
                        />
                        <IconButton
                          ref={moves.arrowRef(categoryKey(category), 1)}
                          label={t("downFor", { name: category.name })}
                          icon={<ArrowDown />}
                          className={arrowClass}
                          disabled={index === shown.length - 1}
                          onClick={() => move(index, 1)}
                          onKeyDown={ignoreHeldEnter}
                        />
                        <IconButton
                          label={t("remove", { name: category.name })}
                          icon={<Trash2 />}
                          className="text-ink-2"
                          onClick={() => void remove(index)}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {disabled || atMost || liveDepartments.length === 0 ? null : (
              <form onSubmit={add} className={rowClass}>
                <input
                  aria-label={t("newName")}
                  placeholder={t("newName")}
                  value={name}
                  maxLength={MENU_TEXT_MAX.category}
                  aria-invalid={taken !== null || undefined}
                  className={cn(inputClass, "min-w-40 flex-1 basis-40")}
                  onChange={(event) => {
                    setName(event.target.value);
                    setTaken(null);
                  }}
                />
                <div className="flex flex-wrap items-center gap-1 max-xl:w-full xl:contents">
                  <div className="flex min-w-0 flex-1 items-center xl:w-48 xl:flex-none">
                    <ChoiceMenu
                      label={`${t("newDepartment")}: ${choiceShown(options, chosenDepartment) ?? ""}`}
                      value={chosenDepartment}
                      options={options}
                      onChange={setDepartment}
                      className="text-ink"
                    />
                  </div>
                  <IconButton
                    type="submit"
                    label={t("add")}
                    icon={<Plus />}
                    variant="secondary"
                    disabled={!name.trim()}
                  />
                </div>
              </form>
            )}
          </ListGroup>
          {taken ? (
            <p role="alert" className="px-1 text-danger text-sm">
              {t("taken", { name: taken })}
            </p>
          ) : null}
          {removed ? (
            <UndoRow
              // Each removal a row of its own (keyed as its row was): another
              // while this one is up takes the focus again.
              key={categoryKey(removed.category)}
              message={t("removed", {
                name: removed.category.name,
                count: removed.count,
              })}
              onUndo={() => void undo()}
              // The row went with the button pressed.
              autoFocus
            />
          ) : null}
          {!disabled && atMost ? (
            <p className="px-1 text-ink-2 text-sm">{t("max")}</p>
          ) : null}
          {!disabled && liveDepartments.length === 0 ? (
            <div className="flex flex-col gap-2 px-1">
              <p className="text-ink-2">{t("noDepartments")}</p>
              {departmentsHref ? (
                <Button asChild variant="secondary" className="self-start">
                  <Link href={departmentsHref}>{t("toDepartments")}</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </PageSection>

        {current ? (
          <div className="hidden md:block xl:hidden">
            <PageSection title={t("itemsOf", { name: current.name })}>
              {currentItems.length === 0 ? (
                <p className="rounded-card bg-surface px-4 py-3.5 text-ink-2 shadow-card">
                  {t("itemsEmpty")}
                </p>
              ) : (
                <ul className="overflow-hidden rounded-card bg-surface shadow-card">
                  {currentItems.map((item) => (
                    <li
                      key={item.id}
                      className="relative px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']"
                    >
                      {item.name}
                    </li>
                  ))}
                </ul>
              )}
            </PageSection>
          </div>
        ) : null}
      </div>
    </>
  );
}
