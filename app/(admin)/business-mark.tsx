import { accentTokens } from "@domain/color";
import { accentProps } from "@ui/accent";
import { cn } from "@ui/cn";

/** A business at a glance: its first letter, in its own colour. */
export function BusinessMark({
  name,
  accent,
  className,
}: {
  name: string;
  accent: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      {...accentProps(accentTokens(accent))}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-[13px] bg-accent font-bold text-accent-ink",
        className,
      )}
    >
      {[...name][0]}
    </span>
  );
}
