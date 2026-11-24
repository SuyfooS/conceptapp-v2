"use client";

import { X } from "lucide-react";
import { type ReactNode, useId, useLayoutEffect, useRef } from "react";
import { AttachmentChip, type AttachmentProgress } from "./attachment-chip";
import { Button } from "./button";
import { cn } from "./cn";
import { focusFirst, focusLost } from "./focus-after";
import { IconButton } from "./icon-button";
import { Spinner } from "./spinner";

/** One way to pick the file: the camera, the phone's photos, a PDF. */
export type FileFieldChoice = {
  /** Its own key, which never changes ("camera", "photos", "pdf"). */
  key: string;
  icon: ReactNode;
  label: string;
  /** What the phone's picker offers. */
  accept: string;
  /** Straight to the camera (`capture`), where the phone has one. */
  capture?: "environment" | "user";
  onPick: (file: File) => void;
};

/** What was picked, as the field shows it. */
export type FileFieldChosen =
  /** A photo made ready on the phone: shown as it will go. */
  | { kind: "image"; src: string; alt: string }
  /** A PDF: its name and size, as a chip. */
  | { kind: "pdf"; name: string; meta?: ReactNode };

export type FileFieldProps = {
  /** The field's title ("הקובץ"). */
  legend: string;
  /** What to pick, under the title. */
  hint?: ReactNode;
  choices: readonly FileFieldChoice[];
  chosen: FileFieldChosen | null;
  /** What the chosen file is called for screen readers ("הקובץ שבחרת"). */
  chosenLabel: string;
  /** Takes the file out ("הסרת הקובץ"), while it can still change. */
  remove?: { label: string; onRemove: () => void } | null;
  /** While a photo is made ready: what it says beside a spinner. */
  preparing?: string | null;
  /** Said once the file is picked ("הקובץ מוכן לשליחה"). */
  readyLabel?: string;
  /** A PDF on its way up, with the way to stop it. */
  progress?: AttachmentProgress | null;
  cancel?: { label: string; onCancel: () => void } | null;
  /** What is wrong with it, read out as it appears. */
  error?: ReactNode;
  disabled?: boolean;
  className?: string;
};

/**
 * The file of a form (chat C7: an official document's): a button for each
 * way to pick it (the camera, the phone's photos, a PDF), each its own
 * picker, and once picked the file itself: a photo shown as it will go, a
 * PDF as a chip with its name and size, how far it got on its way up, and
 * the way to take it out or stop it. The pickers stay outside what is shown,
 * so a file picked after the screen changed still arrives. Its buttons are
 * pills of at least 44px, each with its words. One line a screen reader
 * hears is always there: the photo being made ready, then the file ready
 * (`readyLabel`). The picker's button goes with the pick, so the focus
 * goes to the way to take the file out, and back to the buttons once it is.
 */
export function FileField({
  legend,
  hint,
  choices,
  chosen,
  chosenLabel,
  remove,
  preparing,
  readyLabel,
  progress,
  cancel,
  error,
  disabled = false,
  className,
}: FileFieldProps) {
  const pickers = useRef(new Map<string, HTMLInputElement>());
  const fieldset = useRef<HTMLFieldSetElement>(null);
  const hintId = useId();
  const errorId = useId();
  const picked = chosen?.kind ?? null;
  const making = Boolean(preparing);
  // What the field showed last: a pick, or a removal, moves the focus that
  // went with the button pressed.
  const was = useRef({ picked, making });
  useLayoutEffect(() => {
    const before = was.current;
    was.current = { picked, making };
    if (!focusLost()) return;
    const root = fieldset.current;
    if (picked && (!before.picked || before.making)) {
      focusFirst(["[data-file-remove]", "[data-attachment-cancel]"], { root });
    } else if (!picked && !making && (before.picked || before.making)) {
      focusFirst(["[data-file-choice-button]"], { root });
    }
  }, [picked, making]);
  return (
    <fieldset
      ref={fieldset}
      className={cn("m-0 flex min-w-0 flex-col gap-3 border-0 p-0", className)}
      aria-describedby={
        [hint ? hintId : null, error ? errorId : null]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      <legend className="mb-3 px-1 font-bold text-lg">{legend}</legend>
      {hint ? (
        <p id={hintId} className="-mt-3 px-1 text-ink-2 text-sm">
          {hint}
        </p>
      ) : null}
      {choices.map((choice) => (
        <input
          key={choice.key}
          ref={(node) => {
            if (node) pickers.current.set(choice.key, node);
            else pickers.current.delete(choice.key);
          }}
          type="file"
          accept={choice.accept}
          capture={choice.capture}
          hidden
          tabIndex={-1}
          data-file-choice={choice.key}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // The same file can be picked again after a problem.
            event.target.value = "";
            if (file) choice.onPick(file);
          }}
        />
      ))}
      {/* There before it speaks: a line drawn with its words isn't heard. */}
      <p aria-live="polite" className="sr-only">
        {preparing ? preparing : chosen && readyLabel ? readyLabel : null}
      </p>
      {preparing ? (
        <p
          aria-hidden="true"
          className="flex min-h-14 items-center gap-2 rounded-control bg-surface-2 px-4 text-ink-2"
        >
          <Spinner className="size-5" />
          <span>{preparing}</span>
        </p>
      ) : chosen?.kind === "image" ? (
        <div className="relative self-start">
          {/* biome-ignore lint/performance/noImgElement: a photo made ready on the phone, a data URL */}
          <img
            src={chosen.src}
            alt={chosen.alt}
            className="max-h-80 max-w-full rounded-control bg-surface-2 object-contain shadow-card"
          />
          {remove ? (
            <IconButton
              data-file-remove=""
              label={remove.label}
              icon={<X />}
              onClick={remove.onRemove}
              disabled={disabled}
              className="absolute end-2 top-2 bg-elevated shadow-card"
            />
          ) : null}
        </div>
      ) : chosen?.kind === "pdf" ? (
        <AttachmentChip
          name={chosen.name}
          meta={chosen.meta}
          href={null}
          label={chosenLabel}
          progress={progress}
          cancel={
            cancel
              ? { label: cancel.label, onCancel: cancel.onCancel }
              : remove
                ? { label: remove.label, onCancel: remove.onRemove }
                : null
          }
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {choices.map((choice) => (
            <Button
              key={choice.key}
              data-file-choice-button=""
              variant="secondary"
              disabled={disabled}
              onClick={() => pickers.current.get(choice.key)?.click()}
            >
              <span aria-hidden="true" className="[&_svg]:size-5">
                {choice.icon}
              </span>
              {choice.label}
            </Button>
          ))}
        </div>
      )}
      {error ? (
        <p id={errorId} role="alert" className="px-1 text-danger text-sm">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
