import {
  Hourglass,
  Send,
  StickyNote,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { cn } from "./cn";
import { floatingButtonClass } from "./floating-action";
import { IconButton } from "./icon-button";
import { Stepper } from "./stepper";

/** A button of a draft line: its word, and the item it is for, for screen readers. */
type LineButton = { label: string; forItem: string; onClick: () => void };

export type DraftLineRowProps = {
  name: string;
  /** The options chosen, under it ("מדיום · גבינה"). */
  choices?: readonly string[];
  /** The unit price, in an LTR span. */
  price: ReactNode;
  quantity: number;
  onQuantity: (quantity: number) => void;
  /** The stepper's names, each with the item ("כמה: חומוס"). */
  quantityLabels: { label: string; less: string; more: string };
  /** The note in words, in a warning box ("הערה: בלי שום"). */
  note?: ReactNode;
  /** The allergy in words with its word, in danger ("אלרגיה: בוטנים"). */
  allergy?: ReactNode;
  /** Held for a later course: these words ("יחכה לקריאה"). */
  held?: string | null;
  noteButton: LineButton;
  allergyButton: LineButton;
  /** "לחכות עם זה", pressed while held. */
  holdButton: LineButton & { pressed: boolean };
  /** Takes it off the draft; the screen offers its undo. */
  remove: { label: string; onClick: () => void };
  /** Nothing changes it: a view session. */
  disabled?: boolean;
};

/**
 * A line of the draft (waiter mode): its name and choices, unit price, how
 * many, its note and allergy in sight, and "הערה", "אלרגיה" and "לחכות עם
 * זה" with no long press, each named with the item. A list item: put it in
 * the draft's `ul`.
 */
export function DraftLineRow({
  name,
  choices = [],
  price,
  quantity,
  onQuantity,
  quantityLabels,
  note,
  allergy,
  held = null,
  noteButton,
  allergyButton,
  holdButton,
  remove,
  disabled = false,
}: DraftLineRowProps) {
  return (
    <li className="relative flex flex-col gap-2 px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{name}</span>
          {choices.length > 0 ? (
            <span className="text-ink-2 text-sm">{choices.join(" · ")}</span>
          ) : null}
          <span className="text-ink-2 text-sm">{price}</span>
        </span>
        <Stepper
          value={String(quantity)}
          onValueChange={(value) => {
            const next = Number(value);
            if (Number.isInteger(next) && next >= 1 && next <= 99) {
              onQuantity(next);
            }
          }}
          min={1}
          max={99}
          disabled={disabled}
          label={quantityLabels.label}
          decreaseLabel={quantityLabels.less}
          increaseLabel={quantityLabels.more}
        />
      </div>
      {allergy ? (
        <p className="flex items-start gap-1.5 font-semibold text-danger">
          <TriangleAlert aria-hidden="true" className="mt-1 size-4 shrink-0" />
          {allergy}
        </p>
      ) : null}
      {note ? (
        <p className="rounded-control bg-warning-soft px-3 py-1.5">{note}</p>
      ) : null}
      {held ? <Badge className="self-start">{held}</Badge> : null}
      <div className="-ms-2 flex flex-wrap items-center gap-1">
        {(
          [
            [noteButton, <StickyNote key="note" aria-hidden="true" />],
            [allergyButton, <TriangleAlert key="allergy" aria-hidden="true" />],
          ] as const
        ).map(([button, icon]) => (
          <Button
            key={button.label}
            variant="ghost"
            className="px-3"
            disabled={disabled}
            onClick={button.onClick}
          >
            {icon}
            {button.label}
            <span className="sr-only">{button.forItem}</span>
          </Button>
        ))}
        <Button
          variant="ghost"
          className={cn("px-3", holdButton.pressed && "bg-surface-2")}
          aria-pressed={holdButton.pressed}
          disabled={disabled}
          onClick={holdButton.onClick}
        >
          <Hourglass aria-hidden="true" />
          {holdButton.label}
          <span className="sr-only">{holdButton.forItem}</span>
        </Button>
        <IconButton
          label={remove.label}
          icon={<Trash2 />}
          className="ms-auto"
          disabled={disabled}
          onClick={remove.onClick}
        />
      </div>
    </li>
  );
}

export type SendOrderButtonProps = {
  /** "שליחת ההזמנה", the screen's one main action. */
  label: string;
  /** How many go, in words ("3 מנות"). */
  count: string;
  /** Where they go, under it ("מטבח · 2, בר · 1"). */
  routes: string;
  onClick: () => void;
  /** Above the tab bar on a phone, with the accent's lift. */
  floating?: boolean;
  disabled?: boolean;
  loading?: boolean;
};

/**
 * The send (waiter mode): "שליחת ההזמנה" with how many beside it and where
 * they go under it. On a phone it floats above the tab bar
 * (`FloatingAction`); from tablet up it ends the draft.
 */
export function SendOrderButton({
  label,
  count,
  routes,
  onClick,
  floating = false,
  disabled = false,
  loading = false,
}: SendOrderButtonProps) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={cn(
        "w-full flex-col gap-0 py-2",
        floating && floatingButtonClass,
      )}
    >
      <span className="flex items-center gap-2">
        <Send aria-hidden="true" className="rtl:-scale-x-100" />
        {label}
        <span className="font-medium text-base">{count}</span>
      </span>
      {routes ? <span className="font-medium text-sm">{routes}</span> : null}
    </Button>
  );
}
