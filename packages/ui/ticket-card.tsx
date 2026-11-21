import { Check, Gift, Hourglass, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

export type OrderLineProps = {
  /** How many and what ("2 × לימונדה"), its number in an LTR span. */
  title: ReactNode;
  /** The options chosen, under it ("מדיום · גבינה"). */
  choices?: readonly string[];
  /** The note for how to make it, in words ("הערה: בלי שום"), in a warning box. */
  note?: ReactNode;
  /** The allergy in words with its word ("אלרגיה: שומשום"), in danger. */
  allergy?: ReactNode;
  /**
   * Taken back by its sender: struck through, saying so in these words
   * ("בוטל"), with its note and allergy no longer shown.
   */
  takenBack?: string | null;
  /**
   * Still made, and marked so in these words under it: on the house ("על
   * חשבון הבית · פיצוי ללקוח"), never struck.
   */
  mark?: ReactNode;
  /** A station's size, readable from about 1.5 m. */
  large?: boolean;
  /** What to do with it, at its end (taking it back). */
  trailing?: ReactNode;
};

/**
 * A line of an order as the kitchen and the waiter read it (waiter mode):
 * how many and what, the choices under it, an allergy in danger with its
 * word and a note in a warning box, never colour alone. A list item: put
 * it in a `ul` of its ticket.
 */
export function OrderLine({
  title,
  choices = [],
  note,
  allergy,
  takenBack = null,
  mark,
  large = false,
  trailing,
}: OrderLineProps) {
  const gone = takenBack !== null;
  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          className={cn("flex min-w-0 flex-1 flex-col", gone && "text-danger")}
        >
          <span
            className={cn(
              "font-semibold",
              large ? "text-lg" : "text-md",
              gone && "line-through",
            )}
          >
            {title}
          </span>
          {choices.length > 0 ? (
            <span
              className={cn(
                gone ? "line-through" : "text-ink-2",
                large ? "text-md" : "text-base",
              )}
            >
              {choices.join(" · ")}
            </span>
          ) : null}
          {gone ? (
            <span className="font-semibold text-sm">{takenBack}</span>
          ) : mark ? (
            <span className="flex items-center gap-1 font-semibold text-ink-2 text-sm">
              <Gift aria-hidden="true" className="size-4 shrink-0" />
              {mark}
            </span>
          ) : null}
        </span>
        {trailing}
      </div>
      {allergy && !gone ? (
        <p
          className={cn(
            "flex items-start gap-1.5 font-semibold text-danger",
            large ? "text-md" : "text-base",
          )}
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {allergy}
        </p>
      ) : null}
      {note && !gone ? (
        <p
          className={cn(
            "rounded-control bg-warning-soft px-3 py-1.5 text-ink",
            large ? "text-md" : "text-base",
          )}
        >
          {note}
        </p>
      ) : null}
    </li>
  );
}

/** How long a ticket still new has waited: calm, past the late mark, past twice it. */
export type TicketAge = "calm" | "late" | "overdue";

export type TicketCardProps = {
  /** The place, large ("שולחן 4"). */
  title: string;
  /** Names the card for screen readers: the place and the department. */
  label: string;
  /** Who sent it, to which department ("יואב · מטבח"). */
  from: string;
  /** How long it has waited, in words ("לפני 6 דק׳"), and how late that is. */
  age: { text: string; tone: TicketAge };
  /**
   * A block held for a later course: greyed, these words ("מחכה לקריאה")
   * in place of its age, and no "מוכן".
   */
  held?: string | null;
  /** A station's size: the lines larger, "מוכן" at least 64px tall. */
  large?: boolean;
  /**
   * Just reached a station's screen (P8a): a ring in the business's colour
   * fades once, and while it stays fresh an edge in that colour at its
   * start, drawn inside the card so it keeps no border. With reduced motion,
   * the edge alone.
   */
  fresh?: boolean;
  /**
   * Every line of it taken back or cancelled (P8a): these words ("בוטל
   * כולו") in danger in place of its age, its lines struck.
   */
  gone?: string | null;
  /**
   * "מוכן", full width at its foot: one on every ticket, so not in the
   * accent. `loading` while the server hears it (the button says so and
   * waits). `ariaLabel` names it with its ticket, where its words alone
   * would name several buttons alike ("הסרה מהמסך: שולחן 4"); it starts
   * with `label`, so what is read is what shows.
   */
  ready?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
    ariaLabel?: string;
  } | null;
  /** The ticket's lines, each an `OrderLine`. */
  children: ReactNode;
};

const ageClass: Record<TicketAge, string> = {
  calm: "text-ink-2",
  late: "text-warning",
  overdue: "text-danger",
};

/**
 * A ticket on a prep screen (waiter mode): the place large, its age in
 * words, who sent it, its lines, and one full-width "מוכן" at the foot. No
 * prices: they are noise to a cook.
 */
export function TicketCard({
  title,
  label,
  from,
  age,
  held = null,
  large = false,
  fresh = false,
  gone = null,
  ready = null,
  children,
}: TicketCardProps) {
  return (
    <article
      aria-label={label}
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-card p-4",
        held !== null ? "bg-surface-2" : "bg-surface shadow-card",
        fresh &&
          "motion-safe:animate-[ticket-flash_1s_ease-out] before:absolute before:inset-y-0 before:start-0 before:w-1.5 before:bg-accent before:content-['']",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="font-bold text-2xl">{title}</span>
          <span className="text-ink-2 text-sm">{from}</span>
        </span>
        {gone !== null ? (
          <span
            className={cn(
              "shrink-0 font-semibold text-danger",
              large ? "text-md" : "text-base",
            )}
          >
            {gone}
          </span>
        ) : held !== null ? (
          <span className="flex shrink-0 items-center gap-1.5 font-semibold text-base text-ink-2">
            <Hourglass aria-hidden="true" className="size-4" />
            {held}
          </span>
        ) : (
          <span
            className={cn(
              "shrink-0 font-semibold",
              large ? "text-md" : "text-base",
              ageClass[age.tone],
            )}
          >
            {age.text}
          </span>
        )}
      </header>
      <ul className="flex flex-col divide-y divide-line">{children}</ul>
      {held === null && ready ? (
        <Button
          size="lg"
          variant="secondary"
          onClick={ready.onClick}
          loading={ready.loading}
          aria-label={ready.ariaLabel}
          className={cn("w-full", large && "min-h-16 text-lg")}
        >
          <Check aria-hidden="true" />
          {ready.label}
        </Button>
      ) : null}
    </article>
  );
}
