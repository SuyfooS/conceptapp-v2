import type { ReactNode } from "react";

/**
 * The small status on a hero card. Its fill moves away from the text drawn on
 * it, so it reads on any business's colour.
 */
export function HeroChip({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex min-h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-accent-press px-3 font-semibold text-accent-ink text-sm shadow-[inset_0_0.5px_0_rgb(255_255_255/0.35)] [&_svg]:size-4">
      {icon}
      {children}
    </span>
  );
}
