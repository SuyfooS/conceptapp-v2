import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { cn } from "./cn";

type Content = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Icon, initials or an Avatar at the start of the row. */
  leading?: ReactNode;
  /** Badge, time or value at the end of the row. */
  trailing?: ReactNode;
  className?: string;
};

export type ListRowProps = Content &
  (
    | { href: string; onClick?: never; disabled?: never }
    | {
        /** Gets the click, whose `currentTarget` is the row, to focus later. */
        onClick: (event: MouseEvent<HTMLButtonElement>) => void;
        /** Dimmed, and it takes no press, for as long as it can't help. */
        disabled?: boolean;
        href?: never;
      }
    | { href?: never; onClick?: never; disabled?: never }
  );

const base =
  "relative flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-start not-first:before:absolute not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";
const interactiveClass =
  "transition-colors duration-150 ease-calm hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/** One row of a list. A link or button when it leads somewhere, plain otherwise. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  href,
  onClick,
  disabled = false,
  className,
}: ListRowProps) {
  const interactive = href !== undefined || onClick !== undefined;
  // The separator starts at the text, as in a grouped list.
  const inset = leading
    ? "not-first:before:start-[68px]"
    : "not-first:before:start-4";
  const content = (
    <>
      {leading ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-ink-2 text-sm [&_svg]:size-5">
          {leading}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-ink">{title}</span>
        {subtitle ? (
          <span className="text-ink-2 text-sm">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
      {interactive ? (
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
        />
      ) : null}
    </>
  );

  if (href !== undefined) {
    return (
      <Link
        href={href}
        className={cn(base, inset, interactiveClass, className)}
      >
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          base,
          inset,
          disabled ? "opacity-50" : interactiveClass,
          className,
        )}
      >
        {content}
      </button>
    );
  }
  return <div className={cn(base, inset, className)}>{content}</div>;
}

/** A grouped list: one soft card, with hairlines between its rows. */
export function ListGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}
