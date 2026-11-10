"use client";

import {
  boundOf,
  type DraftItem,
  type ListItemKind,
  listItemInput,
  MAX_LIST_ITEMS,
  moved,
  newItemKey,
  numberRange,
  readBound,
  type TypedBound,
  typedBound,
} from "@domain/lists";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { FieldRow, rowPillInputClass } from "@ui/field-row";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageSection } from "@ui/page";
import { Segmented } from "@ui/segmented";
import { Sheet } from "@ui/sheet";
import { Switch } from "@ui/switch";
import { ltrInputClass } from "@ui/text-field";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { UndoRow } from "../../manage/undo-row";
import { ITEM_ICONS } from "../list-preview";

/** The kinds an item can be made as now; photos come with their own part. */
const KINDS = ["check", "number", "note"] as const satisfies ListItemKind[];
type MadeKind = (typeof KINDS)[number];

const LABEL_MAX = 120;
const HINT_MAX = 200;
const UNIT_MAX = 12;

const rowClass =
  "relative flex items-center gap-1 pe-1.5 not-first:before:absolute not-first:before:start-[68px] not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";
const rowButtonClass =
  "flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-[18px] py-2.5 ps-4 text-start transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** A new item's first values: a check anyone must do. */
const blank = (): DraftItem => ({
  key: newItemKey(),
  id: null,
  kind: "check",
  label: "",
  hint: null,
  required: true,
  unit: null,
  min: null,
  max: null,
  defaultQuantity: null,
});

/**
 * A list's items: each row says what it is (its kind's icon, its label, its
 * range, whether it may stay empty) and opens a sheet to change or remove
 * it, with up and down beside it rather than a drag. A move keeps the focus
 * on the item's arrow (the other one once it reaches an end) and is said to
 * a screen reader. Adding is the row at the end. Removing has an undo, which
 * puts the item back where it was. Used by the template editor and for a
 * list typed when sending.
 */
