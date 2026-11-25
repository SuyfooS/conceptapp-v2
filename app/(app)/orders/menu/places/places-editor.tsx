"use client";

import {
  MENU_CAPS,
  MENU_TEXT_MAX,
  type OrderPlace,
  type PlaceInput,
  quickCount,
  quickPlaces,
} from "@domain/order-taking";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { ignoreHeldEnter } from "@ui/focus-after";
import { IconButton } from "@ui/icon-button";
import { ListGroup } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { StatusToast } from "@ui/status-toast";
import { Stepper } from "@ui/stepper";
import { UndoRow } from "@ui/undo-row";
import { ArrowDown, ArrowUp, LayoutGrid, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { inputClass, rowClass } from "../../../manage/list-rows";
import { FailureLine } from "../menu-parts";
import type { MenuActionFailure, SavePlaces } from "../menu-types";
import { type MoveBy, useRowMoves } from "../row-moves";

/** Where the quick start begins: a small restaurant's floor. */
const QUICK_START = 10;

/** A place's row, as its list keys it: one not saved yet by its name. */
const placeKey = (place: PlaceInput) => place.id ?? `new:${place.name}`;

/**
 * The places orders are taken for (waiter mode P2): tables, seats at the bar
 * or rooms, each a name to type over in the order the floor shows them,
 * saved whole with each change, as the departments are. Removing one has an
 * undo. A business with none yet makes them all at once, named 1 to N,
 * renamed later as it likes. A move keeps the focus on the place's arrow
 * (the other one once it reaches an end) and says where it went
 * (`useRowMoves`); Enter held down moves it once, so the other arrow takes
 * no key repeating. The same rows on every screen, one list.
 */
export function PlacesEditor({
  places,
  disabled,
  save,
  version,
}: {
  places: OrderPlace[];
  disabled: boolean;
  save: SavePlaces;
  /** The menu's version: a new one is the server's list, which replaces this screen's. */
  version: number;
}) {
  const t = useTranslations("app.orders.places");
  const quickId = useId();
  const [order, setOrder] = useState<PlaceInput[] | null>(null);
  const [heldVersion, setHeldVersion] = useState(version);
  if (heldVersion !== version) {
    setHeldVersion(version);
    setOrder(null);
  }
  const [name, setName] = useState("");
  const [count, setCount] = useState(String(QUICK_START));
  const [making, setMaking] = useState(false);
  const [taken, setTaken] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{
    place: PlaceInput;
    index: number;
  } | null>(null);
  const [failure, setFailure] = useState<MenuActionFailure | null>(null);
  const [saved, setSaved] = useState(0);

  const shown: PlaceInput[] = order ?? places;
  const moves = useRowMoves(shown, placeKey);
  const named = (text: string, except?: number) =>
    shown.some(
      (p, at) => at !== except && p.name.toLowerCase() === text.toLowerCase(),
    );

  /** Saves the list (the server checks it again); says whether it saved. */
  async function change(next: PlaceInput[]): Promise<boolean> {
    const before = order;
    setOrder(next);
    let result: Awaited<ReturnType<SavePlaces>>;
    try {
      result = await save(next);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (result.ok) {
      const ids = result.value;
      setOrder(next.map((p, at) => ({ ...p, id: ids[at] ?? p.id })));
      setFailure(null);
      setSaved((n) => n + 1);
      return true;
    }
    setOrder(before);
    setFailure(result.failure);
    return false;
  }

  // The one number the button names, makes, and puts back in the field.
  const quick = quickCount(count, QUICK_START);

  async function makeAll() {
    setCount(String(quick));
    setMaking(true);
    await change(quickPlaces(quick, shown));
    setMaking(false);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const text = name.trim();
    if (!text) return;
    if (named(text)) {
      setTaken(text);
      return;
    }
    setName("");
    setTaken(null);
    if (await change([...shown, { name: text }])) {
      setRemoved(null);
    } else {
      setName((typing) => typing || text);
    }
  }

  function rename(index: number, text: string): boolean {
    const place = shown[index];
    const clean = text.trim();
    if (!place || !clean || clean === place.name) return false;
    if (named(clean, index)) {
      setTaken(clean);
      return false;
    }
    setTaken(null);
    void change(
      shown.map((p, at) => (at === index ? { ...p, name: clean } : p)),
    );
    return true;
  }

  function move(index: number, by: MoveBy) {
    const to = index + by;
    if (to < 0 || to >= shown.length) return;
    const next = [...shown];
    const [moving] = next.splice(index, 1);
    if (!moving) return;
    next.splice(to, 0, moving);
    moves.moving(
      placeKey(moving),
      by,
      t("movedTo", { name: moving.name, place: to + 1, count: next.length }),
    );
    void change(next);
  }

  async function remove(index: number) {
    const place = shown[index];
    if (!place) return;
    const before = removed;
    setRemoved({ place, index });
    if (!(await change(shown.filter((_, at) => at !== index)))) {
      setRemoved(before);
    }
  }

  async function undo() {
    if (!removed) return;
    const { place, index } = removed;
    setRemoved(null);
    if (shown.some((p) => p.id !== undefined && p.id === place.id)) return;
    const next = [...shown];
    next.splice(index, 0, place);
    if (!(await change(next))) setRemoved(removed);
  }

  return (
    <>
      <StatusToast
        message={saved > 0 ? t("saved") : null}
        stamp={String(saved)}
        duration={1800}
      />
      <FailureLine failure={failure} />
      {shown.length === 0 && !disabled ? (
        <EmptyState
          headingLevel="h2"
          icon={<LayoutGrid />}
          title={t("quick.title")}
          body={t("quick.hint")}
        >
          <div className="flex flex-col items-center gap-2">
            <label htmlFor={quickId} className="font-medium text-sm">
              {t("quick.count")}
            </label>
            <Stepper
              id={quickId}
              value={count}
              onValueChange={setCount}
              onBlur={() => setCount(String(quick))}
              min={1}
              max={MENU_CAPS.places}
              decreaseLabel={t("quick.fewer")}
              increaseLabel={t("quick.more")}
              wide
            />
          </div>
          <Button size="lg" loading={making} onClick={() => void makeAll()}>
            {t("quick.action", { count: quick })}
          </Button>
        </EmptyState>
      ) : (
        <PageSection title={t("listTitle")} className="md:max-w-2xl">
          <ListGroup>
            {shown.length === 0 ? (
              <p className="px-4 py-3.5 text-ink-2">{t("empty")}</p>
            ) : null}
            {shown.map((place, index) => (
              <div key={placeKey(place)} className={rowClass}>
                <input
                  key={place.name}
                  aria-label={t("nameOf", { name: place.name })}
                  defaultValue={place.name}
                  maxLength={MENU_TEXT_MAX.place}
                  disabled={disabled}
                  className={inputClass}
                  onBlur={(event) => {
                    if (!rename(index, event.target.value)) {
                      event.target.value = place.name;
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                {disabled ? null : (
                  <>
                    <IconButton
                      ref={moves.arrowRef(placeKey(place), -1)}
                      label={t("upFor", { name: place.name })}
                      icon={<ArrowUp />}
                      className="text-ink-2"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      onKeyDown={ignoreHeldEnter}
                    />
                    <IconButton
                      ref={moves.arrowRef(placeKey(place), 1)}
                      label={t("downFor", { name: place.name })}
                      icon={<ArrowDown />}
                      className="text-ink-2"
                      disabled={index === shown.length - 1}
                      onClick={() => move(index, 1)}
                      onKeyDown={ignoreHeldEnter}
                    />
                    <IconButton
                      label={t("remove", { name: place.name })}
                      icon={<Trash2 />}
                      className="text-ink-2"
                      onClick={() => void remove(index)}
                    />
                  </>
                )}
              </div>
            ))}
            {disabled || shown.length >= MENU_CAPS.places ? null : (
              <form onSubmit={add} className={rowClass}>
                <input
                  aria-label={t("newName")}
                  placeholder={t("newName")}
                  value={name}
                  maxLength={MENU_TEXT_MAX.place}
                  aria-invalid={taken !== null || undefined}
                  className={inputClass}
                  onChange={(event) => {
                    setName(event.target.value);
                    setTaken(null);
                  }}
                />
                <IconButton
                  type="submit"
                  label={t("add")}
                  icon={<Plus />}
                  variant="secondary"
                  disabled={!name.trim()}
                />
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
              key={placeKey(removed.place)}
              message={t("removed", { name: removed.place.name })}
              onUndo={() => void undo()}
              autoFocus
            />
          ) : null}
          {!disabled && shown.length >= MENU_CAPS.places ? (
            <p className="px-1 text-ink-2 text-sm">{t("max")}</p>
          ) : null}
        </PageSection>
      )}
    </>
  );
}
