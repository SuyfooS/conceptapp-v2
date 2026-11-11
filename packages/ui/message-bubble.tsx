import { type MessagePart, messageParts } from "@domain/chat";
import { Ban, CheckCheck, Clock3, RotateCcw } from "lucide-react";
import { cn } from "./cn";

/**
 * What a message shows. Each kind is one case here and in `Body`, so a new
 * one (an announcement in C3, an image and a file in C4 and C5, a file no
 * longer kept) is added without touching the others.
 */
export type MessageContent =
  /** Text as it was sent; http(s) addresses in it become links. */
  | { kind: "text"; body: string }
  /** Removed: whose doing it was, in words ("ההודעה נמחקה"). */
  | { kind: "removed"; label: string };

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
  className?: string;
};

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
  className,
}: MessageBubbleProps) {
  const opens = run === "single" || run === "first";
  const closes = run === "single" || run === "last";
  const removed = content.kind === "removed";
  const named = author && !own && author.shown;
  return (
    <div
      className={cn(
        "flex w-full flex-col",
        own ? "items-end" : "items-start",
        opens ? "pt-3" : "pt-1",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 max-w-[min(85%,34rem)] flex-col gap-0.5 rounded-card px-3.5 pt-2 pb-1.5",
          removed
            ? "bg-surface-2 text-ink-2"
            : own
              ? "bg-accent-soft text-ink"
              : "bg-surface text-ink shadow-card",
          closes && (own ? "rounded-ee-control" : "rounded-es-control"),
        )}
      >
        {author ? (
          <span
            className={named ? "font-semibold text-ink text-sm" : "sr-only"}
          >
            {author.name}
          </span>
        ) : null}
        <Body content={content} />
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

function Body({ content }: { content: MessageContent }) {
  switch (content.kind) {
    case "text":
      return (
        <p dir="auto" className="whitespace-pre-wrap text-start wrap-anywhere">
          {keyed(messageParts(content.body)).map(({ key, part }) =>
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
    case "removed":
      return (
        <p className="flex items-center gap-1.5">
          <Ban aria-hidden="true" className="size-4 shrink-0" />
          {content.label}
        </p>
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
