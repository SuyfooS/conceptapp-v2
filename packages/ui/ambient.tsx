import { cn } from "./cn";

/**
 * A soft glow of the business's colour at the top of a screen, behind
 * everything on it. Put it first inside a `relative isolate` wrapper, so it
 * sits above the page's background and under the content.
 */
export function Ambient({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 -z-10 h-[340px] bg-[radial-gradient(70%_90%_at_80%_0%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_70%)]",
        className,
      )}
    />
  );
}
