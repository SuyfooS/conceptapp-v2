import { Check, Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "./cn";

/**
 * A place's one state: free, free with items in its draft, open, ready to
 * serve, or waiting past the late mark.
 */
export type PlaceTileTone = "free" | "draft" | "open" | "ready" | "late";

export type PlaceTileProps = {
  href: string;
  /**
   * What kind of place it is ("שולחן", "לקחת"), small above its name, so
   * the link's name starts with the words it shows ("שולחן 6 פנוי").
   */
  kind: string;
  /** Its name, large: a table's "6", a takeaway's number, or "חדשה". */
  name: string;
  /** Its state in words, never colour alone ("מוכן להגשה", "מחכה 20 דק׳"). */
  state: string;
  tone: PlaceTileTone;
  /** Who opened it, under the state. */
  by?: string | null;
  /** A takeaway's few words to call the customer by, under that. */
  label?: string | null;
};

const marks = {
  ready: <Check />,
  late: <TriangleAlert />,
  open: <Clock />,
} as const;

/**
 * A table or a takeaway on the floor (waiter mode): its kind and name, its
 * one state in words with a mark beside it, and who has it. A free place
 * is a flat fill; an open one lifts as a card; one ready to serve lifts
 * too, with the business's colour in its check only, so a floor with many
 * ready keeps the tinted card for the screen's one; one waiting past the
 * late mark says so in warning.
 */
export function PlaceTile({
  href,
  kind,
  name,
  state,
  tone,
  by = null,
  label = null,
}: PlaceTileProps) {
  const flat = tone === "free" || tone === "draft";
  const mark = tone === "free" || tone === "draft" ? null : marks[tone];
  return (
    <Link
      href={href}
      className={cn(
        "pressable flex min-h-[88px] w-full min-w-0 flex-col justify-between gap-1 rounded-card p-3 text-start",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        flat ? "bg-surface-2" : "bg-surface shadow-card",
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-ink-2 text-sm">{kind}</span>
          <span className="font-bold text-2xl leading-none">{name}</span>
        </span>
        {mark ? (
          <span
            aria-hidden="true"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-4 [&_svg]:stroke-[2.2]",
              tone === "ready"
                ? "bg-accent text-accent-ink"
                : tone === "late"
                  ? "bg-warning-soft text-warning"
                  : "bg-surface-2 text-ink-2",
            )}
          >
            {mark}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col">
        <span
          className={cn(
            "text-sm",
            tone === "ready" ? "font-bold" : "font-semibold",
            tone === "late"
              ? "text-warning"
              : tone === "free"
                ? "text-ink-2"
                : "text-ink",
          )}
        >
          {state}
        </span>
        {by ? <span className="text-ink-2 text-sm">{by}</span> : null}
        {label ? <span className="text-ink-2 text-sm">{label}</span> : null}
      </span>
    </Link>
  );
}
