"use client";

import {
  Check,
  ImageOff,
  ImagePlus,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { type ReactNode, useId, useRef, useState } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import { cn } from "./cn";
import { PICKED_PHOTO_ACCEPT } from "./photo-encode";
import { Spinner } from "./spinner";
import { Stepper } from "./stepper";
import { fieldInputClass, ltrInputClass } from "./text-field";

export type ChecklistItemKind = "check" | "number" | "note" | "photo";

export type ChecklistItemProps = {
  kind: ChecklistItemKind;
  label: string;
  /** A line under the label: how to do it, the range, what was asked for. */
  hint?: ReactNode;
  required: boolean;
  /** Said beside an item that may stay empty ("לא חובה"). */
  optionalLabel: string;
  done: boolean;
  /** Who did it and when ("נועה · 07:42"). */
  doneLine?: ReactNode;
  /** A comment left on the item. */
  comment?: string | null;
  /** The quiet way to add or change the comment. */
  commentAction?: { label: string; onClick: () => void } | null;
  /** Shown as it is: closed, someone else's, or a view session. */
  readOnly?: boolean;
  /** A check: the whole row ticks it, and ticking again takes it back. */
  check?: { checked: boolean; onToggle: () => void };
  /**
   * An order's check: how many were given. Ticking gives what was asked for
   * (the hint says how many); once ticked, a stepper under the row changes
   * it, saved on leaving the field or shortly after the last tap. Read-only,
   * `text` says it instead ("ניתנו 20 מתוך 24").
   */
  quantity?: {
    /** "ניתנו", beside the stepper. */
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    onCommit: () => void;
    /** Names the count for screen readers, with the item in it. */
    fieldLabel: string;
    decreaseLabel: string;
    increaseLabel: string;
    max: number;
    /** Said beside it while fewer were given than asked ("חסרים 4"). */
    short?: ReactNode;
    /** What was given, in words, for a list only read. */
    text?: ReactNode;
  } | null;
  /** A number: typed left to right, saved on leaving the field or on Enter. */
  number?: {
    value: string;
    onValueChange: (value: string) => void;
    onCommit: () => void;
    fieldLabel: string;
    unit?: string | null;
    /** The range it should be in, when it has one. */
    range?: ReactNode;
    /** Says the reading is outside its range; null while it isn't. */
    outOfRange?: ReactNode;
    /**
     * A keypad without a minus sign (an iPhone's) can't type −18: a toggle
     * beside the field makes the number negative. Only while it can be typed:
     * read-only, `value` carries its own sign.
     */
    minus?: { label: string; on: boolean; onToggle: () => void } | null;
  };
  /** A few words: saved on leaving the field. */
  note?: {
    value: string;
    onValueChange: (value: string) => void;
    onCommit: () => void;
    fieldLabel: string;
    placeholder?: string;
  };
  /**
   * A photo (L6): the photo taken, and the way to take one, replace it or
   * remove it with the phone's own chooser (its camera or its photos). The
   * screen re-encodes and saves what is picked (`onPick`) and says how it went.
   */
  photo?: {
    /** The photo now (stored, or the one being saved), or null for none. */
    src: string | null;
    /** Names the photo for screen readers. */
    alt: string;
    /** Said in place of a photo: none was taken, or it is no longer kept. */
    empty?: ReactNode;
    /** Said beside a spinner while a photo is prepared or saved. */
    busy?: ReactNode;
    /** Why the last photo didn't save or go, in words. */
    problem?: ReactNode;
    /** Why no photo is taken here (a demo business), in place of the buttons. */
    locked?: ReactNode;
    take?: {
      /**
       * "הוספת תמונה", and "החלפת התמונה" once there is one: words that
       * hold on any device (a phone's chooser offers its camera, a
       * computer's its files).
       */
      label: string;
      replaceLabel: string;
      /** Under the button: take one, or choose one already there. */
      hint?: ReactNode;
      onPick: (file: File) => void;
    } | null;
    remove?: { label: string; onRemove: () => void } | null;
    /** Under it all, such as the undo of a removal. */
    after?: ReactNode;
  };
};

const rowClass =
  "relative flex min-h-16 flex-col gap-2 px-4 py-3 not-first:before:absolute not-first:before:start-4 not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

/**
 * One item of a list being filled: a check, a number with its unit and range,
 * a note, or a photo. A tick is a 44px circle that fills, on a row that is
 * itself the button. A reading outside its range is said in words, in the
 * warning colour. Who did it and when sits under it. On an order, a ticked
 * check has its count under it, a stepper that says how many were given.
 * Read-only lists show the same without the controls. A checkbox is named by
 * its label alone; the rest of the row describes it.
 */
export function ChecklistItem({
  kind,
  label,
  hint,
  required,
  optionalLabel,
  done,
  doneLine,
  comment,
  commentAction,
  readOnly = false,
  check,
  quantity,
  number,
  note,
  photo,
}: ChecklistItemProps) {
  const fieldId = useId();
  const shortId = useId();
  const labelId = useId();
  const optionalId = useId();
  const hintId = useId();
  const commentId = useId();
  const doneId = useId();
  const title = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span id={labelId} className="font-medium text-md text-ink">
        {label}
      </span>
      {required ? null : (
        <Badge id={optionalId} tone="neutral">
          {optionalLabel}
        </Badge>
      )}
    </span>
  );
  const shownDoneLine = done && doneLine ? doneLine : null;
  const below = (
    <>
      {comment ? (
        <span className="flex items-start gap-1.5 text-ink-2 text-sm">
          <MessageSquareText
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span id={commentId} className="min-w-0">
            {comment}
          </span>
        </span>
      ) : null}
      {shownDoneLine ? (
        <span id={doneId} className="text-ink-2 text-sm">
          {shownDoneLine}
        </span>
      ) : null}
    </>
  );
  // What a checkbox says after its name: optional, how, the comment, who.
  const described =
    [
      required ? null : optionalId,
      hint ? hintId : null,
      comment ? commentId : null,
      shownDoneLine ? doneId : null,
    ]
      .filter((id) => id !== null)
      .join(" ") || undefined;
  const commentButton =
    commentAction && !readOnly ? (
      <button
        type="button"
        onClick={commentAction.onClick}
        aria-label={`${commentAction.label}: ${label}`}
        title={commentAction.label}
        className="pressable grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent [&_svg]:size-5"
      >
        <MessageSquareText aria-hidden="true" />
      </button>
    ) : null;

  if (kind === "check") {
    const checked = check?.checked ?? done;
    const circle = (
      <span
        aria-hidden="true"
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,scale] duration-200 ease-spring",
          checked
            ? "scale-100 border-accent bg-accent text-accent-ink"
            : "border-edge bg-transparent text-transparent",
        )}
      >
        <Check className="size-5 stroke-[3]" />
      </span>
    );
    const text = (
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
        {title}
        {hint ? (
          <span id={hintId} className="text-ink-2 text-sm">
            {hint}
          </span>
        ) : null}
        {below}
      </span>
    );
    // An order's count, under the row once it's ticked: a stepper while it
    // is filled, its words while it is only read. In line with the label,
    // past the circle.
    const counted =
      quantity && checked ? (
        readOnly || !check ? (
          quantity.text ? (
            <span className="ps-14 text-ink-2 text-sm">{quantity.text}</span>
          ) : null
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-14">
            <span aria-hidden="true" className="font-medium text-base text-ink">
              {quantity.label}
            </span>
            <Stepper
              value={quantity.value}
              onValueChange={quantity.onValueChange}
              onBlur={quantity.onCommit}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              min={0}
              max={quantity.max}
              wide
              label={quantity.fieldLabel}
              decreaseLabel={quantity.decreaseLabel}
              increaseLabel={quantity.increaseLabel}
              describedBy={quantity.short ? shortId : undefined}
            />
            {quantity.short ? (
              <span id={shortId} className="text-ink-2 text-sm">
                {quantity.short}
              </span>
            ) : null}
          </div>
        )
      ) : null;
    const row = (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {readOnly || !check ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            {circle}
            {text}
          </span>
        ) : (
          // A real checkbox, drawn as the circle; the whole row is its label.
          <label className="pressable -my-1 flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[14px] py-1">
            <span className="relative grid size-11 shrink-0 place-items-center">
              <input
                type="checkbox"
                checked={checked}
                onChange={check.onToggle}
                aria-labelledby={labelId}
                aria-describedby={described}
                className={cn(
                  "peer size-11 cursor-pointer appearance-none rounded-full border-2 border-edge transition-[background-color,border-color] duration-200 ease-spring",
                  "checked:border-accent checked:bg-accent",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                )}
              />
              <Check
                aria-hidden="true"
                className="pointer-events-none absolute size-5 stroke-[3] text-transparent peer-checked:text-accent-ink"
              />
            </span>
            {text}
          </label>
        )}
        {commentButton}
      </div>
    );
    return counted ? (
      <div className={rowClass}>
        {row}
        {counted}
      </div>
    ) : (
      <div className={cn(rowClass, "flex-row items-center gap-3")}>{row}</div>
    );
  }

  const doneMark = done ? (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-4"
    >
      <Check className="stroke-[3]" />
    </span>
  ) : null;

  return (
    <div className={rowClass}>
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            {doneMark}
            {kind === "number" || kind === "note" ? (
              <label htmlFor={fieldId} className="min-w-0">
                {title}
              </label>
            ) : (
              title
            )}
          </span>
          {hint ? (
            <span id={hintId} className="text-ink-2 text-sm">
              {hint}
            </span>
          ) : null}
        </span>
        {commentButton}
      </div>

      {kind === "number" && number ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            {number.minus && !readOnly ? (
              <button
                type="button"
                aria-pressed={number.minus.on}
                aria-label={`${number.minus.label}: ${label}`}
                onClick={number.minus.onToggle}
                className={cn(
                  "pressable min-h-11 shrink-0 rounded-full px-4 font-semibold text-base transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  number.minus.on
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-2 text-ink",
                )}
              >
                {number.minus.label}
              </button>
            ) : null}
            <input
              id={fieldId}
              dir="ltr"
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              value={number.value}
              readOnly={readOnly}
              aria-label={number.fieldLabel}
              aria-describedby={hint ? hintId : undefined}
              aria-invalid={number.outOfRange ? true : undefined}
              onChange={(event) => number.onValueChange(event.target.value)}
              onBlur={number.onCommit}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className={cn(
                fieldInputClass,
                ltrInputClass,
                "max-w-40 tabular-nums read-only:bg-surface-2",
                number.outOfRange &&
                  "border-warning aria-invalid:border-warning aria-invalid:focus-visible:outline-warning/25",
              )}
            />
            {number.unit ? (
              <span dir="ltr" className="shrink-0 text-base text-ink-2">
                {number.unit}
              </span>
            ) : null}
          </div>
          {number.outOfRange ? (
            <span role="status" className="font-medium text-sm text-warning">
              {number.outOfRange}
            </span>
          ) : number.range ? (
            <span className="text-ink-2 text-sm">{number.range}</span>
          ) : null}
        </div>
      ) : null}

      {kind === "note" && note ? (
        <textarea
          id={fieldId}
          rows={2}
          value={note.value}
          readOnly={readOnly}
          aria-label={note.fieldLabel}
          placeholder={readOnly ? undefined : note.placeholder}
          maxLength={500}
          onChange={(event) => note.onValueChange(event.target.value)}
          onBlur={note.onCommit}
          className={cn(
            fieldInputClass,
            "h-auto min-h-20 py-2.5 read-only:bg-surface-2",
          )}
        />
      ) : null}

      {kind === "photo" && photo ? (
        <PhotoPart photo={photo} label={label} readOnly={readOnly} />
      ) : null}

      {below}
    </div>
  );
}

