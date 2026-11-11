import { type MessagePart, messageParts } from "@domain/chat";
import {
  Ban,
  CheckCheck,
  Clock3,
  Ellipsis,
  FileX2,
  Megaphone,
  RotateCcw,
} from "lucide-react";
import type { MouseEvent } from "react";
import { AttachmentChip, type AttachmentChipProps } from "./attachment-chip";
import { cn } from "./cn";
import { type MessageImage, MessageImageView } from "./message-image";

export type { MessageImage } from "./message-image";

/**
 * A message's file (chat C5, a PDF): its chip, a download once the server has
 * it (`href`), on its way with how far it went; or the line saying it is no
 * longer kept ("הקובץ כבר לא נשמר"), where the message stays.
 */
export type MessageFile =
  | ({ kind: "shown" } & Omit<AttachmentChipProps, "className">)
  | { kind: "gone"; label: string };

/**
 * What a message shows. Each kind is one case here and in `Body`, so a new
 * one (a PDF in C5) is added without touching the others.
 */
export type MessageContent =
  /** Text as it was sent; http(s) addresses in it become links. */
  | { kind: "text"; body: string }
  /**
   * An announcement from management (C3): its text under the label that
   * says so ("הודעה מההנהלה").
   */
  | { kind: "announcement"; body: string; label: string }
  /** Removed: whose doing it was, in words ("ההודעה נמחקה"). */
  | { kind: "removed"; label: string }
  /**
   * A picture (C4), with what was written with it, if anything: its
   * thumbnail, which opens the whole picture, or the line saying its file is
   * no longer kept ("הקובץ כבר לא נשמר"). A removed one is `removed`, with no
   * picture. `label` says it is an announcement, as for text.
   */
  | {
      kind: "image";
      image: MessageImage;
      body: string | null;
      label?: string;
    }
  /**
   * A PDF (C5), with what was written with it, if anything: its name and
   * size as a download, which the phone opens in its own viewer, or the line
   * saying its file is no longer kept. A removed one is `removed`.
   */
  | {
      kind: "pdf";
      file: MessageFile;
      body: string | null;
      label?: string;
    };

/**
 * Where one's own message is. A message sent and not yet read says nothing:
 * "seen" goes on the last of one's messages the other person read, in a
 * private chat only.
 */
export type MessageStatus =
  | { kind: "sending"; label: string }
  | { kind: "seen"; label: string }
  /** Its label is the way to try again ("לא נשלחה. לנסות שוב"). */
  | { kind: "failed"; label: string; onRetry: () => void };

/** Where a message sits in a run of one author's messages close together. */
export type MessageRun = "single" | "first" | "middle" | "last";

export type MessageBubbleProps = {
  /** One's own: at the end, in the business's tint. Others': at the start. */
  own: boolean;
  content: MessageContent;
  /** On the business's clock ("08:05"), and the instant it names. */
  time: { label: string; at: string };
  /**
   * Who wrote it. `shown` puts the name over the text, on the first of a run
   * by someone else in a group; otherwise only screen readers hear it.
   */
  author?: { name: string; shown: boolean };
  status?: MessageStatus | null;
  /**
   * The first of a run has room above it; the last points at its author.
   * A message alone is both.
   */
  run?: MessageRun;
  /**
   * What may be done with it (copy, delete, remove; C3): an IconButton beside
   * it with its label and tooltip ("פעולות"), shown on a desktop with a mouse
   * when the pointer or the keyboard is on the message, always on a touch
   * screen that wide, and kept for screen readers and keyboards everywhere;
   * below 1280px, and on any touch screen, a tap on the message itself opens
   * them too, but not on a link in it or while text is selected. A picture's
   * message (C4) shows the button below 1280px too: a tap on the picture
   * opens the picture, and the rest of the bubble is too small a place; so
   * does a PDF's (C5), whose chip is its download.
   */
  actions?: { label: string; onOpen: (trigger: HTMLElement) => void } | null;
  /**
   * The message's id, on the bubble (`data-message-id`): how the screen
   * finds its actions' button again, to give it the focus back.
   */
  messageId?: string;
  className?: string;
};

