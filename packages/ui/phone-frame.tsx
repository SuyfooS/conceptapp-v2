import type { ReactNode } from "react";
import { cn } from "./cn";

export type PhoneFrameProps = {
  /** What the picture shows, for screen readers. */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * A phone with a screen of the app inside, as a picture: nothing in it can be
 * pressed or reached with the keyboard, and it is read out as one image.
 */
export function PhoneFrame({ label, children, className }: PhoneFrameProps) {
  return (
    <div
      role="img"
      aria-label={label}
      inert
      className={cn(
        "isolate overflow-hidden rounded-[44px] bg-bg text-ink shadow-[0_0_0_9px_var(--bezel),var(--float-shadow)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