/**
 * A photo item's own part: the whole photo in a rounded frame of its own
 * shape (wide or tall, as it loads; never cropped), or what is said instead;
 * while it saves, a spinner over it and the words; the buttons to take,
 * replace or remove it, each named with the item.
 */
function PhotoPart({
  photo,
  label,
  readOnly,
}: {
  photo: NonNullable<ChecklistItemProps["photo"]>;
  label: string;
  readOnly: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  // A photo taller than it is wide gets a tall frame, as wide as a wide
  // one's height, so it shows as large; until it loads, a wide one.
  const [tall, setTall] = useState(false);
  const busy = Boolean(photo.busy);
  const take = readOnly || photo.locked ? null : (photo.take ?? null);
  const remove =
    readOnly || photo.locked || !photo.src || busy
      ? null
      : (photo.remove ?? null);
  // How to take one, until there is one.
  const showHint = Boolean(take?.hint) && !photo.src;
  const note = (text: ReactNode) => (
    <span className="flex items-center gap-2 text-ink-2 text-sm">
      <ImageOff aria-hidden="true" className="size-4 shrink-0" />
      {text}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      {photo.src ? (
        <span
          className={cn(
            "relative block w-full overflow-hidden rounded-control bg-surface-2",
            tall ? "aspect-[3/4] max-w-72" : "aspect-[4/3] max-w-sm",
          )}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            unoptimized
            draggable={false}
            sizes="(min-width: 768px) 384px, 100vw"
            onLoad={(event) => {
              const shown = event.currentTarget;
              setTall(shown.naturalHeight > shown.naturalWidth);
            }}
            className={cn(
              "object-contain transition-opacity duration-200",
              busy && "opacity-60",
            )}
          />
          {busy ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center text-ink"
            >
              <span className="grid size-11 place-items-center rounded-full bg-surface shadow-card">
                <Spinner />
              </span>
            </span>
          ) : null}
        </span>
      ) : busy ? null : photo.empty ? (
        note(photo.empty)
      ) : null}

      {/* Out of the flow, so it is there before it speaks. */}
      <span aria-live="polite" className="sr-only">
        {photo.busy}
      </span>
      {busy ? (
        <span
          aria-hidden="true"
          className="flex items-center gap-2 text-base text-ink-2"
        >
          {photo.src ? null : <Spinner className="size-4" />}
          {photo.busy}
        </span>
      ) : null}
      {photo.problem ? (
        <p role="alert" className="font-medium text-danger text-sm">
          {photo.problem}
        </p>
      ) : null}

      {readOnly ? null : photo.locked ? (
        note(photo.locked)
      ) : take || remove ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {take ? (
              <>
                <input
                  ref={input}
                  type="file"
                  accept={PICKED_PHOTO_ACCEPT}
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // The same file can be picked again after a problem.
                    event.target.value = "";
                    if (file) take.onPick(file);
                  }}
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  aria-label={`${photo.src ? take.replaceLabel : take.label}: ${label}`}
                  aria-describedby={showHint ? hintId : undefined}
                  onClick={() => input.current?.click()}
                >
                  <ImagePlus aria-hidden="true" />
                  {photo.src ? take.replaceLabel : take.label}
                </Button>
              </>
            ) : null}
            {remove ? (
              <Button
                variant="ghost"
                aria-label={`${remove.label}: ${label}`}
                onClick={remove.onRemove}
                className="text-danger"
              >
                <Trash2 aria-hidden="true" />
                {remove.label}
              </Button>
            ) : null}
          </div>
          {showHint ? (
            <span id={hintId} className="text-ink-2 text-sm">
              {take?.hint}
            </span>
          ) : null}
        </div>
      ) : null}

      {photo.after}
    </div>
  );
}
