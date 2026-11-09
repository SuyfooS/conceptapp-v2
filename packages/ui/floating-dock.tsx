import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./button";
import { cn } from "./cn";

/**
 * The tab bar says when it has shrunk (see app-shell), and on a phone the dock
 * then drops down beside it. The selector lives here, in one place.
 */
const whenBarShrunk = {
  dock: "max-md:[body:has([data-tab-compact])_&]:bottom-[calc(env(safe-area-inset-bottom)+14px)] max-md:[body:has([data-tab-compact])_&]:start-[5.625rem]",
  button: "max-md:[body:has([data-tab-compact])_&]:min-h-16",
  quietButton: "max-md:[body:has([data-tab-compact])_&]:min-w-16",
  hideLabel: "max-md:[body:has([data-tab-compact])_&]:sr-only",
};

export type FloatingDockProps = {
  /** A message that stays until it is dealt with, above the buttons. */
  notice?: ReactNode;
  /** DockButtons. The screen's main action comes last. */
  children: ReactNode;
};

/**
 * A screen's main action, always within reach: floating above the tab bar on
 * phones and tablets, and at the screen's corner on desktop, where there is no
 * tab bar. When the bar shrinks on a phone, the dock moves down beside it.
 */
export function FloatingDock({ notice, children }: FloatingDockProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+88px)] z-30 flex flex-col gap-2",
        "transition-[bottom,inset-inline-start] duration-500 ease-spring",
        "md:inset-x-0 md:mx-auto md:max-w-[480px]",
        "xl:inset-x-auto xl:end-8 xl:bottom-6 xl:mx-0 xl:w-[23rem]",
        whenBarShrunk.dock,
      )}
    >
      {notice ? <div className="pointer-events-auto">{notice}</div> : null}
      <div className="pointer-events-auto flex items-stretch gap-2">
        {children}
      </div>
    </div>
  );
}

export type DockButtonProps = Omit<ButtonProps, "variant" | "size"> & {
  icon: ReactNode;
  /** `main` is the screen's one main action; `quiet` is glass, beside it. */
  tone?: "main" | "quiet";
};

/**
 * A button in the dock. A quiet one keeps only its icon while the bar is shrunk
 * on a phone, to leave room for the main action; its name stays for screen
 * readers and comes back on sight when the bar does. A main one never fades,
 * since the page under the dock would show through its words: one that can't
 * be pressed yet turns to glass, and one at work keeps its colour and spins.
 */
export function DockButton({
  icon,
  tone = "main",
  className,
  children,
  ...props
}: DockButtonProps) {
  return (
    <Button
      size="lg"
      variant={tone === "main" ? "primary" : "ghost"}
      className={cn(
        "px-4 transition-[min-height,background-color,opacity,transform] duration-300",
        tone === "main"
          ? props.disabled
            ? "glass flex-1 bg-[var(--glass-strong)] text-ink-2 disabled:opacity-100"
            : "flex-1 shadow-[0_14px_28px_-10px_color-mix(in_oklab,var(--accent)_70%,black),inset_0_0.5px_0_rgb(255_255_255/0.35)] disabled:opacity-100"
          : cn(
              "glass shrink-0 bg-[var(--glass-strong)] text-base",
              whenBarShrunk.quietButton,
            ),
        whenBarShrunk.button,
        className,
      )}
      {...props}
    >
      {icon}
      <span className={tone === "quiet" ? whenBarShrunk.hideLabel : undefined}>
        {children}
      </span>
    </Button>
  );
}