export function ItemsEditor({
  title,
  items,
  readOnly,
  onChange,
  missing,
}: {
  title: string;
  items: DraftItem[];
  readOnly: boolean;
  /** The items as they are now, in their order. */
  onChange: (next: DraftItem[]) => void;
  /** Said under the items when there are none yet and there must be one. */
  missing?: string;
}) {
  const t = useTranslations("app.lists.items");
  const tl = useTranslations("app.lists.list");
  const [open, setOpen] = useState(false);
  // Kept while the sheet slides away, so it doesn't empty as it leaves.
  const [editing, setEditing] = useState<{
    item: DraftItem;
    isNew: boolean;
  } | null>(null);
  const [removed, setRemoved] = useState<{
    item: DraftItem;
    index: number;
  } | null>(null);
  // Where the last move left its item, said to a screen reader.
  const [moveNote, setMoveNote] = useState("");
  // Each row's arrows by `${key}:up` and `${key}:down`, and the arrow to
  // focus once a move is drawn.
  const arrows = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<{ key: string; by: -1 | 1 } | null>(null);

  // After a move the pressed arrow may have gone (an end) or moved in the
  // page: the same arrow of the same item gets the focus, or the other one.
  useEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = null;
    const index = items.findIndex((item) => item.key === want.key);
    if (index < 0) return;
    const atEnd = want.by === -1 ? index === 0 : index === items.length - 1;
    const by = atEnd ? -want.by : want.by;
    arrows.current.get(`${want.key}:${by === -1 ? "up" : "down"}`)?.focus();
  }, [items]);

  const arrowRef = (key: string) => (node: HTMLButtonElement | null) => {
    if (!node) return;
    arrows.current.set(key, node);
    return () => {
      arrows.current.delete(key);
    };
  };

  function move(index: number, by: -1 | 1, event: MouseEvent) {
    const item = items[index];
    if (!item) return;
    const next = moved(items, index, by);
    if (event.currentTarget === document.activeElement) {
      refocus.current = { key: item.key, by };
    }
    setMoveNote(
      t("movedTo", {
        label: item.label,
        place: next.findIndex((other) => other.key === item.key) + 1,
        count: next.length,
      }),
    );
    onChange(next);
  }

  function show(item: DraftItem, isNew: boolean) {
    setEditing({ item, isNew });
    setOpen(true);
  }

  function save(item: DraftItem) {
    setOpen(false);
    const known = items.some((other) => other.key === item.key);
    onChange(
      known
        ? items.map((other) => (other.key === item.key ? item : other))
        : [...items, item],
    );
    setRemoved(null);
  }

  function remove(key: string) {
    setOpen(false);
    const index = items.findIndex((item) => item.key === key);
    const item = items[index];
    if (!item) return;
    setRemoved({ item, index });
    onChange(items.filter((other) => other.key !== key));
  }

  function undo() {
    if (!removed) return;
    const { item, index } = removed;
    setRemoved(null);
    if (items.some((other) => other.key === item.key)) return;
    const next = [...items];
    next.splice(Math.min(index, next.length), 0, item);
    onChange(next);
  }

  const summaryOf = (item: DraftItem): ReactNode => {
    const range = item.kind === "number" ? numberRange(item) : null;
    const parts: ReactNode[] = [
      t(`kinds.${item.kind}`),
      range
        ? tl.rich(`range.${range.kind}`, { range: range.range, ltr })
        : item.kind === "number" && item.unit
          ? t.rich("unitOnly", { unit: item.unit, ltr })
          : null,
      item.required ? null : tl("optional"),
      item.hint,
    ].filter((part) => part !== null && part !== "");
    return parts.map((part, at) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: a few fixed parts
      <span key={at}>
        {at > 0 ? " · " : null}
        {part}
      </span>
    ));
  };

  return (
    <PageSection title={title}>
      <ListGroup>
        {items.length === 0 ? (
          <p className="px-4 py-3.5 text-ink-2">
            {readOnly ? t("emptyReadOnly") : t("empty")}
          </p>
        ) : null}
        {items.map((item, index) => {
          const Icon = ITEM_ICONS[item.kind];
          const content = (
            <>
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 [&_svg]:size-5"
              >
                <Icon />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-ink">{item.label}</span>
                <span className="text-ink-2 text-sm">{summaryOf(item)}</span>
              </span>
            </>
          );
          return (
            <div key={item.key} className={rowClass}>
              {readOnly ? (
                <div className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 ps-4">
                  {content}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className={rowButtonClass}
                    onClick={() => show(item, false)}
                  >
                    {content}
                  </button>
                  <IconButton
                    ref={arrowRef(`${item.key}:up`)}
                    label={t("up", { label: item.label })}
                    icon={<ArrowUp />}
                    disabled={index === 0}
                    className="text-ink-2"
                    onClick={(event) => move(index, -1, event)}
                  />
                  <IconButton
                    ref={arrowRef(`${item.key}:down`)}
                    label={t("down", { label: item.label })}
                    icon={<ArrowDown />}
                    disabled={index === items.length - 1}
                    className="text-ink-2"
                    onClick={(event) => move(index, 1, event)}
                  />
                </>
              )}
            </div>
          );
        })}
        {readOnly || items.length >= MAX_LIST_ITEMS ? null : (
          <ListRow
            leading={<Plus />}
            title={t("add")}
            onClick={() => show(blank(), true)}
          />
        )}
      </ListGroup>
      {items.length >= MAX_LIST_ITEMS && !readOnly ? (
        <p className="px-1 text-ink-2 text-sm">
          {t("full", { count: MAX_LIST_ITEMS })}
        </p>
      ) : null}
      {items.length === 0 && missing ? (
        <p className="px-1 text-ink-2 text-sm">{missing}</p>
      ) : null}
      {readOnly ? null : (
        <p aria-live="polite" className="sr-only">
          {moveNote}
        </p>
      )}
      {removed ? (
        <UndoRow
          message={t("removed", { label: removed.item.label })}
          onUndo={undo}
        />
      ) : null}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={editing?.isNew ? t("newTitle") : editing?.item.label}
        closeLabel={t("close")}
      >
        {editing ? (
          <ItemForm
            key={editing.item.key}
            item={editing.item}
            isNew={editing.isNew}
            onSave={save}
            onRemove={() => remove(editing.item.key)}
          />
        ) : null}
      </Sheet>
    </PageSection>
  );
}

type Problem = "label" | "number" | "range";

/**
 * One item in its sheet: its kind, what it is called, a short hint, whether
 * it is required, and for a number its unit and the range a reading is
 * flagged outside. A bound below zero has its own minus beside it, since a
 * phone's number pad may have none; a minus typed in the field turns it on
 * (`typedBound`).
 */
