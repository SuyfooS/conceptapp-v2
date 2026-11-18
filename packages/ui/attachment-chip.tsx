import { shownFileName } from "@domain/chat-files";
import { Download, FileText, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { IconButton } from "./icon-button";
import { Spinner } from "./spinner";

/** A file on its way up (chat C5): how far it went, in words and as a bar. */
export type AttachmentProgress = {
  /**
   * From 0 to 1 while its bytes go up; null while it waits for something
   * that can't be measured (being made ready, being checked): a spinner then.
   */
  value: number | null;
  /** The bar's name for screen readers ("העלאת הקובץ"). */
  label: string;
  /** What it says under the name ("מעלים את הקובץ · 45%", "בודקים את הקובץ"). */
  text: ReactNode;
};

export type AttachmentChipProps = {
  /** The file's name as it is kept, in its own direction. */
  name: string;
  /** Its size and kind, under the name ("2.4 MB · PDF"), numbers in `<ltr>`. */
  meta?: ReactNode;
  /**
   * Where it downloads: the app's own route, which checks the reader again
   * and answers with `attachment`, so the phone opens it in its own viewer.
   * A plain link with `download`, never a Link: nothing prefetches it. Null
   * while it is on its way, or where it can't be fetched.
   */
  href: string | null;
  /**
   * What it is, heard before its name: "הורדה" for a download, which is also
   * its tooltip; "הקובץ שבחרת" over the field.
   */
  label: string;
  /**
   * The name it is saved as, where the address doesn't say (a demo's own
   * file); the app's route names it itself.
   */
  saveAs?: string;
  /** On its way up: a bar, or a spinner while that can't be measured. */
  progress?: AttachmentProgress | null;
  /** "ביטול השליחה": an IconButton beside it while it may still be stopped. */
  cancel?: { label: string; onCancel: () => void } | null;
  /** A line under it (who sent it and when, in a conversation's details). */
  detail?: ReactNode;
  /**
   * `chip` (the default): on a soft fill of its own, with the inputs' radius,
   * in a bubble or over the field. `row`: one row of `AttachmentList`, on the
   * list's card, as wide as it.
   */
  shape?: "chip" | "row";
  className?: string;
};

/**
 * A file in chat (C5): a PDF's name and size with its icon, as a plain
 * download link (`<a href download>`), at least 56px tall. Its name wraps and
 * keeps its own direction; its numbers read left to right. On its way up it
 * says how far it went, with a bar from the start of the line (a spinner
 * while it is made ready or checked), and the way to stop it beside it. It
 * sits on a soft fill of its own in a bubble and over the field; in a
 * conversation's details it is a row of one card (`AttachmentList`).
 */
export function AttachmentChip({
  name,
  meta,
  href,
  label,
  saveAs,
  progress,
  cancel,
  detail,
  shape = "chip",
  className,
}: AttachmentChipProps) {
  const row = shape === "row";
  const words = (
    <>
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-5"
      >
        <FileText />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="sr-only">{label}: </span>
        <span
          dir="auto"
          className="text-start font-medium text-ink wrap-anywhere"
        >
          {/* Its ".pdf" is in the line under it, and would split from digits. */}
          {shownFileName(name)}
        </span>
        {meta ? <span className="text-ink-2 text-sm">{meta}</span> : null}
        {detail ? <span className="text-ink-2 text-sm">{detail}</span> : null}
        {progress ? <Progress progress={progress} /> : null}
      </span>
    </>
  );
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1",
        row ? null : "rounded-control bg-surface-2",
        className,
      )}
    >
      {href ? (
        <a
          href={href}
          download={saveAs ?? true}
          title={label}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-2 focus-visible:outline-accent",
            row
              ? "min-h-16 px-4 py-2.5 transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:-outline-offset-2"
              : "pressable min-h-14 rounded-control px-3 py-2 hover:bg-surface-3 active:bg-surface-3",
          )}
        >
          {words}
          <Download aria-hidden="true" className="size-5 shrink-0 text-ink-2" />
        </a>
      ) : (
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3",
            row ? "min-h-16 px-4 py-2.5" : "min-h-14 px-3 py-2",
          )}
        >
          {words}
        </div>
      )}
      {cancel ? (
        <IconButton
          label={cancel.label}
          icon={<X />}
          onClick={cancel.onCancel}
          className="me-1 text-ink-2"
        />
      ) : null}
    </div>
  );
}

/** One file of `AttachmentList`: a chip's own, with a key of its own. */
export type AttachmentListItem = Omit<
  AttachmentChipProps,
  "shape" | "className"
> & { id: string };

/**
 * Files in one soft card, a row each with hairlines between (a
 * conversation's details), drawn as ListGroup draws its rows: the card's
 * radius on `bg-surface` with its shadow, or what `className` says (in a
 * sheet, the sheet's card colour, no shadow). Each row is a download.
 */
export function AttachmentList({
  files,
  className,
}: {
  files: readonly AttachmentListItem[];
  className?: string;
}) {
  // The separator starts at the text, past the icon, as ListRow's does.
  const separator =
    "not-first:before:absolute not-first:before:start-[68px] not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-card bg-surface shadow-card",
        className,
      )}
    >
      {files.map(({ id, ...file }) => (
        <li key={id} className={cn("relative min-w-0", separator)}>
          <AttachmentChip {...file} shape="row" />
        </li>
      ))}
    </ul>
  );
}

function Progress({ progress }: { progress: AttachmentProgress }) {
  if (progress.value === null) {
    return (
      <span className="flex items-center gap-1.5 pt-1 text-ink-2 text-sm">
        <Spinner className="size-4" />
        <span>{progress.text}</span>
      </span>
    );
  }
  const percent = Math.round(Math.min(Math.max(progress.value, 0), 1) * 100);
  return (
    <span className="flex flex-col gap-1 pt-1.5">
      <span
        role="progressbar"
        aria-label={progress.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <span
          className="absolute inset-y-0 start-0 rounded-full bg-accent transition-[width] duration-200 ease-calm"
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-ink-2 text-sm">{progress.text}</span>
    </span>
  );
}
