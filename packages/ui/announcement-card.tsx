"use client";

import { CheckCheck, Megaphone, PinOff, Users } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "./button";
import { Card } from "./card";
import { cn } from "./cn";
import { IconButton } from "./icon-button";
import { MessageText } from "./message-bubble";
import { VisibilityNote } from "./visibility-note";

export type AnnouncementCardProps = {
  /** What it is ("הודעה מההנהלה"): the card's heading. */
  label: string;
  /** Who posted it and when, in a line ("שירן הדגמה · 08:10"). */
  byline: ReactNode;
  /** Its text; links in it are the parsed addresses. */
  body: string;
  /**
   * `accent` for the one that waits on this screen (at most one accent card
   * per screen), `flat` for the rest.
   */
  tone?: "accent" | "flat";
  /**
   * Its "קראתי", for someone it asks (null for its author): the button until
   * they press it, then that they did. The note under it says, before they
   * press, that management sees who confirmed.
   */
  confirm?: {
    confirmed: boolean;
    /** "קראתי". */
    label: string;
    /** "אישרת שקראת". */
    confirmedLabel: string;
    onConfirm?: () => void;
    /** On its way: the button waits. */
    pending?: boolean;
    /** "ההנהלה רואה מי אישר שקרא". */
    note: string;
  } | null;
  /**
   * For its author and management: how many of the group confirmed of how
   * many ("2 מתוך 3 אישרו שקראו"), opening who did and who not yet.
   */
  readers?: {
    label: ReactNode;
    /** Opens them, with the button pressed, for the focus to go back to. */
    onOpen?: (trigger: HTMLElement) => void;
    href?: string;
  } | null;
  /** Its author's and management's way to take it off the top of the group. */
  unpin?: { label: string; onClick: () => void } | null;
  /** A line at its foot: where it was posted, or how many more are pinned. */
  footer?: ReactNode;
  headingLevel?: "h2" | "h3";
  className?: string;
};

/**
 * An announcement from management (chat C3): pinned at the top of its group
 * and on Today until it is unpinned, with "קראתי" for everyone it asks and,
 * for its author and management, who did. No border; the accent tone marks
 * the one that waits on the screen.
 */
export function AnnouncementCard({
  label,
  byline,
  body,
  tone = "flat",
  confirm,
  readers,
  unpin,
  footer,
  headingLevel = "h2",
  className,
}: AnnouncementCardProps) {
  const Heading = headingLevel;
  // "קראתי" pressed from the keyboard goes as the line that says so comes:
  // the focus goes on to that line.
  const pressed = useRef(false);
  const done = useRef<HTMLParagraphElement>(null);
  const confirmed = confirm?.confirmed ?? false;
  useEffect(() => {
    if (!confirmed || !pressed.current) return;
    pressed.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) {
      done.current?.focus({ preventScroll: true });
    }
  }, [confirmed]);
  return (
    <Card
      tone={tone}
      padding="md"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-ink [&_svg]:size-4",
            tone === "accent" ? "bg-surface" : "bg-accent-soft",
          )}
        >
          <Megaphone />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <Heading className="font-semibold text-base text-ink">
            {label}
          </Heading>
          <p className="text-ink-2 text-sm">{byline}</p>
        </div>
        {unpin ? (
          <IconButton
            label={unpin.label}
            icon={<PinOff />}
            onClick={unpin.onClick}
            className="-my-1.5 -me-1.5"
          />
        ) : null}
      </div>
      <MessageText body={body} className="text-md text-ink" />
      {confirm || readers ? (
        <div className="flex flex-wrap items-center gap-2">
          {confirm ? (
            confirm.confirmed ? (
              <p
                ref={done}
                tabIndex={-1}
                className="flex min-h-11 items-center gap-1.5 font-medium text-base text-ink outline-none"
              >
                <CheckCheck aria-hidden="true" className="size-5 shrink-0" />
                {confirm.confirmedLabel}
              </p>
            ) : (
              <Button
                variant="secondary"
                loading={confirm.pending}
                // How a screen finds it, to give it the focus.
                data-announcement-confirm=""
                onClick={() => {
                  pressed.current = true;
                  confirm.onConfirm?.();
                }}
                className={cn(
                  tone === "accent" &&
                    "bg-surface hover:bg-surface-2 active:bg-surface-3",
                )}
              >
                {confirm.label}
              </Button>
            )
          ) : null}
          {readers ? (
            readers.href ? (
              <Button
                asChild
                variant="ghost"
                className="-ms-2 text-ink-2 hover:text-ink"
              >
                <Link href={readers.href}>
                  <Users aria-hidden="true" />
                  {readers.label}
                </Link>
              </Button>
            ) : (
              <Button
                variant="ghost"
                aria-haspopup="dialog"
                onClick={(event) => readers.onOpen?.(event.currentTarget)}
                className="-ms-2 text-ink-2 hover:text-ink"
              >
                <Users aria-hidden="true" />
                {readers.label}
              </Button>
            )
          ) : null}
        </div>
      ) : null}
      {confirm ? (
        <VisibilityNote className="-mt-1">{confirm.note}</VisibilityNote>
      ) : null}
      {footer ? <div className="text-ink-2 text-sm">{footer}</div> : null}
    </Card>
  );
}