/**
 * Where a tap on the message opens its actions: below 1280px, and on a
 * touch screen of any width (a tablet in landscape has the desktop's layout
 * and no pointer to hover with).
 */
const TAP_OPENS = "(max-width: 1279.98px), (hover: none)";

/**
 * One message in a conversation. Flat, with no border: one's own in the
 * business's tint, others' on a soft card. The text keeps its own direction
 * (`dir="auto"`), so English in a Hebrew chat reads left to right, and it is
 * only ever text: links are the parsed addresses, opened in a new tab with no
 * referrer, and nothing is fetched to preview them.
 */
export function MessageBubble({
  own,
  content,
  time,
  author,
  status,
  run = "single",
  actions,
  messageId,
  className,
}: MessageBubbleProps) {
  const opens = run === "single" || run === "first";
  const closes = run === "single" || run === "last";
  const removed = content.kind === "removed";
  const named = author && !own && author.shown;
  // The picture, or the file's download, takes the tap: its message's
  // actions keep a button of their own.
  const picture =
    (content.kind === "image" && content.image.kind === "shown") ||
    (content.kind === "pdf" && content.file.kind === "shown");

  function onTap(event: MouseEvent<HTMLDivElement>) {
    if (!actions || !window.matchMedia(TAP_OPENS).matches) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button")) return;
    if ((window.getSelection()?.toString() ?? "") !== "") return;
    const trigger =
      event.currentTarget.parentElement?.querySelector<HTMLElement>(
        "[data-message-actions]",
      ) ?? event.currentTarget;
    actions.onOpen(trigger);
  }

  return (
    <div
      data-bubble=""
      data-message-id={messageId}
      className={cn(
        "group/bubble flex w-full flex-col",
        own ? "items-end" : "items-start",
        opens ? "pt-3" : "pt-1",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 max-w-[min(85%,34rem)] items-center gap-1",
          own && "flex-row-reverse",
        )}
      >
        {/* A pointer's shortcut to the button beside it, which keyboards and
            screen readers use. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the actions' own button is beside it */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the actions' own button is beside it */}
        <div
          onClick={actions ? onTap : undefined}
          className={cn(
            "flex min-w-0 flex-col gap-0.5 rounded-card px-3.5 pt-2 pb-1.5",
            removed
              ? "bg-surface-2 text-ink-2"
              : own
                ? "bg-accent-soft text-ink"
                : "bg-surface text-ink shadow-card",
            closes && (own ? "rounded-ee-control" : "rounded-es-control"),
            actions &&
              "max-xl:cursor-pointer [@media(hover:none)]:cursor-pointer",
          )}
        >
          {author ? (
            <span
              className={named ? "font-semibold text-ink text-sm" : "sr-only"}
            >
              {author.name}
            </span>
          ) : null}
          <Body content={content} own={own} />
          <span
            className={cn(
              "flex items-center gap-1 self-end text-sm",
              // Text on the tint stays ink (CLAUDE.md).
              own && !removed ? "text-ink" : "text-ink-2",
            )}
          >
            <time dateTime={time.at} dir="ltr">
              {time.label}
            </time>
            {status && status.kind !== "failed" ? (
              <StatusMark status={status} />
            ) : null}
          </span>
        </div>
        {actions ? (
          <button
            type="button"
            data-message-actions=""
            aria-label={actions.label}
            title={actions.label}
            aria-haspopup="dialog"
            onClick={(event) => actions.onOpen(event.currentTarget)}
            className={cn(
              "pressable grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 active:bg-surface-3",
              "focus-visible:outline-2 focus-visible:outline-accent",
              // Below 1280px the message itself is the way in: the button
              // stays for keyboards and screen readers, and shows on focus;
              // beside a picture it shows.
              !picture && "max-xl:not-focus-visible:sr-only",
              // Wider, it shows as the mouse or the keyboard reaches the
              // message; on a touch screen that wide it always shows.
              "[@media(hover:hover)]:xl:opacity-0 xl:group-hover/bubble:opacity-100 xl:focus-visible:opacity-100",
            )}
          >
            <Ellipsis aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>
      {status?.kind === "failed" ? (
        <button
          type="button"
          onClick={status.onRetry}
          className={cn(
            "pressable flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-danger text-sm",
            "focus-visible:outline-2 focus-visible:outline-accent",
          )}
        >
          <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
          {status.label}
        </button>
      ) : null}
    </div>
  );
}

function StatusMark({
  status,
}: {
  status: Exclude<MessageStatus, { kind: "failed" }>;
}) {
  const Icon = status.kind === "seen" ? CheckCheck : Clock3;
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden="true">·</span>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {status.label}
    </span>
  );
}

/** A message's text, its links the parsed addresses. */
export function MessageText({
  body,
  className,
}: {
  body: string;
  className?: string;
}) {
  return (
    <p
      dir="auto"
      className={cn("whitespace-pre-wrap text-start wrap-anywhere", className)}
    >
      {keyed(messageParts(body)).map(({ key, part }) =>
        part.kind === "link" ? (
          <a
            key={key}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {part.text}
          </a>
        ) : (
          <span key={key}>{part.text}</span>
        ),
      )}
    </p>
  );
}

/** A message's file: its chip, on a fill that stands off the bubble's own. */
function FileView({ file, own }: { file: MessageFile; own: boolean }) {
  if (file.kind === "gone") {
    return (
      <p className="flex items-center gap-1.5 text-ink-2">
        <FileX2 aria-hidden="true" className="size-4 shrink-0" />
        {file.label}
      </p>
    );
  }
  const { kind: _shown, ...chip } = file;
  // The span stretches across the bubble, 6px into its padding on both
  // sides, as a picture does; the chip's own width sizes the bubble.
  return (
    <span className="-mx-1.5 block pt-0.5">
      <AttachmentChip
        {...chip}
        className={cn(own ? "bg-surface" : "bg-surface-2", "w-72 max-w-full")}
      />
    </span>
  );
}

function Body({ content, own }: { content: MessageContent; own: boolean }) {
  switch (content.kind) {
    case "text":
      return <MessageText body={content.body} />;
    case "announcement":
      return (
        <>
          <span className="flex items-center gap-1.5 font-semibold text-ink text-sm">
            <Megaphone aria-hidden="true" className="size-4 shrink-0" />
            {content.label}
          </span>
          <MessageText body={content.body} />
        </>
      );
    case "removed":
      return (
        <p className="flex items-center gap-1.5">
          <Ban aria-hidden="true" className="size-4 shrink-0" />
          {content.label}
        </p>
      );
    case "image":
      return (
        <>
          {content.label ? (
            <span className="flex items-center gap-1.5 font-semibold text-ink text-sm">
              <Megaphone aria-hidden="true" className="size-4 shrink-0" />
              {content.label}
            </span>
          ) : null}
          <span
            className={
              content.image.kind === "shown" ? "-mx-1.5 pt-0.5" : undefined
            }
          >
            <MessageImageView image={content.image} />
          </span>
          {content.body ? <MessageText body={content.body} /> : null}
        </>
      );
    case "pdf":
      return (
        <>
          {content.label ? (
            <span className="flex items-center gap-1.5 font-semibold text-ink text-sm">
              <Megaphone aria-hidden="true" className="size-4 shrink-0" />
              {content.label}
            </span>
          ) : null}
          <FileView file={content.file} own={own} />
          {content.body ? <MessageText body={content.body} /> : null}
        </>
      );
    default: {
      const unhandled: never = content;
      return unhandled;
    }
  }
}

/** Each part with a key: where it starts in the text, which never repeats. */
function keyed(parts: MessagePart[]): { key: number; part: MessagePart }[] {
  let at = 0;
  return parts.map((part) => {
    const key = at;
    at += part.text.length;
    return { key, part };
  });
}
