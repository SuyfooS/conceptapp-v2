import { ArrowDown } from "lucide-react";
import { cn } from "./cn";

export type NewBelowProps = {
  /** New messages came in while the reader was further up. */
  shown: boolean;
  /** "הודעות חדשות למטה". */
  label: string;
  /** Takes the reader down to them: only when pressed, never by itself. */
  onClick: () => void;
  className?: string;
};

/**
 * The glass pill that says new messages arrived below while the reader is
 * further up the conversation. The page never moves on its own; the reader
 * goes down when they press it. The conversation's own line already tells
 * screen readers what arrived, so the pill is no live region. It belongs in
 * the Composer's `above`, floating just over it.
 */
export function NewBelow({ shown, label, onClick, className }: NewBelowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      inert={!shown}
      className={cn(
        "glass flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--glass-strong)] px-4 font-semibold text-base text-ink",
        "transition-[opacity,translate,scale] duration-200 ease-calm",
        "focus-visible:outline-2 focus-visible:outline-accent",
        shown
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-2 scale-95 opacity-0",
        className,
      )}
    >
      <ArrowDown aria-hidden="true" className="size-5 shrink-0" />
      {label}
    </button>
  );
}