function ItemForm({
  item,
  isNew,
  onSave,
  onRemove,
}: {
  item: DraftItem;
  isNew: boolean;
  onSave: (item: DraftItem) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("app.lists.items");
  const id = useId();
  const [kind, setKind] = useState<MadeKind>(
    item.kind === "photo" ? "check" : item.kind,
  );
  const [label, setLabel] = useState(item.label);
  const [hint, setHint] = useState(item.hint ?? "");
  const [required, setRequired] = useState(item.required);
  const [unit, setUnit] = useState(item.unit ?? "");
  const [min, setMin] = useState<TypedBound>(() => boundOf(item.min));
  const [max, setMax] = useState<TypedBound>(() => boundOf(item.max));
  const [problem, setProblem] = useState<Problem | null>(null);

  function submit() {
    const number = kind === "number";
    const low = number ? readBound(min) : null;
    const high = number ? readBound(max) : null;
    if (!label.trim()) {
      setProblem("label");
      return;
    }
    if (low === "number" || high === "number") {
      setProblem("number");
      return;
    }
    const next: DraftItem = {
      ...item,
      kind,
      label: label.trim(),
      hint: hint.trim() || null,
      required,
      unit: number ? unit.trim() || null : null,
      min: low,
      max: high,
      // A usual count belongs to a check of an order.
      defaultQuantity: kind === "check" ? item.defaultQuantity : null,
    };
    const parsed = listItemInput.safeParse({
      kind: next.kind,
      label: next.label,
      ...(next.hint ? { hint: next.hint } : {}),
      required: next.required,
      ...(next.unit ? { unit: next.unit } : {}),
      ...(next.min === null ? {} : { min: next.min }),
      ...(next.max === null ? {} : { max: next.max }),
      ...(next.defaultQuantity === null
        ? {}
        : { defaultQuantity: next.defaultQuantity }),
    });
    if (!parsed.success) {
      setProblem(
        next.min !== null && next.max !== null && next.min > next.max
          ? "range"
          : "number",
      );
      return;
    }
    onSave(next);
  }

  const boundRow = (
    which: "min" | "max",
    bound: TypedBound,
    set: (next: TypedBound) => void,
  ) => {
    const fieldId = `${id}-${which}`;
    return (
      <FieldRow label={t(which)} htmlFor={fieldId}>
        <span className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={bound.minus}
            aria-label={t("minusOf", { field: t(which) })}
            title={t("minusOf", { field: t(which) })}
            onClick={() => {
              set({ ...bound, minus: !bound.minus });
              setProblem(null);
            }}
            className={cn(
              "pressable min-h-11 shrink-0 rounded-full px-4 font-semibold text-base transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              bound.minus
                ? "bg-accent text-accent-ink"
                : "bg-surface-2 text-ink",
            )}
          >
            {t("minus")}
          </button>
          <input
            id={fieldId}
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            value={bound.text}
            maxLength={9}
            aria-invalid={
              problem === "number" || problem === "range" || undefined
            }
            className={cn(rowPillInputClass, ltrInputClass, "w-24")}
            onChange={(event) => {
              set(typedBound(bound.minus, event.target.value));
              setProblem(null);
            }}
          />
        </span>
      </FieldRow>
    );
  };

  return (
    <div className="flex flex-col gap-4 px-2 pt-1 pb-2">
      <Segmented
        label={t("kindLabel")}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setProblem(null);
        }}
        options={KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }))}
      />
      <p className="px-2 text-ink-2 text-sm">{t(`kindHints.${kind}`)}</p>
      <FieldGroup className="bg-elevated">
        <GroupedField
          label={t("label")}
          value={label}
          maxLength={LABEL_MAX}
          error={problem === "label" ? t("problem.label") : undefined}
          onChange={(event) => {
            setLabel(event.target.value);
            setProblem(null);
          }}
        />
        <GroupedField
          label={t("hint")}
          hint={t("hintHint")}
          value={hint}
          maxLength={HINT_MAX}
          onChange={(event) => setHint(event.target.value)}
        />
      </FieldGroup>

      {kind === "number" ? (
        <FieldGroup className="bg-elevated">
          <GroupedField
            label={t("unit")}
            hint={t("unitHint")}
            value={unit}
            maxLength={UNIT_MAX}
            onChange={(event) => setUnit(event.target.value)}
          />
          {boundRow("min", min, setMin)}
          {boundRow("max", max, setMax)}
        </FieldGroup>
      ) : null}
      {kind === "number" ? (
        <p className="px-2 text-ink-2 text-sm">{t("rangeHint")}</p>
      ) : null}

      <FieldGroup className="bg-elevated">
        <FieldRow label={t("required")} hint={t("requiredHint")}>
          <Switch
            checked={required}
            aria-label={t("required")}
            title={t("required")}
            onChange={setRequired}
          />
        </FieldRow>
      </FieldGroup>

      {problem && problem !== "label" ? (
        <p role="alert" className="px-2 font-medium text-danger">
          {t(`problem.${problem}`)}
        </p>
      ) : null}

      <Button size="lg" onClick={submit}>
        {t(isNew ? "create" : "save")}
      </Button>
      {isNew ? null : (
        <Button
          size="lg"
          variant="ghost"
          className="text-danger"
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
      )}
    </div>
  );
}
