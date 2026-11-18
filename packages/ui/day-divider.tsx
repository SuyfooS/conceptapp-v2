import { cn } from "./cn";

export type DayDividerProps = {
  /** "היום", "אתמול" or the date written out (`chatDay` in @domain/chat-days says which). */
  label: string;
  /** The day it names, YYYY-MM-DD in the business's clock. */
  day: string;
  /** A heading, so a screen reader moves through a conversation by day. */
  level?: 2 | 3;
  className?: string;
};

/** The day over a conversation's messages of that day, in a small soft pill. */
export function DayDivider({
  label,
  day,
  level = 2,
  className,
}: DayDividerProps) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <Heading className={cn("flex justify-center pt-5 pb-1", className)}>
      <time
        dateTime={day}
        className="rounded-full bg-surface px-3 py-1 font-semibold text-ink-2 text-sm shadow-card"
      >
        {label}
      </time>
    </Heading>
  );
}
