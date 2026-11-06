import type { ReactNode } from "react";
import { cn } from "./cn";

/** Above the full tab bar: 14px from the edge, the 64px bar, a 10px gap. */
const above = "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] inset-x-4";
/** Next to a one-item tab bar, which stays small (see AppShell). */
const beside =
  "bottom-[calc(env(safe-area-inset-bottom)+14px)] start-[calc(1rem+4rem+10px)] end-4";

/** The lift under a floating main action, tinted by the accent. */
export const floatingButtonClass =
  "shadow-[0_14px_28px_-10px_color-mix(in_oklab,var(--accent)_70%,black),inset_0_0.5px_0_rgb(255_255_255/0.35)]";

/**
 * A form's main action. On phones it floats above the tab bar, or beside it when
 * the bar holds a single item, so a thumb always reaches it, with the empty space
 * that keeps the end of the page clear of it. From tablet up it is an ordinary
 * part of the page, where the form ends.
 */
export function FloatingAction({
  children,
  besideTabBar = false,
  className,
}: {
  children: ReactNode;
  /** The tab bar holds one item, so the action sits in the same row. */
  besideTabBar?: boolean;
  className?: string;
}) {
  return (
    <>
      {besideTabBar ? null : (
        <div aria-hidden="true" className="h-14 md:hidden" />
      )}
      <div
        className={cn(
          "fixed z-30 flex gap-2 md:static [&>*]:min-w-0",
          besideTabBar ? beside : above,
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
