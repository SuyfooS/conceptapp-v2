import { BellOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "./badge";
import { cn } from "./cn";

/** Above this the count says "99+", as the database counts no further. */
const MOST = 99;

export type ChatRowProps = {
  /** The conversation. */
  href: string;
  /** The group's name, or the other person's. */
  title: ReactNode;
  /**
   * An Avatar for a person, a ChatGroupMark for a group: both 40px, so the
   * names line up. An AvatarStack is wider.
   */
  leading: ReactNode;
  /**
   * The last message, already cut in code (`chatPreview`), with who wrote it
   * in a group ("נועה: …"). It wraps; nothing is cut here.
   */
  preview?: ReactNode;
  /** When it last spoke ("08:05", "אתמול", "1.11"), and the instant. */
  time?: { label: string; at: string } | null;
  /** Messages the reader hasn't read, and that count in words for screen readers. */
  unread?: { count: number; label: string } | null;
  /** The words for its mark when it sends no notifications ("בלי התראות"). */
  muted?: string | null;
  /** An announcement here waits for the reader's "קראתי" (C3), in words. */
  waiting?: string | null;
  /** The conversation open beside the list, from tablet up. */
  current?: boolean;
  className?: string;
};

const base =
  "relative flex min-h-[4.5rem] w-full items-center gap-3 px-4 py-3 text-start not-first:before:absolute not-first:before:start-[68px] not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";
const interactive =
  "transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
// The current row's bar, as ListRow's.
const currentClass =
  "bg-surface-2 after:absolute after:inset-y-2 after:start-0 after:w-1 after:rounded-full after:bg-accent after:content-['']";

/**
 * A conversation in the chat list, as a link, inside a ListGroup: who or
 * which group, the last message, when, and what waits for the reader (an
 * unread count, an announcement to confirm), with a quiet mark when it is
 * muted. The preview and the title wrap rather than being cut.
 */
export function ChatRow({
  href,
  title,
  leading,
  preview,
  time,
  unread,
  muted,
  waiting,
  current = false,
  className,
}: ChatRowProps) {
  const fresh = unread && unread.count > 0 ? unread : null;
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(base, interactive, current && currentClass, className)}
    >
      <span className="flex min-h-10 min-w-10 shrink-0 items-center justify-center self-start">
        {leading}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 text-ink",
              fresh ? "font-bold" : "font-semibold",
            )}
          >
            {title}
          </span>
          {time ? (
            <time
              dateTime={time.at}
              dir="ltr"
              className={cn(
                "shrink-0 text-sm",
                fresh ? "font-semibold text-ink" : "text-ink-2",
              )}
            >
              {time.label}
            </time>
          ) : null}
        </span>
        <span className="flex items-start gap-2">
          {preview ? (
            <span
              className={cn(
                "min-w-0 flex-1 text-base",
                fresh ? "text-ink" : "text-ink-2",
              )}
            >
              {preview}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {muted ? (
            <span title={muted} className="flex h-6 shrink-0 items-center">
              <BellOff aria-hidden="true" className="size-4 text-ink-2" />
              <span className="sr-only">{muted}</span>
            </span>
          ) : null}
          {fresh ? (
            <>
              <span
                aria-hidden="true"
                className="min-w-6 shrink-0 rounded-full bg-accent px-1.5 text-center font-bold text-accent-ink text-sm leading-6 tabular-nums"
              >
                {fresh.count > MOST ? `${MOST}+` : fresh.count}
              </span>
              <span className="sr-only">{fresh.label}</span>
            </>
          ) : null}
        </span>
        {waiting ? (
          <Badge tone="accent" className="mt-1 self-start">
            {waiting}
          </Badge>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * The round mark a group shows where a person shows their photo: the
 * group's icon on the business's tint, 40px like an Avatar.
 */
export function ChatGroupMark({ icon }: { icon: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-ink [&_svg]:size-5"
    >
      {icon}
    </span>
  );
}
