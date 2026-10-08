import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Content = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Icon or initials in a round tile at the start of the row. */
  leading?: ReactNode;
  /** Badge, time or value at the end of the row. */
  trailing?: ReactNode;
  className?: string;
};

export type ListRowProps = Content &
  (
    | { href: string; onClick?: never }
    | { onClick: () => void; href?: never }
    | { href?: never; onClick?: never }
  );

const base = "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start";
const interactiveClass =
  "transition-colors duration-150 ease-calm hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/** One row of a list. A link or button when it leads somewhere, plain otherwise. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  href,
  onClick,
  className,
}: ListRowProps) {
  const interactive = href !== undefined || onClick !== undefined;
  const content = (
    <>
      {leading ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-medium text-ink-2 text-sm [&_svg]:size-5">
          {leading}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-ink">{title}</span>
        {subtitle ? (
          <span className="truncate text-ink-2 text-sm">{subtitle}</span>
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
      <Link href={href} className={cn(base, interactiveClass, className)}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(base, interactiveClass, className)}
      >
        {content}
      </button>
    );
  }
  return <div className={cn(base, className)}>{content}</div>;
}

/** Bordered container that separates rows with hairlines. */
export function ListGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "divide-y divide-line overflow-hidden rounded-card border border-line bg-surface",
        className,
      )}
      {...props}
    />
  );
}
