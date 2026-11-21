import type { ReactNode, Ref } from "react";
import { cn } from "./cn";

/**
 * A screen with nothing to show yet, or one that cannot show it: what happened
 * and what to do next, in the middle of the page.
 */
export function EmptyState({
  icon,
  title,
  body,
  headingLevel = "h1",
  headingRef,
  className,
  children,
}: {
  icon: ReactNode;
  title?: ReactNode;
  body: ReactNode;
  /** `h1` when this is all the screen says, `h2` under a page title. */
  headingLevel?: "h1" | "h2";
  /**
   * The title, for a screen that puts the keyboard's focus there when what
   * held it went away (an order closed while its screen was on).
   */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
  /** What to do next. */
  children?: ReactNode;
}) {
  const Heading = headingLevel;
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-5 px-4 py-10 text-center",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-20 place-items-center rounded-[26px] bg-surface text-accent shadow-card [&_svg]:size-9 [&_svg]:stroke-[1.6]"
      >
        {icon}
      </span>
      <div className="flex max-w-md flex-col gap-2">
        {title ? (
          <Heading
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
            className="text-balance font-bold text-2xl outline-none"
          >
            {title}
          </Heading>
        ) : null}
        <p className="text-pretty text-ink-2">{body}</p>
      </div>
      {children ? (
        <div className="flex w-full max-w-xs flex-col gap-2">{children}</div>
      ) : null}
    </div>
  );
}
