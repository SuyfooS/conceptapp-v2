import type { ReactNode } from "react";
import { cn } from "./cn";

/** The covers a profile can wear. H1 draws the default one; more come later. */
export type CoverPreset = "glow";

/**
 * The band at the top of a profile, drawn in the business's colour with a
 * little grain, so it is the screen's one strong moment (it counts as its
 * hero). The art is decoration; `children`, such as a way back, sit on it.
 * The caller gives it its size and corners.
 */
export function ProfileCover({
  preset = "glow",
  className,
  children,
}: {
  preset?: CoverPreset;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-cover={preset}
      className={cn("hero-surface relative isolate overflow-hidden", className)}
    >
      <span
        aria-hidden="true"
        className="cover-grain pointer-events-none absolute inset-0 -z-10"
      />
      {children}
    </div>
  );
}
