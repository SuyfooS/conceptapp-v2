import { TriangleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "./cn";

/**
 * The attribute app/globals.css shows the notice by, written out on the
 * element below (tooling/old-browser.test.ts keeps the two the same).
 */
export const OLD_BROWSER_ATTRIBUTE = "data-old-browser";

export type OldBrowserNoticeProps = {
  /** What is wrong, in one line. */
  title: string;
  /** What to do, a paragraph each. */
  children: ReactNode;
  /**
   * Drawn in any browser, for the /design gallery. On a page it is left out:
   * the notice is hidden there, and only app/globals.css shows it.
   */
  shown?: boolean;
  className?: string;
};

/**
 * A browser older than what the app needs, told at the top of every page in
 * plain words, with what to do about it. CSS only, with no script, since on
 * such a browser the page's script may never run: the notice carries
 * Tailwind's `hidden`, which sits in a cascade layer, and the rule in
 * app/globals.css, outside any layer, wins over it where the browser lacks
 * what the app needs (it says which, and why). A browser too old for cascade
 * layers never applies `hidden` at all, so it shows there too.
 *
 * It never blocks the page: it lies in the flow above it and scrolls away
 * with it, so the person can still try. It has no z-index of its own, so the
 * fixed bars, a toast and a sheet are drawn over it as over the rest of the
 * page, and a tab bar it reaches on a short phone still takes the press. At
 * the top none of them meets it: the desktop's sidebar is beside it, and the
 * floating title and its fade show only once the header below it has
 * scrolled away. Its colours are the plain tokens (surface, ink, warning),
 * never one mixed with color-mix() or a relative colour, so it reads in the
 * browser it is for.
 */
export function OldBrowserNotice({
  title,
  children,
  shown = false,
  className,
}: OldBrowserNoticeProps) {
  const titleId = useId();
  return (
    <div
      data-old-browser=""
      className={cn(
        !shown && "hidden",
        "px-4 pt-[max(1rem,env(safe-area-inset-top))]",
        className,
      )}
    >
      <section
        aria-labelledby={titleId}
        className="mx-auto flex max-w-[560px] items-start gap-3 rounded-card bg-surface p-5 text-ink shadow-float"
      >
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-6 shrink-0 text-warning"
        />
        <div className="flex min-w-0 flex-col gap-2">
          <p id={titleId} className="font-semibold text-md">
            {title}
          </p>
          <div className="flex flex-col gap-1.5 text-base">{children}</div>
        </div>
      </section>
    </div>
  );
}
