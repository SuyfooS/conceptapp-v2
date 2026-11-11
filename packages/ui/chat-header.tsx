import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { cn } from "./cn";

export type ChatHeaderProps = {
  /** The group's name, or the other person's. */
  title: ReactNode;
  /** Who sees this conversation, in one line ("רק שניכם רואים את השיחה הזאת"). */
  subtitle?: ReactNode;
  /** An Avatar, or a ChatGroupMark. */
  leading?: ReactNode;
  /**
   * Back to the chat list, on phones. From tablet up the list is beside the
   * conversation, so there is no back. Its label names the list.
   */
  back: { href: string; label: string };
  /** At the end: what the conversation offers beside sending. */
  trailing?: ReactNode;
  /** The conversation's own screen: h1. Lower inside another page. */
  headingLevel?: "h1" | "h2" | "h3";
  /**
   * The title, for a screen that puts the keyboard's focus there when it
   * opens with nothing focused (a phone's list just went away under it).
   */
  headingRef?: Ref<HTMLHeadingElement>;
  /**
   * False shows it in place, as the /design gallery does, instead of
   * sticking to the top of the screen.
   */
  floating?: boolean;
  className?: string;
};

/**
 * A conversation's title, floating in glass at the top while its messages
 * scroll under it, over a soft fade up to the top of the screen, as a page's
 * floating title has: back (on phones), the face or the group's mark, the
 * name and who sees it. Place it first in the conversation's column.
 */
export function ChatHeader({
  title,
  subtitle,
  leading,
  back,
  trailing,
  headingLevel = "h1",
  headingRef,
  floating = true,
  className,
}: ChatHeaderProps) {
  const Heading = headingLevel;
  const header = (
    <header
      className={cn(
        "glass flex min-h-14 items-center gap-2 rounded-card bg-[var(--glass-strong)] py-1.5 ps-1.5 pe-4 md:ps-3",
        className,
      )}
    >
      <Link
        href={back.href}
        aria-label={back.label}
        title={back.label}
        className="pressable grid size-11 shrink-0 place-items-center rounded-full text-ink focus-visible:outline-2 focus-visible:outline-accent md:hidden"
      >
        <ChevronRight aria-hidden="true" className="size-6 ltr:-scale-x-100" />
      </Link>
      {leading ? <span className="flex shrink-0">{leading}</span> : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <Heading
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="font-semibold text-md outline-none"
        >
          {title}
        </Heading>
        {subtitle ? <p className="text-ink-2 text-sm">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="flex shrink-0 gap-1">{trailing}</div> : null}
    </header>
  );
  if (!floating) return header;
  // The fade is the glass's sibling, never inside it: a blur inside a blur
  // sees only the glass.
  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+0.5rem)] z-30 md:top-4">
      <div
        aria-hidden="true"
        className="edge-fade-top pointer-events-none absolute inset-x-0 -top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-1/2 -z-10 md:-top-4"
      />
      {header}
    </div>
  );
}
