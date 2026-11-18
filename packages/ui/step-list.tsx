import { Check, ChevronRight, CircleDashed } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

/**
 * Steps toward something being ready, one row each, worked out from data
 * rather than ticked: the console's checklist of a new business and the
 * owner's first steps on Today. Floats over the card that says how far
 * along it is.
 */
export function StepList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-card bg-surface shadow-float",
        className,
      )}
      {...props}
    />
  );
}

const MARKS = {
  /** Done: nothing to do, though a row with a link can still be checked. */
  done: { icon: <Check />, tone: "bg-success-soft text-success" },
  /** Not done yet, and nothing wrong with that: the next thing to do. */
  open: { icon: <CircleDashed />, tone: "bg-surface-2 text-ink-2" },
  /** Missing, and the business can't start well without it. */
  missing: { icon: <CircleDashed />, tone: "bg-warning-soft text-warning" },
} as const;

// The separator starts at the text, past the mark.
const rowClass =
  "relative flex min-h-16 items-center gap-3 px-4 py-2.5 not-first:before:absolute not-first:before:end-0 not-first:before:start-[56px] not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

/**
 * One step: its mark, what it is and where it stands. `state` says the mark
 * in words for screen readers, after the title. With `href` the row leads to
 * where the step is done.
 */
export function StepRow({
  mark,
  title,
  detail,
  state,
  badge,
  href,
}: {
  mark: keyof typeof MARKS;
  title: ReactNode;
  detail?: ReactNode;
  state: string;
  /** Beside the words, such as a step that is optional. */
  badge?: ReactNode;
  href?: string | null;
}) {
  const { icon, tone } = MARKS[mark];
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-4 [&_svg]:stroke-3",
          tone,
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">
          {title}
          <span className="sr-only">
            {" · "}
            {state}
          </span>
        </span>
        {detail ? (
          <span className="break-words text-ink-2 text-sm">{detail}</span>
        ) : null}
      </span>
      {badge ? <span className="shrink-0">{badge}</span> : null}
    </>
  );
  if (!href) return <li className={rowClass}>{content}</li>;
  return (
    <li className={cn(rowClass, "p-0")}>
      <Link
        href={href}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 transition-colors duration-150 ease-calm hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-surface-3"
      >
        {content}
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
        />
      </Link>
    </li>
  );
}
